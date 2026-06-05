# AI Prompt: Generate Custom NextAdmin Model and App

Copy the prompt block below and paste it into your AI coding assistant to instantly create a new Django-style app and register models.

---

```text
Act as a premium Node.js and TypeScript developer specializing in the NextAdmin framework.

I want to create a new backend app module called "[APP_NAME_LOWERCASE]" (e.g. store, tasks) with a custom database model called "[MODEL_NAME_CAMELCASE]" (e.g. Product, Task).

Key Specifications:
1. Model Attributes & Fields:
[LIST_OF_FIELDS_AND_TYPES] (e.g., name: CharField, count: IntegerField, description: TextField, isFeatured: BooleanField)

2. Admin Panel Registration Options:
- Section Group (appName): "[APP_GROUP]" (e.g., "Store", "Tasks")
- Display Name: "[DISPLAY_NAME]" (e.g., "Manage Products")
- Icon: "[LUCIDE_ICON]" (e.g., "package", "check-square")
- Columns to show in table (listDisplay): [LIST_COLUMNS] (e.g., ['id', 'name', 'count'])
- Search fields: [SEARCH_FIELDS] (e.g., ['name', 'description'])
- Filtering columns: [FILTER_FIELDS] (e.g., ['isFeatured'])
- Related Fields mapping (relatedFields): [RELATED_FIELDS_JSON] (e.g., { categoryId: 'Category' })

Please generate the complete codebase files matching the NextAdmin framework's exact API structures:

- File 1: `api/src/apps/[APP_NAME_LOWERCASE]/models.ts`
  - Import the model class and custom field descriptors:
    ```ts
    import { Model } from '../../core/model';
    import { CharField, TextField, BooleanField, DateTimeField, IntegerField, FloatField, ForeignKey } from '../../core/fields';
    import { registerAdmin } from '../../core/adminRegistry';
    ```
  - Define the class extending `Model` using the `@registerAdmin` decorator.
  - Implement the static table name override:
    ```ts
    static getTableName(): string {
      return '[APP_NAME_LOWERCASE]_[MODEL_NAME_LOWERCASE]s';
    }
    ```
  - Map variables to custom fields (e.g. `title = new CharField({ maxLength: 255 });`). Use defaults and nullability options correctly.

- File 2: `api/src/apps/[APP_NAME_LOWERCASE]/routes.ts`
  - Implement a default-exported Fastify routes plugin:
    ```ts
    import { FastifyInstance } from 'fastify';
    import { [MODEL_NAME_CAMELCASE] } from './models';
    
    export default async function [APP_NAME_LOWERCASE]Routes(fastify: FastifyInstance) {
      // Endpoint 1: List all
      fastify.get('/api/public/[APP_NAME_LOWERCASE]', async (request, reply) => {
        const items = await [MODEL_NAME_CAMELCASE].objects.all<[MODEL_NAME_CAMELCASE]>().all();
        return { data: items };
      });
      
      // Endpoint 2: Get single by identifier
      fastify.get('/api/public/[APP_NAME_LOWERCASE]/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const item = await [MODEL_NAME_CAMELCASE].objects.get<[MODEL_NAME_CAMELCASE]>({ id: parseInt(id) });
        if (!item) return reply.code(404).send({ error: 'Item not found' });
        return { data: item };
      });
    }
    ```
  - Leverage typed querysets `all<T>()`, `filter<T>()`, `get<T>()`, and `.objects` correctly.

- File 3: `api/src/apps/[APP_NAME_LOWERCASE]/seed.ts` (Optional Seeder)
  - Create a default-exported async function that populates the database table with sample mock data on startup if the count is zero.

Do not use Prisma. Avoid importing paths outside of `../../core/` modules. The Auto-Discovery Engine dynamically reads models and registers routes from the custom app folders.
```

