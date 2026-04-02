import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { DbAdapter, DbRunResult } from './types';

export class SQLiteAdapter implements DbAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  async run(sql: string, params: any[] = []): Promise<DbRunResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as T | undefined;
    return result ?? null;
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
