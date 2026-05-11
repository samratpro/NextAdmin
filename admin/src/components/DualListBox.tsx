'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Search, X, Plus, ChevronsRight, ChevronsLeft } from 'lucide-react';

interface DualListBoxProps {
    title: string;
    available: any[];
    selected: any[];
    onChange: (selected: any[]) => void;
    formatLabel?: (item: any) => string;
    helpText?: string;
}

function getLabel(item: any, formatLabel?: (item: any) => string): string {
    if (formatLabel) return formatLabel(item);
    return item.name || item.label || item.username || String(item.id || item);
}

function getId(item: any): any {
    return item.id ?? item.value ?? item;
}

export default function DualListBox({ title, available = [], selected = [], onChange, formatLabel, helpText }: DualListBoxProps) {
    const [availableSearch, setAvailableSearch] = useState('');
    const [selectedSearch, setSelectedSearch] = useState('');

    const availableItems = useMemo(() => {
        return available.filter(item => !selected.includes(getId(item)));
    }, [available, selected]);

    const selectedItems = useMemo(() => {
        return selected.map(id => available.find(item => getId(item) === id)).filter(Boolean);
    }, [available, selected]);

    const filteredAvailable = useMemo(() => {
        const lower = availableSearch.toLowerCase();
        return availableItems.filter(item => getLabel(item, formatLabel).toLowerCase().includes(lower));
    }, [availableItems, availableSearch, formatLabel]);

    const filteredSelected = useMemo(() => {
        const lower = selectedSearch.toLowerCase();
        return selectedItems.filter(item => getLabel(item, formatLabel).toLowerCase().includes(lower));
    }, [selectedItems, selectedSearch, formatLabel]);

    const toggle = (item: any) => {
        const id = getId(item);
        if (selected.includes(id)) {
            onChange(selected.filter(i => i !== id));
        } else {
            onChange([...selected, id]);
        }
    };

    const addAll = () => {
        const newIds = filteredAvailable.map(getId);
        onChange([...selected, ...newIds]);
    };

    const removeAll = () => {
        const removeIds = filteredSelected.map(getId);
        onChange(selected.filter(id => !removeIds.includes(id)));
    };

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
                <label className="text-sm font-semibold text-gray-800">{title}</label>
                {helpText && <span className="text-xs text-gray-500 text-right max-w-xs">{helpText}</span>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_52px_1fr] gap-3 items-start">
                {/* Available */}
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search available..."
                                value={availableSearch}
                                onChange={e => setAvailableSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>
                        <button type="button" onClick={addAll} title="Add all"
                            className="p-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors flex-shrink-0">
                            <ChevronsRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="min-h-[240px] max-h-[300px] overflow-y-auto">
                        {filteredAvailable.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                                {available.length === 0 ? 'Loading...' : 'No items available'}
                            </div>
                        ) : (
                            filteredAvailable.map(item => (
                                <div key={getId(item)} onClick={() => toggle(item)}
                                    className="flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0 group">
                                    <span className="text-sm text-gray-700 group-hover:text-indigo-700 truncate pr-2">
                                        {getLabel(item, formatLabel)}
                                    </span>
                                    <Plus className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-500 flex-shrink-0" />
                                </div>
                            ))
                        )}
                    </div>

                    <div className="px-3 py-1.5 border-t border-gray-200 bg-gray-50 flex justify-between">
                        <span className="text-xs text-gray-500">Available</span>
                        <span className="text-xs font-medium text-gray-700">{availableItems.length}</span>
                    </div>
                </div>

                {/* Arrow controls */}
                <div className="flex lg:flex-col justify-center items-center gap-2 py-2">
                    <button type="button" onClick={() => {}}
                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => {}}
                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition-colors shadow-sm">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>

                {/* Selected */}
                <div className="border border-indigo-200 rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="px-3 py-2 border-b border-indigo-200 bg-indigo-50 flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400" />
                            <input
                                type="text"
                                placeholder="Search selected..."
                                value={selectedSearch}
                                onChange={e => setSelectedSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-indigo-200 rounded-md bg-white text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>
                        <button type="button" onClick={removeAll} title="Remove all"
                            className="p-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                            <ChevronsLeft className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="min-h-[240px] max-h-[300px] overflow-y-auto">
                        {filteredSelected.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                                No items selected
                            </div>
                        ) : (
                            filteredSelected.map(item => (
                                <div key={getId(item)} onClick={() => toggle(item)}
                                    className="flex items-center justify-between px-3 py-2.5 bg-indigo-50 hover:bg-red-50 cursor-pointer border-b border-indigo-100 last:border-0 group">
                                    <span className="text-sm text-indigo-700 group-hover:text-red-600 truncate pr-2">
                                        {getLabel(item, formatLabel)}
                                    </span>
                                    <X className="w-3.5 h-3.5 text-indigo-300 group-hover:text-red-500 flex-shrink-0" />
                                </div>
                            ))
                        )}
                    </div>

                    <div className="px-3 py-1.5 border-t border-indigo-200 bg-indigo-50 flex justify-between">
                        <span className="text-xs text-indigo-600">Selected</span>
                        <span className="text-xs font-medium text-indigo-700">{selectedItems.length}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
