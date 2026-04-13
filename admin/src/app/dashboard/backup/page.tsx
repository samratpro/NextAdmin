'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type DbEngine = 'sqlite' | 'postgresql' | 'mysql' | 'mariadb' | 'mssql';

interface DbFile {
  name: string;
  path: string;
  sizeBytes: number;
  engine: DbEngine;
}

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  modifiedAt: string;
}

type Tab = 'databases' | 'backups' | 'restore' | 'schedule' | 'running';

interface ScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  minute: number;
  keepCount: number;
  uploadToDrive: boolean;
  bandwidthLimitMbps: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function acceptExt(engine?: DbEngine): string {
  switch (engine) {
    case 'postgresql': return '.dump';
    case 'mysql':
    case 'mariadb':    return '.sql';
    case 'mssql':      return '.bak';
    default:           return '.sqlite3,.db';
  }
}

function acceptLabel(engine?: DbEngine): string {
  switch (engine) {
    case 'postgresql': return 'Backup File (.dump — pg_dump custom format)';
    case 'mysql':
    case 'mariadb':    return 'Backup File (.sql — mysqldump)';
    case 'mssql':      return 'Backup File (.bak — SQL Server backup)';
    default:           return 'Backup File (.sqlite3)';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Alert({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose: () => void }) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border text-sm mb-4 ${type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="font-bold opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

function Badge({ children, color }: { children: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {children}
    </span>
  );
}

// ─── Databases Tab ────────────────────────────────────────────────────────────

function DatabasesTab({ onNotify }: { onNotify: (type: 'success' | 'error', msg: string) => void }) {
  const [dbs, setDbs] = useState<DbFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  useEffect(() => {
    api.getBackupDatabases()
      .then(d => setDbs(d.databases ?? []))
      .catch(() => onNotify('error', 'Failed to load databases'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (db: DbFile) => {
    setCreatingFor(db.path);
    try {
      const res = await api.createBackup(db.path);
      onNotify('success', `Backup created: ${res.backup.filename} (${formatBytes(res.backup.sizeBytes)})`);
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Failed to create backup');
    } finally {
      setCreatingFor(null);
    }
  };

  const handleDownload = (db: DbFile) => {
    window.open(api.getDownloadDbUrl(db.path), '_blank');
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Loading databases...</p>;
  if (dbs.length === 0) return <p className="text-gray-500 py-8 text-center">No SQLite database files discovered.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Active database files found on this server.
      </p>
      {dbs.map(db => (
        <div key={db.path} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 truncate">{db.name}</span>
              <Badge color="bg-blue-100 text-blue-700">SQLite</Badge>
              <span className="text-xs text-gray-400">{formatBytes(db.sizeBytes)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate" title={db.path}>{db.path}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => handleCreate(db)}
              disabled={creatingFor === db.path}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingFor === db.path ? 'Creating...' : 'Create Backup'}
            </button>
            <button
              onClick={() => handleDownload(db)}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-200"
            >
              Download
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Backups Tab ──────────────────────────────────────────────────────────────

interface DriveStatus {
  configured: boolean;
  authMethod: 'oauth2' | 'service_account' | null;
  canConnect: boolean;
  credentialsSource: 'file' | 'env' | null;
  folderName: string;
}

function BackupsTab({ onNotify }: { onNotify: (type: 'success' | 'error', msg: string) => void }) {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [sendingFile, setSendingFile] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [uploadingCreds, setUploadingCreds] = useState(false);
  const credInputRef = useRef<HTMLInputElement>(null);

  const refreshDriveStatus = () => api.getDriveStatus().then(setDriveStatus).catch(() => {});

  const load = () => {
    setLoading(true);
    api.listBackups()
      .then(d => setBackups(d.backups ?? []))
      .catch(() => onNotify('error', 'Failed to load backup list'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    refreshDriveStatus();
  }, []);

  const handleCredentialsUpload = async (file: File) => {
    setUploadingCreds(true);
    try {
      await api.uploadDriveCredentials(file);
      await refreshDriveStatus();
      onNotify('success', 'Credentials uploaded. Click "Connect Google Drive" to authenticate.');
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Invalid credentials file');
    } finally {
      setUploadingCreds(false);
      if (credInputRef.current) credInputRef.current.value = '';
    }
  };

  const handleRemoveCredentials = async () => {
    if (!confirm('Remove credentials file? This will also disconnect Google Drive.')) return;
    try {
      await api.removeDriveCredentials();
      await refreshDriveStatus();
      onNotify('success', 'Credentials removed.');
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Failed to remove credentials');
    }
  };

  const handleDownload = (b: BackupFile) => {
    window.open(api.getBackupFileDownloadUrl(b.filename), '_blank');
  };

  const handleConnectDrive = async () => {
    try {
      const { authUrl } = await api.getDriveAuthUrl();
      const popup = window.open(authUrl, 'google_drive_auth', 'width=520,height=640,left=200,top=100');
      // Listen for postMessage from popup (sent by callback page)
      const onMsg = async (e: MessageEvent) => {
        if (e.data === 'success') {
          window.removeEventListener('message', onMsg);
          popup?.close();
          const status = await api.getDriveStatus();
          setDriveStatus(status);
          onNotify('success', 'Google Drive connected successfully!');
        } else if (e.data === 'error') {
          window.removeEventListener('message', onMsg);
          onNotify('error', 'Google Drive authorization failed.');
        }
      };
      window.addEventListener('message', onMsg);
      // Fallback: if popup is closed without postMessage
      const poll = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(poll);
          window.removeEventListener('message', onMsg);
          const status = await api.getDriveStatus();
          setDriveStatus(status);
        }
      }, 1000);
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Failed to get auth URL');
    }
  };

  const handleDisconnectDrive = async () => {
    if (!confirm('Disconnect Google Drive? You can reconnect anytime.')) return;
    try {
      await api.disconnectDrive();
      const status = await api.getDriveStatus();
      setDriveStatus(status);
      onNotify('success', 'Google Drive disconnected.');
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Failed to disconnect');
    }
  };

  const handleSendToDrive = async (b: BackupFile) => {
    if (!driveStatus?.configured) {
      onNotify('error', 'Connect Google Drive first.');
      return;
    }
    setSendingFile(b.filename);
    try {
      const res = await api.sendBackupToDrive(b.filename);
      onNotify('success', `Uploaded to Drive "${res.folder}/". View: ${res.webViewLink}`);
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Failed to upload to Google Drive');
    } finally {
      setSendingFile(null);
    }
  };

  const handleDelete = async (b: BackupFile) => {
    if (!confirm(`Delete backup "${b.filename}"? This cannot be undone.`)) return;
    setDeletingFile(b.filename);
    try {
      await api.deleteBackup(b.filename);
      onNotify('success', `Deleted: ${b.filename}`);
      load();
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Delete failed');
    } finally {
      setDeletingFile(null);
    }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Loading backups...</p>;

  return (
    <div className="space-y-3">
      {/* Drive status banner */}
      {driveStatus && (
        <div className={`rounded-lg border text-sm ${driveStatus.configured ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
          {/* Main row */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span>{driveStatus.configured ? '☁️' : '○'}</span>
              {driveStatus.configured ? (
                <>
                  Google Drive connected
                  <span className="font-medium text-green-700">
                    ({driveStatus.authMethod === 'oauth2' ? 'OAuth2' : 'Service Account'})
                  </span>
                  — uploads go to <strong>{driveStatus.folderName}/</strong>
                </>
              ) : driveStatus.canConnect ? (
                <>Credentials ready — click <strong>Connect</strong> to authorise your Google account</>
              ) : (
                <>
                  Google Drive not set up —{' '}
                  <button
                    onClick={() => credInputRef.current?.click()}
                    disabled={uploadingCreds}
                    className="underline font-medium hover:text-gray-900 disabled:opacity-50"
                  >
                    {uploadingCreds ? 'Uploading...' : 'upload credentials.json'}
                  </button>
                  <input
                    ref={credInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCredentialsUpload(f); }}
                  />
                  <span className="text-gray-400 mx-1">·</span>
                  <a
                    href="https://github.com/samratpro/NextAdmin/blob/master/tutorials/GOOGLE_DRIVE_BACKUP.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-900"
                  >
                    see setup guide
                  </a>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {driveStatus.configured ? (
                <button onClick={handleDisconnectDrive} className="px-3 py-1 text-xs bg-white border border-red-200 text-red-600 rounded hover:bg-red-50">
                  Disconnect
                </button>
              ) : driveStatus.canConnect ? (
                <button onClick={handleConnectDrive} className="px-3 py-1 text-xs bg-white border border-indigo-300 text-indigo-600 rounded hover:bg-indigo-50 font-medium">
                  ☁ Connect Google Drive
                </button>
              ) : null}
              {/* Allow removing an uploaded credentials file */}
              {driveStatus.credentialsSource === 'file' && (
                <button onClick={handleRemoveCredentials} className="px-3 py-1 text-xs bg-white border border-gray-300 text-gray-500 rounded hover:bg-gray-100">
                  Remove file
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {backups.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">
          No backup files yet. Go to <strong>Databases</strong> tab and create one.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{backups.length} backup file{backups.length !== 1 ? 's' : ''} on disk</p>
            <button onClick={load} className="text-xs text-indigo-600 hover:underline">Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Filename</th>
                  <th className="px-4 py-3 text-left">Size</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {backups.map(b => (
                  <tr key={b.filename} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800 max-w-xs truncate" title={b.filename}>
                      {b.filename.startsWith('pre-restore_') ? (
                        <span className="flex items-center gap-1.5">
                          <Badge color="bg-yellow-100 text-yellow-700">safety</Badge>
                          {b.filename}
                        </span>
                      ) : b.filename}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatBytes(b.sizeBytes)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(b.modifiedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleDownload(b)}
                          className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleSendToDrive(b)}
                          disabled={sendingFile === b.filename || !driveStatus?.configured}
                          title={!driveStatus?.configured ? 'Configure GOOGLE_SERVICE_ACCOUNT_KEY to enable' : 'Upload to Google Drive'}
                          className="px-2.5 py-1 text-xs bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {sendingFile === b.filename ? (
                            <span>Sending...</span>
                          ) : (
                            <><span>☁</span> Drive</>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={deletingFile === b.filename}
                          className="px-2.5 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                        >
                          {deletingFile === b.filename ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Restore Tab ──────────────────────────────────────────────────────────────

function RestoreTab({ onNotify }: { onNotify: (type: 'success' | 'error', msg: string) => void }) {
  const [dbs, setDbs] = useState<DbFile[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getBackupDatabases()
      .then(d => {
        const list: DbFile[] = d.databases ?? [];
        setDbs(list);
        if (list.length > 0) setSelectedDb(list[0].path);
      })
      .catch(() => {});
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleRestore = async () => {
    if (!file) return onNotify('error', 'Select a backup file first');
    if (!selectedDb) return onNotify('error', 'Select a target database');
    if (!confirm(`This will REPLACE the database at:\n${selectedDb}\n\nA safety backup will be created automatically. Continue?`)) return;

    setRestoring(true);
    setResult(null);
    try {
      const res = await api.restoreBackup(file, selectedDb);
      setResult(res);
      onNotify('success', `Restored successfully. Safety backup: ${res.safetyBackup}`);
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        <strong>Before restoring:</strong> A safety backup of the current database is automatically created so you can roll back if needed.
      </div>

      {/* Target DB selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Target Database</label>
        <select
          value={selectedDb}
          onChange={e => { setSelectedDb(e.target.value); setFile(null); }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {dbs.map(db => (
            <option key={db.path} value={db.path}>{db.name}</option>
          ))}
        </select>
      </div>

      {/* File drop zone */}
      {(() => {
        const engine = dbs.find(d => d.path === selectedDb)?.engine;
        const ext = acceptExt(engine);
        const extDisplay = ext.split(',').join(' / ');
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {acceptLabel(engine)}
            </label>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-gray-100'}`}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="text-center">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null); }}
                    className="mt-2 text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Drag & drop a backup file here, or click to browse</p>
                  <p className="text-xs text-gray-400">Accepts {extDisplay} files</p>
                </>
              )}
            </div>
          </div>
        );
      })()}

      <button
        onClick={handleRestore}
        disabled={restoring || !file || !selectedDb}
        className="w-full py-2.5 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {restoring ? 'Restoring...' : 'Restore Database'}
      </button>

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 space-y-1">
          <p><strong>Restored to:</strong> {result.restoredTo}</p>
          <p><strong>Safety backup saved as:</strong> {result.safetyBackup}</p>
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

interface LogEntry {
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

function pad2(n: number) { return String(n).padStart(2, '0'); }

function describeSchedule(cfg: ScheduleConfig): string {
  const time = `${pad2(cfg.hour)}:${pad2(cfg.minute)}`;
  switch (cfg.frequency) {
    case 'daily':   return `Every day at ${time}`;
    case 'weekly':  return `Every Monday at ${time}`;
    case 'monthly': return `1st of every month at ${time}`;
    default:        return time;
  }
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-indigo-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

function ScheduleTab({ onNotify }: { onNotify: (type: 'success' | 'error', msg: string) => void }) {
  const [cfg, setCfg] = useState<ScheduleConfig>({
    enabled: false, frequency: 'daily', hour: 3, minute: 0,
    keepCount: 2, uploadToDrive: false, bandwidthLimitMbps: 50,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);

  useEffect(() => {
    Promise.all([api.getBackupSchedule(), api.getDriveStatus()])
      .then(([schedule, drive]) => { setCfg(schedule); setDriveConnected(drive.configured); })
      .catch(() => onNotify('error', 'Failed to load schedule'))
      .finally(() => setLoading(false));
  }, []);

  // Toggle enable/disable — saves immediately, no need to click Save
  const handleToggle = async () => {
    const next = { ...cfg, enabled: !cfg.enabled };
    setCfg(next);
    setToggling(true);
    try {
      const res = await api.saveBackupSchedule(next);
      setCfg(res.config);
      onNotify('success', res.config.enabled ? `Auto backup enabled — ${describeSchedule(res.config)}` : 'Auto backup disabled');
    } catch (e: any) {
      setCfg(cfg); // revert on failure
      onNotify('error', e?.response?.data?.error || 'Failed to update');
    } finally {
      setToggling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.saveBackupSchedule(cfg);
      setCfg(res.config);
      onNotify('success', res.config.enabled ? `Saved — ${describeSchedule(res.config)}` : 'Schedule saved');
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Loading...</p>;

  const dim = !cfg.enabled;

  return (
    <div className="max-w-xl space-y-4">

      {/* Header card — enable toggle + summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-900">Auto Backup</p>
          <p className={`text-sm mt-0.5 ${cfg.enabled ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
            {toggling
              ? (cfg.enabled ? 'Enabling...' : 'Disabling...')
              : cfg.enabled ? describeSchedule(cfg) : 'Disabled — configure below and enable'}
          </p>
        </div>
        {toggling ? (
          <span className="w-11 flex justify-center">
            <span className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full inline-block" />
          </span>
        ) : (
          <Toggle on={cfg.enabled} onChange={handleToggle} />
        )}
      </div>

      {/* Settings — dimmed when disabled */}
      <div className={`space-y-4 transition-opacity ${dim ? 'opacity-40 pointer-events-none select-none' : ''}`}>

        {/* Frequency + Time on one row */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Schedule</p>

          {/* Frequency pills */}
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map(f => (
              <button
                key={f}
                onClick={() => setCfg(p => ({ ...p, frequency: f }))}
                className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-colors capitalize
                  ${cfg.frequency === f
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {cfg.frequency === 'weekly' ? 'Every Monday' : cfg.frequency === 'monthly' ? '1st of each month' : 'Every day'}
          </p>

          {/* Time selects */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Hour</label>
              <select
                value={cfg.hour}
                onChange={e => setCfg(p => ({ ...p, hour: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{pad2(i)}:00</option>
                ))}
              </select>
            </div>
            <span className="text-gray-300 text-lg font-light mt-5">:</span>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Minute</label>
              <select
                value={cfg.minute}
                onChange={e => setCfg(p => ({ ...p, minute: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>{pad2(m)}</option>
                ))}
              </select>
            </div>
            <div className="mt-5 flex-1 text-sm text-gray-500 whitespace-nowrap">
              → <span className="font-medium text-gray-700">{pad2(cfg.hour)}:{pad2(cfg.minute)}</span>
            </div>
          </div>
        </div>

        {/* Keep count */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Retention</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Keep last backups</p>
              <p className="text-xs text-gray-400 mt-0.5">Older backups are deleted automatically — local &amp; Drive</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCfg(p => ({ ...p, keepCount: Math.max(1, p.keepCount - 1) }))}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg leading-none"
              >−</button>
              <span className="w-8 text-center font-bold text-gray-900 text-lg">{cfg.keepCount}</span>
              <button
                onClick={() => setCfg(p => ({ ...p, keepCount: Math.min(30, p.keepCount + 1) }))}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 text-lg leading-none"
              >+</button>
            </div>
          </div>
        </div>

        {/* Google Drive */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Google Drive</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Upload after backup</p>
              {!driveConnected
                ? <p className="text-xs text-amber-500 mt-0.5">Drive not connected — go to Backup Files tab</p>
                : <p className="text-xs text-green-600 mt-0.5">Drive connected</p>
              }
            </div>
            <Toggle
              on={cfg.uploadToDrive && driveConnected}
              onChange={() => setCfg(p => ({ ...p, uploadToDrive: !p.uploadToDrive }))}
              disabled={!driveConnected}
            />
          </div>

          {cfg.uploadToDrive && driveConnected && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">Upload speed limit</label>
                <span className="text-xs font-semibold text-indigo-600">{cfg.bandwidthLimitMbps} Mbps</span>
              </div>
              <input
                type="range" min={1} max={50} value={cfg.bandwidthLimitMbps}
                onChange={e => setCfg(p => ({ ...p, bandwidthLimitMbps: Number(e.target.value) }))}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-300 mt-0.5">
                <span>1 Mbps</span><span>50 Mbps max</span>
              </div>
            </div>
          )}
        </div>

      </div>{/* end dim wrapper */}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
      >
        {saving ? 'Saving...' : 'Save Schedule'}
      </button>

    </div>
  );
}

// ─── Running Tab ──────────────────────────────────────────────────────────────

function RunningTab({ onNotify }: { onNotify: (type: 'success' | 'error', msg: string) => void }) {
  const [backupRunning, setBackupRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = () =>
    api.getBackupLog().then(res => {
      setLog(res.log);
      setBackupRunning(res.running);
      return res.running;
    }).catch(() => false);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const still = await refresh();
      if (!still && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, 3000);
  };

  useEffect(() => {
    refresh().then(running => { if (running) startPolling(); }).finally(() => setLoading(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleRunNow = async () => {
    setTriggering(true);
    try {
      await api.runBackupNow();
      setBackupRunning(true);
      startPolling();
      onNotify('success', 'Backup started');
    } catch (e: any) {
      onNotify('error', e?.response?.data?.error || 'Failed to start backup');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Loading...</p>;

  const lastRun = log[0];

  return (
    <div className="max-w-xl space-y-4">

      {/* Status card */}
      <div className={`rounded-xl border p-6 flex items-center justify-between gap-4 transition-colors
        ${backupRunning ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-4">
          {backupRunning ? (
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="animate-spin inline-block w-6 h-6 border-[3px] border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
              ${lastRun?.status === 'error' ? 'bg-red-100' : 'bg-green-100'}`}>
              <span className={`text-2xl ${lastRun?.status === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                {lastRun ? (lastRun.status === 'success' ? '✓' : '✗') : '○'}
              </span>
            </div>
          )}
          <div>
            <p className={`font-semibold text-lg ${backupRunning ? 'text-indigo-700' : 'text-gray-900'}`}>
              {backupRunning ? 'Backup running...' : lastRun ? `Last run ${lastRun.status}` : 'No backups yet'}
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              {backupRunning
                ? 'This page auto-refreshes every 3 seconds'
                : lastRun
                  ? `${new Date(lastRun.at).toLocaleString()} · ${(lastRun.durationMs / 1000).toFixed(1)}s`
                  : 'Click Run Now to take a backup manually'}
            </p>
          </div>
        </div>
        <button
          onClick={handleRunNow}
          disabled={triggering || backupRunning}
          className="flex-shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {triggering ? 'Starting...' : backupRunning ? 'Running...' : 'Run Now'}
        </button>
      </div>

      {/* Log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Recent Runs</p>
          <button onClick={refresh} className="text-xs text-indigo-600 hover:underline">Refresh</button>
        </div>

        {log.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No backup history yet</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {log.map((entry, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                {/* Status dot */}
                <div className={`mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
                  ${entry.status === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {entry.status === 'success' ? '✓' : '✗'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(entry.at).toLocaleString()}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                      ${entry.trigger === 'manual' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {entry.trigger}
                    </span>
                    <span className="text-xs text-gray-400">{(entry.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                  {entry.status === 'success' && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {entry.file && <span className="text-xs font-mono text-gray-500 truncate max-w-xs">{entry.file}</span>}
                      {entry.sizeBytes != null && (
                        <span className="text-xs text-gray-400">{(entry.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                      )}
                      {entry.uploadedDrive && (
                        <span className="text-xs text-indigo-500 font-medium">☁ Drive</span>
                      )}
                      {entry.deletedLocal > 0 && (
                        <span className="text-xs text-orange-500">−{entry.deletedLocal} local</span>
                      )}
                      {entry.deletedDrive > 0 && (
                        <span className="text-xs text-orange-500">−{entry.deletedDrive} Drive</span>
                      )}
                    </div>
                  )}
                  {entry.error && (
                    <p className="text-xs text-red-500 mt-1">{entry.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [tab, setTab] = useState<Tab>('databases');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'databases', label: 'Databases' },
    { id: 'backups',   label: 'Backup Files' },
    { id: 'restore',   label: 'Restore' },
    { id: 'schedule',  label: 'Schedule' },
    { id: 'running',   label: 'Running' },
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Nav */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <a href="/dashboard" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                    Dashboard
                  </a>
                  {user?.isSuperuser === true && (
                    <a href="/dashboard/models/User" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                      Users
                    </a>
                  )}
                  <a href="/dashboard/backup" className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                    Backup
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-700">{user?.username}</span>
                <button
                  onClick={async () => { await logout(); router.push('/login'); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Content */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Database Backup & Restore</h2>
            <p className="text-sm text-gray-500 mt-1">Manage backups for all database files — no configuration required.</p>
          </div>

          {notification && (
            <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)} />
          )}

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex space-x-6">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {tab === 'databases' && <DatabasesTab onNotify={notify} />}
          {tab === 'backups'   && <BackupsTab onNotify={notify} />}
          {tab === 'restore'   && <RestoreTab onNotify={notify} />}
          {tab === 'schedule'  && <ScheduleTab onNotify={notify} />}
          {tab === 'running'   && <RunningTab onNotify={notify} />}
        </main>
      </div>
    </ProtectedRoute>
  );
}
