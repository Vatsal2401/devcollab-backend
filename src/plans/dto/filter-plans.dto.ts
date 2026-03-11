import { IsOptional, IsEnum, IsString } from 'class-validator';
import { PlanType, PlanStatus, PlanPriority } from '../entities/plan.entity';

export class FilterPlansDto {
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @IsOptional()
  @IsEnum(PlanType)
  type?: PlanType;

  @IsOptional()
  @IsString()
  assigned_to?: string;

  @IsOptional()
  @IsEnum(PlanPriority)
  priority?: PlanPriority;

  @IsOptional()
  @IsString()
  parent_plan_id?: string;
}
