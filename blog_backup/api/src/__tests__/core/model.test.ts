import { describe, it, expect, beforeAll } from 'vitest';
import { Model } from '../../core/model';
import { CharField, BooleanField } from '../../core/fields';

// A minimal model for testing
class TestItem extends Model {
  static getTableName() { return 'test_items'; }
  name = new CharField({ maxLength: 100 });
  active = new BooleanField({ default: true });
}

beforeAll(async () => {
  await TestItem.createTable();
});

describe('Model.createTable', () => {
  it('creates the table without throwing', () => {
    // If we get here, createTable() succeeded (called in beforeAll)
    expect(true).toBe(true);
  });
});

describe('Model CRUD', () => {
  it('creates a record and returns it with an id', async () => {
    const item = await TestItem.objects.create<any>({ name: 'Alpha', active: true });
    expect(item.id).toBeDefined();
    expect(item.name).toBe('Alpha');
  });

  it('retrieves a record by id', async () => {
    const created = await TestItem.objects.create<any>({ name: 'Beta' });
    const found = await TestItem.objects.get<any>({ id: created.id });
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Beta');
  });

  it('returns null for a non-existent id', async () => {
    const found = await TestItem.objects.get<any>({ id: 999999 });
    expect(found).toBeNull();
  });

  it('counts records', async () => {
    const before = await TestItem.objects.count();
    await TestItem.objects.create<any>({ name: 'Gamma' });
    expect(await TestItem.objects.count()).toBe(before + 1);
  });

  it('saves updates to an existing record', async () => {
    const item = await TestItem.objects.create<any>({ name: 'Delta' });
    (item as any).name = 'Delta Updated';
    await item.save();
    const reloaded = await TestItem.objects.get<any>({ id: item.id });
    expect(reloaded!.name).toBe('Delta Updated');
  });

  it('deletes a record', async () => {
    const item = await TestItem.objects.create<any>({ name: 'ToDelete' });
    await item.delete();
    const found = await TestItem.objects.get<any>({ id: item.id });
    expect(found).toBeNull();
  });
});

describe('QuerySet', () => {
  it('filters records', async () => {
    await TestItem.objects.create<any>({ name: 'Filter_A', active: true });
    await TestItem.objects.create<any>({ name: 'Filter_B', active: false });
    const active = await TestItem.objects.filter<any>({ name: 'Filter_A' }).all();
    expect(active.every((i: any) => i.name === 'Filter_A')).toBe(true);
  });

  it('rejects invalid orderBy field (SQL injection guard)', () => {
    expect(() => {
      TestItem.objects.all<any>().orderBy('; DROP TABLE test_items; --');
    }).toThrow(/Security Error/);
  });

  it('rejects invalid filter field (SQL injection guard)', async () => {
    await expect(
      TestItem.objects.filter({ 'badField; DROP TABLE': 'x' }).all()
    ).rejects.toThrow(/Security Error/);
  });

  it('applies limit', async () => {
    const total = await TestItem.objects.count();
    if (total > 1) {
      const limited = await TestItem.objects.all<any>().limit(1).all();
      expect(limited.length).toBe(1);
    }
  });

  it('orders results', async () => {
    const asc = await TestItem.objects.all<any>().orderBy('id', 'ASC').all();
    const desc = await TestItem.objects.all<any>().orderBy('id', 'DESC').all();
    if (asc.length > 1) {
      expect(asc[0].id).toBeLessThan(asc[asc.length - 1].id);
      expect(desc[0].id).toBeGreaterThan(desc[desc.length - 1].id);
    }
  });
});
