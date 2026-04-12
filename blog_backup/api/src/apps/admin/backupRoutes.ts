import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Transform, TransformCallback } from 'stream';
import { google } from 'googleapis';
import cron from 'node-cron';
import { requireSuperuser } from '../../middleware/auth';
import DatabaseManager from '../../core/database';
import settings from '../../config/settings';

const execAsync = promisify(exec);

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const DRIVE_FOLDER_NAME = 'nango_backup';
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKENS_FILE = path.resolve(process.cwd(), '.google_tokens.json');
const CREDENTIALS_FILE = path.resolve(process.cwd(), '.google_credentials.json');
const SCHEDULE_FILE = path.resolve(process.cwd(), 'backup_schedule.json');
const LOG_FILE = path.resolve(process.cwd(), 'backup_log.json');
const LOG_MAX = 20;

type DbEngine = 'sqlite' | 'postgresql' | 'mysql' | 'mariadb' | 'mssql';
type DriveAuthMethod = 'oauth2' | 'service_account' | null;

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

interface DiscoveredDb {
  name: string;
  path: string;
  sizeBytes: number;
  engine: DbEngine;
}

interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  minute: number;
  keepCount: number;
  uploadToDrive: boolean;
  bandwidthLimitMbps: number;
}

interface BackupLogEntry {
  at: string;
  trigger: 'schedule' | 'manual';
  status: 'success' | 'error';
  file?: string;
  sizeBytes?: number;
  durationMs: number;
  uploadedDrive: boolean;
  deletedLocal: number;
  deletedDrive: number;
  error?: string;
}

const DEFAULT_SCHEDULE: BackupScheduleConfig = {
  enabled: false,
  frequency: 'daily',
  hour: 3,
  minute: 0,
  keepCount: 2,
  uploadToDrive: false,
  bandwidthLimitMbps: 50,
};

let backupRunning = false;
let activeJob: cron.ScheduledTask | null = null;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function safeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9_.\-]/g, '_');
}

function loadStoredTokens(): any | null {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch {
    // Ignore malformed token files.
  }
  return null;
}

function saveTokens(tokens: any) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function clearTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      fs.unlinkSync(TOKENS_FILE);
    }
  } catch {
    // Ignore cleanup errors.
  }
}

function loadOAuthCredentials(): OAuthCredentials | null {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      const entry = raw.web ?? raw.installed ?? raw;
      if (entry.client_id && entry.client_secret) {
        return { clientId: entry.client_id, clientSecret: entry.client_secret };
      }
    }
  } catch {
    // Ignore malformed credential files.
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  return null;
}

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
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // Ignore cleanup errors.
  }
}

function loadScheduleConfig(): BackupScheduleConfig {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return { ...DEFAULT_SCHEDULE, ...JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')) };
    }
  } catch {
    // Ignore malformed schedule files.
  }
  return { ...DEFAULT_SCHEDULE };
}

function saveScheduleConfig(config: BackupScheduleConfig) {
  try {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(config, null, 2));
  } catch (err: any) {
    throw new Error(`Failed to save schedule config: ${err.message}`);
  }
}

function readLog(): BackupLogEntry[] {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch {
    // Ignore malformed logs.
  }
  return [];
}

function appendLog(entry: BackupLogEntry) {
  const entries = [entry, ...readLog()].slice(0, LOG_MAX);
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
}

function createThrottle(bytesPerSecond: number): Transform {
  let bucket = bytesPerSecond;
  let lastTime = Date.now();
  return new Transform({
    transform(chunk: Buffer, _enc: string, cb: TransformCallback) {
      const now = Date.now();
      bucket = Math.min(bytesPerSecond, bucket + ((now - lastTime) / 1000) * bytesPerSecond);
      lastTime = now;
      const delay = chunk.length > bucket
        ? Math.ceil(((chunk.length - bucket) / bytesPerSecond) * 1000)
        : 0;
      bucket = Math.max(0, bucket - chunk.length);
      if (delay > 0) {
        setTimeout(() => { this.push(chunk); cb(); }, delay);
      } else {
        this.push(chunk);
        cb();
      }
    },
  });
}

