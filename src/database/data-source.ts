import { DataSource } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { PlanEntity } from '../plans/entities/plan.entity';
import { PlanHistoryEntity } from '../plans/entities/plan-history.entity';
import { ActivityEntity } from '../plans/entities/activity.entity';
import { SessionEntity } from '../sessions/entities/session.entity';
import { RepoConfigEntity } from '../repo-configs/entities/repo-config.entity';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.DATABASE_PATH || '/opt/devcollab/devcollab.db',
  entities: [
    UserEntity,
    PlanEntity,
    PlanHistoryEntity,
    ActivityEntity,
    SessionEntity,
    RepoConfigEntity,
  ],
  synchronize: true,
});
