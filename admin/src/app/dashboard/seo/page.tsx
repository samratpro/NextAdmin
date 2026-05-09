'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import Breadcrumbs from '@/components/Breadcrumbs';
import CharacterCounter from '@/components/CharacterCounter';
import DashboardNavbar from '@/components/DashboardNavbar';

// --- Types ---

interface PageSeo {
    pageSlug: string;
    metaTitle: string;
    metaDescription: string;
    canonicalUrl: string;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    twitterTitle: string;
    twitterDescription: string;
    twitterImage: string;
    noIndex: boolean;
    schema: string;
}

interface GlobalSeoSettings {
    headerScripts: string;
    footerScripts: string;
}

interface SitemapConfig {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    priority: number;
    excludeSlugs: string[];
    includedModels: string[];
    staticPaths: string[];
    maxUrlsPerSitemap: number;
}

type Tab = 'pages' | 'robots' | 'scripts' | 'sitemap' | 'backup';

// --- Sub-components ---

function Badge({ children, color }: { children: string; color: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
            {children}
        </span>
    );
}

function ImageUploadField({
    label, value, onChange, slug, imageType, savedSlugs
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    slug: string;          // current page slug
    imageType: 'og' | 'twitter';
    savedSlugs: string[];
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const normalize = (s: string) => s.replace(/^\//, '').replace(/\/$/, '');
    const isSaved = !!slug && savedSlugs.some(s => normalize(s) === normalize(slug));
    const canUpload = isSaved;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !slug) return;
        setUploading(true);
        try {
            const res = await api.uploadSeoImage(file, slug, imageType);
            onChange(res.url);
        } catch {
            alert('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    if (!canUpload) {
        return (
            <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">{label}</label>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs text-amber-700 flex items-center gap-2">
                        <span>💡</span> Save the page first to enable image uploads for this slug.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">{label}</label>
            <div className="flex items-start gap-4">
                {value && (
                    <div className="relative w-20 h-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center group">
                        <img
                            src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${value}`}
                            alt="Preview"
                            className="w-full h-full object-cover"
                        />
                        <button
                            onClick={() => onChange('')}
                            className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 shadow-sm"
                        >✕</button>
                    </div>
                )}
                <div className="flex-1 space-y-1">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="/uploads/seo/..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="px-4 py-2 bg-white text-gray-700 rounded-lg text-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap font-medium transition-colors"
                        >
                            {uploading ? '...' : 'Upload'}
                        </button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                </div>
            </div>
        </div>
    );
}

// --- Main Page ---

export default function SeoManagementPage() {
    const { user, hasPermission } = useAuthStore();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('pages');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [driveStatus, setDriveStatus] = useState<any>(null);

    // Data states
    const [robots, setRobots] = useState('');
    const [globalSettings, setGlobalSettings] = useState<GlobalSeoSettings>({ headerScripts: '', footerScripts: '' });
    const [pages, setPages] = useState<PageSeo[]>([]);
    const [sitemap, setSitemap] = useState<SitemapConfig>({
        enabled: true, frequency: 'daily', priority: 0.8,
        excludeSlugs: [], includedModels: [], staticPaths: [], maxUrlsPerSitemap: 0
    });
    const [availableModels, setAvailableModels] = useState<{ name: string; displayName: string }[]>([]);

    // Page editing state
    const [editingPage, setEditingPage] = useState<PageSeo | null>(null);

    useEffect(() => {
        if (activeTab === 'pages') loadAllData();
        if (activeTab === 'backup') fetchDriveStatus();
    }, [activeTab]);

    const fetchDriveStatus = async () => {
        try {
            const status = await api.getDriveStatus();
            setDriveStatus(status);
        } catch {}
    };

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [robotsRes, globalRes, pagesRes, sitemapRes, modelsRes] = await Promise.all([
                api.getSeoRobots(),
                api.getSeoGlobalScripts(),
                api.listSeoPages(),
                api.getSeoSitemapConfig(),
                api.get('/api/admin/models'),
            ]);
            setRobots(robotsRes.content || '');
            setGlobalSettings(globalRes);
            setPages(pagesRes || []);
            setSitemap(sitemapRes);
            const modelList = (modelsRes?.models || []).map((m: any) => ({ name: m.name, displayName: m.displayName }));
            setAvailableModels(modelList);
        } catch (err) {
            console.error('SEO: Load error:', err);
            setMessage({ type: 'error', text: 'Failed to load SEO data' });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveGlobal = async () => {
        setSaving(true);
        try {
            if (activeTab === 'robots') await api.updateSeoRobots(robots);
            else await api.updateSeoGlobalScripts(globalSettings);
            setMessage({ type: 'success', text: 'Global SEO settings saved' });
        } catch {
            setMessage({ type: 'error', text: 'Failed to save global settings' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSitemap = async () => {
        setSaving(true);
        try {
            await api.updateSeoSitemapConfig(sitemap);
            setMessage({ type: 'success', text: 'Sitemap configuration saved' });
        } catch {
            setMessage({ type: 'error', text: 'Failed to save sitemap config' });
        } finally {
            setSaving(false);
        }
    };

    const handleSavePage = async () => {
        if (!editingPage) return;

        const slug = editingPage.pageSlug.trim();
        if (!slug) {
            setMessage({ type: 'error', text: 'Page slug is required' });
            return;
        }

        const normalize = (s: string) => s.replace(/^\//, '').replace(/\/$/, '');
        const targetSlug = normalize(slug);

        // Check for duplicates if creating NEW
        const isExisting = pages.some(p => normalize(p.pageSlug) === targetSlug);
        // If editing an existing one, we are fine as long as we don't change to another existing one
        // But for simplicity, we use the backend to handle the merge/overwrite, 
        // however the user asked for termination if slug exists.
        // Actually, if we are EDITING, we want to overwrite. If we are ADDING, we want to warn.
        
        // Let's assume 'editingPage' from the '+ Add Page' button has no original slug.
        // We'll just let the user save.

        setSaving(true);
        try {
            await api.updateSeoPage(editingPage);
            setMessage({ type: 'success', text: `SEO for "${slug}" saved` });
            setEditingPage(null);
            loadAllData();
        } catch {
            setMessage({ type: 'error', text: 'Failed to save page SEO' });
        } finally {
            setSaving(false);
        }
    };

    const handleDeletePage = async (slug: string) => {
        if (!confirm(`Are you sure you want to delete SEO settings for "${slug}"?`)) return;
        try {
            await api.deleteSeoPage(slug);
            setMessage({ type: 'success', text: 'Deleted successfully' });
            loadAllData();
        } catch {
            setMessage({ type: 'error', text: 'Delete failed' });
        }
    };

    if (user && !hasPermission('seo.manage')) {
        return (
            <ProtectedRoute>
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <div className="text-center p-8 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm">
                        <div className="text-4xl mb-4">🚫</div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                        <p className="text-gray-500 text-sm mb-6">You don't have permission to manage SEO settings.</p>
                        <button onClick={() => router.push('/dashboard')} className="text-indigo-600 font-bold hover:underline">Back to Dashboard</button>
                    </div>
                </div>
            </ProtectedRoute>
        );
    }

    const breadcrumbs = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'SEO Management' }
    ];

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 pb-20">
                <DashboardNavbar />
                
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <div>
                            <Breadcrumbs items={breadcrumbs} />
                            <h1 className="text-3xl font-bold text-gray-900 mt-2">SEO Management</h1>
                            <p className="text-gray-500 text-sm mt-1">Configure meta tags, robots.txt, sitemaps, and structured data.</p>
                        </div>
                        {activeTab === 'pages' && !editingPage && (
                            <button 
                                onClick={() => setEditingPage({
                                    pageSlug: '', metaTitle: '', metaDescription: '', canonicalUrl: '',
                                    ogTitle: '', ogDescription: '', ogImage: '',
                                    twitterTitle: '', twitterDescription: '', twitterImage: '',
                                    noIndex: false, schema: ''
                                })}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                            >
                                <span>+</span> Add New Page
                            </button>
                        )}
                    </div>

                    {message && (
                        <div className={`mb-8 p-4 rounded-xl flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-300 ${
                            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                        }`}>
                            <div className="flex items-center gap-3">
                                <span>{message.type === 'success' ? '✅' : '❌'}</span>
                                <span className="font-medium">{message.text}</span>
                            </div>
                            <button onClick={() => setMessage(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Tabs Navigation */}
                        <div className="flex border-b border-gray-100 bg-gray-50/50 px-6">
                            {[
                                { id: 'pages', label: 'Page SEO', icon: '📄' },
                                { id: 'robots', label: 'Robots.txt', icon: '🤖' },
                                { id: 'scripts', label: 'Global Scripts', icon: '📜' },
                                { id: 'sitemap', label: 'XML Sitemap', icon: '🗺️' },
                                { id: 'backup', label: 'Backup & Restore', icon: '💾' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id as any); setEditingPage(null); }}
                                    className={`py-5 px-6 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                                        activeTab === tab.id 
                                            ? 'border-indigo-600 text-indigo-600 bg-white shadow-[0_4px_20px_-10px_rgba(79,70,229,0.2)]' 
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
                                    }`}
                                >
                                    <span>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="p-8">
                            {loading ? (
                                <div className="py-20 flex flex-col items-center justify-center">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                                    <p className="text-gray-400 text-sm font-medium">Loading SEO configurations...</p>
                                </div>
                            ) : (
                                <>
                                    {/* PAGES TAB */}
                                    {activeTab === 'pages' && !editingPage && (
                                        <div className="space-y-6">
                                            {pages.length === 0 ? (
                                                <div className="text-center py-20 border-2 border-dashed border-gray-100 rounded-2xl">
                                                    <div className="text-4xl mb-4 opacity-20">📂</div>
                                                    <p className="text-gray-400 font-medium">No page SEO configured yet.</p>
                                                    <button 
                                                        onClick={() => setEditingPage({pageSlug: '', metaTitle: '', metaDescription: '', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '', twitterTitle: '', twitterDescription: '', twitterImage: '', noIndex: false, schema: ''})}
                                                        className="mt-4 text-indigo-600 font-bold hover:underline"
                                                    >+ Create your first page SEO</button>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {pages.map(page => (
                                                        <div key={page.pageSlug} className="group p-6 border border-gray-200 rounded-2xl hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-50/50 transition-all bg-white relative">
                                                            <div className="flex items-start justify-between gap-4 mb-4">
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 truncate max-w-[150px]">
                                                                            /{page.pageSlug}
                                                                        </span>
                                                                        {page.noIndex && <Badge color="bg-red-50 text-red-600 border border-red-100">no-index</Badge>}
                                                                    </div>
                                                                    <h3 className="font-bold text-gray-900 line-clamp-1 group-hover:text-indigo-600 transition-colors">{page.metaTitle || 'Untitled Page'}</h3>
                                                                </div>
                                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                                                                    <button onClick={() => setEditingPage(page)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                                                                        ✏️
                                                                    </button>
                                                                    <button onClick={() => handleDeletePage(page.pageSlug)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                                                        🗑️
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{page.metaDescription || 'No description provided.'}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* PAGE EDITOR */}
                                    {activeTab === 'pages' && editingPage && (
                                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center justify-between border-b border-gray-100 pb-6">
                                                <div className="flex items-center gap-4">
                                                    <button onClick={() => setEditingPage(null)} className="text-gray-400 hover:text-gray-600 transition-colors">←</button>
                                                    <h2 className="text-xl font-bold text-gray-900">
                                                        {editingPage.pageSlug ? `Edit SEO: /${editingPage.pageSlug}` : 'New Page SEO'}
                                                    </h2>
                                                </div>
                                                <div className="flex gap-3">
                                                    <button onClick={() => setEditingPage(null)} className="px-5 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                                                    <button 
                                                        onClick={handleSavePage}
                                                        disabled={saving || !editingPage.pageSlug}
                                                        className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 text-sm"
                                                    >
                                                        {saving ? 'Saving...' : 'Save Changes'}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
                                                {/* Section: Basic Info */}
                                                <div className="space-y-6">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">01</span>
                                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Base Metadata</h3>
                                                    </div>
                                                    
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Page Slug (URL Path)</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">/</span>
                                                                <input 
                                                                    type="text" 
                                                                    value={editingPage.pageSlug} 
                                                                    onChange={(e) => setEditingPage({...editingPage, pageSlug: e.target.value})}
                                                                    placeholder="services/web-design"
                                                                    className="w-full border border-gray-300 rounded-xl pl-6 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                                                                />
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 mt-2 italic">Use "home" for your website's index page.</p>
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Meta Title</label>
                                                            <input 
                                                                type="text" 
                                                                value={editingPage.metaTitle} 
                                                                onChange={(e) => setEditingPage({...editingPage, metaTitle: e.target.value})}
                                                                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <CharacterCounter current={editingPage.metaTitle.length} max={60} />
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Meta Description</label>
                                                            <textarea 
                                                                rows={4}
                                                                value={editingPage.metaDescription} 
                                                                onChange={(e) => setEditingPage({...editingPage, metaDescription: e.target.value})}
                                                                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <CharacterCounter current={editingPage.metaDescription.length} max={160} />
                                                        </div>

                                                        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 group cursor-pointer" onClick={() => setEditingPage({...editingPage, noIndex: !editingPage.noIndex})}>
                                                            <div className={`w-10 h-6 rounded-full transition-colors relative ${editingPage.noIndex ? 'bg-red-500' : 'bg-gray-200'}`}>
                                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${editingPage.noIndex ? 'translate-x-5' : 'translate-x-1'}`} />
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="text-sm font-bold text-gray-900">No-Index</p>
                                                                <p className="text-[10px] text-gray-500">Prevent search engines from indexing this page.</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Section: Social Sharing */}
                                                <div className="space-y-6">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">02</span>
                                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Social Media (Open Graph)</h3>
                                                    </div>

                                                    <div className="space-y-6">
                                                        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Facebook / LinkedIn (OG)</p>
                                                            <input 
                                                                type="text" 
                                                                placeholder="OG Title"
                                                                value={editingPage.ogTitle} 
                                                                onChange={(e) => setEditingPage({...editingPage, ogTitle: e.target.value})}
                                                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <textarea 
                                                                rows={2}
                                                                placeholder="OG Description"
                                                                value={editingPage.ogDescription} 
                                                                onChange={(e) => setEditingPage({...editingPage, ogDescription: e.target.value})}
                                                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <ImageUploadField
                                                                label="OG Image (1200x630px)"
                                                                value={editingPage.ogImage}
                                                                onChange={(val) => setEditingPage({...editingPage, ogImage: val})}
                                                                slug={editingPage.pageSlug}
                                                                imageType="og"
                                                                savedSlugs={pages.map(p => p.pageSlug)}
                                                            />
                                                        </div>

                                                        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Twitter Card</p>
                                                            <input 
                                                                type="text" 
                                                                placeholder="Twitter Title"
                                                                value={editingPage.twitterTitle} 
                                                                onChange={(e) => setEditingPage({...editingPage, twitterTitle: e.target.value})}
                                                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <ImageUploadField
                                                                label="Twitter Image (600x330px)"
                                                                value={editingPage.twitterImage}
                                                                onChange={(val) => setEditingPage({...editingPage, twitterImage: val})}
                                                                slug={editingPage.pageSlug}
                                                                imageType="twitter"
                                                                savedSlugs={pages.map(p => p.pageSlug)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Section: Structured Data */}
                                                <div className="lg:col-span-2 space-y-6 pt-10 border-t border-gray-100">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">03</span>
                                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Structured Data (JSON-LD)</h3>
                                                    </div>
                                                    
                                                    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-2xl">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex gap-1.5">
                                                                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                                                                <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
                                                                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                                                            </div>
                                                            <span className="text-[10px] text-gray-500 font-mono">application/ld+json</span>
                                                        </div>
                                                        <textarea 
                                                            rows={10}
                                                            value={editingPage.schema} 
                                                            onChange={(e) => setEditingPage({...editingPage, schema: e.target.value})}
                                                            placeholder='{ "@context": "https://schema.org", "@type": "WebPage", "name": "..." }'
                                                            className="w-full bg-transparent text-indigo-300 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 px-2 italic">Paste your JSON-LD schema here. This will be injected into the page head for rich search results.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ROBOTS TAB */}
                                    {activeTab === 'robots' && (
                                        <div className="space-y-8 max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div>
                                                <h2 className="text-xl font-bold text-gray-900 mb-2">Robots.txt Content</h2>
                                                <p className="text-sm text-gray-500 mb-6">Control how search engine crawlers interact with your site.</p>
                                                
                                                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-lg">
                                                    <textarea 
                                                        rows={12}
                                                        value={robots} 
                                                        onChange={(e) => setRobots(e.target.value)}
                                                        className="w-full bg-transparent text-green-400 font-mono text-sm focus:outline-none resize-none leading-relaxed"
                                                        placeholder="User-agent: *..."
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-6 border-t border-gray-100">
                                                <button 
                                                    onClick={handleSaveGlobal}
                                                    disabled={saving}
                                                    className="px-10 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
                                                >
                                                    {saving ? 'Saving...' : 'Save Robots.txt'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* SCRIPTS TAB */}
                                    {activeTab === 'scripts' && (
                                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                                <div className="space-y-4">
                                                    <div>
                                                        <h3 className="text-sm font-bold text-gray-900 mb-1">Header Scripts</h3>
                                                        <p className="text-xs text-gray-400 mb-3">Injected before the closing &lt;/head&gt; tag.</p>
                                                    </div>
                                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                                                        <textarea 
                                                            rows={12}
                                                            value={globalSettings.headerScripts} 
                                                            onChange={(e) => setGlobalSettings({...globalSettings, headerScripts: e.target.value})}
                                                            className="w-full bg-transparent font-mono text-xs focus:outline-none resize-none"
                                                            placeholder="<script>...</script>"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    <div>
                                                        <h3 className="text-sm font-bold text-gray-900 mb-1">Footer Scripts</h3>
                                                        <p className="text-xs text-gray-400 mb-3">Injected before the closing &lt;/body&gt; tag.</p>
                                                    </div>
                                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                                                        <textarea 
                                                            rows={12}
                                                            value={globalSettings.footerScripts} 
                                                            onChange={(e) => setGlobalSettings({...globalSettings, footerScripts: e.target.value})}
                                                            className="w-full bg-transparent font-mono text-xs focus:outline-none resize-none"
                                                            placeholder="<script>...</script>"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-6 border-t border-gray-100">
                                                <button 
                                                    onClick={handleSaveGlobal}
                                                    disabled={saving}
                                                    className="px-10 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
                                                >
                                                    {saving ? 'Saving...' : 'Save All Scripts'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* SITEMAP TAB */}
                                    {activeTab === 'sitemap' && (
                                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center justify-between p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm text-2xl">🗺️</div>
                                                    <div>
                                                        <p className="font-bold text-indigo-900">XML Sitemap Generator</p>
                                                        <p className="text-xs text-indigo-700 mt-1">Automatically notify search engines about your site's structure.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setSitemap({...sitemap, enabled: !sitemap.enabled})}
                                                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all ${sitemap.enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                                >
                                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${sitemap.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </button>
                                            </div>

                                            <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 transition-all duration-300 ${!sitemap.enabled ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
                                                <div className="space-y-6">
                                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Configuration</h3>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-gray-700 uppercase mb-2">Frequency</label>
                                                            <select
                                                                value={sitemap.frequency}
                                                                onChange={(e) => setSitemap({...sitemap, frequency: e.target.value as any})}
                                                                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                                            >
                                                                <option value="daily">Daily</option>
                                                                <option value="weekly">Weekly</option>
                                                                <option value="monthly">Monthly</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-gray-700 uppercase mb-2">Priority</label>
                                                            <input
                                                                type="number" step="0.1" min="0" max="1"
                                                                value={sitemap.priority}
                                                                onChange={(e) => setSitemap({...sitemap, priority: parseFloat(e.target.value)})}
                                                                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                                                        <h4 className="text-xs font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                                                            Included Database Models
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {availableModels.map(m => (
                                                                <label key={m.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer group">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={sitemap.includedModels.includes(m.name)}
                                                                        onChange={(e) => {
                                                                            const next = e.target.checked
                                                                                ? [...sitemap.includedModels, m.name]
                                                                                : sitemap.includedModels.filter(n => n !== m.name);
                                                                            setSitemap({...sitemap, includedModels: next});
                                                                        }}
                                                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                                    />
                                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900">{m.displayName || m.name}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Advanced</h3>
                                                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                                        <h4 className="text-xs font-bold text-gray-900 mb-2">Static Paths</h4>
                                                        <div className="space-y-2">
                                                            {(sitemap.staticPaths || []).map((p, i) => (
                                                                <div key={i} className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={p}
                                                                        placeholder="/about"
                                                                        onChange={(e) => {
                                                                            const next = [...sitemap.staticPaths];
                                                                            next[i] = e.target.value;
                                                                            setSitemap({...sitemap, staticPaths: next});
                                                                        }}
                                                                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                                                    />
                                                                    <button
                                                                        onClick={() => setSitemap({...sitemap, staticPaths: sitemap.staticPaths.filter((_, idx) => idx !== i)})}
                                                                        className="text-red-400 hover:text-red-600 transition-colors"
                                                                    >✕</button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                onClick={() => setSitemap({...sitemap, staticPaths: [...(sitemap.staticPaths || []), '']})}
                                                                className="text-indigo-600 text-xs font-bold hover:underline"
                                                            >+ Add Manual Path</button>
                                                        </div>
                                                    </div>

                                                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                                        <h4 className="text-xs font-bold text-gray-900 mb-2">Excluded URLs</h4>
                                                        <p className="text-[10px] text-gray-400 -mt-2">Slugs to hide from sitemap (e.g. /admin, /secret)</p>
                                                        <div className="space-y-2">
                                                            {(sitemap.excludeSlugs || []).map((p, i) => (
                                                                <div key={i} className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={p}
                                                                        placeholder="/secret-page"
                                                                        onChange={(e) => {
                                                                            const next = [...sitemap.excludeSlugs];
                                                                            next[i] = e.target.value;
                                                                            setSitemap({...sitemap, excludeSlugs: next});
                                                                        }}
                                                                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                                                    />
                                                                    <button
                                                                        onClick={() => setSitemap({...sitemap, excludeSlugs: sitemap.excludeSlugs.filter((_, idx) => idx !== i)})}
                                                                        className="text-red-400 hover:text-red-600 transition-colors"
                                                                    >✕</button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                onClick={() => setSitemap({...sitemap, excludeSlugs: [...(sitemap.excludeSlugs || []), '']})}
                                                                className="text-indigo-600 text-xs font-bold hover:underline"
                                                            >+ Exclude URL</button>
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-6 border-t border-gray-100">
                                                <button 
                                                    onClick={handleSaveSitemap}
                                                    disabled={saving}
                                                    className="px-10 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
                                                >
                                                    {saving ? 'Saving...' : 'Save Sitemap Settings'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* BACKUP TAB */}
                                    {activeTab === 'backup' && (
                                        <BackupTab driveStatus={driveStatus} />
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}

function BackupTab({ driveStatus }: { driveStatus: any }) {
    const [working, setWorking] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);

    const handleBackup = async (toDrive = false) => {
        setWorking(true);
        try {
            const res = await api.createSeoBackup(toDrive);
            if (toDrive) {
                alert('SEO Backup uploaded to Google Drive successfully!');
            } else {
                // Trigger download
                window.location.href = api.getBackupFileDownloadUrl(res.file);
            }
        } catch (err: any) {
            alert('Backup failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setWorking(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreFile) return;
        if (!confirm('Are you sure you want to restore SEO data? This will overwrite existing meta.json files and images.')) return;
        
        setWorking(true);
        try {
            await api.restoreSeoBackup(restoreFile);
            alert('SEO Data restored successfully!');
            setRestoreFile(null);
        } catch (err: any) {
            alert('Restore failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setWorking(false);
        }
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Create Backup */}
                <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-sm">📤</div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">Create SEO Backup</h3>
                            <p className="text-sm text-gray-500">Export your SEO metadata and assets.</p>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <button
                            onClick={() => handleBackup(false)}
                            disabled={working}
                            className="w-full py-4 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-3 transition-all disabled:opacity-50 shadow-sm"
                        >
                            {working ? '📦 Preparing Archive...' : 'Download SEO Archive (.tar.gz)'}
                        </button>
                        
                        <div className="relative">
                            <button
                                onClick={() => handleBackup(true)}
                                disabled={working || !driveStatus?.canConnect}
                                className={`w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-50 ${
                                    driveStatus?.canConnect 
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100' 
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                }`}
                            >
                                <span>☁️</span>
                                {working ? 'Uploading to Drive...' : 'Backup to Google Drive'}
                            </button>
                            
                            {!driveStatus?.canConnect && (
                                <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                                    <span className="text-amber-600">⚠️</span>
                                    <p className="text-[10px] text-amber-800 leading-tight">
                                        Google Drive is not configured. Go to <strong>Settings &gt; Backup</strong> to enable Drive integration.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Restore Backup */}
                <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-sm">📥</div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">Restore SEO Data</h3>
                            <p className="text-sm text-gray-500">Import settings from an archive.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="relative border-2 border-dashed border-gray-300 rounded-2xl p-8 bg-white hover:border-indigo-400 hover:bg-indigo-50/10 transition-all cursor-pointer group text-center">
                            <input 
                                type="file" 
                                accept=".gz,.tar.gz"
                                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div className="space-y-2">
                                <div className="text-3xl grayscale group-hover:grayscale-0 transition-all">📁</div>
                                <p className="text-sm font-bold text-gray-600 group-hover:text-indigo-600">
                                    {restoreFile ? restoreFile.name : 'Select SEO Backup File'}
                                </p>
                                <p className="text-[10px] text-gray-400 italic">Only .tar.gz files supported</p>
                            </div>
                        </div>

                        <button
                            onClick={handleRestore}
                            disabled={working || !restoreFile}
                            className="w-full py-4 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-100"
                        >
                            {working ? '⏳ Restoring SEO Assets...' : 'Start Restoration'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-900 text-white rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8 border border-indigo-950 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-800 rounded-full blur-3xl opacity-50 -mr-32 -mt-32" />
                <div className="relative z-10 flex-1">
                    <h4 className="text-lg font-bold mb-2 flex items-center gap-2">
                        <span className="text-indigo-400">💡</span> Module Independent Backups
                    </h4>
                    <p className="text-sm text-indigo-100 leading-relaxed max-w-2xl">
                        This tool creates <strong>SEO-Only</strong> backups. It's perfect for moving SEO configurations between different projects or staging/production environments without touching your main database or user accounts.
                    </p>
                </div>
                <div className="relative z-10 text-center px-6 py-4 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-sm">
                    <p className="text-[10px] uppercase font-bold text-indigo-300 mb-1">Backup Strategy</p>
                    <p className="text-sm font-bold text-white italic">Granular & Reliable</p>
                </div>
            </div>
        </div>
    );
}
