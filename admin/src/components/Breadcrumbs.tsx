'use client';

import Link from 'next/link';
import { Home, ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
    label: string;
    href?: string;
}

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
    return (
        <nav className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest mb-4 text-gray-500">
            <Link href="/dashboard" className="flex items-center gap-1 hover:text-indigo-600 transition-colors">
                <Home className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Dashboard</span>
            </Link>
            {items.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5">
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    {item.href ? (
                        <Link href={item.href} className="hover:text-indigo-600 transition-colors">{item.label}</Link>
                    ) : (
                        <span className="text-gray-900 font-semibold">{item.label}</span>
                    )}
                </div>
            ))}
        </nav>
    );
}
