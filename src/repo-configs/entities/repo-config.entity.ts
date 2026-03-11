import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('repo_configs')
export class RepoConfigEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'repo_name', type: 'text', unique: true })
  repoName: string;

  @Column({ name: 'git_url', type: 'text' })
  gitUrl: string;

  @Column({ name: 'start_cmd', type: 'text' })
  startCmd: string;

  @Column({ name: 'install_cmd', type: 'text', default: 'npm install' })
  installCmd: string;

  @Column({ type: 'integer', nullable: true })
  port: number | null;

  @Column({ name: 'node_version', type: 'text', nullable: true })
  nodeVersion: string | null;

  @Column({ name: 'env_file', type: 'text', nullable: true })
  envFile: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
