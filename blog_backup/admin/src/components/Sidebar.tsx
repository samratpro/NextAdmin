'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

interface ModelInfo {
  name: string;
  tableName: string;
  appName: string;
  displayName: string;
  icon: string;
  permissions: string[];
}

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className = '' }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const response = await api.get('/api/admin/models');
      const loadedModels = response.models || [];
      setModels(loadedModels);

      const apps = new Set<string>(loadedModels.map((model: ModelInfo) => model.appName || 'General'));
      setExpandedApps(apps);
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  const groupedModels = models.reduce((acc, model) => {
    const appName = model.appName || 'General';
    if (!acc[appName]) {
      acc[appName] = [];
    }
    acc[appName].push(model);
    return acc;
  }, {} as Record<string, ModelInfo[]>);

  const toggleApp = (appName: string) => {
    const next = new Set(expandedApps);
    if (next.has(appName)) {
      next.delete(appName);
    } else {
      next.add(appName);
    }
    setExpandedApps(next);
  };

  const getIconEmoji = (icon: string) => {
    const iconMap: Record<string, string> = {
      users: '👥',
      shield: '🛡️',
      'users-cog': '⚙️',
      package: '📦',
      folder: '📁',
      database: '🗄️',
      search: '🔎',
      'credit-card': '💳',
      layout: '🧩',
    };

    return iconMap[icon] || '📄';
  };

  const isActive = (modelName: string) => pathname === `/dashboard/models/${modelName}`;

  return (
    <div className={`h-screen w-64 overflow-y-auto border-r border-gray-200 bg-white ${className}`}>
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Models</h2>
        <p className="mt-1 text-xs text-gray-500">Django-style navigation</p>
      </div>

      <div className="py-2">
        {Object.entries(groupedModels).map(([appName, appModels]) => (
          <div key={appName} className="mb-1">
            <button
              onClick={() => toggleApp(appName)}
              className="flex w-full items-center justify-between px-4 py-2 transition-colors hover:bg-gray-50"
            >
              <span className="text-sm font-semibold uppercase tracking-wide text-gray-700">{appName}</span>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${expandedApps.has(appName) ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {expandedApps.has(appName) && (
              <div className="ml-2">
                {appModels.map((model) => (
                  <button
                    key={model.name}
                    onClick={() => router.push(`/dashboard/models/${model.name}`)}
                    className={`flex w-full items-center space-x-2 px-4 py-2 text-left transition-colors hover:bg-indigo-50 ${
                      isActive(model.name) ? 'border-l-4 border-indigo-600 bg-indigo-100' : ''
                    }`}
                  >
                    <span className="text-lg">{getIconEmoji(model.icon)}</span>
                    <span className={`text-sm ${isActive(model.name) ? 'font-semibold text-indigo-700' : 'text-gray-700'}`}>
                      {model.displayName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-gray-200 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Links</h3>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full rounded px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
        >
          Dashboard
        </button>
      </div>
    </div>
  );
}
