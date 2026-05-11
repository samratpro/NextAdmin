'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FieldsetProps {
    title: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
    collapsible?: boolean;
}

export default function Fieldset({ title, children, defaultExpanded = true, collapsible = true }: FieldsetProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-6 bg-white">
            <div
                className={`px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between ${collapsible ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                onClick={() => collapsible && setIsExpanded(!isExpanded)}
            >
                <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
                {collapsible && (
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                )}
            </div>
            {isExpanded && (
                <div className="px-4 py-4">
                    {children}
                </div>
            )}
        </div>
    );
}
