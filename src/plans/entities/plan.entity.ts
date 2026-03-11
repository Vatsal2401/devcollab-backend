import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PlanType {
  FEATURE = 'FEATURE',
  BUG = 'BUG',
  TASK = 'TASK',
  HOTFIX = 'HOTFIX',
}

export enum PlanStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  OPEN = 'OPEN', // BUG plans start here
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  MERGED = 'MERGED',
  QA_APPROVED = 'QA_APPROVED',
  DONE = 'DONE',
  REJECTED = 'REJECTED',
  BLOCKED = 'BLOCKED',
  WONTFIX = 'WONTFIX',
  CLOSED = 'CLOSED', // BUG plans end here
}

export enum PlanPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

@Entity('plans')
export class PlanEntity {
  @PrimaryColumn({ type: 'text' })
  id: string; // e.g. PLAN-001

  @Column({ type: 'text' })
  type: PlanType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  status: PlanStatus;

  @Column({ type: 'text', default: PlanPriority.MEDIUM })
  priority: PlanPriority;

  @Column({ name: 'created_by', type: 'text' })
  createdBy: string; // user id

  @Column({ name: 'assigned_to', type: 'text', nullable: true })
  assignedTo: string | null;

  @Column({ name: 'locked_by', type: 'text', nullable: true })
  lockedBy: string | null;

  @Column({ name: 'locked_at', type: 'datetime', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'lock_expires_at', type: 'datetime', nullable: true })
  lockExpiresAt: Date | null;

  @Column({ type: 'text', nullable: true })
  branch: string | null;

  @Column({ name: 'repos_affected', type: 'text', default: '[]' })
  reposAffected: string; // JSON array of strings

  @Column({ name: 'parent_plan_id', type: 'text', nullable: true })
  parentPlanId: string | null;

  @Column({ name: 'qa_assigned_to', type: 'text', nullable: true })
  qaAssignedTo: string | null;

  @Column({ name: 'qa_signed_off_by', type: 'text', nullable: true })
  qaSignedOffBy: string | null;

  @Column({ name: 'qa_signed_off_at', type: 'datetime', nullable: true })
  qaSignedOffAt: Date | null;

  @Column({ name: 'rollback_tag', type: 'text', nullable: true })
  rollbackTag: string | null;

  @Column({ name: 'rejection_count', default: 0 })
  rejectionCount: number;

  @Column({ name: 'submitted_at', type: 'datetime', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'merged_at', type: 'datetime', nullable: true })
  mergedAt: Date | null;

  @Column({ name: 'done_at', type: 'datetime', nullable: true })
  doneAt: Date | null;

  // Plan content (markdown body — goal, steps, etc.)
  @Column({ type: 'text', nullable: true })
  goal: string | null;

  @Column({ type: 'text', nullable: true })
  background: string | null;

  @Column({ name: 'implementation_steps', type: 'text', nullable: true })
  implementationSteps: string | null;

  @Column({ name: 'claude_instructions', type: 'text', nullable: true })
  claudeInstructions: string | null;

  // JSON arrays: [{text: string, checked: boolean}]
  @Column({ name: 'acceptance_criteria', type: 'text', default: '[]' })
  acceptanceCriteria: string;

  @Column({ name: 'qa_test_cases', type: 'text', default: '[]' })
  qaTestCases: string;

  @Column({ name: 'review_comments', type: 'text', nullable: true })
  reviewComments: string | null;

  @Column({ name: 'qa_notes', type: 'text', nullable: true })
  qaNotes: string | null;

  @Column({ name: 'estimated_hours', type: 'integer', nullable: true })
  estimatedHours: number | null;

  @Column({ name: 'block_reason', type: 'text', nullable: true })
  blockReason: string | null;

  @Column({ name: 'wontfix_reason', type: 'text', nullable: true })
  wontfixReason: string | null;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
