import { Model } from './model';
import { Field } from './fields';
import logger from './logger';

export interface AdminOptions {
    appName?: string;  // NEW: App/section name for grouping models (e.g., 'Shop', 'Auth')
    displayName?: string;
    icon?: string;
    permissions?: string[];
    listDisplay?: string[];
    searchFields?: string[];
    filterFields?: string[];
    orderBy?: string;
    readonly?: boolean;
    excludeFields?: string[];
    relatedFields?: Record<string, string>; // fieldName -> ModelName, renders as dropdown
    tabs?: Array<{ label: string; filter: Record<string, any> }>; // NEW: For listing views
}

export interface ModelMetadata {
    model: typeof Model;
    tableName: string;
    appName: string;  // NEW: App/section name
    displayName: string;
    icon: string;
    permissions: string[];
    fields: Record<string, FieldMetadata>;
    adminOptions: AdminOptions;
}

export interface FieldMetadata {
    name: string;
    type: string;
    required: boolean;
    maxLength?: number;
    unique?: boolean;
    default?: any;
    nullable?: boolean;
    choices?: any[];
    relatedModel?: string;  // For ForeignKey
    onDelete?: string;      // For ForeignKey
}

class ModelRegistryClass {
    private models: Map<string, ModelMetadata> = new Map();

    registerModel(model: typeof Model, options: AdminOptions = {}): void {
        const tableName = model.getTableName();
        const modelName = model.name;

        // Extract app name from options or default to 'General'
        const appName = options.appName || 'General';

        // Get field metadata
        const fields = model.getFields();
        const fieldMetadata: Record<string, FieldMetadata> = {};

        for (const [fieldName, field] of Object.entries(fields)) {
            const metadata: FieldMetadata = {
                name: fieldName,
                type: field.constructor.name,
                required: !field.options.nullable,
                maxLength: field.options.maxLength,
                unique: field.options.unique,
                default: field.options.default,
                nullable: field.options.nullable,
                choices: field.options.choices
            };

            // Add ForeignKey-specific metadata
            if (field.constructor.name === 'ForeignKey' && 'relatedModel' in field) {
                metadata.relatedModel = (field as any).relatedModel;
                metadata.onDelete = field.options.onDelete || 'CASCADE';
            }

            fieldMetadata[fieldName] = metadata;
        }

        const metadata: ModelMetadata = {
            model,
            tableName,
            appName,  // NEW: Store app name
            displayName: options.displayName || modelName,
            icon: options.icon || 'database',
            permissions: options.permissions || ['view', 'add', 'change', 'delete'],
            fields: fieldMetadata,
            adminOptions: options
        };

        this.models.set(modelName, metadata);
        logger.info({ modelName, tableName, appName }, 'Registered model');
    }

    getModel(modelName: string): ModelMetadata | undefined {
        return this.models.get(modelName);
    }

    getAllModels(): ModelMetadata[] {
        return Array.from(this.models.values());
    }

    getModelNames(): string[] {
        return Array.from(this.models.keys());
    }

    hasModel(modelName: string): boolean {
        return this.models.has(modelName);
    }

    unregisterModel(modelName: string): void {
        this.models.delete(modelName);
    }

    clear(): void {
        this.models.clear();
    }
}

// Singleton instance
export const ModelRegistry = new ModelRegistryClass();
export default ModelRegistry;
