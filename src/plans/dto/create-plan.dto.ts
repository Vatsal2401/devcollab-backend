import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  MinLength,
} from 'class-validator';
import { PlanType, PlanPriority } from '../entities/plan.entity';

export class CreatePlanDto {
  @IsEnum(PlanType)
  type: PlanType;

  @IsString()
  @MinLength(3)
  title: string;

  @IsEnum(PlanPriority)
  @IsOptional()
  priority?: PlanPriority;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsArray()
  @IsOptional()
  reposAffected?: string[];

  @IsString()
  @IsOptional()
  goal?: string;

  @IsString()
  @IsOptional()
  background?: string;

  @IsString()
  @IsOptional()
  implementationSteps?: string;

  @IsString()
  @IsOptional()
  claudeInstructions?: string;

  @IsArray()
  @IsOptional()
  acceptanceCriteria?: { text: string; checked: boolean }[];

  @IsArray()
  @IsOptional()
  qaTestCases?: { text: string; checked: boolean }[];

  @IsNumber()
  @IsOptional()
  estimatedHours?: number;

  // For BUG plans
  @IsString()
  @IsOptional()
  parentPlanId?: string;
}
