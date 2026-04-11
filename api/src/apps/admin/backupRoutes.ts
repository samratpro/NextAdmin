import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { google } from 'googleapis';
import { requireSuperuser } from '../../middleware/auth';
import DatabaseManager from '../../core/database';
import settings from '../../config/settings';

const execAsync = promisify(exec);

// Backups stored under <api-cwd>/backups/
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

// ─── Google Drive helpers ─────────────────────────────────────────────────────

const DRIVE_FOLDER_NAME = 'nango_backup';
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKENS_FILE      = path.resolve(process.cwd(), '.google_tokens.json');
const CREDENTIALS_FILE = path.resolve(process.cwd(), '.google_credentials.json');

// ── token helpers ─────────────────────────────────────────────────────────────
function loadStoredTokens(): any | null {
  try { if (fs.existsSync(TOKENS_FILE)) return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch {}
  return null;
}
function saveTokens(tokens: any) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}
function clearTokens() {
  try { if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE); } catch {}
}

// ── credentials helpers ───────────────────────────────────────────────────────
interface OAuthCredentials { clientId: string; clientSecret: string }

/**
 * Load OAuth2 credentials from (in priority order):
 *   1. .google_credentials.json  — uploaded via admin UI
 *   2. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars
 */
function loadOAuthCredentials(): OAuthCredentials | null {
  // 1. Uploaded credentials file
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      // Google downloads credentials as { web: {...} } or { installed: {...} }
      const entry = raw.web ?? raw.installed ?? raw;
      if (entry.client_id && entry.client_secret) {
        return { clientId: entry.client_id, clientSecret: entry.client_secret };
      }
    }
  } catch {}

  // 2. Env vars
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };

  return null;
}

/** Validate a parsed JSON object looks like a Google OAuth2 credentials file */
function validateCredentialsJson(parsed: any): OAuthCredentials | null {
  const entry = parsed.web ?? parsed.installed ?? parsed;
  if (entry?.client_id && entry?.client_secret) {
    return { clientId: entry.client_id, clientSecret: entry.client_secret };
  }
  return null;
}

function saveCredentials(raw: any) {
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(raw, null, 2), { mode: 0o600 });
}

function clearCredentials() {
  try { if (fs.existsSync(CREDENTIALS_FILE)) fs.unlinkSync(CREDENTIALS_FILE); } catch {}
}

// ── OAuth2 client ─────────────────────────────────────────────────────────────
function getOAuth2Client() {
  const creds = loadOAuthCredentials();
  if (!creds) return null;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    || `http://localhost:${settings.port}/api/admin/backup/drive/callback`;
  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);
  const stored = loadStoredTokens();
  if (stored) {
    client.setCredentials(stored);
    client.on('tokens', newTokens => saveTokens({ ...stored, ...newTokens }));
  }
  return client;
}

type DriveAuthMethod = 'oauth2' | 'service_account' | null;

function getDriveClient(): { drive: ReturnType<typeof google.drive>; method: DriveAuthMethod } | null {
  // 1. OAuth2 with stored user tokens
  const oauth2 = getOAuth2Client();
  if (oauth2 && loadStoredTokens()) {
    return { drive: google.drive({ version: 'v3', auth: oauth2 }), method: 'oauth2' };
  }
  // 2. Service Account fallback
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyRaw) {
    try {
      const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(keyRaw), scopes: DRIVE_SCOPES });
      return { drive: google.drive({ version: 'v3', auth }), method: 'service_account' };
    } catch {}
  }
  return null;
}

async function getOrCreateDriveFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
  const list = await drive.files.list({
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (list.data.files && list.data.files.length > 0) return list.data.files[0].id!;

  const created = await drive.files.create({
    requestBody: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });

  // For service-account mode: optionally share the folder with an email
  const shareEmail = process.env.GOOGLE_DRIVE_SHARE_EMAIL;
  if (shareEmail && created.data.id) {
    await drive.permissions.create({
      fileId: created.data.id,
      requestBody: { role: 'writer', type: 'user', emailAddress: shareEmail },
    });
  }
  return created.data.id!;
}

async function uploadFileToDrive(filename: string, filePath: string): Promise<{ id: string; webViewLink: string }> {
  const client = getDriveClient();
  if (!client) throw new Error('Google Drive is not connected. Click "Connect Google Drive" to authenticate.');

  const folderId = await getOrCreateDriveFolder(client.drive);
  const mimeType = path.extname(filename) === '.sql' ? 'text/plain' : 'application/octet-stream';

  const res = await client.drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: fs.createReadStream(filePath) },
    fields: 'id,webViewLink',
  });
  return { id: res.data.id!, webViewLink: res.data.webViewLink! };
}

