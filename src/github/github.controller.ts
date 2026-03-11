import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GithubService } from './github.service';
import { GithubOAuthService } from './github-oauth.service';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity } from '../users/entities/user.entity';

@Controller('github')
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    private readonly githubOAuthService: GithubOAuthService,
    private readonly workspaceService: WorkspaceService,
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  @Post('pr')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createPr(@CurrentUser() user: UserEntity) {
    return this.githubService.createPrToMain(user);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Body() payload: any,
    @Headers('x-github-event') event: string,
  ) {
    // GitHub sends event type in header; only handle pull_request events
    if (event === 'pull_request') {
      return this.githubService.handleWebhook(payload);
    }
    return { received: true };
  }

  @Get('oauth/connect')
  async connect(@Query('token') token: string, @Res() res: Response) {
    // Token passed as query param because this is a browser navigation (no headers)
    if (!token) throw new UnauthorizedException('Missing token');
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'devcollab-secret-change-in-prod',
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found');
    const url = this.githubOAuthService.getOAuthUrl(user.id);
    return res.redirect(url);
  }

  @Get('oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      await this.githubOAuthService.handleCallback(code, state);
      const frontendUrl = process.env.FRONTEND_URL || 'https://devcollab-frontend.vercel.app';
      return res.redirect(`${frontendUrl}/settings?github=connected`);
    } catch (e) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://devcollab-frontend.vercel.app';
      return res.redirect(`${frontendUrl}/settings?github=error`);
    }
  }

  @Get('oauth/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@CurrentUser() user: UserEntity) {
    return {
      connected: !!user.githubAccessToken,
      username: user.githubUsername,
      avatarUrl: user.githubAvatarUrl,
    };
  }

  @Delete('oauth/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: UserEntity) {
    await this.githubOAuthService.disconnectGithub(user.id);
    return { message: 'GitHub disconnected' };
  }

  @Get('repos')
  @UseGuards(JwtAuthGuard)
  async listRepos(@CurrentUser() user: UserEntity) {
    return this.githubOAuthService.listRepos(user.id);
  }

  @Post('repos/setup')
  @UseGuards(JwtAuthGuard)
  async setupRepo(
    @CurrentUser() user: UserEntity,
    @Body() dto: { repoFullName: string; defaultBranch: string },
  ) {
    return this.workspaceService.setupRepo(user.id, dto.repoFullName, dto.defaultBranch);
  }

  @Delete('repos/:repoName')
  @UseGuards(JwtAuthGuard)
  async removeRepo(
    @CurrentUser() user: UserEntity,
    @Param('repoName') repoName: string,
  ) {
    await this.workspaceService.removeRepo(user.id, repoName);
    return { message: `Workspace ${repoName} removed` };
  }

  @Get('repos/status/:repoName')
  @UseGuards(JwtAuthGuard)
  getRepoStatus(@Param('repoName') repoName: string) {
    return this.workspaceService.getWorkspaceStatus(repoName);
  }
}
