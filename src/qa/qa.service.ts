import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsEnum, MinLength } from 'class-validator';
import { PlanEntity, PlanStatus, PlanType, PlanPriority } from '../plans/entities/plan.entity';
import { UserEntity, UserRole } from '../users/entities/user.entity';
import { PlansService } from '../plans/plans.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DevcollabGateway } from '../gateway/devcollab.gateway';

export class QaSignoffDto {
  @IsString()
  notes: string;
}

export class QaRejectDto {
  @IsString()
  @MinLength(5)
  reason: string;
}

export class QaBugDto {
  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  description: string;

  @IsString()
  stepsToReproduce: string;

  @IsEnum(['critical', 'major', 'minor'])
  severity: 'critical' | 'major' | 'minor';
}

export class AssignQaDto {
  @IsString()
  qaUserId: string;
}

@Injectable()
export class QaService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly plansRepo: Repository<PlanEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly plansService: PlansService,
    private readonly notificationsService: NotificationsService,
    private readonly gateway: DevcollabGateway,
  ) {}

  private canQa(user: UserEntity): boolean {
    return [UserRole.QA, UserRole.PM, UserRole.TECHLEAD].includes(user.role);
  }

  async signoff(planId: string, dto: QaSignoffDto, user: UserEntity): Promise<PlanEntity> {
    if (!this.canQa(user)) {
      throw new ForbiddenException('Only QA, PM, or Tech Lead can sign off plans');
    }

    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);

    if (plan.status !== PlanStatus.MERGED) {
      throw new BadRequestException('Plan must be MERGED (on preview) for QA sign-off');
    }

    // Only assigned QA or PM/TL can sign off
    if (
      plan.qaAssignedTo &&
      plan.qaAssignedTo !== user.id &&
      ![UserRole.PM, UserRole.TECHLEAD].includes(user.role)
    ) {
      throw new ForbiddenException('Only the assigned QA engineer can sign off this plan');
    }

    plan.status = PlanStatus.QA_APPROVED;
    plan.qaSignedOffBy = user.id;
    plan.qaSignedOffAt = new Date();
    plan.qaNotes = dto.notes;

    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    await this.notificationsService.notifyQaSignedOff(planId, plan.title, user.username);

    return saved;
  }

  async reject(planId: string, dto: QaRejectDto, user: UserEntity): Promise<PlanEntity> {
    if (!this.canQa(user)) {
      throw new ForbiddenException('Only QA, PM, or Tech Lead can reject plans');
    }

    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);

    if (plan.status !== PlanStatus.MERGED) {
      throw new BadRequestException('Plan must be on preview (MERGED) for QA to reject');
    }

    if (
      plan.qaAssignedTo &&
      plan.qaAssignedTo !== user.id &&
      ![UserRole.PM, UserRole.TECHLEAD].includes(user.role)
    ) {
      throw new ForbiddenException('Only the assigned QA engineer can reject this plan');
    }

    plan.status = PlanStatus.IN_PROGRESS;
    plan.rejectionCount += 1;
    plan.rejectReason = dto.reason;

    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);

    // Fetch PM and TL emails for escalation
    const pmUser = await this.usersRepo.findOne({ where: { role: UserRole.PM, isActive: true } });
    const tlUser = await this.usersRepo.findOne({ where: { role: UserRole.TECHLEAD, isActive: true } });

    await this.notificationsService.notifyQaRejected(
      planId,
      plan.title,
      dto.reason,
      plan.rejectionCount,
      pmUser?.email,
      tlUser?.email,
    );

    return saved;
  }

  async createBug(planId: string, dto: QaBugDto, user: UserEntity): Promise<PlanEntity> {
    if (!this.canQa(user)) {
      throw new ForbiddenException('Only QA, PM, or Tech Lead can create bug plans');
    }

    const parentPlan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!parentPlan) throw new NotFoundException(`Plan ${planId} not found`);

    // Create a BUG child plan
    const priorityMap: Record<string, PlanPriority> = {
      critical: PlanPriority.CRITICAL,
      major: PlanPriority.HIGH,
      minor: PlanPriority.MEDIUM,
    };

    const bugPlan = await this.plansService.create(
      {
        type: PlanType.BUG,
        title: dto.title,
        priority: priorityMap[dto.severity],
        parentPlanId: planId,
        goal: dto.description,
        background: `Steps to reproduce:\n${dto.stepsToReproduce}`,
        reposAffected: JSON.parse(parentPlan.reposAffected),
      },
      user,
    );

    // Add bug to parent's child_bug_ids tracking (we track via parentPlanId on bug plan, but also notify)
    await this.notificationsService.notifyBugRaised(
      bugPlan.id,
      bugPlan.title,
      planId,
      bugPlan.assignedTo || 'unassigned',
    );

    return bugPlan;
  }

  async assignQa(planId: string, dto: AssignQaDto, user: UserEntity): Promise<PlanEntity> {
    if (![UserRole.PM, UserRole.TECHLEAD].includes(user.role)) {
      throw new ForbiddenException('Only PM or Tech Lead can assign QA');
    }

    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);

    const qaUser = await this.usersRepo.findOne({ where: { id: dto.qaUserId } });
    if (!qaUser) throw new NotFoundException(`User ${dto.qaUserId} not found`);
    if (qaUser.role !== UserRole.QA) {
      throw new BadRequestException('Assigned user must have QA role');
    }

    plan.qaAssignedTo = dto.qaUserId;
    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);

    return saved;
  }

  async getOpenBugsForPlan(planId: string): Promise<PlanEntity[]> {
    return this.plansRepo.find({
      where: {
        parentPlanId: planId,
        type: PlanType.BUG,
        status: PlanStatus.OPEN,
      },
    });
  }
}
