'use client';

import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    if (user?.isSuperuser) {
      const fetchUserCount = async () => {
        try {
          const response = await api.get('/api/admin/users');
          setTotalUsers(response.pagination?.total || 0);
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      };
      fetchUserCount();
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Navigation */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <a
                    href="/dashboard"
                    className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Dashboard
                  </a>
                  {user?.isSuperuser ? (
                    <a
                      href="/dashboard/models/User"
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Users
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center">
                <span className="text-sm text-gray-700 mr-4">
                  {user?.username}
                  {user?.isSuperuser ? (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      Superuser
                    </span>
                  ) : null}
                </span>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Page Content */}
        <div className="py-10">
          <header>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <Breadcrumbs items={[{ label: 'Dashboard' }]} />
              <h1 className="text-3xl font-bold leading-tight text-gray-900 mt-2">
                Dashboard
              </h1>
            </div>
          </header>
          <main>
            <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
              <div className="px-4 py-8 sm:px-0">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Total Users - Only for Superusers */}
                  {user?.isSuperuser ? (
                    <div className="bg-white overflow-hidden shadow rounded-lg">
                      <div className="p-5">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <svg
                              className="h-6 w-6 text-gray-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                              />
                            </svg>
                          </div>
                          <div className="ml-5 w-0 flex-1">
                            <dl>
                              <dt className="text-sm font-medium text-gray-500 truncate">
                                Total Users
                              </dt>
                              <dd className="text-lg font-medium text-gray-900">{totalUsers}</dd>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* API Documentation Card - Only for Superusers */}
                  {user?.isSuperuser ? (
                    <div className="bg-white overflow-hidden shadow rounded-lg">
                      <div className="p-5">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <svg
                              className="h-6 w-6 text-gray-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <div className="ml-5 w-0 flex-1">
                            <dl>
                              <dt className="text-sm font-medium text-gray-500 truncate">
                                API Documentation
                              </dt>
                              <dd className="mt-1">
                                <a
                                  href="http://localhost:8000/docs"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:text-indigo-500"
                                >
                                  View Swagger Docs
                                </a>
                              </dd>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* User Management Card - Only for Superusers */}
                  {user?.isSuperuser ? (
                    <div className="bg-white overflow-hidden shadow rounded-lg cursor-pointer hover:bg-gray-50"
                      onClick={() => router.push('/dashboard/models/User')}>
                      <div className="p-5">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <svg
                              className="h-6 w-6 text-gray-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                              />
                            </svg>
                          </div>
                          <div className="ml-5 w-0 flex-1">
                            <dl>
                              <dt className="text-sm font-medium text-gray-500 truncate">
                                User Management
                              </dt>
                              <dd className="text-lg font-medium text-gray-900">
                                Manage Users →
                              </dd>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Model Management Card */}
                  <div className="bg-white overflow-hidden shadow rounded-lg cursor-pointer hover:bg-gray-50"
                    onClick={() => router.push('/dashboard/models')}>
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg
                            className="h-6 w-6 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                            />
                          </svg>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">
                              Model Management
                            </dt>
                            <dd className="text-lg font-medium text-gray-900">
                              Browse Models →
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* System Status */}
                  <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="p-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="h-3 w-3 bg-green-400 rounded-full"></div>
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">
                              System Status
                            </dt>
                            <dd className="text-lg font-medium text-gray-900">
                              Online
                            </dd>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Welcome Message */}
                <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Welcome to your Django-like Admin Panel!
                    </h3>
                    <div className="mt-2 max-w-xl text-sm text-gray-500">
                      <p>
                        This is a fully-featured admin panel built with Next.js and TypeScript.
                        You can manage your application, view statistics, and perform administrative tasks.
                      </p>
                    </div>
                    {user?.isSuperuser ? (
                      <div className="mt-5">
                        <a
                          href="http://localhost:8000/docs"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          View API Documentation
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
