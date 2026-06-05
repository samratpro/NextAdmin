import { Pool } from 'pg';
import type { DbAdapter, DbRunResult } from './types';

/** Convert SQLite-style `?` placeholders to PostgreSQL `$1`, `$2`, … */
function toPostgresParams(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Translate SQLite DDL quirks to PostgreSQL equivalents:
 *   INTEGER PRIMARY KEY AUTOINCREMENT  →  SERIAL PRIMARY KEY
 *   DATETIME                           →  TIMESTAMP
 */
function translateDDL(sql: string): string {
  return sql
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMP');
}

export class PostgresAdapter implements DbAdapter {
  private pool: Pool;

  constructor(connectionUrl: string) {
    this.pool = new Pool({ connectionString: connectionUrl });
  }

  async run(sql: string, params: any[] = []): Promise<DbRunResult> {
    const isInsert = /^\s*INSERT/i.test(sql);
    let pgSql = toPostgresParams(sql);

    // Append RETURNING id for INSERT so we can retrieve the last inserted id
    if (isInsert) {
      pgSql = `${pgSql} RETURNING id`;
    }

    const result = await this.pool.query(pgSql, params);
    const lastInsertRowid = isInsert && result.rows[0]?.id ? Number(result.rows[0].id) : 0;

    return {
      lastInsertRowid,
      changes: result.rowCount ?? 0,
    };
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | null> {
    // Add LIMIT 1 only if not already present
    const pgSql = /LIMIT\s+\d+/i.test(sql)
      ? toPostgresParams(sql)
      : `${toPostgresParams(sql)} LIMIT 1`;

    const result = await this.pool.query(pgSql, params);
    return (result.rows[0] as T) ?? null;
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const result = await this.pool.query(toPostgresParams(sql), params);
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(translateDDL(sql));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
