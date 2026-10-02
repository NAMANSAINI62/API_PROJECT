import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  KeyRound,
  FileText,
  Activity,
  LogOut,
  ShieldCheck,
  Terminal,
  Settings as SettingsIcon,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { projectService } from '../services/api';

const Sidebar = () => {
  const { user, logoutUser, selectedProjectId, setSelectedProjectId } = useAuth();
  const [projects, setProjects] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await projectService.getAll();
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load projects in sidebar:', err);
    }
  };

  const navItems = [
    { label: 'Overview', path: '/overview', icon: LayoutDashboard },
    { label: 'Projects', path: '/projects', icon: FolderKanban },
    { label: 'API Keys', path: '/api-keys', icon: KeyRound },
    { label: 'Playground', path: '/playground', icon: Terminal },
    { label: 'API Logs', path: '/logs', icon: FileText },
    { label: 'Usage', path: '/usage', icon: Activity },
    { label: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <>
    <button
      type="button"
      aria-label="Open navigation"
      onClick={() => setIsOpen(true)}
      className="md:hidden fixed left-4 top-4 z-30 p-2 rounded-lg bg-[#101B24] border border-[#24313B] text-[#E7EEF2] shadow-lg"
    >
      <Menu className="w-5 h-5" />
    </button>
    {isOpen && <button aria-label="Close navigation overlay" onClick={() => setIsOpen(false)} className="md:hidden fixed inset-0 z-20 bg-black/60" />}
    <div className={`fixed md:sticky inset-y-0 left-0 z-20 w-72 md:w-64 bg-[#101B24] border-r border-[#24313B] flex flex-col justify-between h-screen transform transition-transform duration-200 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-[#24313B] flex items-center space-x-3">
          <div className="p-2 bg-[#159A8A]/15 text-[#36B8A3] border border-[#159A8A]/30 rounded-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <button type="button" aria-label="Close navigation" onClick={() => setIsOpen(false)} className="md:hidden ml-auto p-1 text-[#81919B] hover:text-[#E7EEF2]">
            <X className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-bold text-lg text-[#E7EEF2] tracking-tight">PulseGate</h1>
            <p className="text-[10px] text-[#81919B] font-medium tracking-wider">API GATEWAY & LOGS</p>
          </div>
        </div>

        {/* Project Switcher */}
        <div className="p-4 border-b border-[#24313B]">
          <label className="block text-[11px] font-semibold text-[#81919B] uppercase tracking-wider mb-1.5">
            Active Project
          </label>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full bg-[#182530] border border-[#2A3B47] rounded-lg px-3 py-1.5 text-xs text-[#E7EEF2] focus:outline-none focus:border-[#159A8A]"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.environment})
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#159A8A]/20 text-[#E8FFFA] border border-[#159A8A]/40'
                    : 'text-[#93A4AE] hover:text-[#E7EEF2] hover:bg-[#182530]'
                }`}
                onClick={() => setIsOpen(false)}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#36B8A3]' : 'text-[#81919B]'}`} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-[#24313B] bg-[#0C151C] flex items-center justify-between">
        <div className="truncate pr-2">
          <p className="text-xs font-semibold text-[#E7EEF2] truncate">{user?.name || 'Developer'}</p>
          <p className="text-[11px] text-[#81919B] truncate">{user?.email}</p>
        </div>
        <button
          onClick={logoutUser}
          title="Sign Out"
          className="p-1.5 text-[#81919B] hover:text-[#E05B5B] hover:bg-[#182530] rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
    </>
  );
};

export default Sidebar;
