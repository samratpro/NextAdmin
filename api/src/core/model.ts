import DatabaseManager from './database';
import { Field, AutoField } from './fields';
import settings from '../config/settings';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export class QuerySet<T> {
  private model: typeof Model;
  private filters: Record<string, any> = {};
  private options: QueryOptions = {};

  constructor(model: typeof Model) {
    this.model = model;
  }

  filter(filters: Record<string, any>): QuerySet<T> {
    this.filters = { ...this.filters, ...filters };
    return this;
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): QuerySet<T> {
    const validFields = Object.keys(this.model.getFields());
    if (!validFields.includes(field) && field !== 'id') {
      throw new Error(`Security Error: Invalid orderBy field '${field}'`);
    }
    this.options.orderBy = field;
    this.options.orderDirection = direction;
    return this;
  }

  limit(count: number): QuerySet<T> {
    this.options.limit = count;
    return this;
  }

  offset(count: number): QuerySet<T> {
    this.options.offset = count;
    return this;
  }

  private buildWhereClause(params: any[]): string {
    if (Object.keys(this.filters).length === 0) return '';

    const validFields = Object.keys(this.model.getFields());
    const conditions: string[] = [];

    for (const key of Object.keys(this.filters)) {
      if (!validFields.includes(key) && key !== 'id') {
        throw new Error(`Security Error: Invalid filter field '${key}' on model '${this.model.name}'`);
      }
      params.push(this.filters[key]);
      conditions.push(`${key} = ?`);
    }

    return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  }

  async all(): Promise<T[]> {
    const db = DatabaseManager.getAdapter();
    const tableName = this.model.getTableName();

    let query = `SELECT * FROM ${tableName}`;
    const params: any[] = [];

    query += this.buildWhereClause(params);

    if (this.options.orderBy) {
      query += ` ORDER BY ${this.options.orderBy} ${this.options.orderDirection || 'ASC'}`;
    }
    if (this.options.limit) {
      query += ` LIMIT ${this.options.limit}`;
    }
    if (this.options.offset) {
      query += ` OFFSET ${this.options.offset}`;
    }

    const results = await db.all<Record<string, any>>(query, params);

    return results.map(row => {
      const instance = new (this.model as any)();
      Object.assign(instance, (this.model as typeof Model).normaliseRow(row));
      return instance as T;
    });
  }

  async first(): Promise<T | null> {
    const results = await this.limit(1).all();
    return results.length > 0 ? results[0] : null;
  }

  async count(): Promise<number> {
    const db = DatabaseManager.getAdapter();
    const tableName = this.model.getTableName();

    let query = `SELECT COUNT(*) as count FROM ${tableName}`;
    const params: any[] = [];

    query += this.buildWhereClause(params);

    const result = await db.get<{ count: number }>(query, params);
    return result?.count ?? 0;
  }

  async delete(): Promise<number> {
    const db = DatabaseManager.getAdapter();
    const tableName = this.model.getTableName();

    let query = `DELETE FROM ${tableName}`;
    const params: any[] = [];

    query += this.buildWhereClause(params);

    const result = await db.run(query, params);
    return result.changes;
  }
}

export class Model {
  id?: number;

  static fields: Record<string, Field> = {};

  static getTableName(): string {
    return this.name.toLowerCase() + 's';
  }

  static getFields(): Record<string, Field> {
    const fields: Record<string, Field> = {};

    const idField = new AutoField();
    idField.fieldName = 'id';
    fields.id = idField;

    const instance = new (this as any)();
    for (const key in instance) {
      if (instance[key] instanceof Field) {
        const field = instance[key] as Field;
        field.fieldName = key;
        fields[key] = field;
      }
    }

    return fields;
  }

  /**
   * Normalise a raw DB row to camelCase field names.
   * PostgreSQL lowercases all unquoted identifiers, so a row from PG has
   * keys like `isactive` instead of `isActive`. This method maps each
   * camelCase field name from the model definition back to the correct key,
   * trying the camelCase name first (SQLite) and then the all-lowercase
   * variant (PostgreSQL).
   */
  static normaliseRow(row: Record<string, any>): Record<string, any> {
    const fields = this.getFields();
    const normalised: Record<string, any> = {};
    for (const fieldName of Object.keys(fields)) {
      const lcName = fieldName.toLowerCase();
      if (fieldName in row) {
        normalised[fieldName] = row[fieldName];
      } else if (lcName in row) {
        normalised[fieldName] = row[lcName];
      }
    }
    return normalised;
  }

