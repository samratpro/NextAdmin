'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import Breadcrumbs from '@/components/Breadcrumbs';
import FiltersSidebar from '@/components/FiltersSidebar';
import ActionBar from '@/components/ActionBar';
import Fieldset from '@/components/Fieldset';
import Sidebar from '@/components/Sidebar';
import DualListBox from '@/components/DualListBox';
import { api } from '@/lib/api';

interface ModelMetadata {
    model: any;
    tableName: string;
    displayName: string;
    icon: string;
    permissions: string[];
    fields: Record<string, FieldMetadata>;
    adminOptions: {
        listDisplay?: string[];
        searchFields?: string[];
        filterFields?: string[];
        excludeFields?: string[];
        relatedFields?: Record<string, string>;
    };
}

interface FieldMetadata {
    name: string;
    type: string;
    required: boolean;
    maxLength?: number;
    unique?: boolean;
    default?: any;
    nullable?: boolean;
    relatedModel?: string;
    onDelete?: string;
}

export default function ModelDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const modelName = params.modelName as string;

    const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
    const [data, setData] = useState<any[]>([]);
    const [filteredData, setFilteredData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [relatedData, setRelatedData] = useState<Record<string, any[]>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [saveAction, setSaveAction] = useState<'save' | 'save-continue' | 'save-add'>('save');
    const [error, setError] = useState<string | null>(null);

    // Django-style features
    const [actionCheckboxes, setActionCheckboxes] = useState<Set<number>>(new Set());
    const [selectAll, setSelectAll] = useState(false);

    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [currentPage, setCurrentPage] = useState(1);
    const [serverTotalPages, setServerTotalPages] = useState(1);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const itemsPerPage = 20;

    // User model specific - Groups and Permissions
    const isUserModel = modelName === 'User';
    const [allGroups, setAllGroups] = useState<any[]>([]);
    const [allPermissions, setAllPermissions] = useState<any[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
    const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);

    // Group model specific - Permissions
    const isGroupModel = modelName === 'Group';
    const [groupPermissions, setGroupPermissions] = useState<number[]>([]);

    useEffect(() => {
        if (modelName) {
            loadMetadata();
            loadData();
            if (isUserModel) {
                loadGroupsAndPermissions();
            }
            if (isGroupModel) {
                loadGroupsAndPermissions();
            }
        }
    }, [modelName]);

    // Re-fetch when page or sort changes
    useEffect(() => {
        if (modelName) loadData();
    }, [currentPage, sortField, sortDirection]);

    // Search functionality
    useEffect(() => {
        if (!metadata || !data.length) {
            setFilteredData(data);
            return;
        }

        if (!searchTerm.trim()) {
            setFilteredData(data);
            return;
        }

        const searchFields = metadata.adminOptions.searchFields || Object.keys(metadata.fields).slice(0, 3);
        const lowerSearch = searchTerm.toLowerCase();

        const filtered = data.filter(item => {
            return searchFields.some(field => {
                const value = item[field];
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(lowerSearch);
            });
        });

        setFilteredData(filtered);
    }, [searchTerm, data, metadata]);

    const loadRelatedData = async (relatedModel: string) => {
        try {
            const response = await api.get(`/api/admin/models/${relatedModel}/data`);
            setRelatedData(prev => ({ ...prev, [relatedModel]: response.data || [] }));
        } catch (error) {
            console.error(`Error loading ${relatedModel} data:`, error);
        }
    };

    const loadMetadata = async () => {
        try {
            const response = await api.get(`/api/admin/models/${modelName}`);
            setMetadata(response.metadata);

            Object.entries(response.metadata.fields).forEach(([key, field]: [string, any]) => {
                if (field.type === 'ForeignKey' && field.relatedModel) {
                    loadRelatedData(field.relatedModel);
                }
            });

            const initialForm: Record<string, any> = {};
            Object.entries(response.metadata.fields).forEach(([key, field]: [string, any]) => {
                if (key !== 'id' && field.default !== undefined) {
                    initialForm[key] = typeof field.default === 'function' ? '' : field.default;
                }
            });
            setFormData(initialForm);
        } catch (error: any) {
            console.error('Error loading metadata:', error);
            if (error.response?.status === 403) {
                setError('You do not have permission to view this model.');
                setLoading(false);
            } else if (error.response?.status === 404) {
                setError('Model not found.');
                setLoading(false);
            }
        }
    };

    const loadData = async () => {
        if (error) return; // Don't load if error
        try {
            const orderBy = sortField || 'id';
            const orderDirection = sortDirection.toUpperCase();
            const response = await api.get(
                `/api/admin/models/${modelName}/data?page=${currentPage}&limit=${itemsPerPage}&orderBy=${orderBy}&orderDirection=${orderDirection}`
            );
            setData(response.data || []);
            setFilteredData(response.data || []);
            if (response.pagination) {
                setServerTotalPages(response.pagination.totalPages || 1);
            }
        } catch (error: any) {
            console.error('Error loading data:', error);
            if (error.response?.status === 403) {
                setError('You do not have permission to view data for this model.');
                setLoading(false);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadGroupsAndPermissions = async () => {
        try {
            const [groupsResponse, permsResponse] = await Promise.all([
                api.get('/api/admin/groups'),
                api.get('/api/admin/permissions'),
            ]);
            setAllGroups(groupsResponse.groups || []);
            setAllPermissions(permsResponse.permissions || []);
        } catch (error) {
            console.error('Error loading groups/permissions:', error);
        }
    };

    const loadUserGroupsAndPermissions = async (userId: number) => {
        try {
            const [groupsResponse, permsResponse] = await Promise.all([
                api.get(`/api/admin/users/${userId}/groups`),
                api.get(`/api/admin/users/${userId}/permissions`),
            ]);
            setSelectedGroups(groupsResponse.groupIds || []);
            setSelectedPermissions(permsResponse.permissionIds || []);
        } catch (error) {
            console.error('Error loading user groups/permissions:', error);
        }
    };

    const loadGroupPermissions = async (groupId: number) => {
        try {
            const response = await api.get(`/api/admin/groups/${groupId}/permissions`);
            setGroupPermissions(response.permissionIds || []);
        } catch (error) {
            console.error('Error loading group permissions:', error);
        }
    };


    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await api.post(`/api/admin/models/${modelName}/data`, formData);

            // Save groups and permissions for User model
            if (isUserModel && response.data?.id) {
                const userId = response.data.id;
                await Promise.all([
                    api.put(`/api/admin/users/${userId}/groups`, { groupIds: selectedGroups }),
                    api.put(`/api/admin/users/${userId}/permissions`, { permissionIds: selectedPermissions }),
                ]);
            }

            // Save permissions for Group model
            if (isGroupModel && response.data?.id) {
                const groupId = response.data.id;
                await api.put(`/api/admin/groups/${groupId}/permissions`, { permissionIds: groupPermissions });
            }


            if (saveAction === 'save-add') {
                resetForm();
                setSelectedGroups([]);
                setSelectedPermissions([]);
                setGroupPermissions([]);
                showNotification('success', `${metadata?.displayName} created! Add another.`);
            } else {
                setShowCreateModal(false);
                resetForm();
                setSelectedGroups([]);
                setSelectedPermissions([]);
                setGroupPermissions([]);
                showNotification('success', `${metadata?.displayName} created successfully!`);
            }

            loadData();
        } catch (error: any) {
            showNotification('error', error.response?.data?.error || error.message);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingItem) return;

        try {
            await api.put(`/api/admin/models/${modelName}/data/${editingItem.id}`, formData);

            // Save groups and permissions for User model
            if (isUserModel && editingItem.id) {
                await Promise.all([
                    api.put(`/api/admin/users/${editingItem.id}/groups`, { groupIds: selectedGroups }),
                    api.put(`/api/admin/users/${editingItem.id}/permissions`, { permissionIds: selectedPermissions }),
                ]);
            }

            // Save permissions for Group model
            if (isGroupModel && editingItem.id) {
                await api.put(`/api/admin/groups/${editingItem.id}/permissions`, { permissionIds: groupPermissions });
            }

            if (saveAction === 'save-continue') {
                // Stay on edit form
                showNotification('success', `${metadata?.displayName} updated successfully!`);
            } else {
                setEditingItem(null);
                resetForm();
                setSelectedGroups([]);
                setSelectedPermissions([]);
                setGroupPermissions([]);
                showNotification('success', `${metadata?.displayName} updated successfully!`);
            }

            loadData();
        } catch (error: any) {
            showNotification('error', error.response?.data?.error || error.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            await api.delete(`/api/admin/models/${modelName}/data/${id}`);
            loadData();
            showNotification('success', `${metadata?.displayName} deleted successfully!`);
        } catch (error: any) {
            showNotification('error', error.response?.data?.error || error.message);
        }
    };

    const editItem = (item: any) => {
        setEditingItem(item);
        const newFormData: Record<string, any> = {};
        Object.keys(metadata?.fields || {}).forEach(key => {
            if (key !== 'id') {
                newFormData[key] = item[key] ?? '';
            }
        });
        setFormData(newFormData);

        // Load groups and permissions for User model
        if (isUserModel && item.id) {
            loadUserGroupsAndPermissions(item.id);
        }

        // Load permissions for Group model
        if (isGroupModel && item.id) {
            loadGroupPermissions(item.id);
        }
    };

    const resetForm = () => {
        const initialForm: Record<string, any> = {};
        Object.entries(metadata?.fields || {}).forEach(([key, field]: [string, any]) => {
            if (key !== 'id' && field.default !== undefined) {
                initialForm[key] = typeof field.default === 'function' ? '' : field.default;
            }
        });

        // Auto-fill dateJoined with current date for User model
        if (isUserModel && metadata?.fields.dateJoined) {
            initialForm.dateJoined = new Date().toISOString().slice(0, 16);
        }

        setFormData(initialForm);
    };

    // New Django-style handlers
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(new Set(paginatedData.map(item => item.id)));
        } else {
            setSelectedRows(new Set());
        }
    };

    const handleSelectRow = (id: number, checked: boolean) => {
        const newSelected = new Set(selectedRows);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedRows(newSelected);
    };

    const handleBulkAction = async (action: string) => {
        if (selectedRows.size === 0) return;

        if (action === 'delete') {
            if (!confirm(`Are you sure you want to delete ${selectedRows.size} items?`)) return;

            try {
                const deletePromises = Array.from(selectedRows).map(id =>
                    api.delete(`/api/admin/models/${modelName}/data/${id}`)
                );
                await Promise.all(deletePromises);
                setSelectedRows(new Set());
                loadData();
                showNotification('success', `${selectedRows.size} items deleted successfully!`);
            } catch (error: any) {
                showNotification('error', error.response?.data?.error || error.message);
            }
        }
    };

    const handleFilterChange = (field: string, value: string) => {
        setActiveFilters(prev => {
            const newFilters = { ...prev };
            if (value === '') {
                delete newFilters[field];
            } else {
                newFilters[field] = value;
            }
            return newFilters;
        });
        setCurrentPage(1);
    };

    const handleClearFilters = () => {
        setActiveFilters({});
        setCurrentPage(1);
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Apply filters, sorting, and pagination
    const getProcessedData = () => {
        let processed = [...filteredData];

        // Apply additional filters
        Object.entries(activeFilters).forEach(([field, value]) => {
            const fieldMeta = metadata?.fields[field];
            processed = processed.filter(item => {
                if (fieldMeta && fieldMeta.type === 'BooleanField') {
                    // Handle boolean stored as 1/0 or true/false
                    const itemBool = item[field] === 1 || item[field] === '1' || item[field] === true || item[field] === 'true';
                    const filterBool = value === 'true' || value === '1';
                    return itemBool === filterBool;
                }
                return String(item[field]) === value;
            });
        });

        // Apply sorting
        if (sortField) {
            processed.sort((a, b) => {
                const aVal = a[sortField];
                const bVal = b[sortField];
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                if (typeof aVal === 'string') {
                    const comparison = aVal.localeCompare(bVal);
                    return sortDirection === 'asc' ? comparison : -comparison;
                }

                const comparison = aVal > bVal ? 1 : -1;
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return processed;
    };

    const processedData = getProcessedData();
    // Pagination is handled server-side; serverTotalPages comes from the API response.
    // Client-side processedData may be a subset (one page), so use server total.
    const totalPages = serverTotalPages;
    const paginatedData = processedData; // already the correct page from the server

    // Generate filter options from data
    const getFilterOptions = () => {
        if (!metadata) return [];

        const filterableFields = metadata.adminOptions.filterFields || [];
        return filterableFields.map(fieldName => {
            const field = metadata.fields[fieldName];
            const uniqueValues = [...new Set(data.map(item => item[fieldName]))].filter(v => v !== null && v !== undefined);

            if (field.type === 'BooleanField') {
                return {
                    label: fieldName.replace(/([A-Z])/g, ' $1').trim(),
                    field: fieldName,
                    options: [
                        { label: 'Yes', value: 'true' },
                        { label: 'No', value: 'false' }
                    ]
                };
            }

            return {
                label: fieldName.replace(/([A-Z])/g, ' $1').trim(),
                field: fieldName,
                options: uniqueValues.slice(0, 10).map(v => ({
                    label: String(v),
                    value: String(v)
                }))
            };
        });
    };


    const renderFieldInput = (fieldName: string, field: FieldMetadata) => {
        const value = formData[fieldName] ?? '';

        // Password fields - render as password input (or skip in edit mode)
        if (fieldName.toLowerCase().includes('password')) {
            return (
                <input
                    type="password"
                    value={value}
                    onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
                    required={!editingItem && field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder={editingItem ? "Leave blank to keep current" : "Enter password"}
                />
            );
        }

        if (field.type === 'ForeignKey' && field.relatedModel) {
            const options = relatedData[field.relatedModel] || [];
            return (
                <select
                    value={value}
                    onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value ? Number(e.target.value) : null })}
                    required={field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                >
                    <option value="">---------</option>
                    {options.map((option: any) => (
                        <option key={option.id} value={option.id}>
                            {option.name || option.title || option.username || `${field.relatedModel} #${option.id}`}
                        </option>
                    ))}
                </select>
            );
        }

        if (field.type === 'BooleanField') {
            return (
                <div className="flex items-center mt-2">
                    <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.checked })}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm text-gray-700">
                        {field.required && !field.nullable ? 'Required' : 'Optional'}
                    </label>
                </div>
            );
        }

        if (field.type === 'TextField') {
            return (
                <textarea
                    value={value}
                    onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
                    required={field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    rows={4}
                />
            );
        }

        if (field.type === 'IntegerField' || field.type === 'FloatField') {
            return (
                <input
                    type="number"
                    value={value}
                    onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
                    required={field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
            );
        }

        return (
            <input
                type={field.type === 'EmailField' ? 'email' : 'text'}
                value={value}
                onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
                required={field.required && !field.nullable}
                maxLength={field.maxLength}
                className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
        );
    };

    const renderValue = (value: any, field: FieldMetadata) => {
        if (value === null || value === undefined) return <span className="text-gray-400">-</span>;

        if (field.type === 'ForeignKey' && field.relatedModel) {
            const options = relatedData[field.relatedModel] || [];
            const relatedObj = options.find((opt: any) => opt.id === value);
            if (relatedObj) {
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {relatedObj.name || relatedObj.title || relatedObj.username || `#${value}`}
                    </span>
                );
            }
            return value ? `#${value}` : '-';
        }

        if (field.type === 'BooleanField') {
            return value ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Yes
                </span>
            ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    ✗ No
                </span>
            );
        }
        if (field.type === 'DateTimeField' || field.type === 'DateField') {
            return <span className="text-sm text-gray-600">{new Date(value).toLocaleString()}</span>;
        }
        return String(value);
    };

    // Conditional Rendering for Error
    if (error) {
        return (
            <ProtectedRoute>
                <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <div className="flex-1 overflow-auto p-10">
                        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md shadow-sm">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <p className="text-lg font-medium text-red-800">Permission Denied</p>
                                    <p className="text-sm text-red-700 mt-1">
                                        {error || "You do not have permission to view this content."}
                                    </p>
                                    <div className="mt-4">
                                        <button
                                            onClick={() => router.push('/dashboard')}
                                            className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                                        >
                                            &larr; Back to Dashboard
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ProtectedRoute>
        );
    }

    if (!metadata) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <ProtectedRoute>
            <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                {/* Left Sidebar - Django Style */}
                <Sidebar />

                {/* Main Content Area */}
                <div className="flex-1 overflow-auto">
                    {/* Notification */}
                    {notification && (
                        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg animate-slide-in ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                            } text-white`}>
                            {notification.message}
                        </div>
                    )}

                    {/* Navigation */}
                    <nav className="bg-white shadow-md border-b border-gray-200">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="flex justify-between h-16">
                                <div className="flex items-center space-x-8">
                                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                        Admin Panel
                                    </h1>
                                    <div className="hidden sm:flex sm:space-x-4">
                                        <a href="/dashboard" className="text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                                            Dashboard
                                        </a>

                                        <a href="/dashboard/models" className="text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                                            Models
                                        </a>
                                        <span className="text-indigo-600 px-3 py-2 rounded-md text-sm font-medium bg-indigo-50">
                                            {metadata.displayName}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <span className="text-sm font-medium text-gray-700">{user?.username}</span>
                                    <button
                                        onClick={async () => { await logout(); router.push('/login'); }}
                                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg font-medium"
                                    >
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </div>
                    </nav>

                    {/* Page Header */}
                    <div className="bg-white shadow-sm border-b border-gray-200">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            {/* Breadcrumbs */}
                            <Breadcrumbs
                                items={[
                                    { label: 'Models', href: '/dashboard/models' },
                                    { label: metadata.displayName }
                                ]}
                            />

                            <div className="flex justify-between items-center mt-2">
                                <div>
                                    <h1 className="text-2xl font-semibold text-gray-900">{metadata.displayName}</h1>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {processedData.length} {processedData.length === 1 ? 'item' : 'items'}
                                        {searchTerm && ` (search: "${searchTerm}")`}
                                        {Object.keys(activeFilters).length > 0 && ` • ${Object.keys(activeFilters).length} filter(s) active`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => { resetForm(); setShowCreateModal(true); }}
                                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl font-medium"
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add {metadata.displayName}
                                </button>
                            </div>

                            {/* Search Bar */}
                            <div className="mt-4">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder={`Search ${metadata.displayName.toLowerCase()}...`}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                    <svg className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>



                    {/* Content */}
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        <div className="flex gap-6">
                            {/* Main Content */}
                            <div className="flex-1">
                                {/* Action Bar */}
                                {!loading && processedData.length > 0 && (
                                    <ActionBar
                                        selectedCount={selectedRows.size}
                                        totalCount={paginatedData.length}
                                        onSelectAll={handleSelectAll}
                                        onAction={handleBulkAction}
                                        actions={[
                                            { label: 'Delete selected', value: 'delete', dangerous: true }
                                        ]}
                                    />
                                )}

                                <div className="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
                                    {loading ? (
                                        <div className="p-12 text-center">
                                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                                            <p className="mt-4 text-gray-500">Loading...</p>
                                        </div>
                                    ) : processedData.length === 0 ? (
                                        <div className="p-12 text-center">
                                            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                            </svg>
                                            <h3 className="mt-4 text-lg font-medium text-gray-900">
                                                {searchTerm || Object.keys(activeFilters).length > 0 ? 'No results found' : `No ${metadata.displayName.toLowerCase()} yet`}
                                            </h3>
                                            <p className="mt-2 text-sm text-gray-500">
                                                {searchTerm || Object.keys(activeFilters).length > 0 ? 'Try adjusting your search or filters' : `Get started by creating a new ${metadata.displayName.toLowerCase()}`}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                                                        <tr>
                                                            {/* Checkbox Column */}
                                                            <th className="px-6 py-4 text-left">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
                                                                    onChange={(e) => handleSelectAll(e.target.checked)}
                                                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                                />
                                                            </th>

                                                            {(metadata.adminOptions.listDisplay?.length
                                                                ? metadata.adminOptions.listDisplay.filter(k => metadata.fields[k])
                                                                : Object.keys(metadata.fields).filter(k => !k.toLowerCase().includes('password')).slice(0, 6)
                                                            ).map((key) => (
                                                                    <th
                                                                        key={key}
                                                                        className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gradient-to-r hover:from-indigo-100 hover:to-purple-100 transition-colors"
                                                                        onClick={() => handleSort(key)}
                                                                    >
                                                                        <div className="flex items-center space-x-1">
                                                                            <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                                                            {sortField === key && (
                                                                                <svg className={`w-4 h-4 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                                                </svg>
                                                                            )}
                                                                        </div>
                                                                    </th>
                                                                ))}
                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                                                Actions
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {paginatedData.map((item, idx) => (
                                                            <tr key={item.id} className={`hover:bg-indigo-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                                                {/* Checkbox Column */}
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedRows.has(item.id)}
                                                                        onChange={(e) => handleSelectRow(item.id, e.target.checked)}
                                                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                                    />
                                                                </td>

                                                                {(metadata.adminOptions.listDisplay?.length
                                                                    ? metadata.adminOptions.listDisplay.filter(k => metadata.fields[k])
                                                                    : Object.keys(metadata.fields).filter(k => !k.toLowerCase().includes('password')).slice(0, 6)
                                                                ).map((key) => (
                                                                        <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                            {renderValue(item[key], metadata.fields[key])}
                                                                        </td>
                                                                    ))}
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                                                                    <button
                                                                        onClick={() => editItem(item)}
                                                                        className="text-indigo-600 hover:text-indigo-900 font-medium transition-colors"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(item.id)}
                                                                        className="text-red-600 hover:text-red-900 font-medium transition-colors"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Pagination */}
                                            {totalPages > 1 && (
                                                <div className="bg-white px-4 py-4 flex items-center justify-between border-t border-gray-200">
                                                    <div className="flex-1 flex justify-between sm:hidden">
                                                        <button
                                                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                                            disabled={currentPage === 1}
                                                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Previous
                                                        </button>
                                                        <button
                                                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                                            disabled={currentPage === totalPages}
                                                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                                        <div>
                                                            <p className="text-sm text-gray-700">
                                                                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                                                                <span className="font-medium">{Math.min(currentPage * itemsPerPage, processedData.length)}</span> of{' '}
                                                                <span className="font-medium">{processedData.length}</span> results
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                                                <button
                                                                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                                                    disabled={currentPage === 1}
                                                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    <span className="sr-only">Previous</span>
                                                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                                    </svg>
                                                                </button>

                                                                {[...Array(totalPages)].map((_, i) => {
                                                                    const pageNum = i + 1;
                                                                    if (
                                                                        pageNum === 1 ||
                                                                        pageNum === totalPages ||
                                                                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                                                                    ) {
                                                                        return (
                                                                            <button
                                                                                key={pageNum}
                                                                                onClick={() => setCurrentPage(pageNum)}
                                                                                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === pageNum
                                                                                    ? 'z-10 bg-gradient-to-r from-indigo-600 to-purple-600 border-indigo-600 text-white'
                                                                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                                                                    }`}
                                                                            >
                                                                                {pageNum}
                                                                            </button>
                                                                        );
                                                                    } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                                                                        return <span key={pageNum} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">...</span>;
                                                                    }
                                                                    return null;
                                                                })}

                                                                <button
                                                                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                                                    disabled={currentPage === totalPages}
                                                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    <span className="sr-only">Next</span>
                                                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                    </svg>
                                                                </button>
                                                            </nav>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Filters Sidebar */}
                            {!loading && getFilterOptions().length > 0 && (
                                <div className="w-64 flex-shrink-0">
                                    <FiltersSidebar
                                        filters={getFilterOptions()}
                                        activeFilters={activeFilters}
                                        onFilterChange={handleFilterChange}
                                        onClearAll={handleClearFilters}
                                    />
                                </div>
                            )}
                        </div>
                    </main>

                    {/* Create/Edit Modal */}
                    {(showCreateModal || editingItem) && (
                        <div className="fixed z-50 inset-0 overflow-y-auto">
                            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity backdrop-blur-sm" onClick={() => { setShowCreateModal(false); setEditingItem(null); }}></div>

                                <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
                                    <form onSubmit={editingItem ? handleUpdate : handleCreate}>
                                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                                            <h3 className="text-xl font-bold text-white">
                                                {editingItem ? `Edit ${metadata.displayName}` : `Create ${metadata.displayName}`}
                                            </h3>
                                        </div>

                                        <div className="bg-white px-6 py-6 max-h-[32rem] overflow-y-auto">
                                            {/* Main Fieldset */}
                                            <Fieldset title="Basic Information" defaultExpanded={true} collapsible={false}>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {Object.entries(metadata.fields)
                                                        .filter(([key]) => key !== 'id' && key !== 'createdAt' && key !== 'updatedAt')
                                                        .map(([fieldName, field]: [string, any]) => (
                                                            <div key={fieldName} className={field.type === 'TextField' ? 'md:col-span-2' : ''}>
                                                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                                                    {fieldName.replace(/([A-Z])/g, ' $1').trim()}
                                                                    {field.required && !field.nullable && <span className="text-red-500 ml-1">*</span>}
                                                                </label>
                                                                {renderFieldInput(fieldName, field)}
                                                                {field.nullable && !field.required && (
                                                                    <p className="mt-1 text-xs text-gray-500">Optional</p>
                                                                )}
                                                            </div>
                                                        ))}
                                                </div>
                                            </Fieldset>


                                            {/* Groups and Permissions - Only for User model */}
                                            {isUserModel && (
                                                <>
                                                    {/* Groups Section - Django Style Dual ListBox */}
                                                    <div className="border-t border-gray-200 pt-6 mt-6">
                                                        <DualListBox
                                                            title="Groups"
                                                            available={allGroups}
                                                            selected={selectedGroups}
                                                            onChange={setSelectedGroups}
                                                            helpText="The groups this user belongs to. A user will get all permissions granted to each of their groups."
                                                        />
                                                    </div>

                                                    {/* Permissions Section - Django Style Dual ListBox */}
                                                    <div className="border-t border-gray-200 pt-6 mt-6">
                                                        <DualListBox
                                                            title="User permissions"
                                                            available={allPermissions}
                                                            selected={selectedPermissions}
                                                            onChange={setSelectedPermissions}
                                                            formatLabel={(perm) => {
                                                                // Format: "App | Model | Can add/change/delete/view model"
                                                                const app = perm.modelName || 'General';
                                                                return `${app} | ${perm.name}`;
                                                            }}
                                                            helpText="Specific permissions for this user."
                                                        />
                                                    </div>
                                                </>
                                            )}

                                            {/* Permissions - Only for Group model */}
                                            {isGroupModel && (
                                                <>
                                                    {/* Permissions Section - Django Style Dual ListBox */}
                                                    <div className="border-t border-gray-200 pt-6 mt-6">
                                                        <DualListBox
                                                            title="Permissions"
                                                            available={allPermissions}
                                                            selected={groupPermissions}
                                                            onChange={setGroupPermissions}
                                                            formatLabel={(perm) => {
                                                                // Format: "App | Model | Can add/change/delete/view model"
                                                                const app = perm.modelName || 'General';
                                                                return `${app} | ${perm.name}`;
                                                            }}
                                                            helpText="Permissions granted to users in this group."
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="bg-gray-50 px-6 py-4 flex flex-wrap justify-between items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => { setShowCreateModal(false); setEditingItem(null); resetForm(); }}
                                                className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 font-medium transition-all shadow-sm"
                                            >
                                                Cancel
                                            </button>

                                            <div className="flex space-x-3">
                                                <button
                                                    type="submit"
                                                    onClick={() => setSaveAction('save')}
                                                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl font-medium"
                                                >
                                                    {editingItem ? 'Save' : 'Create'}
                                                </button>

                                                {editingItem ? (
                                                    <button
                                                        type="submit"
                                                        onClick={() => setSaveAction('save-continue')}
                                                        className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl font-medium"
                                                    >
                                                        Save and continue editing
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="submit"
                                                        onClick={() => setSaveAction('save-add')}
                                                        className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl font-medium"
                                                    >
                                                        Save and add another
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* End Main Content Area */}
            </div>
            {/* End Flex Container */}

            <style jsx global>{`
                @keyframes slide-in {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                .animate-slide-in {
                    animation: slide-in 0.3s ease-out;
                }
            `}</style>
        </ProtectedRoute>
    );
}
