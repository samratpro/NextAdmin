import mssql from 'mssql';
import type { DbAdapter, DbRunResult } from './types';

/**
 * Convert ?-style positional params to MSSQL @p0, @p1, ... named params
 * and build the corresponding InputParameter list.
 */
function convertParams(sql: string, params: any[]): { query: string; inputs: { name: string; value: any }[] } {
  let i = 0;
  const inputs: { name: string; value: any }[] = [];
  const query = sql.replace(/\?/g, () => {
    const name = `p${i}`;
    inputs.push({ name, value: params[i] });
    i++;
    return `@${name}`;
  });
  return { query, inputs };
}

export class MSSQLAdapter implements DbAdapter {
  private pool: mssql.ConnectionPool;

  constructor(url: string) {
    this.pool = new mssql.ConnectionPool(url);
  }

  private async getPool(): Promise<mssql.ConnectionPool> {
    if (!this.pool.connected && !this.pool.connecting) {
      await this.pool.connect();
    }
    return this.pool;
  }

  async run(sql: string, params: any[] = []): Promise<DbRunResult> {
    const pool = await this.getPool();
    const { query, inputs } = convertParams(sql, params);
    const request = pool.request();
    inputs.forEach(({ name, value }) => request.input(name, value));
    const result = await request.query(query);
    return {
      lastInsertRowid: result.recordset?.[0]?.id ?? 0,
      changes: result.rowsAffected[0] ?? 0,
    };
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | null> {
    const pool = await this.getPool();
    const { query, inputs } = convertParams(sql, params);
    const request = pool.request();
    inputs.forEach(({ name, value }) => request.input(name, value));
    const result = await request.query<T>(query);
    return result.recordset.length > 0 ? result.recordset[0] : null;
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const pool = await this.getPool();
    const { query, inputs } = convertParams(sql, params);
    const request = pool.request();
    inputs.forEach(({ name, value }) => request.input(name, value));
    const result = await request.query<T>(query);
    return result.recordset;
  }

  async exec(sql: string): Promise<void> {
    const pool = await this.getPool();
    await pool.request().batch(sql);
  }

  async close(): Promise<void> {
    await this.pool.close();
  }
}
