// Auto-generated migration: 2026-06-04T22:08:38.518Z
import { DbAdapter } from '../core/db/types';

export const up = async (db: DbAdapter) => {
  await db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(150) UNIQUE NOT NULL, email VARCHAR(254) UNIQUE NOT NULL, password TEXT NOT NULL, firstName VARCHAR(150), lastName VARCHAR(150), isActive BOOLEAN NOT NULL DEFAULT FALSE, isStaff BOOLEAN NOT NULL DEFAULT FALSE, isSuperuser BOOLEAN NOT NULL DEFAULT FALSE, dateJoined DATETIME NOT NULL, lastLogin DATETIME);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(150) UNIQUE NOT NULL, description TEXT);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255) NOT NULL, codename VARCHAR(100) UNIQUE NOT NULL, modelName VARCHAR(100) NOT NULL);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS user_permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, permissionId INTEGER NOT NULL);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS group_permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, groupId INTEGER NOT NULL, permissionId INTEGER NOT NULL);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS user_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, groupId INTEGER NOT NULL);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS email_verification_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, userId VARCHAR(36) NOT NULL, token VARCHAR(255) UNIQUE NOT NULL, createdAt DATETIME NOT NULL, expiresAt DATETIME NOT NULL);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS password_reset_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, userId VARCHAR(36) NOT NULL, token VARCHAR(255) UNIQUE NOT NULL, createdAt DATETIME NOT NULL, expiresAt DATETIME NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS refresh_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, userId VARCHAR(36) NOT NULL, token VARCHAR(500) UNIQUE NOT NULL, createdAt DATETIME NOT NULL, expiresAt DATETIME NOT NULL, revoked BOOLEAN NOT NULL DEFAULT FALSE);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS nextadmin_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255) UNIQUE NOT NULL, appliedAt DATETIME NOT NULL);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS blog_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(100) NOT NULL, slug VARCHAR(100) UNIQUE NOT NULL, description TEXT);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS blog_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title VARCHAR(255) NOT NULL, slug VARCHAR(255) UNIQUE NOT NULL, excerpt TEXT, content TEXT NOT NULL, featuredImage VARCHAR(500), metaTitle VARCHAR(60), metaDescription VARCHAR(160), schema TEXT, categoryId INTEGER, authorId INTEGER, published BOOLEAN NOT NULL DEFAULT FALSE, publishedAt DATETIME, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL);`);
};

export const down = async (db: DbAdapter) => {
  await db.exec(`DROP TABLE IF EXISTS users;`);
  await db.exec(`DROP TABLE IF EXISTS groups;`);
  await db.exec(`DROP TABLE IF EXISTS permissions;`);
  await db.exec(`DROP TABLE IF EXISTS user_permissions;`);
  await db.exec(`DROP TABLE IF EXISTS group_permissions;`);
  await db.exec(`DROP TABLE IF EXISTS user_groups;`);
  await db.exec(`DROP TABLE IF EXISTS email_verification_tokens;`);
  await db.exec(`DROP TABLE IF EXISTS password_reset_tokens;`);
  await db.exec(`DROP TABLE IF EXISTS refresh_tokens;`);
  await db.exec(`DROP TABLE IF EXISTS nextadmin_migrations;`);
  await db.exec(`DROP TABLE IF EXISTS blog_categories;`);
  await db.exec(`DROP TABLE IF EXISTS blog_posts;`);
};
