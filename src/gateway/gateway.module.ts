import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevcollabGateway } from './devcollab.gateway';
import { SessionEntity } from '../sessions/entities/session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SessionEntity])],
  providers: [DevcollabGateway],
  exports: [DevcollabGateway],
})
export class GatewayModule {}
