import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { PlanEntity } from '../plans/entities/plan.entity';
import { UserEntity } from '../users/entities/user.entity';
import { PlansModule } from '../plans/plans.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanEntity, UserEntity]),
    PlansModule,
    GatewayModule,
  ],
  controllers: [QaController],
  providers: [QaService],
  exports: [QaService],
})
export class QaModule {}
