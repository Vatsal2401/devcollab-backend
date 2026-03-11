import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../sessions/entities/session.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class DevcollabGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DevcollabGateway.name);

  // Map socket.id → { userId, username, role }
  private connectedClients = new Map<string, { userId: string; username: string; role: string }>();

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionsRepo: Repository<SessionEntity>,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = client.handshake.auth?.userId as string;
    const username = client.handshake.auth?.username as string;
    const role = client.handshake.auth?.role as string;

    if (!userId) {
      client.disconnect();
      return;
    }

    this.connectedClients.set(client.id, { userId, username, role });

    const session = this.sessionsRepo.create({
      id: uuidv4(),
      userId,
      socketId: client.id,
      lastPing: new Date(),
    });
    await this.sessionsRepo.save(session);

    this.server.emit('presence:join', { userId, username, role, socketId: client.id });
    this.logger.log(`Client connected: ${username} (${client.id})`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userInfo = this.connectedClients.get(client.id);
    this.connectedClients.delete(client.id);

    await this.sessionsRepo.delete({ socketId: client.id });

    if (userInfo) {
      this.server.emit('presence:leave', { ...userInfo, socketId: client.id });
      this.logger.log(`Client disconnected: ${userInfo.username} (${client.id})`);
    }
  }

  @SubscribeMessage('presence:ping')
  async handlePing(@ConnectedSocket() client: Socket): Promise<void> {
    await this.sessionsRepo.update({ socketId: client.id }, { lastPing: new Date() });
  }

  // ─── Emit helpers (called by services) ───────────────────────────────────

  emitPlanUpdated(plan: any): void {
    this.server.emit('plan:updated', plan);
  }

  emitPlanLocked(plan: any, lockedByUsername: string): void {
    this.server.emit('plan:locked', { plan, lockedByUsername });
  }

  emitPlanUnlocked(plan: any): void {
    this.server.emit('plan:unlocked', plan);
  }

  emitPlanBlocked(plan: any): void {
    this.server.emit('plan:blocked', plan);
  }

  emitActivityNew(activity: any): void {
    this.server.emit('activity:new', activity);
  }

  emitWorktreeCreated(planId: string, branch: string): void {
    this.server.emit('worktree:created', { planId, branch });
  }

  emitWorktreeRemoved(planId: string, branch: string): void {
    this.server.emit('worktree:removed', { planId, branch });
  }

  emitPreviewSwitched(branch: string): void {
    this.server.emit('preview:switched', { branch });
  }

  emitPreviewCrashed(reason: string): void {
    this.server.emit('preview:crashed', { reason });
  }

  emitPreviewRestarted(): void {
    this.server.emit('preview:restarted', { timestamp: new Date().toISOString() });
  }

  emitLockExpiring(planId: string, lockedByUserId: string | null): void {
    // Targeted: only send to the executor's socket
    if (!lockedByUserId) return;
    for (const [socketId, info] of this.connectedClients.entries()) {
      if (info.userId === lockedByUserId) {
        this.server.to(socketId).emit('lock:expiring', { planId, message: 'Lock expires in 15 minutes' });
      }
    }
  }

  emitLockExpired(planId: string, lockedByUserId: string | null): void {
    this.server.emit('lock:expired', { planId, previousLockedBy: lockedByUserId });
  }

  emitConflictDetected(planId: string, conflictingFiles: string[]): void {
    this.server.emit('conflict:detected', { planId, conflictingFiles });
  }

  getOnlineUsers(): { userId: string; username: string; role: string }[] {
    return Array.from(this.connectedClients.values());
  }
}
