import React, { useState, useEffect } from 'react';
import { Card, Badge, LoadingState, ErrorState, Toast } from '../components/UIComponents';
import { authService, formatDateTimeIST } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Shield, Key, Calendar, CheckCircle2, Lock } from 'lucide-react';

export const Settings = () => {
  const { user: contextUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.getMe();
      setProfile(data);
    } catch (err) {
      console.error('Failed to load user profile:', err);
      if (contextUser) {
        setProfile(contextUser);
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch user settings');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading developer account settings..." />;
  if (error) return <ErrorState message={error} onRetry={loadUserProfile} />;

  const displayUser = profile || contextUser;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div>
        <h1 className="text-2xl font-bold text-[#17212B] tracking-tight">Account Settings</h1>
        <p className="text-sm text-[#687680] mt-1">
          Manage your PulseGate developer profile, API credentials, and session details.
        </p>
      </div>

      {/* Profile Overview Card */}
      <Card>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-[#F2EEFF] border border-[#8067C7]/30 rounded-2xl flex items-center justify-center text-[#6049A6] font-bold text-xl">
              {displayUser?.name ? displayUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#17212B]">{displayUser?.name}</h2>
              <p className="text-sm text-[#687680]">{displayUser?.email}</p>
              <div className="mt-2 flex items-center space-x-2">
                <Badge variant="success">Active Account</Badge>
                <Badge variant="info">Developer Plan</Badge>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Account Details Section */}
      <Card title="Developer Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#687680] flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-[#159A8A]" />
              <span>Full Name</span>
            </label>
            <div className="bg-[#F9FAFB] border border-[#E4E9EE] rounded-lg px-3.5 py-2.5 text-sm text-[#17212B]">
              {displayUser?.name}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#687680] flex items-center space-x-1.5">
              <Mail className="w-3.5 h-3.5 text-[#159A8A]" />
              <span>Email Address</span>
            </label>
            <div className="bg-[#F9FAFB] border border-[#E4E9EE] rounded-lg px-3.5 py-2.5 text-sm text-[#17212B]">
              {displayUser?.email}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#687680] flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-[#159A8A]" />
              <span>User ID</span>
            </label>
            <div className="bg-[#F9FAFB] border border-[#E4E9EE] rounded-lg px-3.5 py-2.5 text-xs font-mono text-[#34424D] truncate">
              {displayUser?.id || 'N/A'}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#687680] flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#159A8A]" />
              <span>Registration Date</span>
            </label>
            <div className="bg-[#F9FAFB] border border-[#E4E9EE] rounded-lg px-3.5 py-2.5 text-sm text-[#17212B]">
              {displayUser?.created_at ? formatDateTimeIST(displayUser.created_at) : 'N/A'}
            </div>
          </div>
      </Card>

      {/* Security & Authentication */}
      <Card title="Security & Authentication">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 bg-[#F9FAFB] border border-[#E4E9EE] rounded-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-[#EAF7EF] text-[#237A50] border border-[#2FA36B]/30 rounded-lg">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#17212B]">JWT Token Session</p>
                <p className="text-xs text-[#687680]">Authenticated via RSA/HMAC signed Bearer JWT token</p>
              </div>
            </div>
            <Badge variant="success">Active Session</Badge>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-[#F9FAFB] border border-[#E4E9EE] rounded-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-[#DDF5F0] text-[#0F8F80] border border-[#159A8A]/30 rounded-lg">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#17212B]">API Key Hashing</p>
                <p className="text-xs text-[#687680]">SHA-256 key hashing enabled. Raw keys are never stored in plain text.</p>
              </div>
            </div>
            <div className="flex items-center text-xs text-[#237A50] font-medium space-x-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Enabled</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
