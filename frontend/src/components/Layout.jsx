import React from 'react';
import Sidebar from './Sidebar';

const Layout = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-[#F7F9FB] text-[#34424D]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="min-h-16 border-b border-[#E4E9EE] bg-white px-4 sm:px-8 py-3 flex items-center justify-between gap-4 sticky top-0 z-10 shadow-xs">
          <p className="text-xs text-[#687680] truncate">
            <span className="font-semibold text-[#17212B]">Developer console</span>
            <span className="hidden sm:inline"> &mdash; Monitor, test, and protect your APIs</span>
          </p>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#EAF7EF] text-[#237A50] border border-[#2FA36B]/20 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2FA36B]" />
              Operational
            </span>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
