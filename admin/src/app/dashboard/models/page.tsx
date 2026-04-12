'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import Breadcrumbs from '@/components/Breadcrumbs';
import Sidebar from '@/components/Sidebar';
import { api } from '@/lib/api';

interface ModelInfo {
    name: string;
    tableName: string;
    appName: string;
    displayName: string;
    icon: string;
    permissions: string[];
}

export default function ModelsPage() {
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadModels();
    }, []);

    const loadModels = async () => {
        try {
            const response = await api.get('/api/admin/models');
            setModels(response.models || []);
        } catch (error) {
            console.error('Error loading models:', error);
        } finally {
            setLoading(false);
        }
    };

    // Group models by app name
    const groupedModels = models.reduce((acc, model) => {
        const appName = model.appName || 'General';
        if (!acc[appName]) {
            acc[appName] = [];
        }
        acc[appName].push(model);
        return acc;
    }, {} as Record<string, ModelInfo[]>);

    const getIconEmoji = (icon: string) => {
        const iconMap: Record<string, string> = {
            users: '👥',
            shield: '🛡️',
            'users-cog': '⚙️',
            package: '📦',
            folder: '📁',
            database: '🗄️',
            edit: '✏️',
        };
        return iconMap[icon] || '📄';
    };

    return (
        <ProtectedRoute>
            <div className="flex min-h-screen bg-gray-100">
                {/* Left Sidebar - Django Style */}
                <Sidebar />

                {/* Main Content */}
                <div className="flex-1 overflow-auto">
                    {/* Page Header */}
                    <div className="bg-white shadow-sm border-b border-gray-200">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            <Breadcrumbs items={[{ label: 'Models' }]} />
                            <h1 className="text-2xl font-semibold text-gray-900 mt-2">Registered Models</h1>
                            <p className="mt-1 text-sm text-gray-500">
                                Models organized by application
                            </p>
                        </div>
                    </div>

                    {/* Content */}
                    <main>
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {Object.entries(groupedModels).map(([appName, appModels]) => (
                                        <div key={appName}>
                                            {/* App Section Header */}
                                            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-t-lg px-6 py-4 shadow-md">
                                                <h2 className="text-lg font-bold text-white uppercase tracking-wide">
                                                    {appName}
                                                </h2>
                                                <p className="text-indigo-100 text-sm font-medium mt-1">
                                                    {appModels.length} {appModels.length === 1 ? 'model' : 'models'}
                                                </p>
                                            </div>

                                            {/* Models Grid */}
                                            <div className="bg-white rounded-b-lg shadow-md overflow-hidden border-x border-b border-gray-200">
                                                <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3 bg-gray-200">
                                                    {appModels.map((model) => (
                                                        <div
                                                            key={model.name}
                                                            onClick={() => router.push(`/dashboard/models/${model.name}`)}
                                                            className="bg-white hover:bg-indigo-50 cursor-pointer transition-colors p-6"
                                                        >
                                                            <div className="flex items-center">
                                                                <div className="flex-shrink-0">
                                                                    <div className="text-4xl">{getIconEmoji(model.icon)}</div>
                                                                </div>
                                                                <div className="ml-5 w-0 flex-1">
                                                                    <dl>
                                                                        <dt className="text-lg font-semibold text-gray-900 truncate">
                                                                            {model.displayName}
                                                                        </dt>
                                                                        <dd className="mt-1 text-sm text-gray-500">
                                                                            Table: {model.tableName}
                                                                        </dd>
                                                                        <dd className="mt-1 text-xs text-gray-400">
                                                                            {model.permissions.length} permissions
                                                                        </dd>
                                                                    </dl>
                                                                </div>
                                                                <div className="ml-2">
                                                                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                    </svg>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!loading && models.length === 0 && (
                                <div className="text-center py-12 bg-white rounded-lg shadow">
                                    <p className="text-gray-600 font-medium">
                                        {user?.isSuperuser 
                                            ? "No models registered yet." 
                                            : "No models have been permitted for your account."}
                                    </p>
                                    {user?.isSuperuser === true && (
                                        <p className="text-sm text-gray-400 mt-2">
                                            Create a model with <code className="bg-gray-100 px-2 py-1 rounded">npm run dev startapp myapp</code>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
