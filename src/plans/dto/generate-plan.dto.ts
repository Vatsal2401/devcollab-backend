import { IsString, IsEnum, IsOptional, MinLength } from 'class-validator';
import { PlanType, PlanPriority } from '../entities/plan.entity';

export class GeneratePlanDto {
  @IsEnum(PlanType)
  type: PlanType;

  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  reposAffected?: string[];
}
