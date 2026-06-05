'use client';

import Sidebar from '@/components/Sidebar';
import DashboardNavbar from '@/components/DashboardNavbar';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        <DashboardNavbar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto min-w-0">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
