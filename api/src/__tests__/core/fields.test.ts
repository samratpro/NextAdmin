import { describe, it, expect } from 'vitest';
import {
  CharField,
  TextField,
  IntegerField,
  BooleanField,
  DateTimeField,
  FloatField,
} from '../../core/fields';

describe('CharField', () => {
  it('returns VARCHAR SQL type with maxLength', () => {
    const f = new CharField({ maxLength: 100 });
    expect(f.getSQLType()).toBe('VARCHAR(100)');
  });

  it('defaults to VARCHAR(255) when no maxLength', () => {
    const f = new CharField();
    expect(f.getSQLType()).toBe('VARCHAR(255)');
  });
});

describe('TextField', () => {
  it('returns TEXT SQL type', () => {
    expect(new TextField().getSQLType()).toBe('TEXT');
  });
});

describe('IntegerField', () => {
  it('returns INTEGER SQL type', () => {
    expect(new IntegerField().getSQLType()).toBe('INTEGER');
  });
});

describe('BooleanField', () => {
  it('returns BOOLEAN SQL type', () => {
    expect(new BooleanField().getSQLType()).toBe('BOOLEAN');
  });

  it('emits DEFAULT 0 for default: false', () => {
    const f = new BooleanField({ default: false });
    f.fieldName = 'active';
    expect(f.getFullDefinition()).toContain('DEFAULT 0');
  });

  it('emits DEFAULT 1 for default: true', () => {
    const f = new BooleanField({ default: true });
    f.fieldName = 'active';
    expect(f.getFullDefinition()).toContain('DEFAULT 1');
  });
});

describe('DateTimeField', () => {
  it('returns DATETIME SQL type', () => {
    expect(new DateTimeField().getSQLType()).toBe('DATETIME');
  });
});

describe('FloatField', () => {
  it('returns REAL SQL type', () => {
    expect(new FloatField().getSQLType()).toBe('REAL');
  });
});

describe('Field constraints', () => {
  it('adds UNIQUE constraint', () => {
    const f = new CharField({ unique: true });
    f.fieldName = 'email';
    expect(f.getFullDefinition()).toContain('UNIQUE');
  });

  it('adds NOT NULL when nullable is false (default)', () => {
    const f = new CharField();
    f.fieldName = 'name';
    expect(f.getFullDefinition()).toContain('NOT NULL');
  });

  it('omits NOT NULL when nullable is true', () => {
    const f = new CharField({ nullable: true });
    f.fieldName = 'name';
    expect(f.getFullDefinition()).not.toContain('NOT NULL');
  });

  it('emits string DEFAULT with quotes', () => {
    const f = new CharField({ default: 'hello' });
    f.fieldName = 'greeting';
    expect(f.getFullDefinition()).toContain("DEFAULT 'hello'");
  });
});