type DbEngine = 'sqlite' | 'postgresql' | 'mysql' | 'mariadb' | 'mssql';

interface DiscoveredDb {
  name: string;
  /** File path for SQLite, PG_SENTINEL for PostgreSQL */
  path: string;
  sizeBytes: number;
  engine: DbEngine;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function safeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9_.\-]/g, '_');
}

/** Scan a directory (max depth) for *.sqlite3 files */
function findSqliteFiles(dir: string, depth = 1): string[] {
  const results: string[] = [];
  if (depth < 0 || !fs.existsSync(dir)) return results;
  const SKIP = new Set(['node_modules', 'dist', '.git', 'backups', '.next']);
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !SKIP.has(entry.name)) {
        results.push(...findSqliteFiles(full, depth - 1));
      } else if (entry.isFile() && entry.name.endsWith('.sqlite3')) {
        results.push(full);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

/** Detect file type from magic bytes / content header */
function detectFileType(filePath: string): 'sqlite' | 'pgdump' | 'mysqldump' | 'mssqlbak' | 'unknown' {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    fs.readSync(fd, buf, 0, 32, 0);
    fs.closeSync(fd);
    const header = buf.subarray(0, 15).toString('ascii');
    const headerFull = buf.toString('utf8');
    if (header.startsWith('SQLite format 3')) return 'sqlite';
    if (buf.subarray(0, 5).toString('ascii') === 'PGDMP') return 'pgdump';
    if (headerFull.includes('MySQL dump') || headerFull.includes('MariaDB dump')) return 'mysqldump';
    // MSSQL .bak starts with 0x01 0x00 0x00 0x00 magic
    if (buf[0] === 0x01 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x00) return 'mssqlbak';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Parse a DB connection URL into its components */
function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: u.port,
    database: u.pathname.slice(1),
  };
}

// ─── Database discovery (engine-agnostic) ────────────────────────────────────

const SERVER_ENGINES: DbEngine[] = ['postgresql', 'mysql', 'mariadb', 'mssql'];

// Sentinels for server-based DBs (connection URL never sent to frontend)
const ENGINE_SENTINEL: Record<string, string> = {
  postgresql: '__postgres__',
  mysql:      '__mysql__',
  mariadb:    '__mariadb__',
  mssql:      '__mssql__',
};

const ENGINE_LABEL: Record<string, string> = {
  postgresql: 'PostgreSQL (active)',
  mysql:      'MySQL (active)',
  mariadb:    'MariaDB (active)',
  mssql:      'SQL Server (active)',
};

function discoverDatabases(): DiscoveredDb[] {
  const engine = settings.database.engine as DbEngine;

  if (SERVER_ENGINES.includes(engine)) {
    return [{
      name: ENGINE_LABEL[engine] ?? engine,
      path: ENGINE_SENTINEL[engine] ?? `__${engine}__`,
      sizeBytes: -1,
      engine,
    }];
  }

  // SQLite: scan filesystem
  const found = new Map<string, string>();
  const configuredPath = path.resolve(process.cwd(), settings.database.path || './db.sqlite3');
  if (fs.existsSync(configuredPath)) found.set(configuredPath, configuredPath);
  for (const root of [process.cwd(), path.resolve(process.cwd(), '..')]) {
    for (const p of findSqliteFiles(root, 1)) found.set(p, p);
  }
  return Array.from(found.values()).map(p => ({
    name: path.basename(p),
    path: p,
    sizeBytes: fs.statSync(p).size,
    engine: 'sqlite' as DbEngine,
  }));
}

function resolveAllowedDb(dbPath: string): DiscoveredDb | null {
  return discoverDatabases().find(d => d.path === dbPath) ?? null;
}

// ─── Engine-specific backup ───────────────────────────────────────────────────

