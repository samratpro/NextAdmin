export interface FieldOptions {
  primaryKey?: boolean;
  unique?: boolean;
  nullable?: boolean;
  default?: any;
  autoIncrement?: boolean;
  maxLength?: number;
  minLength?: number;
  choices?: any[];
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export abstract class Field {
  public fieldName: string = '';
  public options: FieldOptions;

  constructor(options: FieldOptions = {}) {
    this.options = {
      nullable: false,
      ...options
    };
  }

  abstract getSQLType(): string;

  getConstraints(): string {
    const constraints: string[] = [];

    if (this.options.primaryKey) {
      constraints.push('PRIMARY KEY');
    }

    if (this.options.autoIncrement) {
      constraints.push('AUTOINCREMENT');
    }

    if (this.options.unique) {
      constraints.push('UNIQUE');
    }

    if (!this.options.nullable && !this.options.primaryKey) {
      constraints.push('NOT NULL');
    }

    if (this.options.default !== undefined && typeof this.options.default !== 'function') {
      if (typeof this.options.default === 'string') {
        constraints.push(`DEFAULT '${this.options.default}'`);
      } else if (typeof this.options.default === 'boolean') {
        constraints.push(`DEFAULT ${this.options.default ? 1 : 0}`);
      } else {
        constraints.push(`DEFAULT ${this.options.default}`);
      }
    }

    return constraints.join(' ');
  }

  getFullDefinition(): string {
    const sqlType = this.getSQLType();
    const constraints = this.getConstraints();
    return `${this.fieldName} ${sqlType} ${constraints}`.trim();
  }
}

export class CharField extends Field {
  getSQLType(): string {
    return `VARCHAR(${this.options.maxLength || 255})`;
  }
}

export class TextField extends Field {
  getSQLType(): string {
    return 'TEXT';
  }
}

export class IntegerField extends Field {
  getSQLType(): string {
    return 'INTEGER';
  }
}

export class FloatField extends Field {
  getSQLType(): string {
    return 'REAL';
  }
}

export class BooleanField extends Field {
  constructor(options: FieldOptions = {}) {
    super({ default: false, ...options });
  }

  getSQLType(): string {
    return 'BOOLEAN';
  }

  getFullDefinition(): string {
    // The base getConstraints() emits DEFAULT 1 / DEFAULT 0 for boolean options.
    // PostgreSQL's BOOLEAN column rejects integer literals; use TRUE/FALSE instead.
    // SQLite ≥3.23 also accepts TRUE/FALSE, so this is safe for both engines.
    return super.getFullDefinition()
      .replace(/\bDEFAULT 1\b/, 'DEFAULT TRUE')
      .replace(/\bDEFAULT 0\b/, 'DEFAULT FALSE');
  }
}

export class DateTimeField extends Field {
  constructor(options: FieldOptions = {}) {
    super(options);
  }

  getSQLType(): string {
    return 'DATETIME';
  }
}

export class DateField extends Field {
  getSQLType(): string {
    return 'DATE';
  }
}

export class EmailField extends CharField {
  constructor(options: FieldOptions = {}) {
    super({ maxLength: 254, ...options });
  }
}

export class AutoField extends IntegerField {
  constructor(options: FieldOptions = {}) {
    super({ primaryKey: true, autoIncrement: true, ...options });
  }
}

export class ForeignKey extends Field {
  public relatedModel: string;
  public relatedField: string;
  public fieldType: string = 'ForeignKey'; // For admin UI detection

  constructor(relatedModel: string, options: FieldOptions = {}) {
    super(options);
    this.relatedModel = relatedModel;
    this.relatedField = 'id';
  }

  getSQLType(): string {
    return 'INTEGER';
  }

  getFullDefinition(): string {
    const baseDefinition = super.getFullDefinition();
    const onDelete = this.options.onDelete || 'CASCADE';
    const onUpdate = this.options.onUpdate || 'CASCADE';

    return `${baseDefinition}, FOREIGN KEY (${this.fieldName}) REFERENCES ${this.relatedModel.toLowerCase()}s(${this.relatedField}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
  }

  // Metadata for ModelRegistry
  getMetadata() {
    return {
      type: 'ForeignKey',
      relatedModel: this.relatedModel,
      onDelete: this.options.onDelete || 'CASCADE',
      nullable: this.options.nullable || false
    };
  }
}