function getOAuth2Client() {
  const creds = loadOAuthCredentials();
  if (!creds) return null;

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:${settings.port}/api/admin/backup/drive/callback`;

  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);
  const stored = loadStoredTokens();
  if (stored) {
    client.setCredentials(stored);
    client.on('tokens', (newTokens: any) => saveTokens({ ...stored, ...newTokens }));
  }

  return client;
}

function getDriveClient(): { drive: ReturnType<typeof google.drive>; method: DriveAuthMethod } | null {
  const oauth2 = getOAuth2Client();
  if (oauth2 && loadStoredTokens()) {
    return { drive: google.drive({ version: 'v3', auth: oauth2 }), method: 'oauth2' };
  }

  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyRaw) {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(keyRaw),
        scopes: DRIVE_SCOPES,
      });
      return { drive: google.drive({ version: 'v3', auth }), method: 'service_account' };
    } catch {
      // Ignore invalid service account JSON.
    }
  }

  return null;
}

async function getOrCreateDriveFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
  const list = await drive.files.list({
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (list.data.files && list.data.files.length > 0 && list.data.files[0].id) {
    return list.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  const shareEmail = process.env.GOOGLE_DRIVE_SHARE_EMAIL;
  if (shareEmail && created.data.id) {
    await drive.permissions.create({
      fileId: created.data.id,
      requestBody: { role: 'writer', type: 'user', emailAddress: shareEmail },
    });
  }

  return created.data.id!;
}

async function uploadFileToDrive(
  filename: string,
  filePath: string,
  bandwidthLimitMbps = 0,
): Promise<{ id: string; webViewLink: string }> {
  const client = getDriveClient();
  if (!client) {
    throw new Error('Google Drive is not connected. Configure credentials first.');
  }

  const folderId = await getOrCreateDriveFolder(client.drive);
  const mimeType = path.extname(filename) === '.sql' ? 'text/plain' : 'application/octet-stream';

  let body: NodeJS.ReadableStream = fs.createReadStream(filePath);
  if (bandwidthLimitMbps > 0) {
    const bps = Math.floor((bandwidthLimitMbps * 1024 * 1024) / 8);
    body = body.pipe(createThrottle(bps));
  }

  const res = await client.drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body },
    fields: 'id,webViewLink',
  });

  return { id: res.data.id!, webViewLink: res.data.webViewLink! };
}

async function cleanupDriveBackups(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  keepCount: number,
) {
  try {
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,createdTime)',
      orderBy: 'createdTime desc',
      spaces: 'drive',
    });
    const files = list.data.files ?? [];
    for (const f of files.slice(keepCount)) {
      if (f.id) {
        try { await drive.files.delete({ fileId: f.id }); } catch {}
      }
    }
  } catch {
    // Ignore cleanup errors.
  }
}

function listBackupFiles(): { name: string; mtime: number }[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f =>
      !f.startsWith('pre-restore_') &&
      !f.startsWith('_') &&
      (f.endsWith('.sqlite3') || f.endsWith('.dump') || f.endsWith('.sql') || f.endsWith('.bak'))
    )
    .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function cleanupLocalBackups(keepCount: number): number {
  const toDelete = listBackupFiles().slice(keepCount);
  for (const f of toDelete) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch {}
  }
  return toDelete.length;
}

function buildCronExpression(config: BackupScheduleConfig): string {
  const { minute, hour, frequency } = config;
  switch (frequency) {
    case 'daily':   return `${minute} ${hour} * * *`;
    case 'weekly':  return `${minute} ${hour} * * 1`;
    case 'monthly': return `${minute} ${hour} 1 * *`;
    default:        return `${minute} ${hour} * * *`;
  }
}

function describeScheduleLog(config: BackupScheduleConfig): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(config.hour)}:${pad(config.minute)}`;
  switch (config.frequency) {
    case 'daily':   return `every day at ${time}`;
    case 'weekly':  return `every Monday at ${time}`;
    case 'monthly': return `1st of every month at ${time}`;
    default:        return time;
  }
}

function applyScheduleConfig(config: BackupScheduleConfig) {
  if (activeJob) {
    activeJob.stop();
    activeJob = null;
  }

  if (!config.enabled) {
    console.log('[backup] Scheduler disabled');
    return;
  }

  const expr = buildCronExpression(config);
  if (!cron.validate(expr)) {
    console.error('[backup] Invalid cron expression:', expr);
    return;
  }

  activeJob = cron.schedule(expr, () => {
    runScheduledBackup(config).catch(err =>
      console.error('[backup] Scheduled backup error:', err)
    );
  });

  console.log(`[backup] Scheduler active - ${describeScheduleLog(config)} (cron: ${expr})`);
}

