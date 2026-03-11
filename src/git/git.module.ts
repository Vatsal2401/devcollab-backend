import { Module } from '@nestjs/common';
import { GitService } from './git.service';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [GatewayModule],
  providers: [GitService],
  exports: [GitService],
})
export class GitModule {}
