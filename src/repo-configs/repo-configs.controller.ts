import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  RepoConfigsService,
  CreateRepoConfigDto,
  UpdateRepoConfigDto,
} from './repo-configs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity, UserRole } from '../users/entities/user.entity';

@Controller('repo-configs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PM, UserRole.TECHLEAD)
export class RepoConfigsController {
  constructor(private readonly repoConfigsService: RepoConfigsService) {}

  @Get()
  findAll() {
    return this.repoConfigsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateRepoConfigDto, @CurrentUser() user: UserEntity) {
    return this.repoConfigsService.create(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRepoConfigDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.repoConfigsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.TECHLEAD)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserEntity) {
    return this.repoConfigsService.remove(id, user);
  }
}
