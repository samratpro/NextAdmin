'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Breadcrumbs from '@/components/Breadcrumbs';
import FiltersSidebar from '@/components/FiltersSidebar';
import ActionBar from '@/components/ActionBar';
import Fieldset from '@/components/Fieldset';
import DualListBox from '@/components/DualListBox';
import CharacterCounter from '@/components/CharacterCounter';
import dynamic from 'next/dynamic';

const EditorField = dynamic(
  () => import('@/components/EditorField').then(m => ({ default: m.EditorField })),
  {
    ssr: false,
    loading: () => <div className="mt-2 border border-gray-200 rounded-xl bg-white min-h-[400px]" />,
  }
);

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
    const { user } = useAuthStore();
    const modelName = params.modelName as string;

    const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
    const [data, setData] = useState<any[]>([]);
    const [filteredData, setFilteredData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [relatedData, setRelatedData] = useState<Record<string, any[]>>({});
    const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
    const [relatedDataErrors, setRelatedDataErrors] = useState<Record<string, string>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [relatedFieldSearch, setRelatedFieldSearch] = useState<Record<string, string>>({});
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

    // SeoProject model specific - User Assignments
    const isSeoProjectModel = modelName === 'SeoProject';
    const [allSeoUsers, setAllSeoUsers] = useState<any[]>([]);
    const [selectedSeoProjectUsers, setSelectedSeoProjectUsers] = useState<number[]>([]);


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
            if (isSeoProjectModel) {
                loadAllUsers();
            }
        }
    }, [modelName]);

    // Re-fetch when page, sort, or search changes
    useEffect(() => {
        if (modelName) loadData();
    }, [currentPage, sortField, sortDirection]);

    // Debounced search — reset to page 1, then trigger loadData
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentPage(1);
            if (modelName) loadData();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Keep filteredData in sync with data (filtering is now server-side)
    useEffect(() => {
        setFilteredData(data);
    }, [searchTerm, data, metadata]);

    // When the auth store resolves the current user, make sure staff users who
    // cannot load the full User list can still pick themselves as author/owner.
    useEffect(() => {
        if (!user) return;
        setRelatedData(prev => {
            // Don't overwrite if the API call already succeeded with real data
            if (prev['User'] && prev['User'].length > 0) return prev;
            return {
                ...prev,
                User: [{ id: user.userId, email: user.email, username: user.username }],
            };
        });
        // Clear any error banner for User now that we have a fallback
        setRelatedDataErrors(prev => { const n = { ...prev }; delete n['User']; return n; });
    }, [user]);

    const loadRelatedData = async (relatedModel: string) => {
        try {
            const response = await api.get(`/api/admin/models/${relatedModel}/data?page=1&limit=100&orderBy=id&orderDirection=ASC`);
            setRelatedData(prev => ({ ...prev, [relatedModel]: response.data || [] }));
            setRelatedDataErrors(prev => { const n = { ...prev }; delete n[relatedModel]; return n; });
        } catch (error: any) {
            console.error(`Error loading ${relatedModel} data:`, error);
            const status = error?.response?.status;
            const msg = status === 403
                ? `No permission to load ${relatedModel} options`
                : `Failed to load ${relatedModel} options`;
            setRelatedDataErrors(prev => ({ ...prev, [relatedModel]: msg }));
        }
    };

    const getRelatedObjectLabel = (option: any, relatedModel?: string, fieldName?: string) => {
        if (!option) return '-';

        if (fieldName === 'userId' || relatedModel === 'User') {
            return option.email || option.username || `User #${option.id}`;
        }
        if (fieldName === 'appId' || relatedModel === 'App') {
            return option.name || option.slug || `App #${option.id}`;
        }
        const parts = [
            option.name,
            option.title,
            option.username,
            option.displayName,
            option.clientName,
            option.mainTopicName,
            option.slug,
            option.websiteUrl,
            option.email,
            option.url,
        ].filter(Boolean);

        // Deduplicate so identical values don't show as "Test cat • Test cat"
        const uniqueParts = [...new Set(parts)];

        if (uniqueParts.length > 0) {
            return uniqueParts.slice(0, 2).join(' • ');
        }

        return relatedModel ? `${relatedModel} #${option.id}` : `#${option.id}`;
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

            const relatedFields = response.metadata.adminOptions?.relatedFields || {};
            Object.values(relatedFields).forEach((relatedModel: any) => {
                loadRelatedData(relatedModel);
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
            const searchParam = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : '';
            const response = await api.get(
                `/api/admin/models/${modelName}/data?page=${currentPage}&limit=${itemsPerPage}&orderBy=${orderBy}&orderDirection=${orderDirection}${searchParam}`
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

    const loadAllUsers = async () => {
        try {
            const response = await api.get('/api/admin/users');
            setAllSeoUsers(response.users || []);
        } catch (error) {
            console.error('Error loading users for SEO project:', error);
        }
    };

    const loadSeoProjectAssignments = async (projectId: number) => {
        try {
            const response = await api.get(`/api/seo/projects/${projectId}/assignments`);
            setSelectedSeoProjectUsers((response.users || []).map((u: any) => u.id));
        } catch (error) {
            console.error('Error loading SEO project assignments:', error);
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

            // Save user assignments for SeoProject model
            if (isSeoProjectModel && response.data?.id) {
                await api.put(`/api/seo/projects/${response.data.id}/assignments`, { userIds: selectedSeoProjectUsers });
            }

            if (saveAction === 'save-add') {
                resetForm();
                setSelectedGroups([]);
                setSelectedPermissions([]);
                setGroupPermissions([]);
                setSelectedSeoProjectUsers([]);
                showNotification('success', `${metadata?.displayName} created! Add another.`);
            } else {
                setShowCreateModal(false);
                resetForm();
                setSelectedGroups([]);
                setSelectedPermissions([]);
                setGroupPermissions([]);
                setSelectedSeoProjectUsers([]);
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

            // Save user assignments for SeoProject model
            if (isSeoProjectModel && editingItem.id) {
                await api.put(`/api/seo/projects/${editingItem.id}/assignments`, { userIds: selectedSeoProjectUsers });
            }

            if (saveAction === 'save-continue') {
                showNotification('success', `${metadata?.displayName} updated successfully!`);
            } else {
                setEditingItem(null);
                resetForm();
                setSelectedGroups([]);
                setSelectedPermissions([]);
                setGroupPermissions([]);
                setSelectedSeoProjectUsers([]);
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

        // Load assigned users for SeoProject model
        if (isSeoProjectModel && item.id) {
            loadSeoProjectAssignments(item.id);
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
                    onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.value }))}
                    required={!editingItem && field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder={editingItem ? "Leave blank to keep current" : "Enter password"}
                />
            );
        }

        // relatedFields: integer fields that reference another model (renders as searchable dropdown)
        const relatedFieldModel = metadata?.adminOptions?.relatedFields?.[fieldName];
        if (relatedFieldModel) {
            const options = relatedData[relatedFieldModel] || [];
            const loadError = relatedDataErrors[relatedFieldModel];
            const userSearch = relatedFieldSearch[fieldName] || '';
            const filtered = options.filter((o: any) => {
                const label = getRelatedObjectLabel(o, relatedFieldModel, fieldName);
                return label.toLowerCase().includes(userSearch.toLowerCase()) || String(o.id).includes(userSearch);
            });
            return (
                <div>
                    <input
                        type="text"
                        placeholder={`Search ${relatedFieldModel?.toLowerCase() || ''}...`}
                        value={userSearch}
                        onChange={(e) => setRelatedFieldSearch({ ...relatedFieldSearch, [fieldName]: e.target.value })}
                        className="mt-1 block w-full border border-gray-300 rounded-t-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {loadError ? (
                        <div className="block w-full border border-t-0 border-red-300 rounded-b-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                            ⚠ {loadError} — <button type="button" className="underline" onClick={() => loadRelatedData(relatedFieldModel)}>Retry</button>
                        </div>
                    ) : (
                        <select
                            size={Math.min(Math.max(filtered.length + 1, 3), 5)}
                            value={value}
                            onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.value ? Number(e.target.value) : null }))}
                            required={field.required && !field.nullable}
                            className="block w-full border border-t-0 border-gray-300 rounded-b-lg shadow-sm py-1 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                        >
                            <option value="">— none —</option>
                            {filtered.map((o: any) => (
                                <option key={o.id} value={o.id}>
                                    {getRelatedObjectLabel(o, relatedFieldModel, fieldName)}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
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
                            {getRelatedObjectLabel(option, field.relatedModel)}
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
                        onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.checked }))}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm text-gray-700">
                        {value ? 'Yes' : 'No'}
                    </label>
                </div>
            );
        }

        if (field.type === 'TextField') {
            if (fieldName === 'content' || fieldName === 'body') {
                return (
                    <EditorField
                        value={value}
                        onChange={(newValue) => setFormData(prev => ({ ...prev, [fieldName]: newValue }))}
                    />
                );
            }
            return (
                <div>
                    <textarea
                        value={value}
                        onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.value }))}
                        required={field.required && !field.nullable}
                        maxLength={field.maxLength}
                        className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        rows={4}
                    />
                    {field.maxLength && <CharacterCounter current={value.length} max={field.maxLength} />}
                </div>
            );
        }


        if (field.type === 'DateTimeField') {
            // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:MM)
            const dtValue = value ? String(value).slice(0, 16) : '';
            return (
                <input
                    type="datetime-local"
                    value={dtValue}
                    onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                    required={field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
            );
        }

        if (field.type === 'DateField') {
            const dValue = value ? String(value).slice(0, 10) : '';
            return (
                <input
                    type="date"
                    value={dValue}
                    onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.value || null }))}
                    required={field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
            );
        }

        // Image upload — any CharField whose name contains image/photo/avatar/thumbnail/picture
        const isImageField = /image|photo|avatar|thumbnail|picture/i.test(fieldName);
        if (field.type === 'CharField' && isImageField) {
            const isUploading = uploadingFields[fieldName] || false;
            return (
                <div className="space-y-2">
                    {/* Preview */}
                    {value && (
                        <div className="relative inline-block">
                            <img
                                src={value}
                                alt="Preview"
                                className="h-28 w-auto rounded-lg border border-gray-200 object-cover shadow-sm"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        </div>
                    )}
                    {/* Upload button + URL input */}
                    <div className="flex gap-2 items-center">
                        <input
                            type="url"
                            value={value || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.value }))}
                            placeholder="https://... or upload below"
                            className="flex-1 block border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                        <label className={`cursor-pointer inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${isUploading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}>
                            {isUploading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Upload
                                </>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                disabled={isUploading}
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setUploadingFields(prev => ({ ...prev, [fieldName]: true }));
                                    try {
                                        const body = new FormData();
                                        body.append('file', file);
                                        // Next.js API route — admin/src/app/api/upload/route.ts
                                        // Saves to admin/public/uploads/, served at /uploads/<file>
                                        const res = await fetch('/api/upload', {
                                            method: 'POST',
                                            body,
                                        });
                                        let data: any = {};
                                        try { data = await res.json(); } catch { /* non-JSON response */ }
                                        if (res.ok && data.url) {
                                            setFormData(prev => ({ ...prev, [fieldName]: data.url }));
                                        } else {
                                            const msg = res.status === 404
                                                ? 'Upload endpoint not found — add POST /api/admin/upload to your API server'
                                                : data.error || `Upload failed (${res.status})`;
                                            setNotification({ type: 'error', message: msg });
                                        }
                                    } catch {
                                        setNotification({ type: 'error', message: 'Upload failed — API server unreachable.' });
                                    } finally {
                                        setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
                                        e.target.value = '';
                                    }
                                }}
                            />
                        </label>
                        {value && (
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, [fieldName]: '' })}
                                className="p-2.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                title="Remove image"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        if (field.type === 'IntegerField' || field.type === 'FloatField') {
            return (
                <input
                    type="number"
                    value={value}
                    onChange={(e) => setFormData(prev => ({ ...prev, [fieldName]: e.target.value }))}
                    required={field.required && !field.nullable}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
            );
        }

        return (
            <div>
                <input
                    type={field.type === 'EmailField' ? 'email' : field.type === 'URLField' ? 'url' : 'text'}
                    value={value}
                    onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
                    required={field.required && !field.nullable}
                    maxLength={field.maxLength}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                {field.maxLength && <CharacterCounter current={String(value).length} max={field.maxLength} />}
            </div>
        );
    };

    const renderValue = (fieldName: string, value: any, field: FieldMetadata) => {
        if (value === null || value === undefined) return <span className="text-gray-400">-</span>;

        const relatedModel = metadata?.adminOptions?.relatedFields?.[fieldName] || field.relatedModel;
        if (relatedModel) {
            const options = relatedData[relatedModel] || [];
            const relatedObj = options.find((opt: any) => String(opt.id) === String(value));
            if (relatedObj) {
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {getRelatedObjectLabel(relatedObj, relatedModel, fieldName)}
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
        <><div className="flex-1 overflow-auto">
                    {/* Notification */}
                    {notification && (
                        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg animate-slide-in ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                            } text-white`}>
                            {notification.message}
                        </div>
                    )}

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
                                                                            {renderValue(key, item[key], metadata.fields[key])}
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

                                        <div className="bg-white px-6 py-6 max-h-[75vh] overflow-y-auto">
                                            {/* Main Fieldset */}
                                            <Fieldset title="Basic Information" defaultExpanded={true} collapsible={false}>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {Object.entries(metadata.fields)
                                                        .filter(([key]) => key !== 'id' && key !== 'createdAt' && key !== 'updatedAt' && !(metadata.adminOptions.excludeFields || []).includes(key))
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

                                            {/* Assigned Users - Only for SeoProject model */}
                                            {isSeoProjectModel && (
                                                <div className="border-t border-gray-200 pt-6 mt-6">
                                                    <DualListBox
                                                        title="Assigned Users"
                                                        available={allSeoUsers}
                                                        selected={selectedSeoProjectUsers}
                                                        onChange={setSelectedSeoProjectUsers}
                                                        formatLabel={(u) => `${u.username} (${u.email})${u.isSuperuser ? ' — Admin' : u.isStaff ? ' — Staff' : ' — Client'}`}
                                                        helpText="Staff and client users who can access this SEO project."
                                                    />
                                                </div>
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
        `}</style></>
    );
}
