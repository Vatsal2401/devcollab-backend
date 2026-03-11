import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { PlanEntity } from './entities/plan.entity';
import { PlanHistoryEntity } from './entities/plan-history.entity';
import { ActivityEntity } from './entities/activity.entity';
import { UserEntity } from '../users/entities/user.entity';
import { GitModule } from '../git/git.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanEntity, PlanHistoryEntity, ActivityEntity, UserEntity]),
    GitModule,
    GatewayModule,
  ],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService, TypeOrmModule],
})
export class PlansModule {}
