'use client';

import { useState } from 'react';
import { Filter as FilterIcon, ChevronDown, RotateCcw } from 'lucide-react';

interface Filter {
    label: string;
    field: string;
    options: { label: string; value: string }[];
}

interface FiltersSidebarProps {
    filters: Filter[];
    activeFilters: Record<string, string>;
    onFilterChange: (field: string, value: string) => void;
    onClearAll: () => void;
}

export default function FiltersSidebar({ filters, activeFilters, onFilterChange, onClearAll }: FiltersSidebarProps) {
    const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>({});

    const toggleFilter = (field: string) => {
        setExpandedFilters(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const hasActiveFilters = Object.keys(activeFilters).length > 0;

    return (
        <div className="w-64 bg-white border border-gray-200 rounded-xl shadow-sm h-fit sticky top-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <FilterIcon className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
                </div>
                {hasActiveFilters && (
                    <button
                        onClick={onClearAll}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
                        title="Clear all"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Clear
                    </button>
                )}
            </div>

            <div className="p-3 space-y-1">
                {filters.map((filter) => (
                    <div key={filter.field}>
                        <button
                            onClick={() => toggleFilter(filter.field)}
                            className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-50 text-left transition-colors"
                        >
                            <span className="text-sm font-medium text-gray-700">{filter.label}</span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expandedFilters[filter.field] ? 'rotate-180' : ''}`} />
                        </button>

                        {expandedFilters[filter.field] && (
                            <div className="ml-3 mt-1 mb-2 space-y-1">
                                <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="radio"
                                        name={filter.field}
                                        checked={!activeFilters[filter.field]}
                                        onChange={() => onFilterChange(filter.field, '')}
                                        className="w-3.5 h-3.5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-gray-600">All</span>
                                </label>
                                {filter.options.map((option) => (
                                    <label
                                        key={option.value}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${activeFilters[filter.field] === option.value ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'}`}
                                    >
                                        <input
                                            type="radio"
                                            name={filter.field}
                                            value={option.value}
                                            checked={activeFilters[filter.field] === option.value}
                                            onChange={(e) => onFilterChange(filter.field, e.target.value)}
                                            className="w-3.5 h-3.5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                        />
                                        <span className={`text-sm ${activeFilters[filter.field] === option.value ? 'font-medium text-indigo-700' : 'text-gray-600'}`}>{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
