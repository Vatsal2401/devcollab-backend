import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('sessions')
export class SessionEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ name: 'socket_id', type: 'text', nullable: true })
  socketId: string | null;

  @CreateDateColumn({ name: 'connected_at' })
  connectedAt: Date;

  @Column({ name: 'last_ping', type: 'datetime', nullable: true })
  lastPing: Date | null;
}
