import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { GithubService } from './github.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity } from '../users/entities/user.entity';

@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

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
}