async function createSqliteBackup(srcPath: string, destPath: string) {
  const configuredPath = path.resolve(process.cwd(), settings.database.path || './db.sqlite3');
  const adapter = DatabaseManager.getAdapter() as any;
  if (srcPath === configuredPath && adapter?.db) {
    await adapter.db.backup(destPath);
  } else {
    fs.copyFileSync(srcPath, destPath);
    for (const ext of ['-wal', '-shm']) {
      const side = srcPath + ext;
      if (fs.existsSync(side)) fs.copyFileSync(side, destPath + ext);
    }
  }
}

async function createPostgresBackup(destPath: string) {
  const url = settings.database.url!;
  await execAsync(`pg_dump "${url}" -F c -f "${destPath}"`);
}

async function createMysqlBackup(destPath: string) {
  const { user, password, host, port, database } = parseDbUrl(settings.database.url!);
  const portFlag = port ? `-P ${port}` : '';
  // --single-transaction keeps a consistent snapshot without locking tables
  await execAsync(
    `mysqldump --single-transaction --routines --triggers -h "${host}" ${portFlag} -u "${user}" -p"${password}" "${database}" > "${destPath}"`
  );
}

async function createMssqlBackup(destPath: string) {
  const { user, password, host, port, database } = parseDbUrl(settings.database.url!);
  const server = port ? `${host},${port}` : host;
  // NOTE: For Docker, BACKUP_DIR must be mounted into the SQL Server container.
  // Set MSSQL_BACKUP_DIR env var to the path as seen by SQL Server (default: same as app).
  const mssqlPath = process.env.MSSQL_BACKUP_DIR
    ? path.join(process.env.MSSQL_BACKUP_DIR, path.basename(destPath))
    : destPath;
  await execAsync(
    `sqlcmd -S "${server}" -U "${user}" -P "${password}" -Q "BACKUP DATABASE [${database}] TO DISK = N'${mssqlPath}' WITH FORMAT, INIT, COMPRESSION"`
  );
}

// ─── Engine-specific restore ──────────────────────────────────────────────────

async function restoreSqliteBackup(srcPath: string, targetPath: string): Promise<string> {
  const configuredPath = path.resolve(process.cwd(), settings.database.path || './db.sqlite3');
  const safetyName = `pre-restore_${formatTimestamp(new Date())}_${path.basename(targetPath)}`;
  const safetyPath = path.join(BACKUP_DIR, safetyName);
  if (fs.existsSync(targetPath)) {
    const adapter = DatabaseManager.getAdapter() as any;
    if (targetPath === configuredPath && adapter?.db) {
      await DatabaseManager.close();
      fs.copyFileSync(targetPath, safetyPath);
      fs.copyFileSync(srcPath, targetPath);
      for (const ext of ['-wal', '-shm']) {
        const extra = targetPath + ext;
        if (fs.existsSync(extra)) fs.unlinkSync(extra);
      }
      DatabaseManager.initialize(settings.database);
    } else {
      fs.copyFileSync(targetPath, safetyPath);
      fs.copyFileSync(srcPath, targetPath);
      for (const ext of ['-wal', '-shm']) {
        const extra = targetPath + ext;
        if (fs.existsSync(extra)) fs.unlinkSync(extra);
      }
    }
  } else {
    fs.copyFileSync(srcPath, targetPath);
  }
  return safetyName;
}

async function restorePostgresBackup(srcPath: string): Promise<string> {
  const url = settings.database.url!;
  const safetyName = `pre-restore_${formatTimestamp(new Date())}_postgres.dump`;
  await execAsync(`pg_dump "${url}" -F c -f "${path.join(BACKUP_DIR, safetyName)}"`);
  await execAsync(`pg_restore --clean -1 -d "${url}" "${srcPath}"`);
  return safetyName;
}

async function restoreMysqlBackup(srcPath: string): Promise<string> {
  const { user, password, host, port, database } = parseDbUrl(settings.database.url!);
  const portFlag = port ? `-P ${port}` : '';
  const safetyName = `pre-restore_${formatTimestamp(new Date())}_mysql.sql`;
  await execAsync(
    `mysqldump --single-transaction -h "${host}" ${portFlag} -u "${user}" -p"${password}" "${database}" > "${path.join(BACKUP_DIR, safetyName)}"`
  );
  await execAsync(
    `mysql -h "${host}" ${portFlag} -u "${user}" -p"${password}" "${database}" < "${srcPath}"`
  );
  return safetyName;
}

