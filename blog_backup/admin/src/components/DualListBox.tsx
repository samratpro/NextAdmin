'use client';

import { useState, useMemo } from 'react';

interface DualListBoxProps {
    title: string;
    available: any[];
    selected: number[];
    onChange: (selected: number[]) => void;
    formatLabel?: (item: any) => string;
    helpText?: string;
}

export default function DualListBox({ title, available, selected, onChange, formatLabel, helpText }: DualListBoxProps) {
    const [availableFilter, setAvailableFilter] = useState('');
    const [chosenFilter, setChosenFilter] = useState('');
    const [selectedAvailable, setSelectedAvailable] = useState<number[]>([]);
    const [selectedChosen, setSelectedChosen] = useState<number[]>([]);

    const availableItems = useMemo(() => {
        return available.filter(item => !selected.includes(item.id));
    }, [available, selected]);

    const chosenItems = useMemo(() => {
        return available.filter(item => selected.includes(item.id));
    }, [available, selected]);

    const filteredAvailable = useMemo(() => {
        if (!availableFilter) return availableItems;
        const lower = availableFilter.toLowerCase();
        return availableItems.filter(item => {
            const label = formatLabel ? formatLabel(item) : item.name;
            return label.toLowerCase().includes(lower);
        });
    }, [availableItems, availableFilter, formatLabel]);

    const filteredChosen = useMemo(() => {
        if (!chosenFilter) return chosenItems;
        const lower = chosenFilter.toLowerCase();
        return chosenItems.filter(item => {
            const label = formatLabel ? formatLabel(item) : item.name;
            return label.toLowerCase().includes(lower);
        });
    }, [chosenItems, chosenFilter, formatLabel]);

    const handleChoose = () => {
        onChange([...selected, ...selectedAvailable]);
        setSelectedAvailable([]);
    };

    const handleRemove = () => {
        onChange(selected.filter(id => !selectedChosen.includes(id)));
        setSelectedChosen([]);
    };

    const handleChooseAll = () => {
        onChange([...selected, ...filteredAvailable.map(item => item.id)]);
    };

    const handleRemoveAll = () => {
        const filteredIds = filteredChosen.map(item => item.id);
        onChange(selected.filter(id => !filteredIds.includes(id)));
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">{title}:</label>

            <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
                {/* Available Box */}
                <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">
                        Available {title.toLowerCase()}
                        <p className="text-xs text-gray-500 font-normal mt-1">
                            Choose {title.toLowerCase()} by selecting them and then select the "Choose" arrow button.
                        </p>
                    </div>

                    {/* Filter */}
                    <input
                        type="text"
                        placeholder="Filter"
                        value={availableFilter}
                        onChange={(e) => setAvailableFilter(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />

                    {/* List Box */}
                    <select
                        multiple
                        value={selectedAvailable.map(String)}
                        onChange={(e) => {
                            const values = Array.from(e.target.selectedOptions).map(opt => parseInt(opt.value));
                            setSelectedAvailable(values);
                        }}
                        className="w-full h-64 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 overflow-y-auto"
                        style={{ fontFamily: 'monospace' }}
                    >
                        {filteredAvailable.map(item => (
                            <option key={item.id} value={item.id} className="py-0.5">
                                {formatLabel ? formatLabel(item) : item.name}
                            </option>
                        ))}
                    </select>

                    {/* Choose All */}
                    <button
                        type="button"
                        onClick={handleChooseAll}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                        Choose all {title.toLowerCase()}
                    </button>
                </div>

                {/* Arrow Buttons */}
                <div className="flex flex-col justify-center gap-2">
                    <button
                        type="button"
                        onClick={handleChoose}
                        disabled={selectedAvailable.length === 0}
                        className="px-3 py-2 text-lg font-bold bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                        title="Choose selected"
                    >
                        →
                    </button>
                    <button
                        type="button"
                        onClick={handleRemove}
                        disabled={selectedChosen.length === 0}
                        className="px-3 py-2 text-lg font-bold bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                        title="Remove selected"
                    >
                        ←
                    </button>
                </div>

                {/* Chosen Box */}
                <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">
                        Chosen {title.toLowerCase()}
                        <p className="text-xs text-gray-500 font-normal mt-1">
                            Remove {title.toLowerCase()} by selecting them and then select the "Remove" arrow button.
                        </p>
                    </div>

                    {/* Filter */}
                    <input
                        type="text"
                        placeholder="Filter"
                        value={chosenFilter}
                        onChange={(e) => setChosenFilter(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />

                    {/* List Box */}
                    <select
                        multiple
                        value={selectedChosen.map(String)}
                        onChange={(e) => {
                            const values = Array.from(e.target.selectedOptions).map(opt => parseInt(opt.value));
                            setSelectedChosen(values);
                        }}
                        className="w-full h-64 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 overflow-y-auto"
                        style={{ fontFamily: 'monospace' }}
                    >
                        {filteredChosen.map(item => (
                            <option key={item.id} value={item.id} className="py-0.5">
                                {formatLabel ? formatLabel(item) : item.name}
                            </option>
                        ))}
                    </select>

                    {/* Remove All */}
                    <button
                        type="button"
                        onClick={handleRemoveAll}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                        Remove all {title.toLowerCase()}
                    </button>
                </div>
            </div>

            {helpText && (
                <p className="text-xs text-gray-600 mt-2">{helpText}</p>
            )}
        </div>
    );
}
