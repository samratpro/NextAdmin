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

type Tab = 'databases' | 'backups' | 'restore';

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
                    href="https://github.com/samratpro/nango/blob/master/tutorials/GOOGLE_DRIVE_BACKUP.md"
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
          onChange={e => setSelectedDb(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {dbs.map(db => (
            <option key={db.path} value={db.path}>{db.name} — {db.path}</option>
          ))}
        </select>
      </div>

      {/* File drop zone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {acceptLabel(dbs.find(d => d.path === selectedDb)?.engine)}
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
            accept={acceptExt(dbs.find(d => d.path === selectedDb)?.engine)}
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
              <p className="text-xs text-gray-400">Accepts .sqlite3 files</p>
            </>
          )}
        </div>
      </div>

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
    { id: 'backups', label: 'Backup Files' },
    { id: 'restore', label: 'Restore' },
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
                  {user?.isSuperuser && (
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
          {tab === 'backups' && <BackupsTab onNotify={notify} />}
          {tab === 'restore' && <RestoreTab onNotify={notify} />}
        </main>
      </div>
    </ProtectedRoute>
  );
}
