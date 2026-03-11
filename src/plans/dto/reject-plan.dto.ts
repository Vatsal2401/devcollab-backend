import { IsString, MinLength } from 'class-validator';

export class RejectPlanDto {
  @IsString()
  @MinLength(5)
  reason: string;
}
