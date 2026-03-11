import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('activity')
export class ActivityEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id', type: 'text', nullable: true })
  planId: string | null;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
