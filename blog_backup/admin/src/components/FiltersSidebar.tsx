'use client';

import { useState } from 'react';

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

export default function FiltersSidebar({
    filters,
    activeFilters,
    onFilterChange,
    onClearAll
}: FiltersSidebarProps) {
    const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>({});

    const toggleFilter = (field: string) => {
        setExpandedFilters(prev => ({
            ...prev,
            [field]: !prev[field]
        }));
    };

    const hasActiveFilters = Object.keys(activeFilters).length > 0;

    return (
        <div className="w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Filters
                </h3>
                {hasActiveFilters && (
                    <button
                        onClick={onClearAll}
                        className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
                    >
                        Clear All
                    </button>
                )}
            </div>

            <div className="space-y-3">
                {filters.map((filter) => (
                    <div key={filter.field} className="border-b border-gray-200 pb-3 last:border-b-0">
                        <button
                            onClick={() => toggleFilter(filter.field)}
                            className="flex items-center justify-between w-full text-left text-sm font-semibold text-gray-700 hover:text-indigo-600 transition-colors"
                        >
                            <span>{filter.label}</span>
                            <svg
                                className={`w-4 h-4 transition-transform ${expandedFilters[filter.field] ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {expandedFilters[filter.field] && (
                            <div className="mt-2 space-y-1">
                                <label className="flex items-center space-x-2 text-sm text-gray-600 hover:text-indigo-600 cursor-pointer transition-colors">
                                    <input
                                        type="radio"
                                        name={filter.field}
                                        checked={!activeFilters[filter.field]}
                                        onChange={() => onFilterChange(filter.field, '')}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>All</span>
                                </label>
                                {filter.options.map((option) => (
                                    <label
                                        key={option.value}
                                        className="flex items-center space-x-2 text-sm text-gray-600 hover:text-indigo-600 cursor-pointer transition-colors"
                                    >
                                        <input
                                            type="radio"
                                            name={filter.field}
                                            value={option.value}
                                            checked={activeFilters[filter.field] === option.value}
                                            onChange={(e) => onFilterChange(filter.field, e.target.value)}
                                            className="text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>{option.label}</span>
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
