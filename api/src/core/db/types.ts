export interface DbRunResult {
  lastInsertRowid: number;
  changes: number;
}

export interface DbAdapter {
  run(sql: string, params?: any[]): Promise<DbRunResult>;
  get<T>(sql: string, params?: any[]): Promise<T | null>;
  all<T>(sql: string, params?: any[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
