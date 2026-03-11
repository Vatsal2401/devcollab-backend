import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsOptional, IsNumber, IsInt } from 'class-validator';
import { RepoConfigEntity } from './entities/repo-config.entity';
import { UserEntity, UserRole } from '../users/entities/user.entity';

export class CreateRepoConfigDto {
  @IsString()
  repoName: string;

  @IsString()
  gitUrl: string;

  @IsString()
  startCmd: string;

  @IsString()
  @IsOptional()
  installCmd?: string;

  @IsInt()
  @IsOptional()
  port?: number;

  @IsString()
  @IsOptional()
  nodeVersion?: string;

  @IsString()
  @IsOptional()
  envFile?: string;
}

export class UpdateRepoConfigDto {
  @IsString()
  @IsOptional()
  gitUrl?: string;

  @IsString()
  @IsOptional()
  startCmd?: string;

  @IsString()
  @IsOptional()
  installCmd?: string;

  @IsInt()
  @IsOptional()
  port?: number;

  @IsString()
  @IsOptional()
  nodeVersion?: string;

  @IsString()
  @IsOptional()
  envFile?: string;
}

@Injectable()
export class RepoConfigsService {
  constructor(
    @InjectRepository(RepoConfigEntity)
    private readonly repoConfigsRepo: Repository<RepoConfigEntity>,
  ) {}

  private requireManager(user: UserEntity): void {
    if (![UserRole.PM, UserRole.TECHLEAD].includes(user.role)) {
      throw new ForbiddenException('Only PM or Tech Lead can manage repo configs');
    }
  }

  async findAll(): Promise<RepoConfigEntity[]> {
    return this.repoConfigsRepo.find({ order: { repoName: 'ASC' } });
  }

  async create(dto: CreateRepoConfigDto, user: UserEntity): Promise<RepoConfigEntity> {
    this.requireManager(user);
    const config = this.repoConfigsRepo.create({
      repoName: dto.repoName,
      gitUrl: dto.gitUrl,
      startCmd: dto.startCmd,
      installCmd: dto.installCmd || 'npm install',
      port: dto.port || null,
      nodeVersion: dto.nodeVersion || null,
      envFile: dto.envFile || null,
    });
    return this.repoConfigsRepo.save(config);
  }

  async update(
    id: number,
    dto: UpdateRepoConfigDto,
    user: UserEntity,
  ): Promise<RepoConfigEntity> {
    this.requireManager(user);
    const config = await this.repoConfigsRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException(`Repo config ${id} not found`);

    Object.assign(config, dto);
    return this.repoConfigsRepo.save(config);
  }

  async remove(id: number, user: UserEntity): Promise<{ message: string }> {
    if (user.role !== UserRole.TECHLEAD) {
      throw new ForbiddenException('Only Tech Lead can delete repo configs');
    }
    const config = await this.repoConfigsRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException(`Repo config ${id} not found`);

    await this.repoConfigsRepo.remove(config);
    return { message: `Repo config '${config.repoName}' deleted` };
  }
}
