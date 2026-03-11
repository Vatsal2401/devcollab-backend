import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class GithubOAuthService {
  private readonly logger = new Logger(GithubOAuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  getOAuthUrl(userId: string): string {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = encodeURIComponent(
      `${process.env.APP_URL || 'https://devcollab.autoreels.in'}/api/github/oauth/callback`,
    );
    const scope = encodeURIComponent('repo read:org read:user');
    const state = Buffer.from(userId).toString('base64');
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  async handleCallback(code: string, state: string): Promise<UserEntity> {
    const userId = Buffer.from(state, 'base64').toString('utf8');

    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.APP_URL || 'https://devcollab.autoreels.in'}/api/github/oauth/callback`,
      }),
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error('Failed to get GitHub access token');
    }

    // Get GitHub user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const githubUser: any = await userRes.json();

    // Save to user
    await this.usersRepo.update(userId, {
      githubAccessToken: tokenData.access_token,
      githubUsername: githubUser.login,
      githubAvatarUrl: githubUser.avatar_url,
    });

    return this.usersRepo.findOne({ where: { id: userId } });
  }

  async listRepos(userId: string): Promise<any[]> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.githubAccessToken) throw new Error('GitHub not connected');

    // Get user repos
    const reposRes = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      { headers: { Authorization: `Bearer ${user.githubAccessToken}` } },
    );
    const repos: any[] = await reposRes.json();

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      private: r.private,
      language: r.language,
      defaultBranch: r.default_branch,
      updatedAt: r.updated_at,
      cloneUrl: r.clone_url,
      sshUrl: r.ssh_url,
      htmlUrl: r.html_url,
    }));
  }

  async disconnectGithub(userId: string): Promise<void> {
    await this.usersRepo.update(userId, {
      githubAccessToken: null,
      githubUsername: null,
      githubAvatarUrl: null,
    });
  }
}
