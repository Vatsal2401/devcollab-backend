import { IsString, IsEnum, IsOptional, IsArray, IsNumber } from 'class-validator';
import { PlanPriority } from '../entities/plan.entity';

export class UpdatePlanDto {
  @IsString()
  @IsOptional()
  title?: string;

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

  @IsString()
  @IsOptional()
  qaAssignedTo?: string;
}
