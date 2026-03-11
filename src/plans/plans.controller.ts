import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsOptional, MinLength } from 'class-validator';
import { PlansService } from './plans.service';
import { PlanAiService } from './plan-ai.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { RejectPlanDto } from './dto/reject-plan.dto';
import { FilterPlansDto } from './dto/filter-plans.dto';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity } from '../users/entities/user.entity';

class BlockPlanDto {
  @IsString()
  @MinLength(5)
  reason: string;
}

class WontfixPlanDto {
  @IsString()
  @MinLength(5)
  reason: string;
}

class SetReadyDto {
  // No body needed — just the action
  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly planAiService: PlanAiService,
  ) {}

  @Get('stats')
  getStats() {
    return this.plansService.getStats();
  }

  @Get('activity')
  getActivity(@Query('limit') limit?: string) {
    return this.plansService.getActivity(limit ? parseInt(limit, 10) : 50);
  }

  @Get()
  findAll(@Query() filters: FilterPlansDto) {
    return this.plansService.findAll(filters);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generatePlan(@Body() dto: GeneratePlanDto) {
    return this.planAiService.generatePlanContent({
      type: dto.type,
      title: dto.title,
      description: dto.description,
      reposAffected: dto.reposAffected,
    });
  }

  @Get(':id/session')
  getSession(@Param('id') id: string) {
    return this.plansService.getSessionInfo(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plansService.findById(id);
  }

  @Post()
  create(@Body() dto: CreatePlanDto, @CurrentUser() user: UserEntity) {
    return this.plansService.create(dto, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.plansService.update(id, dto, user);
  }

  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  setReady(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.setReady(id, user);
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  execute(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.execute(id, user);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.submit(id, user);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectPlanDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.plansService.reject(id, dto, user);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.unlock(id, user);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  block(
    @Param('id') id: string,
    @Body() dto: BlockPlanDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.plansService.block(id, dto.reason, user);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.unblock(id, user);
  }

  @Post(':id/done')
  @HttpCode(HttpStatus.OK)
  markDone(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.markDone(id, user);
  }

  @Post(':id/rollback')
  @HttpCode(HttpStatus.OK)
  rollback(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.rollback(id, user);
  }

  @Post(':id/wontfix')
  @HttpCode(HttpStatus.OK)
  wontfix(
    @Param('id') id: string,
    @Body() dto: WontfixPlanDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.plansService.wontfix(id, dto.reason, user);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.plansService.getHistory(id, user);
  }
}
