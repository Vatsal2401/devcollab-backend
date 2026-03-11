import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as pty from 'node-pty';
import { UserEntity } from '../users/entities/user.entity';
import { PlanEntity, PlanStatus } from '../plans/entities/plan.entity';

interface Session {
  pty: pty.IPty;
  planId: string;
  userId: string;
}

@Injectable()
@WebSocketGateway({
  namespace: '/terminal',
  cors: { origin: '*' },
})
export class TerminalGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private sessions = new Map<string, Session>(); // socketId → session

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(PlanEntity)
    private readonly plansRepo: Repository<PlanEntity>,
  ) {}

  async handleDisconnect(client: Socket): Promise<void> {
    const session = this.sessions.get(client.id);
    if (session) {
      try {
        session.pty.kill();
      } catch (_) {}
      this.sessions.delete(client.id);
      this.logger.log(`Terminal session closed for ${client.id}`);
    }
  }

  @SubscribeMessage('terminal:start')
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { planId: string; token: string; cols?: number; rows?: number },
  ): Promise<void> {
    // Validate JWT
    let userId: string;
    try {
      const decoded = this.jwtService.verify(payload.token, {
        secret: process.env.JWT_SECRET || 'devcollab-secret-change-in-prod',
      }) as { sub: string };
      userId = decoded.sub;
    } catch {
      client.emit('terminal:error', { message: 'Unauthorized' });
      client.disconnect();
      return;
    }

    // Verify user exists
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      client.emit('terminal:error', { message: 'User not found' });
      return;
    }

    // Find plan and verify access
    const plan = await this.plansRepo.findOne({ where: { id: payload.planId } });
    if (!plan) {
      client.emit('terminal:error', { message: 'Plan not found' });
      return;
    }

    // Allow access to executor, PM, or TL
    const canAccess =
      plan.lockedBy === userId ||
      ['pm', 'techlead'].includes(user.role);

    if (!canAccess) {
      client.emit('terminal:error', { message: 'Access denied — only the executor, PM, or TL can access this session' });
      return;
    }

    // Kill existing session for this socket if any
    const existing = this.sessions.get(client.id);
    if (existing) {
      try { existing.pty.kill(); } catch (_) {}
    }

    // Compute tmux session name
    const tmuxSession = payload.planId.toLowerCase().replace('plan-', 'plan');
    const cols = payload.cols || 220;
    const rows = payload.rows || 50;

    // Spawn PTY attached to tmux session
    // If session doesn't exist yet, create a new one
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn('bash', ['-c',
        `tmux attach-session -t ${tmuxSession} 2>/dev/null || tmux new-session -s ${tmuxSession} -c /workspaces/active 2>/dev/null || bash`
      ], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: '/workspaces/active',
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      });
    } catch (err) {
      this.logger.error('Failed to spawn PTY:', err.message);
      client.emit('terminal:error', { message: 'Failed to start terminal: ' + err.message });
      return;
    }

    // Store session
    this.sessions.set(client.id, { pty: ptyProcess, planId: payload.planId, userId });

    // Stream PTY output to client
    ptyProcess.onData((data) => {
      client.emit('terminal:data', data);
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      this.logger.log(`PTY exited with code ${exitCode} for socket ${client.id}`);
      client.emit('terminal:exit', { exitCode });
      this.sessions.delete(client.id);
    });

    client.emit('terminal:ready', {
      planId: payload.planId,
      tmuxSession,
      cols,
      rows,
    });

    this.logger.log(`Terminal started: ${user.username} → ${tmuxSession} (${client.id})`);
  }

  @SubscribeMessage('terminal:input')
  handleInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: string,
  ): void {
    const session = this.sessions.get(client.id);
    if (session) {
      try {
        session.pty.write(data);
      } catch (err) {
        this.logger.warn('PTY write error:', err.message);
      }
    }
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { cols: number; rows: number },
  ): void {
    const session = this.sessions.get(client.id);
    if (session) {
      try {
        session.pty.resize(payload.cols, payload.rows);
      } catch (err) {
        this.logger.warn('PTY resize error:', err.message);
      }
    }
  }
}
