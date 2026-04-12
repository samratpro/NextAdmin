import type { DbAdapter } from './db/types';
import { SQLiteAdapter } from './db/sqliteAdapter';
import { PostgresAdapter } from './db/postgresAdapter';

export interface DatabaseConfig {
  engine: 'sqlite' | 'postgresql';
  /** SQLite file path (or ':memory:' for tests). Ignored when engine is 'postgresql'. */
  path?: string;
  /** PostgreSQL connection URL. Required when engine is 'postgresql'. */
  url?: string;
}

class DatabaseManager {
  private static adapter: DbAdapter | null = null;

  static initialize(config: DatabaseConfig | string): DbAdapter {
    // Accept a raw string for backwards-compatibility (treated as SQLite path)
    if (typeof config === 'string') {
      this.adapter = new SQLiteAdapter(config);
      return this.adapter;
    }

    if (config.engine === 'postgresql') {
      if (!config.url) {
        throw new Error('DATABASE_URL is required when DB_ENGINE=postgresql');
      }
      this.adapter = new PostgresAdapter(config.url);
    } else {
      this.adapter = new SQLiteAdapter(config.path || './db.sqlite3');
    }

    return this.adapter;
  }

  static getAdapter(): DbAdapter {
    if (!this.adapter) {
      // Lazy default: SQLite in the current working directory
      this.adapter = new SQLiteAdapter('./db.sqlite3');
    }
    return this.adapter;
  }

  /** @deprecated Use getAdapter() */
  static getConnection(): DbAdapter {
    return this.getAdapter();
  }

  static async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close();
      this.adapter = null;
    }
  }

  static getPath(): string {
    return './db.sqlite3';
  }
}

export default DatabaseManager;
