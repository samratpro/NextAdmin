import { Model } from '../model';
import { CharField, DateTimeField } from '../fields';

export class Migration extends Model {
  name = new CharField({ maxLength: 255, unique: true });
  appliedAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string {
    return 'nextadmin_migrations';
  }
}

export type MigrationRecord = Omit<Migration, 'name' | 'appliedAt'> & {
  name: string;
  appliedAt: string;
};
