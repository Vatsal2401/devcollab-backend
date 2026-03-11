import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { PlanEntity, PlanType, PlanStatus, PlanPriority } from './entities/plan.entity';
import { PlanHistoryEntity } from './entities/plan-history.entity';
import { ActivityEntity } from './entities/activity.entity';
import { UserEntity, UserRole } from '../users/entities/user.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { RejectPlanDto } from './dto/reject-plan.dto';
import { FilterPlansDto } from './dto/filter-plans.dto';
import { GitService } from '../git/git.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DevcollabGateway } from '../gateway/devcollab.gateway';

const PLANS_DIR = process.env.PLANS_DIR || '/plans';
const LOCK_DURATION_HOURS = 8;
const INACTIVITY_LOCK_MINUTES = 30;

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly plansRepo: Repository<PlanEntity>,
    @InjectRepository(PlanHistoryEntity)
    private readonly historyRepo: Repository<PlanHistoryEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly gitService: GitService,
    private readonly notificationsService: NotificationsService,
    private readonly gateway: DevcollabGateway,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async generatePlanId(): Promise<string> {
    const lastPlan = await this.plansRepo
      .createQueryBuilder('p')
      .orderBy("CAST(SUBSTR(p.id, 6) AS INTEGER)", 'DESC')
      .getOne();

    if (!lastPlan) return 'PLAN-001';

    const lastNum = parseInt(lastPlan.id.replace('PLAN-', ''), 10);
    const nextNum = lastNum + 1;
    return `PLAN-${String(nextNum).padStart(3, '0')}`;
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 40);
  }

  private async recordHistory(
    planId: string,
    changedBy: string,
    field: string,
    oldValue: any,
    newValue: any,
  ): Promise<void> {
    await this.historyRepo.save(
      this.historyRepo.create({
        planId,
        changedBy,
        field,
        oldValue: oldValue != null ? String(oldValue) : null,
        newValue: newValue != null ? String(newValue) : null,
      }),
    );
  }

  private async logActivity(
    userId: string,
    action: string,
    planId?: string,
    detail?: string,
  ): Promise<void> {
    const entry = this.activityRepo.create({ userId, action, planId, detail });
    await this.activityRepo.save(entry);
    this.gateway.emitActivityNew({ userId, action, planId, detail });
  }

  private generatePlanMd(plan: PlanEntity, username: string): string {
    const frontmatter = `---
id: ${plan.id}
type: ${plan.type}
title: ${plan.title}
status: ${plan.status}
priority: ${plan.priority}
created_by: ${username}
assigned_to: ${plan.assignedTo || 'null'}
locked_by: ${plan.lockedBy || 'null'}
branch: ${plan.branch || 'null'}
repos_affected: ${plan.reposAffected}
parent_plan_id: ${plan.parentPlanId || 'null'}
qa_assigned_to: ${plan.qaAssignedTo || 'null'}
rollback_tag: ${plan.rollbackTag || 'null'}
estimated_hours: ${plan.estimatedHours || 'null'}
created_at: ${plan.createdAt.toISOString()}
updated_at: ${plan.updatedAt.toISOString()}
---`;

    const body = `
## Goal
${plan.goal || ''}

## Background
${plan.background || ''}

## Repos & Files
${(JSON.parse(plan.reposAffected) as string[]).map((r) => `- ${r}`).join('\n')}

## Implementation Steps
${plan.implementationSteps || ''}

## Claude Instructions
${plan.claudeInstructions || ''}

## Acceptance Criteria
${(JSON.parse(plan.acceptanceCriteria) as { text: string; checked: boolean }[])
  .map((c) => `- [${c.checked ? 'x' : ' '}] ${c.text}`)
  .join('\n')}

## QA Test Cases
${(JSON.parse(plan.qaTestCases) as { text: string; checked: boolean }[])
  .map((t) => `- [${t.checked ? 'x' : ' '}] ${t.text}`)
  .join('\n')}

## Review Comments
${plan.reviewComments || '(Senior Dev adds notes here during code review)'}

## QA Notes
${plan.qaNotes || '(QA adds test results and sign-off notes here)'}
`;

    return frontmatter + body;
  }

  private savePlanMd(plan: PlanEntity, username: string): void {
    try {
      if (!fs.existsSync(PLANS_DIR)) {
        fs.mkdirSync(PLANS_DIR, { recursive: true });
      }
      const content = this.generatePlanMd(plan, username);
      fs.writeFileSync(path.join(PLANS_DIR, `${plan.id}.md`), content, 'utf8');
    } catch (_) {
      // Non-fatal — DB is the source of truth
    }
  }

  private canExecute(user: UserEntity): boolean {
    return [UserRole.JUNIOR, UserRole.SENIOR, UserRole.PM, UserRole.TECHLEAD].includes(user.role);
  }

  private canApproveReject(user: UserEntity): boolean {
    return [UserRole.SENIOR, UserRole.PM, UserRole.TECHLEAD].includes(user.role);
  }

  private canManage(user: UserEntity): boolean {
    return [UserRole.PM, UserRole.TECHLEAD].includes(user.role);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(filters: FilterPlansDto): Promise<PlanEntity[]> {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.assigned_to) where.assignedTo = filters.assigned_to;
    if (filters.priority) where.priority = filters.priority;
    if (filters.parent_plan_id) where.parentPlanId = filters.parent_plan_id;

    return this.plansRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<PlanEntity> {
    const plan = await this.plansRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    return plan;
  }

  async create(dto: CreatePlanDto, user: UserEntity): Promise<PlanEntity> {
    // Permission: HOTFIX → pm/tl only; BUG → qa/pm/tl; FEATURE/TASK → senior/pm/tl
    if (dto.type === PlanType.HOTFIX && !this.canManage(user)) {
      throw new ForbiddenException('Only PM and Tech Lead can create HOTFIX plans');
    }
    if (
      dto.type === PlanType.BUG &&
      ![UserRole.QA, UserRole.PM, UserRole.TECHLEAD].includes(user.role)
    ) {
      throw new ForbiddenException('Only QA, PM, or Tech Lead can create BUG plans');
    }
    if (
      [PlanType.FEATURE, PlanType.TASK].includes(dto.type) &&
      ![UserRole.SENIOR, UserRole.PM, UserRole.TECHLEAD].includes(user.role)
    ) {
      throw new ForbiddenException('Only Senior Dev, PM, or Tech Lead can create FEATURE/TASK plans');
    }

    const id = await this.generatePlanId();
    const slug = this.slugify(dto.title);
    const branchPrefix =
      dto.type === PlanType.HOTFIX
        ? 'hotfix'
        : dto.type === PlanType.BUG
        ? 'bug'
        : 'feature';
    const branch = `${branchPrefix}/${id.toLowerCase()}-${slug}`;

    // Determine initial status
    let status: PlanStatus;
    if (dto.type === PlanType.HOTFIX) {
      status = PlanStatus.READY; // HOTFIX skips DRAFT
    } else if (dto.type === PlanType.BUG) {
      status = PlanStatus.OPEN;
    } else {
      status = PlanStatus.DRAFT;
    }

    // If BUG plan, auto-assign to parent feature executor
    let assignedTo = dto.assignedTo || null;
    if (dto.type === PlanType.BUG && dto.parentPlanId) {
      const parent = await this.findById(dto.parentPlanId);
      if (parent.lockedBy) {
        assignedTo = parent.lockedBy;
      } else if (parent.assignedTo) {
        assignedTo = parent.assignedTo;
      }
    }

    const plan = this.plansRepo.create({
      id,
      type: dto.type,
      title: dto.title,
      status,
      priority: dto.priority || PlanPriority.MEDIUM,
      createdBy: user.id,
      assignedTo,
      branch,
      reposAffected: JSON.stringify(dto.reposAffected || []),
      parentPlanId: dto.parentPlanId || null,
      goal: dto.goal || null,
      background: dto.background || null,
      implementationSteps: dto.implementationSteps || null,
      claudeInstructions: dto.claudeInstructions || null,
      acceptanceCriteria: JSON.stringify(dto.acceptanceCriteria || []),
      qaTestCases: JSON.stringify(dto.qaTestCases || []),
      estimatedHours: dto.estimatedHours || null,
    });

    const saved = await this.plansRepo.save(plan);
    this.savePlanMd(saved, user.username);

    await this.logActivity(user.id, 'PLAN_CREATED', saved.id, `Created ${saved.type} plan: ${saved.title}`);
    this.gateway.emitPlanUpdated(saved);

    if (dto.type === PlanType.HOTFIX) {
      await this.notificationsService.notifyHotfixCreated(saved.id, saved.title, user.username);
    } else {
      await this.notificationsService.notifyPlanCreated(saved.id, saved.title, user.username);
    }

    return saved;
  }

  async update(id: string, dto: UpdatePlanDto, user: UserEntity): Promise<PlanEntity> {
    const plan = await this.findById(id);

    // Edit rules
    if ([PlanStatus.DONE, PlanStatus.WONTFIX, PlanStatus.CLOSED].includes(plan.status)) {
      throw new ForbiddenException('Cannot edit a completed/archived plan');
    }

    if (plan.status === PlanStatus.DRAFT || plan.status === PlanStatus.READY || plan.status === PlanStatus.OPEN) {
      if (![UserRole.SENIOR, UserRole.PM, UserRole.TECHLEAD].includes(user.role)) {
        throw new ForbiddenException('Only Senior+, PM, or TL can edit plans in this status');
      }
    } else if (plan.status === PlanStatus.IN_PROGRESS) {
      // Only PM/TL can edit; only specific fields
      if (!this.canManage(user)) {
        throw new ForbiddenException('Only PM or Tech Lead can edit plans in progress');
      }
    } else {
      // IN_REVIEW and beyond — only priority by PM/TL
      if (!this.canManage(user)) {
        throw new ForbiddenException('Only PM or Tech Lead can edit plans at this stage');
      }
      // Restrict fields
      if (
        dto.title ||
        dto.goal ||
        dto.background ||
        dto.implementationSteps ||
        dto.claudeInstructions ||
        dto.acceptanceCriteria ||
        dto.qaTestCases
      ) {
        throw new ForbiddenException('Only priority can be changed at this stage');
      }
    }

    const fields = [
      'title', 'priority', 'assignedTo', 'reposAffected', 'goal', 'background',
      'implementationSteps', 'claudeInstructions', 'acceptanceCriteria', 'qaTestCases',
      'estimatedHours', 'qaAssignedTo',
    ];

    for (const field of fields) {
      if (dto[field] !== undefined) {
        let newVal = dto[field];
        if (Array.isArray(newVal)) newVal = JSON.stringify(newVal);
        const oldVal = plan[field];
        if (String(oldVal) !== String(newVal)) {
          await this.recordHistory(id, user.id, field, oldVal, newVal);
          (plan as any)[field] = newVal;
        }
      }
    }

    const saved = await this.plansRepo.save(plan);
    this.savePlanMd(saved, user.username);
    this.gateway.emitPlanUpdated(saved);

    return saved;
  }

  // ─── Status Transitions ───────────────────────────────────────────────────

  async setReady(id: string, user: UserEntity): Promise<PlanEntity> {
    const plan = await this.findById(id);
    if (plan.status !== PlanStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT plans can be set to READY');
    }
    if (![UserRole.SENIOR, UserRole.PM, UserRole.TECHLEAD].includes(user.role)) {
      throw new ForbiddenException('Only Senior+, PM, or TL can mark plans as READY');
    }

    await this.recordHistory(id, user.id, 'status', plan.status, PlanStatus.READY);
    plan.status = PlanStatus.READY;
    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    return saved;
  }

  async execute(id: string, user: UserEntity): Promise<PlanEntity> {
    if (!this.canExecute(user)) {
      throw new ForbiddenException('Only Developers, PM, or TL can execute plans');
    }

    // Use transaction to prevent race condition
    return this.dataSource.transaction(async (manager) => {
      const planRepo = manager.getRepository(PlanEntity);

      const plan = await planRepo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!plan) throw new NotFoundException(`Plan ${id} not found`);

      const allowedStatuses = [PlanStatus.READY, PlanStatus.OPEN];
      if (!allowedStatuses.includes(plan.status)) {
        throw new BadRequestException(`Plan must be in READY or OPEN status to execute (current: ${plan.status})`);
      }

      // Check if executor is assigned or plan is open
      if (plan.assignedTo && plan.assignedTo !== user.id && !this.canManage(user)) {
        throw new ForbiddenException('This plan is assigned to another developer');
      }

      // HOTFIX bypasses queue check; others must wait
      if (plan.type !== PlanType.HOTFIX) {
        const existingInProgress = await planRepo.findOne({
          where: { status: PlanStatus.IN_PROGRESS },
        });
        if (existingInProgress && existingInProgress.id !== id) {
          throw new BadRequestException(
            `Another plan (${existingInProgress.id}) is already IN_PROGRESS. Wait for it to reach IN_REVIEW first, or ask PM/TL for priority override.`,
          );
        }
      }

      const now = new Date();
      const lockExpiresAt = new Date(now.getTime() + LOCK_DURATION_HOURS * 60 * 60 * 1000);

      plan.status = PlanStatus.IN_PROGRESS;
      plan.lockedBy = user.id;
      plan.lockedAt = now;
      plan.lockExpiresAt = lockExpiresAt;
      plan.assignedTo = user.id;

      const saved = await planRepo.save(plan);

      // Start git worktree + Claude Code (fire and forget)
      this.gitService
        .createWorktree(plan.branch, plan.type === PlanType.HOTFIX ? 'main' : 'preview', plan.id)
        .catch((err) => console.error(`Worktree creation failed for ${id}:`, err));

      await this.logActivity(user.id, 'PLAN_EXECUTED', id, `${user.username} started executing plan`);
      this.gateway.emitPlanLocked(saved, user.username);
      await this.notificationsService.notifyPlanExecuted(id, plan.title, user.username);

      return saved;
    });
  }

  async submit(id: string, user: UserEntity): Promise<PlanEntity> {
    const plan = await this.findById(id);

    if (plan.status !== PlanStatus.IN_PROGRESS) {
      throw new BadRequestException('Plan must be IN_PROGRESS to submit for review');
    }
    if (plan.lockedBy !== user.id && !this.canManage(user)) {
      throw new ForbiddenException('Only the executor can submit this plan for review');
    }

    // Pre-checks: all acceptance criteria checked
    const criteria: { text: string; checked: boolean }[] = JSON.parse(plan.acceptanceCriteria);
    const allChecked = criteria.length === 0 || criteria.every((c) => c.checked);
    if (!allChecked) {
      throw new BadRequestException(
        'All acceptance criteria must be checked before submitting for review',
      );
    }

    await this.recordHistory(id, user.id, 'status', plan.status, PlanStatus.IN_REVIEW);
    plan.status = PlanStatus.IN_REVIEW;
    plan.submittedAt = new Date();

    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    await this.logActivity(user.id, 'PLAN_SUBMITTED', id, `${user.username} submitted for review`);
    await this.notificationsService.notifyPlanSubmitted(id, plan.title, user.username);

    return saved;
  }

  async approve(id: string, user: UserEntity): Promise<PlanEntity> {
    if (!this.canApproveReject(user)) {
      throw new ForbiddenException('Only Senior Dev, PM, or TL can approve plans');
    }

    const plan = await this.findById(id);
    if (plan.status !== PlanStatus.IN_REVIEW) {
      throw new BadRequestException('Plan must be IN_REVIEW to approve');
    }

    // Get executor username for notifications
    let executorUsername = 'executor';
    if (plan.lockedBy) {
      const executor = await this.usersRepo.findOne({ where: { id: plan.lockedBy } });
      if (executor) executorUsername = executor.username;
    }

    // Auto-merge to preview
    try {
      await this.gitService.mergeToPreview(plan.branch, plan.id);
    } catch (err) {
      if (err.message?.includes('conflict')) {
        const conflictFiles: string[] = err.conflictFiles || [];
        await this.notificationsService.notifyConflictDetected(id, plan.title, conflictFiles);
        this.gateway.emitConflictDetected(id, conflictFiles);
        throw new BadRequestException(
          `Merge conflict detected. Senior Dev must resolve manually. Files: ${conflictFiles.join(', ')}`,
        );
      }
      throw err;
    }

    await this.recordHistory(id, user.id, 'status', plan.status, PlanStatus.MERGED);
    plan.status = PlanStatus.MERGED;
    plan.approvedAt = new Date();
    plan.mergedAt = new Date();
    plan.lockedBy = null;
    plan.lockedAt = null;
    plan.lockExpiresAt = null;

    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    await this.logActivity(user.id, 'PLAN_APPROVED', id, `${user.username} approved and merged to preview`);
    await this.notificationsService.notifyPlanApproved(id, plan.title, executorUsername);
    await this.notificationsService.notifyMergedToPreview(id, plan.title);

    return saved;
  }

  async reject(id: string, dto: RejectPlanDto, user: UserEntity): Promise<PlanEntity> {
    if (!this.canApproveReject(user)) {
      throw new ForbiddenException('Only Senior Dev, PM, or TL can reject plans');
    }

    const plan = await this.findById(id);
    if (plan.status !== PlanStatus.IN_REVIEW) {
      throw new BadRequestException('Plan must be IN_REVIEW to reject');
    }

    let executorUsername = 'executor';
    if (plan.lockedBy) {
      const executor = await this.usersRepo.findOne({ where: { id: plan.lockedBy } });
      if (executor) executorUsername = executor.username;
    }

    await this.recordHistory(id, user.id, 'status', plan.status, PlanStatus.IN_PROGRESS);
    plan.status = PlanStatus.IN_PROGRESS;
    plan.rejectReason = dto.reason;

    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    await this.logActivity(user.id, 'PLAN_REJECTED', id, `${user.username} rejected: ${dto.reason}`);
    await this.notificationsService.notifyPlanRejected(id, plan.title, executorUsername, dto.reason);

    return saved;
  }

  async unlock(id: string, user: UserEntity): Promise<PlanEntity> {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Only PM or Tech Lead can force unlock plans');
    }

    const plan = await this.findById(id);
    const oldLockedBy = plan.lockedBy;
    plan.lockedBy = null;
    plan.lockedAt = null;
    plan.lockExpiresAt = null;
    plan.status = PlanStatus.READY;

    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUnlocked(saved);
    await this.logActivity(
      user.id,
      'PLAN_FORCE_UNLOCKED',
      id,
      `${user.username} force-unlocked plan (was locked by ${oldLockedBy})`,
    );

    return saved;
  }

  async block(id: string, reason: string, user: UserEntity): Promise<PlanEntity> {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Only PM or Tech Lead can block plans');
    }

    const plan = await this.findById(id);
    const prevStatus = plan.status;
    plan.status = PlanStatus.BLOCKED;
    plan.blockReason = reason;

    await this.recordHistory(id, user.id, 'status', prevStatus, PlanStatus.BLOCKED);
    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanBlocked(saved);
    await this.logActivity(user.id, 'PLAN_BLOCKED', id, `${user.username} blocked: ${reason}`);

    return saved;
  }

  async unblock(id: string, user: UserEntity): Promise<PlanEntity> {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Only PM or Tech Lead can unblock plans');
    }

    const plan = await this.findById(id);
    if (plan.status !== PlanStatus.BLOCKED) {
      throw new BadRequestException('Plan is not blocked');
    }

    plan.status = PlanStatus.READY;
    plan.blockReason = null;

    await this.recordHistory(id, user.id, 'status', PlanStatus.BLOCKED, PlanStatus.READY);
    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    await this.logActivity(user.id, 'PLAN_UNBLOCKED', id, `${user.username} unblocked plan`);

    return saved;
  }

  async rollback(id: string, user: UserEntity): Promise<PlanEntity> {
    if (!this.canApproveReject(user)) {
      throw new ForbiddenException('Only Senior Dev, PM, or TL can roll back plans');
    }

    const plan = await this.findById(id);
    if (plan.status !== PlanStatus.MERGED) {
      throw new BadRequestException('Only MERGED plans can be rolled back');
    }
    if (!plan.rollbackTag) {
      throw new BadRequestException('No rollback snapshot available for this plan');
    }

    await this.gitService.rollbackPreview(plan.rollbackTag);

    plan.status = PlanStatus.IN_REVIEW;
    plan.mergedAt = null;

    await this.recordHistory(id, user.id, 'status', PlanStatus.MERGED, PlanStatus.IN_REVIEW);
    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    await this.logActivity(user.id, 'PLAN_ROLLED_BACK', id, `${user.username} rolled back preview`);
    await this.notificationsService.notifyRollback(id, plan.title, user.username);

    return saved;
  }

  async wontfix(id: string, reason: string, user: UserEntity): Promise<PlanEntity> {
    if (!this.canApproveReject(user)) {
      throw new ForbiddenException('Only Senior Dev, PM, or TL can mark plans as WONTFIX');
    }

    const plan = await this.findById(id);
    const prevStatus = plan.status;
    plan.status = PlanStatus.WONTFIX;
    plan.wontfixReason = reason;

    await this.recordHistory(id, user.id, 'status', prevStatus, PlanStatus.WONTFIX);
    const saved = await this.plansRepo.save(plan);
    this.gateway.emitPlanUpdated(saved);
    await this.logActivity(user.id, 'PLAN_WONTFIX', id, `${user.username} marked WONTFIX: ${reason}`);

    return saved;
  }

  async getHistory(id: string, user: UserEntity): Promise<PlanHistoryEntity[]> {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Only PM or Tech Lead can view plan history');
    }
    await this.findById(id); // ensure plan exists
    return this.historyRepo.find({ where: { planId: id }, order: { changedAt: 'DESC' } });
  }

  // ─── Cron: Lock Expiry ────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async checkLockExpiry(): Promise<void> {
    const now = new Date();

    // Warn when 15 minutes remain
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
    const expiringPlans = await this.plansRepo
      .createQueryBuilder('p')
      .where('p.lock_expires_at IS NOT NULL')
      .andWhere('p.lock_expires_at > :now', { now })
      .andWhere('p.lock_expires_at <= :soon', { soon: fifteenMinutesFromNow })
      .andWhere('p.status = :status', { status: PlanStatus.IN_PROGRESS })
      .getMany();

    for (const plan of expiringPlans) {
      this.gateway.emitLockExpiring(plan.id, plan.lockedBy);
    }

    // Actually expire locks
    const expiredPlans = await this.plansRepo
      .createQueryBuilder('p')
      .where('p.lock_expires_at IS NOT NULL')
      .andWhere('p.lock_expires_at <= :now', { now })
      .andWhere('p.status = :status', { status: PlanStatus.IN_PROGRESS })
      .getMany();

    for (const plan of expiredPlans) {
      const oldLockedBy = plan.lockedBy;
      const executor = oldLockedBy
        ? await this.usersRepo.findOne({ where: { id: oldLockedBy } })
        : null;

      plan.lockedBy = null;
      plan.lockedAt = null;
      plan.lockExpiresAt = null;
      plan.status = PlanStatus.READY;

      await this.plansRepo.save(plan);
      this.gateway.emitLockExpired(plan.id, oldLockedBy);
      await this.logActivity(
        oldLockedBy || 'system',
        'LOCK_EXPIRED',
        plan.id,
        'Lock expired due to inactivity',
      );

      if (executor) {
        await this.notificationsService.notifyLockExpired(plan.id, plan.title, executor.username);
      }
    }
  }
}
