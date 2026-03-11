import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { TerminalGateway } from './terminal.gateway';
import { UserEntity } from '../users/entities/user.entity';
import { PlanEntity } from '../plans/entities/plan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, PlanEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'devcollab-secret-change-in-prod',
    }),
  ],
  providers: [TerminalGateway],
  exports: [TerminalGateway],
})
export class TerminalModule {}
