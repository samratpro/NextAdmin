'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { LogOut, User as UserIcon, Menu } from 'lucide-react';

export default function DashboardNavbar() {
    const pathname = usePathname();
    const { user, logout, hasPermission } = useAuthStore();
    const isSuperuser = !!user?.isSuperuser;

    const navLinks = [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Users', href: '/dashboard/models/User', superuserOnly: true },
        { name: 'Backup', href: '/dashboard/backup', superuserOnly: true },
        { name: 'SEO', href: '/dashboard/seo', permission: 'seo.manage' },
    ];

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname?.startsWith(href);
    };

    const toggleSidebar = () => {
        window.dispatchEvent(new CustomEvent('toggle-sidebar'));
    };

    return (
        <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 shadow-sm">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex items-center gap-4">
                        {/* Hamburger — mobile only */}
                        <button
                            onClick={toggleSidebar}
                            className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all"
                            aria-label="Open menu"
                        >
                            <Menu size={20} />
                        </button>

                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-lg">
                                <span className="text-white font-bold text-lg">N</span>
                            </div>
                            <span className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent hidden sm:block">
                                NextAdmin
                            </span>
                        </div>

                        <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>

                        {/* Desktop nav links */}
                        <div className="hidden md:flex md:items-center md:gap-1">
                            {navLinks.map((link) => {
                                if (link.superuserOnly && !isSuperuser) return null;
                                if (link.permission && !hasPermission(link.permission)) return null;
                                const active = isActive(link.href);
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                            active
                                                ? 'text-indigo-600'
                                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        {link.name}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* User info + logout */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 pr-2 border-r border-gray-100 hidden sm:flex">
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold text-gray-900 leading-none">
                                    {user?.username || 'admin'}
                                </span>
                                {isSuperuser && (
                                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5">
                                        Superuser
                                    </span>
                                )}
                            </div>
                            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 border border-gray-200 shadow-sm">
                                <UserIcon size={18} />
                            </div>
                        </div>
                        
                        <button
                            onClick={() => logout()}
                            className="group flex items-center gap-2 text-gray-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-all"
                        >
                            <span className="text-sm font-medium hidden md:block">Logout</span>
                            <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}

