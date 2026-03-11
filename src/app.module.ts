import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlansModule } from './plans/plans.module';
import { QaModule } from './qa/qa.module';
import { GitModule } from './git/git.module';
import { GithubModule } from './github/github.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RepoConfigsModule } from './repo-configs/repo-configs.module';
import { SessionsModule } from './sessions/sessions.module';
import { GatewayModule } from './gateway/gateway.module';
import { TerminalModule } from './terminal/terminal.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    PlansModule,
    QaModule,
    GitModule,
    GithubModule,
    NotificationsModule,
    RepoConfigsModule,
    SessionsModule,
    GatewayModule,
    TerminalModule,
  ],
})
export class AppModule {}
