import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export enum UserRole {
  JUNIOR = 'junior',
  SENIOR = 'senior',
  QA = 'qa',
  PM = 'pm',
  TECHLEAD = 'techlead',
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({
    type: 'text',
    default: UserRole.JUNIOR,
  })
  role: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'invited_by', nullable: true })
  invitedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'last_seen', nullable: true })
  lastSeen: Date;

  @Column({ name: 'github_access_token', type: 'text', nullable: true })
  githubAccessToken: string | null;

  @Column({ name: 'github_username', type: 'text', nullable: true })
  githubUsername: string | null;

  @Column({ name: 'github_avatar_url', type: 'text', nullable: true })
  githubAvatarUrl: string | null;
}