  static async createTable(): Promise<void> {
    const db = DatabaseManager.getAdapter();
    const tableName = this.getTableName();
    const fields = this.getFields();

    const fieldDefinitions: string[] = [];
    const foreignKeys: string[] = [];

    for (const [, field] of Object.entries(fields)) {
      const definition = field.getFullDefinition();

      if (definition.includes('FOREIGN KEY')) {
        const parts = definition.split(', FOREIGN KEY');
        fieldDefinitions.push(parts[0]);
        foreignKeys.push('FOREIGN KEY' + parts[1]);
      } else {
        fieldDefinitions.push(definition);
      }
    }

    const allDefinitions = [...fieldDefinitions, ...foreignKeys].join(', ');
    await db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${allDefinitions})`);
  }

  static async dropTable(): Promise<void> {
    const db = DatabaseManager.getAdapter();
    const tableName = this.getTableName();
    await db.exec(`DROP TABLE IF EXISTS ${tableName}`);
  }

  static get objects() {
    const ModelClass = this;
    return {
      all<T>(): QuerySet<T> {
        return new QuerySet<T>(ModelClass);
      },

      filter<T>(filters: Record<string, any>): QuerySet<T> {
        return new QuerySet<T>(ModelClass).filter(filters);
      },

      async get<T>(filters: Record<string, any>): Promise<T | null> {
        return new QuerySet<T>(ModelClass).filter(filters).first();
      },

      async create<T>(data: Partial<T>): Promise<T> {
        const instance = new (ModelClass as any)();
        Object.assign(instance, data);
        await instance.save();
        return instance as T;
      },

      async count(): Promise<number> {
        return new QuerySet(ModelClass).count();
      },
    };
  }

  async save(): Promise<void> {
    const db = DatabaseManager.getAdapter();
    const tableName = (this.constructor as typeof Model).getTableName();
    const fields = (this.constructor as typeof Model).getFields();

    const data: Record<string, any> = {};

    for (const fieldName of Object.keys(fields)) {
      if (fieldName === 'id') continue;

      let value = (this as any)[fieldName];
      const field = fields[fieldName];

      // If value is still a Field instance, use its default or skip
      if (value !== undefined && value !== null && typeof value === 'object' && 'fieldName' in value) {
        if (field.options.default !== undefined) {
          value = typeof field.options.default === 'function' ? field.options.default() : field.options.default;
        } else {
          continue;
        }
      }

      // Apply default when value is absent
      if ((value === undefined || value === null) && field.options.default !== undefined) {
        value = typeof field.options.default === 'function' ? field.options.default() : field.options.default;
      }

      // better-sqlite3 rejects JS booleans; convert to 0/1 for SQLite only.
      // PostgreSQL's BOOLEAN column requires actual JS booleans via the pg driver.
      data[fieldName] = (settings.database.engine === 'sqlite' && typeof value === 'boolean')
        ? (value ? 1 : 0)
        : value;
    }

    if (this.id) {
      const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
      await db.run(
        `UPDATE ${tableName} SET ${setClause} WHERE id = ?`,
        [...Object.values(data), this.id]
      );
    } else {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => '?').join(', ');
      const result = await db.run(
        `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
        Object.values(data)
      );
      this.id = result.lastInsertRowid;
    }
  }

  async delete(): Promise<void> {
    if (!this.id) throw new Error('Cannot delete unsaved object');
    const db = DatabaseManager.getAdapter();
    const tableName = (this.constructor as typeof Model).getTableName();
    await db.run(`DELETE FROM ${tableName} WHERE id = ?`, [this.id]);
  }

  toJSON(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key in this) {
      const value = (this as any)[key];
      if (
        typeof value !== 'function' &&
        (value === null || value === undefined || typeof value !== 'object' || !('fieldName' in value))
      ) {
        result[key] = value;
      }
    }
    return result;
  }
}
