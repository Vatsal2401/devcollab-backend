import { Injectable, Logger } from '@nestjs/common';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DevcollabGateway } from '../gateway/devcollab.gateway';

const WORKSPACES_DIR = process.env.WORKSPACES_DIR || '/workspaces';
const REPO_BASE = process.env.REPO_BASE || '/workspaces/preview';
const ENVS_DIR = process.env.ENVS_DIR || '/opt/devcollab/envs';

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);

  constructor(private readonly gateway: DevcollabGateway) {}

  private exec(cmd: string, cwd?: string): string {
    try {
      return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
      throw new Error(err.stderr?.toString() || err.message);
    }
  }

  async createWorktree(branch: string, baseBranch: string, planId: string): Promise<void> {
    const worktreePath = path.join(WORKSPACES_DIR, 'active');

    try {
      // Remove existing worktree if present
      if (fs.existsSync(worktreePath)) {
        try {
          this.exec(`git worktree remove ${worktreePath} --force`, REPO_BASE);
        } catch (_) {}
      }

      // Create new branch from baseBranch
      try {
        this.exec(`git branch ${branch} ${baseBranch}`, REPO_BASE);
      } catch (_) {
        // Branch may already exist
      }

      this.exec(`git worktree add ${worktreePath} ${branch}`, REPO_BASE);
      this.logger.log(`Worktree created at ${worktreePath} for branch ${branch}`);

      // Copy env files
      this.copyEnvFiles(worktreePath);

      // npm install
      try {
        this.exec(`npm install --legacy-peer-deps`, worktreePath);
      } catch (err) {
        this.logger.warn(`npm install warning: ${err.message}`);
      }

      // Start Claude Code in tmux
      const planFile = `/plans/${planId}.md`;
      const sessionName = planId.toLowerCase().replace('plan-', 'plan');
      try {
        this.exec(
          `tmux new-session -d -s ${sessionName} -c ${worktreePath} -- claude --context ${planFile}`,
        );
        this.logger.log(`Claude Code session started: ${sessionName}`);
      } catch (err) {
        this.logger.warn(`tmux/claude session start failed (may not be installed): ${err.message}`);
      }

      // Emit worktree created event
      this.gateway.emitWorktreeCreated(planId, branch);
    } catch (err) {
      this.logger.error(`Worktree creation failed for ${planId}: ${err.message}`);
      this.gateway.emitWorktreeRemoved(planId, '');
      throw err;
    }
  }

  private copyEnvFiles(worktreePath: string): void {
    if (!fs.existsSync(ENVS_DIR)) return;

    const envFiles = fs.readdirSync(ENVS_DIR).filter((f) => f.endsWith('.env'));
    for (const envFile of envFiles) {
      const repoName = envFile.replace('.env', '');
      const targetDir = path.join(worktreePath, repoName);
      if (fs.existsSync(targetDir)) {
        fs.copyFileSync(path.join(ENVS_DIR, envFile), path.join(targetDir, '.env'));
      }
    }
  }

  async mergeToPreview(branch: string, planId: string): Promise<void> {
    const repoPath = REPO_BASE;

    // Save rollback tag before merge
    const rollbackTag = `rollback/before-${planId.toLowerCase()}`;
    try {
      this.exec(`git tag ${rollbackTag} preview`, repoPath);
    } catch (_) {
      // Tag may already exist
    }

    // Detect conflicts before merge
    const conflictFiles = this.detectConflicts(branch, repoPath);
    if (conflictFiles.length > 0) {
      const err: any = new Error(`conflict: Merge conflict detected`);
      err.conflictFiles = conflictFiles;
      throw err;
    }

    // Perform merge
    this.exec(`git checkout preview`, repoPath);
    this.exec(`git merge ${branch} --no-ff -m "Merge ${branch} to preview [${planId}]"`, repoPath);
    this.exec(`git push origin preview`, repoPath);

    // Restart preview server
    try {
      this.exec(`pm2 restart preview-server`);
    } catch (_) {
      this.logger.warn('pm2 restart failed (may not be running)');
    }

    // Clean up worktree and branch
    const worktreePath = path.join(WORKSPACES_DIR, 'active');
    try {
      this.exec(`git worktree remove ${worktreePath} --force`, repoPath);
      this.exec(`git branch -d ${branch}`, repoPath);
    } catch (err) {
      this.logger.warn(`Cleanup warning: ${err.message}`);
    }

    this.logger.log(`Merged ${branch} to preview, tag: ${rollbackTag}`);
  }

  private detectConflicts(branch: string, repoPath: string): string[] {
    try {
      // Dry-run merge to detect conflicts
      this.exec(`git merge --no-commit --no-ff ${branch}`, repoPath);
      // No conflicts — abort the no-commit merge
      this.exec(`git merge --abort`, repoPath);
      return [];
    } catch (_) {
      // Get conflicting files
      try {
        const output = this.exec(`git diff --name-only --diff-filter=U`, repoPath);
        this.exec(`git merge --abort`, repoPath);
        return output ? output.split('\n').filter(Boolean) : [];
      } catch (_) {
        return ['unknown'];
      }
    }
  }

  async mergeHotfixToMainAndPreview(branch: string, planId: string): Promise<void> {
    const repoPath = REPO_BASE;

    // Merge to main
    this.exec(`git checkout main`, repoPath);
    this.exec(`git merge ${branch} --no-ff -m "HOTFIX: Merge ${branch} to main [${planId}]"`, repoPath);
    this.exec(`git push origin main`, repoPath);

    // Back-merge to preview
    this.exec(`git checkout preview`, repoPath);
    this.exec(`git merge ${branch} --no-ff -m "HOTFIX back-merge: ${branch} to preview [${planId}]"`, repoPath);
    this.exec(`git push origin preview`, repoPath);

    // Restart preview server
    try {
      this.exec(`pm2 restart preview-server`);
    } catch (_) {}

    // Clean up
    const worktreePath = path.join(WORKSPACES_DIR, 'active');
    try {
      this.exec(`git worktree remove ${worktreePath} --force`, repoPath);
      this.exec(`git branch -d ${branch}`, repoPath);
    } catch (_) {}

    this.logger.log(`HOTFIX ${branch} merged to main and preview`);
  }

  async rollbackPreview(rollbackTag: string): Promise<void> {
    const repoPath = REPO_BASE;

    this.exec(`git checkout preview`, repoPath);
    this.exec(`git reset --hard ${rollbackTag}`, repoPath);
    this.exec(`git push origin preview --force-with-lease`, repoPath);

    try {
      this.exec(`pm2 restart preview-server`);
    } catch (_) {}

    this.logger.log(`Preview rolled back to ${rollbackTag}`);
  }

  getRollbackTag(planId: string): string {
    return `rollback/before-${planId.toLowerCase()}`;
  }
}
