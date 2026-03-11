import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepoConfigsController } from './repo-configs.controller';
import { RepoConfigsService } from './repo-configs.service';
import { RepoConfigEntity } from './entities/repo-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RepoConfigEntity])],
  controllers: [RepoConfigsController],
  providers: [RepoConfigsService],
})
export class RepoConfigsModule {}
