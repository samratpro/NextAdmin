import fs from 'fs';
import path from 'path';

const appName = process.argv[2];

if (!appName) {
    console.error('Usage: npm run startapp <appName>');
    process.exit(1);
}

if (!/^[a-z0-9_]+$/.test(appName)) {
    console.error('App name must be lowercase alphanumeric/underscores only');
    process.exit(1);
}

const appsDir = path.join(__dirname, '../apps');
const appPath = path.join(appsDir, appName);

if (fs.existsSync(appPath)) {
    console.error(`App '${appName}' already exists at ${appPath}`);
    process.exit(1);
}

console.log(`Creating app: ${appName}...`);

try {
    fs.mkdirSync(appPath, { recursive: true });

    const className = capitalize(appName) + 'Item';
    const tableName = appName + '_items';
    const routePath = `/api/${appName}`;
    const tagName = capitalize(appName);
    const serviceName = `${appName}Service`;

    const modelsContent = `import { Model } from '../../core/model';
import { CharField, TextField, BooleanField, DateTimeField } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
    appName: '${tagName}',
    displayName: '${className}',
    icon: 'folder',
    permissions: ['view', 'add', 'change', 'delete'],
    listDisplay: ['id', 'name', 'isActive', 'createdAt'],
    searchFields: ['name'],
    filterFields: ['isActive']
})
export class ${className} extends Model {
    static getTableName(): string {
        return '${tableName}';
    }

    name = new CharField({ maxLength: 100 });
    description = new TextField({ nullable: true });
    isActive = new BooleanField({ default: true });
    createdAt = new DateTimeField({ default: () => new Date().toISOString() });
}
`;
    fs.writeFileSync(path.join(appPath, 'models.ts'), modelsContent);

    const serviceContent = `import { ${className} } from './models';

export class ${className}Service {
    list() {
        return ${className}.objects.all<${className}>()
            .orderBy('id', 'DESC')
            .all();
    }

    getById(id: number) {
        return ${className}.objects.get<${className}>({ id });
    }

    create(data: Partial<${className}>) {
        return ${className}.objects.create<${className}>(data);
    }
}

export default new ${className}Service();
`;
    fs.writeFileSync(path.join(appPath, 'service.ts'), serviceContent);

    const routesContent = `import { FastifyInstance } from 'fastify';
import ${serviceName} from './service';

export default async function ${appName}Routes(fastify: FastifyInstance) {
    fastify.get('${routePath}', {
        schema: {
            tags: ['${tagName}'],
            description: 'List ${className} records'
        }
    }, async () => {
        return { data: ${serviceName}.list() };
    });

    fastify.get('${routePath}/:id', {
        schema: {
            tags: ['${tagName}'],
            description: 'Get a single ${className} record'
        }
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const item = ${serviceName}.getById(parseInt(id, 10));

        if (!item) {
            return reply.code(404).send({ error: '${className} not found' });
        }

        return { data: item };
    });

    fastify.post('${routePath}', {
        schema: {
            tags: ['${tagName}'],
            description: 'Create a ${className} record'
        }
    }, async (request, reply) => {
        const item = ${serviceName}.create(request.body as any);
        return reply.code(201).send({ data: item });
    });
}
`;
    fs.writeFileSync(path.join(appPath, 'routes.ts'), routesContent);

    const indexContent = `export * from './models';
export * from './service';
`;
    fs.writeFileSync(path.join(appPath, 'index.ts'), indexContent);

    const testContent = `import { describe, it, expect, beforeAll } from 'vitest';
import DatabaseManager from '../../../core/database';
import { ${className} } from '../models';
import ${serviceName} from '../service';

beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.SECRET_KEY = 'test-secret-key-at-least-16-chars';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
    DatabaseManager.initialize(':memory:');
    ${className}.createTable();
});

describe('${className} model', () => {
    it('creates a record', () => {
        const item = ${className}.objects.create<any>({ name: 'Test Item' });
        expect(item.id).toBeDefined();
        expect(item.name).toBe('Test Item');
    });

    it('retrieves a record by id', () => {
        const created = ${className}.objects.create<any>({ name: 'Find Me' });
        const found = ${serviceName}.getById(created.id!);
        expect(found).not.toBeNull();
        expect((found as any).name).toBe('Find Me');
    });

    it('lists all records', () => {
        const items = ${serviceName}.list();
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeGreaterThan(0);
    });
});
`;
    fs.mkdirSync(path.join(appPath, '__tests__'), { recursive: true });
    fs.writeFileSync(path.join(appPath, '__tests__', `${appName}.test.ts`), testContent);

    console.log('Created directory structure');
    console.log('Created default model');
    console.log('Created example service');
    console.log('Created example routes');
    console.log('Created test scaffold');

    console.log('\nSUCCESS! Next steps:');
    console.log('1. Open src/index.ts');
    console.log(`2. Add model import: import './apps/${appName}/models';`);
    console.log(`3. Add route import: import ${appName}Routes from './apps/${appName}/routes';`);
    console.log(`4. Register routes: await fastify.register(${appName}Routes);`);
    console.log('5. Restart the server');
    console.log('6. Run npm test to execute tests');
} catch (e) {
    console.error('Failed to create app:', e);
    process.exit(1);
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
