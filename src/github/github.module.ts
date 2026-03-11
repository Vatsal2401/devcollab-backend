import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { GithubOAuthService } from './github-oauth.service';
import { WorkspaceService } from './workspace.service';
import { PlanEntity } from '../plans/entities/plan.entity';
import { UserEntity } from '../users/entities/user.entity';
import { RepoConfigEntity } from '../repo-configs/entities/repo-config.entity';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanEntity, UserEntity, RepoConfigEntity]),
    GatewayModule,
  ],
  controllers: [GithubController],
  providers: [GithubService, GithubOAuthService, WorkspaceService],
})
export class GithubModule {}
