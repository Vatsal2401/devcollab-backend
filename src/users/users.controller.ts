import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity, UserRole } from './entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.PM, UserRole.TECHLEAD)
  findAll() {
    return this.usersService.findAll();
  }

  @Post('invite')
  @Roles(UserRole.PM, UserRole.TECHLEAD)
  invite(@Body() dto: InviteUserDto, @CurrentUser() user: UserEntity) {
    return this.usersService.invite(dto, user.id);
  }

  @Put(':id/role')
  @Roles(UserRole.TECHLEAD)
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.usersService.updateRole(id, dto, user);
  }

  @Put(':id/deactivate')
  @Roles(UserRole.TECHLEAD)
  deactivate(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.usersService.deactivate(id, user);
  }

  @Put(':id/activate')
  @Roles(UserRole.TECHLEAD)
  activate(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.usersService.activate(id, user);
  }
}
