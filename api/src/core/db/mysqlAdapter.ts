import mysql from 'mysql2/promise';
import type { DbAdapter, DbRunResult } from './types';

export class MySQLAdapter implements DbAdapter {
  private pool: mysql.Pool;

  constructor(url: string) {
    this.pool = mysql.createPool(url);
  }

  async run(sql: string, params: any[] = []): Promise<DbRunResult> {
    const [result] = await this.pool.execute(sql, params);
    const r = result as any;
    return {
      lastInsertRowid: r.insertId ?? 0,
      changes: r.affectedRows ?? 0,
    };
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | null> {
    const [rows] = await this.pool.execute(sql, params);
    const arr = rows as any[];
    return arr.length > 0 ? (arr[0] as T) : null;
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const [rows] = await this.pool.execute(sql, params);
    return rows as T[];
  }

  async exec(sql: string): Promise<void> {
    // exec may contain multiple statements; use query (not execute) for DDL
    const conn = await this.pool.getConnection();
    try {
      for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
        await conn.query(stmt);
      }
    } finally {
      conn.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
