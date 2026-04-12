import { Model } from './model';
import { ModelRegistry, AdminOptions } from './ModelRegistry';

/**
 * Decorator to register a model in the admin panel
 * 
 * @example
 * @registerAdmin({
 *   displayName: 'Products',
 *   icon: 'package',
 *   permissions: ['view', 'add', 'change', 'delete']
 * })
 * export class Product extends Model {
 *   // ...
 * }
 */
export function registerAdmin(options: AdminOptions = {}) {
    return function <T extends typeof Model>(constructor: T) {
        // Register the model in the ModelRegistry
        ModelRegistry.registerModel(constructor, options);
        return constructor;
    };
}

/**
 * Helper function to manually register a model
 */
export function registerModel(model: typeof Model, options: AdminOptions = {}): void {
    ModelRegistry.registerModel(model, options);
}

export default registerAdmin;