async function restoreMssqlBackup(srcPath: string): Promise<string> {
  const { user, password, host, port, database } = parseDbUrl(settings.database.url!);
  const server = port ? `${host},${port}` : host;
  const safetyName = `pre-restore_${formatTimestamp(new Date())}_mssql.bak`;
  const mssqlSafetyPath = process.env.MSSQL_BACKUP_DIR
    ? path.join(process.env.MSSQL_BACKUP_DIR, safetyName)
    : path.join(BACKUP_DIR, safetyName);
  const mssqlRestorePath = process.env.MSSQL_BACKUP_DIR
    ? path.join(process.env.MSSQL_BACKUP_DIR, path.basename(srcPath))
    : srcPath;
  await execAsync(
    `sqlcmd -S "${server}" -U "${user}" -P "${password}" -Q "BACKUP DATABASE [${database}] TO DISK = N'${mssqlSafetyPath}' WITH FORMAT, INIT, COMPRESSION"`
  );
  await execAsync(
    `sqlcmd -S "${server}" -U "${user}" -P "${password}" -Q "RESTORE DATABASE [${database}] FROM DISK = N'${mssqlRestorePath}' WITH REPLACE"`
  );
  return safetyName;
}

// ─── Unified dispatch helpers ─────────────────────────────────────────────────

/** Returns { ext, label } for the backup file to be created */
function backupMeta(engine: DbEngine): { ext: string; label: string } {
  switch (engine) {
    case 'postgresql': return { ext: '.dump', label: 'postgres' };
    case 'mysql':      return { ext: '.sql',  label: 'mysql'    };
    case 'mariadb':    return { ext: '.sql',  label: 'mariadb'  };
    case 'mssql':      return { ext: '.bak',  label: 'mssql'    };
    default:           return { ext: '.sqlite3', label: 'sqlite' };
  }
}

async function dispatchBackup(db: DiscoveredDb, destPath: string) {
  switch (db.engine) {
    case 'postgresql': return createPostgresBackup(destPath);
    case 'mysql':
    case 'mariadb':    return createMysqlBackup(destPath);
    case 'mssql':      return createMssqlBackup(destPath);
    default:           return createSqliteBackup(db.path, destPath);
  }
}

async function dispatchRestore(db: DiscoveredDb, srcPath: string): Promise<string> {
  switch (db.engine) {
    case 'postgresql': return restorePostgresBackup(srcPath);
    case 'mysql':
    case 'mariadb':    return restoreMysqlBackup(srcPath);
    case 'mssql':      return restoreMssqlBackup(srcPath);
    default:           return restoreSqliteBackup(srcPath, db.path);
  }
}

