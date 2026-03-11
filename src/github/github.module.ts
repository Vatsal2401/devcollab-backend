import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { PlanEntity } from '../plans/entities/plan.entity';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([PlanEntity]), GatewayModule],
  controllers: [GithubController],
  providers: [GithubService],
})
export class GithubModule {}
