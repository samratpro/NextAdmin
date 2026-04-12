'use client';

import { useState } from 'react';

interface FieldsetProps {
    title: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
    collapsible?: boolean;
}

export default function Fieldset({
    title,
    children,
    defaultExpanded = true,
    collapsible = true
}: FieldsetProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden mb-4">
            <div
                className={`bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-200 ${collapsible ? 'cursor-pointer hover:from-indigo-100 hover:to-purple-100' : ''
                    } transition-colors`}
                onClick={() => collapsible && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">
                        {title}
                    </h3>
                    {collapsible && (
                        <svg
                            className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''
                                }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="px-6 py-6">
                    {children}
                </div>
            )}
        </div>
    );
}
