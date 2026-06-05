import { Field, FieldOptions } from '../fields';

/**
 * Many-to-Many Field - Django-like relationship field
 * 
 * @example
 * groups = new ManyToManyField('Group', { relatedName: 'users' });
 */
export class ManyToManyField extends Field {
    public relatedModel: string;
    public relatedName?: string;
    public throughTable?: string;
    public fieldType: string = 'ManyToManyField';

    constructor(
        relatedModel: string,
        options: FieldOptions & { relatedName?: string; throughTable?: string } = {}
    ) {
        super(options);
        this.relatedModel = relatedModel;
        this.relatedName = options.relatedName;

        // Auto-generate through table name if not provided
        this.throughTable = options.throughTable || `${this.constructor.name.toLowerCase()}_${relatedModel.toLowerCase()}s`;
    }

    getSQLType(): string {
        // ManyToMany doesn't create a column in the main table
        // It creates a separate junction table
        return '';
    }

    getFullDefinition(): string {
        // No column definition needed in main table
        return '';
    }

    // Get the junction table schema
    getJunctionTableSQL(modelName: string): string {
        const table1 = modelName.toLowerCase();
        const table2 = this.relatedModel.toLowerCase();

        return `
      CREATE TABLE IF NOT EXISTS ${this.throughTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ${table1}_id INTEGER NOT NULL,
        ${table2}_id INTEGER NOT NULL,
        FOREIGN KEY (${table1}_id) REFERENCES ${table1}s(id) ON DELETE CASCADE,
        FOREIGN KEY (${table2}_id) REFERENCES ${table2}s(id) ON DELETE CASCADE,
        UNIQUE(${table1}_id, ${table2}_id)
      )
    `;
    }

    getMetadata() {
        return {
            type: 'ManyToManyField',
            relatedModel: this.relatedModel,
            relatedName: this.relatedName,
            throughTable: this.throughTable
        };
    }
}

export default ManyToManyField;