/** Validate the uploaded file matches the target engine */
function validateUpload(filePath: string, engine: DbEngine): string | null {
  if (engine === 'sqlite') {
    if (detectFileType(filePath) !== 'sqlite') return 'Uploaded file is not a valid SQLite database';
  } else if (engine === 'postgresql') {
    if (detectFileType(filePath) !== 'pgdump') return 'Uploaded file is not a valid PostgreSQL custom-format dump (pg_dump -F c)';
  } else if (engine === 'mysql' || engine === 'mariadb') {
    if (detectFileType(filePath) !== 'mysqldump') return 'Uploaded file does not appear to be a mysqldump SQL file';
  } else if (engine === 'mssql') {
    if (detectFileType(filePath) !== 'mssqlbak') return 'Uploaded file does not appear to be a SQL Server .bak file';
  }
  return null;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function backupRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });

  // 1. Discovered databases
  fastify.get('/api/admin/backup/databases', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'List discovered databases (engine-agnostic)', security: [{ bearerAuth: [] }] },
  }, async (_req, reply) => {
    reply.send({ databases: discoverDatabases() });
  });

  // 2. Create backup
  fastify.post('/api/admin/backup/create', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Create a timestamped backup', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { dbPath } = request.body as { dbPath?: string };
    if (!dbPath) return reply.code(400).send({ error: 'dbPath is required' });

    const db = resolveAllowedDb(dbPath);
    if (!db) return reply.code(403).send({ error: 'Database not found or not allowed' });

    ensureBackupDir();
    const { ext, label } = backupMeta(db.engine);
    const backupName = `${formatTimestamp(new Date())}_${label}${ext}`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    await dispatchBackup(db, backupPath);

    const stat = fs.statSync(backupPath);
    reply.code(201).send({ backup: { filename: backupName, sizeBytes: stat.size, createdAt: new Date().toISOString() } });
  });

  // 3. List backup files
  fastify.get('/api/admin/backup/list', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'List all backup files on disk', security: [{ bearerAuth: [] }] },
  }, async (_req, reply) => {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sqlite3') || f.endsWith('.dump') || f.endsWith('.sql') || f.endsWith('.bak'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, sizeBytes: stat.size, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    reply.send({ backups: files });
  });

  // 4. Download live database snapshot
  fastify.get('/api/admin/backup/download-db', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Download a live database snapshot', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { dbPath } = request.query as { dbPath?: string };
    if (!dbPath) return reply.code(400).send({ error: 'dbPath is required' });

    const db = resolveAllowedDb(dbPath);
    if (!db) return reply.code(403).send({ error: 'Database not found or not allowed' });

    ensureBackupDir();
    const { ext, label } = backupMeta(db.engine);
    const tmp = path.join(BACKUP_DIR, `_tmp_dl_${Date.now()}${ext}`);

    try {
      await dispatchBackup(db, tmp);
      const filename = db.engine === 'sqlite' ? path.basename(db.path) : `${label}_snapshot${ext}`;
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Type', 'application/octet-stream');
      reply.send(fs.createReadStream(tmp));
    } finally {
      setTimeout(() => { try { fs.unlinkSync(tmp); } catch {} }, 15000);
    }
  });

  // 5. Download a stored backup file
  fastify.get('/api/admin/backup/files/:filename/download', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Download a stored backup file', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const safe = safeFilename((request.params as any).filename);
    const filePath = path.join(BACKUP_DIR, safe);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Backup file not found' });

    reply.header('Content-Disposition', `attachment; filename="${safe}"`);
    reply.header('Content-Type', 'application/octet-stream');
    reply.send(fs.createReadStream(filePath));
  });

  // 6. Restore from uploaded file
  fastify.post('/api/admin/backup/restore', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Restore database from uploaded backup', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const fields = data.fields as any;
    const defaultPath = SERVER_ENGINES.includes(settings.database.engine as DbEngine)
      ? (ENGINE_SENTINEL[settings.database.engine] ?? `__${settings.database.engine}__`)
      : path.resolve(process.cwd(), settings.database.path || './db.sqlite3');
    const dbPath = fields?.dbPath?.value ?? defaultPath;

    const db = resolveAllowedDb(dbPath);
    if (!db) return reply.code(403).send({ error: 'Target database not found or not allowed' });

    ensureBackupDir();
    const { ext } = backupMeta(db.engine);
    const tmp = path.join(BACKUP_DIR, `_restore_tmp_${Date.now()}${ext}`);

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    fs.writeFileSync(tmp, Buffer.concat(chunks));

    const validationError = validateUpload(tmp, db.engine);
    if (validationError) {
      fs.unlinkSync(tmp);
      return reply.code(400).send({ error: validationError });
    }

    let safetyName: string;
    try {
      safetyName = await dispatchRestore(db, tmp);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }

    reply.send({ success: true, message: 'Database restored successfully', safetyBackup: safetyName, engine: db.engine });
  });

  // 7. Delete a backup file
  fastify.delete('/api/admin/backup/files/:filename', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Delete a backup file', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const safe = safeFilename((request.params as any).filename);
    const filePath = path.join(BACKUP_DIR, safe);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Backup file not found' });
    fs.unlinkSync(filePath);
    reply.code(204).send();
  });

  // 8. Google Drive status
  fastify.get('/api/admin/backup/drive/status', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Check Google Drive configuration status', security: [{ bearerAuth: [] }] },
  }, async (_req, reply) => {
    const client = getDriveClient();
    const creds = loadOAuthCredentials();
    const credentialsSource = fs.existsSync(CREDENTIALS_FILE) ? 'file' : (creds ? 'env' : null);
    reply.send({
      configured:        !!client,
      authMethod:        client?.method ?? null,
      canConnect:        !!creds,           // true = credentials available (file or env)
      credentialsSource,                    // 'file' | 'env' | null
      folderName:        DRIVE_FOLDER_NAME,
    });
  });

  // 8b. Upload Google OAuth2 credentials JSON file
  fastify.post('/api/admin/backup/drive/credentials', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Upload Google OAuth2 credentials JSON file', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);

    let parsed: any;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reply.code(400).send({ error: 'File is not valid JSON' });
    }

    const validated = validateCredentialsJson(parsed);
    if (!validated) {
      return reply.code(400).send({ error: 'File does not look like a Google OAuth2 credentials file. Download it from Google Cloud Console → APIs & Services → Credentials.' });
    }

    saveCredentials(parsed);
    reply.send({ success: true, clientId: validated.clientId.slice(0, 20) + '...' });
  });

  // 8c. Remove uploaded credentials file
  fastify.delete('/api/admin/backup/drive/credentials', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Remove uploaded credentials file', security: [{ bearerAuth: [] }] },
  }, async (_req, reply) => {
    clearCredentials();
    clearTokens(); // tokens are now invalid without credentials
    reply.send({ success: true });
  });

  // 9. Get OAuth2 auth URL (opens Google login)
  fastify.get('/api/admin/backup/drive/auth-url', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Get Google OAuth2 authorization URL', security: [{ bearerAuth: [] }] },
  }, async (_req, reply) => {
    const oauth2 = getOAuth2Client();
    if (!oauth2) return reply.code(400).send({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env' });

    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',   // gets refresh_token so we don't need re-auth
      prompt: 'consent',        // force consent screen to always get refresh_token
      scope: DRIVE_SCOPES,
    });
    reply.send({ authUrl });
  });

  // 10. OAuth2 callback — Google redirects here after user grants permission
  fastify.get('/api/admin/backup/drive/callback', {
    schema: { tags: ['Admin'], description: 'OAuth2 callback — exchanges code for tokens' },
  }, async (request, reply) => {
    const { code, error } = request.query as { code?: string; error?: string };

    if (error || !code) {
      return reply.type('text/html').send(popupPage('error', `Google Drive authorization failed: ${error ?? 'no code'}`));
    }

    const oauth2 = getOAuth2Client();
    if (!oauth2) {
      return reply.type('text/html').send(popupPage('error', 'OAuth2 not configured on server.'));
    }

    try {
      const { tokens } = await oauth2.getToken(code);
      saveTokens(tokens);
      reply.type('text/html').send(popupPage('success', 'Google Drive connected successfully!'));
    } catch (err: any) {
      reply.type('text/html').send(popupPage('error', `Token exchange failed: ${err.message}`));
    }
  });

  // 11. Disconnect Google Drive (removes stored OAuth2 tokens)
  fastify.delete('/api/admin/backup/drive/disconnect', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Disconnect Google Drive (removes stored tokens)', security: [{ bearerAuth: [] }] },
  }, async (_req, reply) => {
    clearTokens();
    reply.send({ success: true });
  });

  // 12. Upload a backup file to Google Drive
  fastify.post('/api/admin/backup/files/:filename/send-to-drive', {
    preHandler: requireSuperuser,
    schema: { tags: ['Admin'], description: 'Upload a backup file to Google Drive nango_backup folder', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const safe = safeFilename((request.params as any).filename);
    const filePath = path.join(BACKUP_DIR, safe);

    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Backup file not found' });

    try {
      const result = await uploadFileToDrive(safe, filePath);
      reply.send({ success: true, fileId: result.id, webViewLink: result.webViewLink, folder: DRIVE_FOLDER_NAME });
    } catch (err: any) {
      reply.code(500).send({ error: err.message ?? 'Failed to upload to Google Drive' });
    }
  });
}

/** Minimal HTML page shown inside the OAuth2 popup after auth completes */
function popupPage(status: 'success' | 'error', message: string): string {
  const color = status === 'success' ? '#16a34a' : '#dc2626';
  const icon  = status === 'success' ? '✓' : '✗';
  return `<!DOCTYPE html><html><head><title>Google Drive Auth</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;}
.box{text-align:center;padding:2rem;border-radius:12px;border:1px solid #e5e7eb;background:#fff;max-width:360px;}
.icon{font-size:3rem;color:${color};} p{color:#374151;margin-top:.5rem;}</style></head>
<body><div class="box"><div class="icon">${icon}</div><p>${message}</p>
${status === 'success' ? '<p style="color:#6b7280;font-size:.85rem;margin-top:1rem">You can close this window.</p>' : ''}
</div><script>
${status === 'success' ? 'setTimeout(()=>window.close(),1500);' : ''}
window.opener && window.opener.postMessage("${status}", "*");
</script></body></html>`;
}
