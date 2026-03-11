import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('plan_history')
export class PlanHistoryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id', type: 'text' })
  planId: string;

  @Column({ name: 'changed_by', type: 'text' })
  changedBy: string; // user id

  @Column({ type: 'text' })
  field: string;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;
}
