import { Controller, Post, Put, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { QaService, QaSignoffDto, QaRejectDto, QaBugDto, AssignQaDto } from './qa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity } from '../users/entities/user.entity';

@Controller('plans/:id/qa')
@UseGuards(JwtAuthGuard)
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Post('signoff')
  @HttpCode(HttpStatus.OK)
  signoff(@Param('id') id: string, @Body() dto: QaSignoffDto, @CurrentUser() user: UserEntity) {
    return this.qaService.signoff(id, dto, user);
  }

  @Post('reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() dto: QaRejectDto, @CurrentUser() user: UserEntity) {
    return this.qaService.reject(id, dto, user);
  }

  @Post('bug')
  createBug(@Param('id') id: string, @Body() dto: QaBugDto, @CurrentUser() user: UserEntity) {
    return this.qaService.createBug(id, dto, user);
  }

  @Put('assign')
  assignQa(@Param('id') id: string, @Body() dto: AssignQaDto, @CurrentUser() user: UserEntity) {
    return this.qaService.assignQa(id, dto, user);
  }
}
