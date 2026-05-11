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

function SidebarContent({ className = '' }: SidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, hasPermission } = useAuthStore();
    const isSuperuser = !!user?.isSuperuser;
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
            const apps = new Set<string>(loadedModels.map((m: ModelInfo) => m.appName || 'General'));
            setExpandedApps(apps);
        } catch (error) {
            console.error('Error loading models:', error);
        }
    };

    const groupedModels = models.reduce((acc, model) => {
        const appName = model.appName || 'General';
        if (!acc[appName]) acc[appName] = [];
        acc[appName].push(model);
        return acc;
    }, {} as Record<string, ModelInfo[]>);

    const toggleApp = (appName: string) => {
        const newExpanded = new Set(expandedApps);
        if (newExpanded.has(appName)) newExpanded.delete(appName);
        else newExpanded.add(appName);
        setExpandedApps(newExpanded);
    };

    const getIconEmoji = (icon: string) => {
        const iconMap: Record<string, string> = {
            users: '👥',
            shield: '🛡️',
            'users-cog': '⚙️',
            package: '📦',
            folder: '📁',
            database: '🗄️',
        };
        return iconMap[icon] || '📄';
    };

    const isActive = (modelName: string) => pathname === `/dashboard/models/${modelName}`;

    return (
        <div className={`w-64 bg-white border-r border-gray-200 h-full flex flex-col ${className}`}>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">Models</h2>
                <p className="text-xs text-gray-500 mt-1">DB Model Navigation</p>
            </div>

            {/* Models — scrolls internally */}
            <div className="flex-1 overflow-y-auto py-2">
                {Object.entries(groupedModels).map(([appName, appModels]) => (
                    <div key={appName} className="mb-1">
                        <button
                            onClick={() => toggleApp(appName)}
                            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                            <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                {appName}
                            </span>
                            <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${expandedApps.has(appName) ? 'rotate-90' : ''}`}
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
                                        className={`w-full px-4 py-2 flex items-center space-x-2 text-left hover:bg-indigo-50 transition-colors ${
                                            isActive(model.name) ? 'bg-indigo-100 border-l-4 border-indigo-600' : ''
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

            {/* Quick Links — pinned at bottom */}
            <div className="flex-shrink-0 border-t border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Links</h3>
                <button
                    onClick={() => router.push('/dashboard')}
                    className={`w-full px-3 py-2 text-sm text-left rounded transition-colors ${
                        pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    📊 Dashboard
                </button>
                {isSuperuser && (
                    <button
                        onClick={() => router.push('/dashboard/backup')}
                        className={`w-full px-3 py-2 text-sm text-left rounded transition-colors ${
                            pathname === '/dashboard/backup' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        💾 Backup Management
                    </button>
                )}
                {hasPermission('seo.manage') && (
                    <button
                        onClick={() => router.push('/dashboard/seo')}
                        className={`w-full px-3 py-2 text-sm text-left rounded transition-colors ${
                            pathname === '/dashboard/seo' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        🔍 SEO Management
                    </button>
                )}
                {isSuperuser && (
                    <button
                        onClick={() => {
                            router.push('/dashboard');
                            setTimeout(() => {
                                document.getElementById('health-check-section')?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                        }}
                        className="w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 rounded transition-colors"
                    >
                        🏥 Health Check
                    </button>
                )}
            </div>
        </div>
    );
}

export default function Sidebar({ className = '' }: SidebarProps) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const toggle = () => setMobileOpen(prev => !prev);
        window.addEventListener('toggle-sidebar', toggle);
        return () => window.removeEventListener('toggle-sidebar', toggle);
    }, []);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    return (
        <>
            {/* Desktop sidebar */}
            <div className="hidden md:flex h-full">
                <SidebarContent className={className} />
            </div>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setMobileOpen(false)}
                    />
                    <div className="absolute left-0 top-0 bottom-0 animate-slide-in">
                        <SidebarContent />
                    </div>
                </div>
            )}
        </>
    );
}
