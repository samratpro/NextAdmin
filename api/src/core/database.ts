import type { DbAdapter } from './db/types';
import { SQLiteAdapter } from './db/sqliteAdapter';
import { PostgresAdapter } from './db/postgresAdapter';
import { MySQLAdapter } from './db/mysqlAdapter';
import { MSSQLAdapter } from './db/mssqlAdapter';

export type DbEngine = 'sqlite' | 'postgresql' | 'mysql' | 'mariadb' | 'mssql';

export interface DatabaseConfig {
  engine: DbEngine;
  /** SQLite file path (or ':memory:' for tests). Only used when engine is 'sqlite'. */
  path?: string;
  /** Connection URL. Required for all non-SQLite engines. */
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

    switch (config.engine) {
      case 'postgresql':
        if (!config.url) throw new Error('DATABASE_URL is required when DB_ENGINE=postgresql');
        this.adapter = new PostgresAdapter(config.url);
        break;

      case 'mysql':
      case 'mariadb':
        if (!config.url) throw new Error('DATABASE_URL is required when DB_ENGINE=mysql/mariadb');
        this.adapter = new MySQLAdapter(config.url);
        break;

      case 'mssql':
        if (!config.url) throw new Error('DATABASE_URL is required when DB_ENGINE=mssql');
        this.adapter = new MSSQLAdapter(config.url);
        break;

      case 'sqlite':
      default:
        this.adapter = new SQLiteAdapter(config.path || './db.sqlite3');
        break;
    }

    return this.adapter;
  }

  static getAdapter(): DbAdapter {
    if (!this.adapter) {
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