async function runScheduledBackup(
  config: BackupScheduleConfig,
  trigger: 'schedule' | 'manual' = 'schedule',
) {
  if (backupRunning) {
    console.log('[backup] Skipped - another backup is already running');
    return;
  }

  const dbs = discoverDatabases();
  if (dbs.length === 0) {
    console.log('[backup] No database found - skipping');
    return;
  }

  const db = dbs[0];
  const startedAt = Date.now();
  backupRunning = true;

  console.log(`[backup] Starting ${trigger} backup (${db.engine})...`);

  ensureBackupDir();
  const { ext, label } = backupMeta(db.engine);
  const backupName = `${formatTimestamp(new Date())}_${label}${ext}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  let deletedLocal = 0;
  let deletedDrive = 0;
  let uploadedDrive = false;

  try {
    await dispatchBackup(db, backupPath);
    const sizeBytes = fs.statSync(backupPath).size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    console.log(`[backup] Backup created: ${backupName} (${sizeMB} MB)`);

    if (config.uploadToDrive) {
      console.log(`[backup] Uploading to Google Drive (limit: ${config.bandwidthLimitMbps} Mbps)...`);
      try {
        await uploadFileToDrive(backupName, backupPath, config.bandwidthLimitMbps);
        uploadedDrive = true;
        console.log(`[backup] Uploaded to Drive folder: ${DRIVE_FOLDER_NAME}/`);

        const driveClient = getDriveClient();
        if (driveClient) {
          const folderId = await getOrCreateDriveFolder(driveClient.drive);
          await cleanupDriveBackups(driveClient.drive, folderId, config.keepCount);
        }
      } catch (driveErr: any) {
        console.error('[backup] Drive upload failed:', driveErr?.message ?? driveErr);
      }
    }

    deletedLocal = cleanupLocalBackups(config.keepCount);
    if (deletedLocal > 0) console.log(`[backup] Removed ${deletedLocal} old local backup(s), keeping ${config.keepCount}`);

    const durationMs = Date.now() - startedAt;
    console.log(`[backup] Done in ${(durationMs / 1000).toFixed(1)}s`);

    appendLog({
      at: new Date().toISOString(),
      trigger,
      status: 'success',
      file: backupName,
      sizeBytes,
      durationMs,
      uploadedDrive,
      deletedLocal,
      deletedDrive,
    });
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const msg = err?.message ?? String(err);
    console.error(`[backup] Failed after ${(durationMs / 1000).toFixed(1)}s:`, msg);
    appendLog({
      at: new Date().toISOString(),
      trigger,
      status: 'error',
      durationMs,
      uploadedDrive,
      deletedLocal,
      deletedDrive,
      error: msg,
    });
  } finally {
    backupRunning = false;
  }
}

function findSqliteFiles(dir: string, depth = 1): string[] {
  const results: string[] = [];
  if (depth < 0 || !fs.existsSync(dir)) return results;

  const skip = new Set(['node_modules', 'dist', '.git', 'backups', '.next']);
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !skip.has(entry.name)) {
        results.push(...findSqliteFiles(full, depth - 1));
      } else if (entry.isFile() && entry.name.endsWith('.sqlite3')) {
        results.push(full);
      }
    }
  } catch {
    // Ignore unreadable folders.
  }

  return results;
}

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
    if (buf[0] === 0x01 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x00) return 'mssqlbak';
  } catch {
    // Ignore read errors.
  }
  return 'unknown';
}

function parseDbUrl(url: string) {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port: parsed.port,
    database: parsed.pathname.slice(1),
  };
}

const SERVER_ENGINES: DbEngine[] = ['postgresql', 'mysql', 'mariadb', 'mssql'];

const ENGINE_SENTINEL: Record<string, string> = {
  postgresql: '__postgres__',
  mysql: '__mysql__',
  mariadb: '__mariadb__',
  mssql: '__mssql__',
};

const ENGINE_LABEL: Record<string, string> = {
  postgresql: 'PostgreSQL (active)',
  mysql: 'MySQL (active)',
  mariadb: 'MariaDB (active)',
  mssql: 'SQL Server (active)',
};

function discoverDatabases(): DiscoveredDb[] {
  const engine = settings.database.engine as DbEngine;

  if (SERVER_ENGINES.includes(engine)) {
    return [
      {
        name: ENGINE_LABEL[engine] ?? engine,
        path: ENGINE_SENTINEL[engine] ?? `__${engine}__`,
        sizeBytes: -1,
        engine,
      },
    ];
  }

  const found = new Map<string, string>();
  const configuredPath = path.resolve(process.cwd(), settings.database.path || './db.sqlite3');
  if (fs.existsSync(configuredPath)) found.set(configuredPath, configuredPath);

  for (const root of [process.cwd(), path.resolve(process.cwd(), '..')]) {
    for (const filePath of findSqliteFiles(root, 1)) {
      found.set(filePath, filePath);
    }
  }

  return Array.from(found.values()).map((filePath) => ({
    name: path.basename(filePath),
    path: filePath,
    sizeBytes: fs.statSync(filePath).size,
    engine: 'sqlite' as DbEngine,
  }));
}

function resolveAllowedDb(dbPath: string): DiscoveredDb | null {
  return discoverDatabases().find((db) => db.path === dbPath) ?? null;
}

async function createSqliteBackup(srcPath: string, destPath: string) {
  const configuredPath = path.resolve(process.cwd(), settings.database.path || './db.sqlite3');
  const adapter = DatabaseManager.getAdapter() as any;

  if (srcPath === configuredPath && adapter?.db) {
    await adapter.db.backup(destPath);
  } else {
    fs.copyFileSync(srcPath, destPath);
    for (const ext of ['-wal', '-shm']) {
      const sidePath = srcPath + ext;
      if (fs.existsSync(sidePath)) {
        fs.copyFileSync(sidePath, destPath + ext);
      }
    }
  }
}

async function createPostgresBackup(destPath: string) {
  await execAsync(`pg_dump "${settings.database.url!}" -F c -f "${destPath}"`);
}

async function createMysqlBackup(destPath: string) {
  const { user, password, host, port, database } = parseDbUrl(settings.database.url!);
  const portFlag = port ? `-P ${port}` : '';
  await execAsync(
    `mysqldump --single-transaction --routines --triggers -h "${host}" ${portFlag} -u "${user}" -p"${password}" "${database}" > "${destPath}"`
  );
}

async function createMssqlBackup(destPath: string) {
  const { user, password, host, port, database } = parseDbUrl(settings.database.url!);
  const server = port ? `${host},${port}` : host;
  const mssqlPath = process.env.MSSQL_BACKUP_DIR
    ? path.join(process.env.MSSQL_BACKUP_DIR, path.basename(destPath))
    : destPath;

  await execAsync(
    `sqlcmd -S "${server}" -U "${user}" -P "${password}" -Q "BACKUP DATABASE [${database}] TO DISK = N'${mssqlPath}' WITH FORMAT, INIT, COMPRESSION"`
  );
}

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
        const sidePath = targetPath + ext;
        if (fs.existsSync(sidePath)) {
          fs.unlinkSync(sidePath);
        }
      }
      DatabaseManager.initialize(settings.database);
    } else {
      fs.copyFileSync(targetPath, safetyPath);
      fs.copyFileSync(srcPath, targetPath);
      for (const ext of ['-wal', '-shm']) {
        const sidePath = targetPath + ext;
        if (fs.existsSync(sidePath)) {
          fs.unlinkSync(sidePath);
        }
      }
    }
  } else {
    fs.copyFileSync(srcPath, targetPath);
  }

  return safetyName;
}

async function restorePostgresBackup(srcPath: string): Promise<string> {
  const safetyName = `pre-restore_${formatTimestamp(new Date())}_postgres.dump`;
  await execAsync(`pg_dump "${settings.database.url!}" -F c -f "${path.join(BACKUP_DIR, safetyName)}"`);
  await execAsync(`pg_restore --clean -1 -d "${settings.database.url!}" "${srcPath}"`);
  return safetyName;
}

async function restoreMysqlBackup(srcPath: string): Promise<string> {
  const { user, password, host, port, database } = parseDbUrl(settings.database.url!);
  const portFlag = port ? `-P ${port}` : '';
  const safetyName = `pre-restore_${formatTimestamp(new Date())}_mysql.sql`;

  await execAsync(
    `mysqldump --single-transaction -h "${host}" ${portFlag} -u "${user}" -p"${password}" "${database}" > "${path.join(BACKUP_DIR, safetyName)}"`
  );
  await execAsync(`mysql -h "${host}" ${portFlag} -u "${user}" -p"${password}" "${database}" < "${srcPath}"`);
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

function backupMeta(engine: DbEngine): { ext: string; label: string } {
  switch (engine) {
    case 'postgresql':
      return { ext: '.dump', label: 'postgres' };
    case 'mysql':
      return { ext: '.sql', label: 'mysql' };
    case 'mariadb':
      return { ext: '.sql', label: 'mariadb' };
    case 'mssql':
      return { ext: '.bak', label: 'mssql' };
    default:
      return { ext: '.sqlite3', label: 'sqlite' };
  }
}

async function dispatchBackup(db: DiscoveredDb, destPath: string) {
  switch (db.engine) {
    case 'postgresql':
      return createPostgresBackup(destPath);
    case 'mysql':
    case 'mariadb':
      return createMysqlBackup(destPath);
    case 'mssql':
      return createMssqlBackup(destPath);
    default:
      return createSqliteBackup(db.path, destPath);
  }
}

async function dispatchRestore(db: DiscoveredDb, srcPath: string): Promise<string> {
  switch (db.engine) {
    case 'postgresql':
      return restorePostgresBackup(srcPath);
    case 'mysql':
    case 'mariadb':
      return restoreMysqlBackup(srcPath);
    case 'mssql':
      return restoreMssqlBackup(srcPath);
    default:
      return restoreSqliteBackup(srcPath, db.path);
  }
}

function validateUpload(filePath: string, engine: DbEngine): string | null {
  if (engine === 'sqlite') {
    if (detectFileType(filePath) !== 'sqlite') return 'Uploaded file is not a valid SQLite database';
  } else if (engine === 'postgresql') {
    if (detectFileType(filePath) !== 'pgdump') {
      return 'Uploaded file is not a valid PostgreSQL custom-format dump';
    }
  } else if (engine === 'mysql' || engine === 'mariadb') {
    if (detectFileType(filePath) !== 'mysqldump') {
      return 'Uploaded file does not appear to be a mysqldump SQL file';
    }
  } else if (engine === 'mssql') {
    if (detectFileType(filePath) !== 'mssqlbak') {
      return 'Uploaded file does not appear to be a SQL Server .bak file';
    }
  }

  return null;
}

export default async function backupRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });

  fastify.get(
    '/api/admin/backup/databases',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'List discovered databases',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      reply.send({ databases: discoverDatabases() });
    }
  );

  fastify.post(
    '/api/admin/backup/create',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Create a timestamped backup',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { dbPath } = request.body as { dbPath?: string };
      if (!dbPath) {
        return reply.code(400).send({ error: 'dbPath is required' });
      }

      const db = resolveAllowedDb(dbPath);
      if (!db) {
        return reply.code(403).send({ error: 'Database not found or not allowed' });
      }

      ensureBackupDir();
      const { ext, label } = backupMeta(db.engine);
      const backupName = `${formatTimestamp(new Date())}_${label}${ext}`;
      const backupPath = path.join(BACKUP_DIR, backupName);

      await dispatchBackup(db, backupPath);

      const stat = fs.statSync(backupPath);
      reply.code(201).send({
        backup: {
          filename: backupName,
          sizeBytes: stat.size,
          createdAt: new Date().toISOString(),
        },
      });
    }
  );

  fastify.get(
    '/api/admin/backup/list',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'List all backup files on disk',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      ensureBackupDir();
      const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((file) => file.endsWith('.sqlite3') || file.endsWith('.dump') || file.endsWith('.sql') || file.endsWith('.bak'))
        .map((file) => {
          const stat = fs.statSync(path.join(BACKUP_DIR, file));
          return {
            filename: file,
            sizeBytes: stat.size,
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

      reply.send({ backups: files });
    }
  );

  fastify.get(
    '/api/admin/backup/download-db',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Download a live database snapshot',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { dbPath } = request.query as { dbPath?: string };
      if (!dbPath) {
        return reply.code(400).send({ error: 'dbPath is required' });
      }

      const db = resolveAllowedDb(dbPath);
      if (!db) {
        return reply.code(403).send({ error: 'Database not found or not allowed' });
      }

      ensureBackupDir();
      const { ext, label } = backupMeta(db.engine);
      const tmpPath = path.join(BACKUP_DIR, `_tmp_dl_${Date.now()}${ext}`);

      try {
        await dispatchBackup(db, tmpPath);
        const filename = db.engine === 'sqlite' ? path.basename(db.path) : `${label}_snapshot${ext}`;
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        reply.header('Content-Type', 'application/octet-stream');
        reply.send(fs.createReadStream(tmpPath));
      } finally {
        setTimeout(() => {
          try {
            fs.unlinkSync(tmpPath);
          } catch {
            // Ignore cleanup errors.
          }
        }, 15000);
      }
    }
  );

  fastify.get(
    '/api/admin/backup/files/:filename/download',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Download a stored backup file',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const safe = safeFilename((request.params as any).filename);
      const filePath = path.join(BACKUP_DIR, safe);
      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({ error: 'Backup file not found' });
      }

      reply.header('Content-Disposition', `attachment; filename="${safe}"`);
      reply.header('Content-Type', 'application/octet-stream');
      reply.send(fs.createReadStream(filePath));
    }
  );

  fastify.post(
    '/api/admin/backup/restore',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Restore database from uploaded backup',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const data = await (request as any).file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const fields = data.fields as any;
      const defaultPath = SERVER_ENGINES.includes(settings.database.engine as DbEngine)
        ? ENGINE_SENTINEL[settings.database.engine] ?? `__${settings.database.engine}__`
        : path.resolve(process.cwd(), settings.database.path || './db.sqlite3');
      const dbPath = fields?.dbPath?.value ?? defaultPath;

      const db = resolveAllowedDb(dbPath);
      if (!db) {
        return reply.code(403).send({ error: 'Target database not found or not allowed' });
      }

      ensureBackupDir();
      const { ext } = backupMeta(db.engine);
      const tmpPath = path.join(BACKUP_DIR, `_restore_tmp_${Date.now()}${ext}`);

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      fs.writeFileSync(tmpPath, Buffer.concat(chunks));

      const validationError = validateUpload(tmpPath, db.engine);
      if (validationError) {
        fs.unlinkSync(tmpPath);
        return reply.code(400).send({ error: validationError });
      }

      let safetyName: string;
      try {
        safetyName = await dispatchRestore(db, tmpPath);
      } finally {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // Ignore cleanup errors.
        }
      }

      reply.send({
        success: true,
        message: 'Database restored successfully',
        safetyBackup: safetyName,
        engine: db.engine,
      });
    }
  );

  fastify.delete(
    '/api/admin/backup/files/:filename',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Delete a backup file',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const safe = safeFilename((request.params as any).filename);
      const filePath = path.join(BACKUP_DIR, safe);
      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({ error: 'Backup file not found' });
      }

      fs.unlinkSync(filePath);
      reply.code(204).send();
    }
  );

  fastify.get(
    '/api/admin/backup/drive/status',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Check Google Drive configuration status',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const client = getDriveClient();
      const creds = loadOAuthCredentials();
      const credentialsSource = fs.existsSync(CREDENTIALS_FILE) ? 'file' : creds ? 'env' : null;

      reply.send({
        configured: !!client,
        authMethod: client?.method ?? null,
        canConnect: !!creds,
        credentialsSource,
        folderName: DRIVE_FOLDER_NAME,
      });
    }
  );

  fastify.post(
    '/api/admin/backup/drive/credentials',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Upload Google OAuth2 credentials JSON file',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const data = await (request as any).file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reply.code(400).send({ error: 'File is not valid JSON' });
      }

      const validated = validateCredentialsJson(parsed);
      if (!validated) {
        return reply.code(400).send({
          error: 'File does not look like a Google OAuth2 credentials file. Download it from Google Cloud Console.',
        });
      }

      saveCredentials(parsed);
      reply.send({ success: true, clientId: validated.clientId.slice(0, 20) + '...' });
    }
  );

  fastify.delete(
    '/api/admin/backup/drive/credentials',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Remove uploaded credentials file',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      clearCredentials();
      clearTokens();
      reply.send({ success: true });
    }
  );

  fastify.get(
    '/api/admin/backup/drive/auth-url',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Get Google OAuth2 authorization URL',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const oauth2 = getOAuth2Client();
      if (!oauth2) {
        return reply.code(400).send({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env' });
      }

      const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: DRIVE_SCOPES,
      });
      reply.send({ authUrl });
    }
  );

  fastify.get(
    '/api/admin/backup/drive/callback',
    {
      schema: {
        tags: ['Admin'],
        description: 'OAuth2 callback for Google Drive',
      },
    },
    async (request, reply) => {
      const { code, error } = request.query as { code?: string; error?: string };

      if (error || !code) {
        return reply.type('text/html; charset=utf-8').send(popupPageSafe('error', `Google Drive authorization failed: ${error ?? 'no code'}`));
      }

      const oauth2 = getOAuth2Client();
      if (!oauth2) {
        return reply.type('text/html; charset=utf-8').send(popupPageSafe('error', 'OAuth2 is not configured on the server.'));
      }

      try {
        const { tokens } = await oauth2.getToken(code);
        saveTokens(tokens);
        reply.type('text/html; charset=utf-8').send(popupPageSafe('success', 'Google Drive connected successfully.'));
      } catch (err: any) {
        reply.type('text/html; charset=utf-8').send(popupPageSafe('error', `Token exchange failed: ${err.message}`));
      }
    }
  );

  fastify.delete(
    '/api/admin/backup/drive/disconnect',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Disconnect Google Drive (removes stored tokens)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      clearTokens();
      reply.send({ success: true });
    }
  );

  fastify.post(
    '/api/admin/backup/files/:filename/send-to-drive',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Upload a backup file to Google Drive',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const safe = safeFilename((request.params as any).filename);
      const filePath = path.join(BACKUP_DIR, safe);

      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({ error: 'Backup file not found' });
      }

      try {
        const result = await uploadFileToDrive(safe, filePath);
        reply.send({
          success: true,
          fileId: result.id,
          webViewLink: result.webViewLink,
          folder: DRIVE_FOLDER_NAME,
        });
      } catch (err: any) {
        reply.code(500).send({ error: err.message ?? 'Failed to upload to Google Drive' });
      }
    }
  );

  fastify.get(
    '/api/admin/backup/schedule',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Get backup schedule configuration',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      reply.send(loadScheduleConfig());
    }
  );

  fastify.post(
    '/api/admin/backup/schedule',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Save and apply backup schedule configuration',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const body = request.body as Partial<BackupScheduleConfig>;
      const current = loadScheduleConfig();
      const updated: BackupScheduleConfig = {
        ...current,
        ...body,
        hour: Math.max(0, Math.min(23, Number(body.hour ?? current.hour))),
        minute: Math.max(0, Math.min(59, Number(body.minute ?? current.minute))),
        keepCount: Math.max(1, Math.min(30, Number(body.keepCount ?? current.keepCount))),
        bandwidthLimitMbps: Math.max(1, Math.min(50, Number(body.bandwidthLimitMbps ?? current.bandwidthLimitMbps))),
      };
      saveScheduleConfig(updated);
      applyScheduleConfig(updated);
      reply.send({ success: true, config: updated });
    }
  );

  fastify.post(
    '/api/admin/backup/schedule/run-now',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Manually trigger a scheduled backup run',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      if (backupRunning) return reply.code(409).send({ error: 'A backup is already running' });
      const config = loadScheduleConfig();
      runScheduledBackup(config, 'manual').catch(err =>
        console.error('[backup] Manual run error:', err)
      );
      reply.send({ success: true, message: 'Backup started in background' });
    }
  );

  fastify.get(
    '/api/admin/backup/log',
    {
      preHandler: requireSuperuser,
      schema: {
        tags: ['Admin'],
        description: 'Get recent backup log entries',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      reply.send({ log: readLog(), running: backupRunning });
    }
  );

  applyScheduleConfig(loadScheduleConfig());
}

function popupPageSafe(status: 'success' | 'error', message: string): string {
  const color = status === 'success' ? '#16a34a' : '#dc2626';
  const icon = status === 'success' ? '&#10003;' : '&#10005;';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Google Drive Auth</title>
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
