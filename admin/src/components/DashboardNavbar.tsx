'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function DashboardNavbar() {
    const pathname = usePathname();
    const { user, logout, hasPermission } = useAuthStore();
    const isSuperuser = !!user?.isSuperuser;
    const canManageSeo = hasPermission('seo.manage');

    const navLinks = [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Users', href: '/dashboard/models/User', superuserOnly: true },
        { name: 'Backup', href: '/dashboard/backup', superuserOnly: true },
        { name: 'SEO Management', href: '/dashboard/seo', permission: 'seo.manage' },
    ];

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname?.startsWith(href);
    };

    return (
        <nav className="bg-white shadow-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center">
                            <h1 className="text-xl font-bold text-gray-900 mr-8">Admin Panel</h1>
                        </div>
                        <div className="hidden sm:flex sm:space-x-8">
                            {navLinks.map((link) => {
                                if (link.superuserOnly && !isSuperuser) return null;
                                if (link.permission && !hasPermission(link.permission)) return null;
                                
                                return (
                                    <a
                                        key={link.href}
                                        href={link.href}
                                        className={`${
                                            isActive(link.href)
                                                ? 'border-indigo-500 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                        } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
                                    >
                                        {link.name}
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-700 font-medium">{user?.username || 'admin'}</span>
                            {isSuperuser && (
                                <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-bold">
                                    Superuser
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => logout()}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
