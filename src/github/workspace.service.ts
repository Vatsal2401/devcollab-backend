import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { UserEntity } from '../users/entities/user.entity';
import { RepoConfigEntity } from '../repo-configs/entities/repo-config.entity';

const WORKSPACES_DIR = process.env.WORKSPACES_DIR || '/workspaces';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(RepoConfigEntity)
    private readonly repoConfigsRepo: Repository<RepoConfigEntity>,
  ) {}

  private exec(cmd: string, cwd?: string): string {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }

  async setupRepo(userId: string, repoFullName: string, defaultBranch: string): Promise<RepoConfigEntity> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.githubAccessToken) throw new BadRequestException('GitHub not connected');

    const repoName = repoFullName.split('/')[1];
    const repoDir = path.join(WORKSPACES_DIR, repoName);
    const cloneUrl = `https://${user.githubAccessToken}@github.com/${repoFullName}.git`;

    // Check if already cloned
    if (!fs.existsSync(repoDir)) {
      this.logger.log(`Cloning ${repoFullName} into ${repoDir}...`);
      fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
      this.exec(`git clone ${cloneUrl} ${repoDir}`);
      this.logger.log(`Cloned successfully`);
    } else {
      // Pull latest
      try {
        this.exec(`git fetch origin && git checkout ${defaultBranch} && git pull origin ${defaultBranch}`, repoDir);
      } catch (e) {
        this.logger.warn(`Pull warning: ${e.message}`);
      }
    }

    // Ensure preview branch exists
    try {
      this.exec(`git checkout preview`, repoDir);
      this.logger.log('Switched to existing preview branch');
    } catch (_) {
      // Create preview branch from default
      this.exec(`git checkout -b preview ${defaultBranch}`, repoDir);
      try {
        this.exec(`git push origin preview`, repoDir);
      } catch (e) {
        this.logger.warn(`Could not push preview branch: ${e.message}`);
      }
      this.logger.log('Created preview branch');
    }

    // Update remote URL to use token (for future pushes)
    this.exec(`git remote set-url origin ${cloneUrl}`, repoDir);

    // Upsert repo config
    let config = await this.repoConfigsRepo.findOne({ where: { repoName } });
    if (!config) {
      config = this.repoConfigsRepo.create({
        repoName,
        gitUrl: `https://github.com/${repoFullName}.git`,
        startCmd: 'npm run dev',
        installCmd: 'npm install',
        port: null,
        nodeVersion: null,
        envFile: null,
      });
    }
    config.gitUrl = `https://github.com/${repoFullName}.git`;
    await this.repoConfigsRepo.save(config);

    this.logger.log(`Workspace ready: ${repoDir}`);
    return config;
  }

  async removeRepo(userId: string, repoName: string): Promise<void> {
    const repoDir = path.join(WORKSPACES_DIR, repoName);
    if (fs.existsSync(repoDir)) {
      this.exec(`rm -rf ${repoDir}`);
    }
    await this.repoConfigsRepo.delete({ repoName });
    this.logger.log(`Removed workspace: ${repoDir}`);
  }

  getWorkspaceStatus(repoName: string): { cloned: boolean; currentBranch: string | null; repoPath: string } {
    const repoDir = path.join(WORKSPACES_DIR, repoName);
    if (!fs.existsSync(repoDir)) {
      return { cloned: false, currentBranch: null, repoPath: repoDir };
    }
    try {
      const branch = this.exec(`git rev-parse --abbrev-ref HEAD`, repoDir);
      return { cloned: true, currentBranch: branch, repoPath: repoDir };
    } catch (_) {
      return { cloned: true, currentBranch: null, repoPath: repoDir };
    }
  }
}
