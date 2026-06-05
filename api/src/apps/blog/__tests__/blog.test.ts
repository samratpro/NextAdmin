import { describe, it, expect, beforeAll } from 'vitest';
import DatabaseManager from '../../../core/database';
import { BlogPost } from '../models';
import blogService from '../service';

beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SECRET_KEY = 'test-secret-key-at-least-16-chars';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
    DatabaseManager.initialize(':memory:');
    await BlogPost.createTable();
});

describe('BlogPost model', () => {
    it('creates a record', async () => {
        const item = await BlogPost.objects.create<any>({ title: 'Test Item', slug: 'test-item' });
        expect(item.id).toBeDefined();
        expect(item.title).toBe('Test Item');
    });

    it('retrieves a record by id', async () => {
        const created = await BlogPost.objects.create<any>({ title: 'Find Me', slug: 'find-me' });
        const found = await blogService.getById(created.id!);
        expect(found).not.toBeNull();
        expect((found as any).title).toBe('Find Me');
    });

    it('lists all records', async () => {
        const items = await blogService.list();
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeGreaterThan(0);
    });
});
