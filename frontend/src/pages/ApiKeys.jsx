import React, { useState, useEffect } from 'react';
import { Plus, Copy, Check, Trash2, Search } from 'lucide-react';
import { apiKeyService, projectService, formatDateIST, formatDateTimeIST } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Badge, Modal, Input, EmptyState, LoadingState, ErrorState, ConfirmModal, Toast } from '../components/UIComponents';

export const ApiKeys = () => {
  const { selectedProjectId } = useAuth();
  const [keys, setKeys] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');

  // Creation & Confirmation States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState({
    project_id: selectedProjectId || '', name: '', environment: 'production',
    expiration_days: '7', rate_limit_per_minute: '5'
  });
  const [createdRawKey, setCreatedRawKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState(null);
  const [deletingKeyId, setDeletingKeyId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {
        project_id: selectedProjectId,
      };
      if (searchFilter) filters.search = searchFilter;
      if (statusFilter) filters.status = statusFilter;
      if (envFilter) filters.environment = envFilter;

      const [keysData, projectsData] = await Promise.all([
        apiKeyService.getAll(filters),
        projectService.getAll(),
      ]);
      setKeys(keysData);
      setProjects(projectsData);
      if (projectsData.length > 0 && !newKey.project_id) {
        setNewKey((prev) => ({ ...prev, project_id: projectsData[0].id }));
      }
    } catch {
      setError('Failed to load API keys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedProjectId, searchFilter, statusFilter, envFilter]);

  const getErrorMessage = (err, fallback) => {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(', ');
    if (!err.response) return 'Cannot reach the server (network/CORS error).';
    return fallback;
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();

    const validProject = projects.find((p) => String(p.id) === String(newKey.project_id));
    if (!validProject) {
      showToast('Please select a valid project.', 'error');
      return;
    }

    const rateLimit = parseInt(newKey.rate_limit_per_minute, 10);
    if (!rateLimit || rateLimit < 1 || rateLimit > 1000) {
      showToast('Rate limit must be between 1 and 1000 requests/minute.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        project_id: validProject.id,
        name: newKey.name.trim(),
        environment: newKey.environment,
        expiration_days: newKey.expiration_days ? Number(newKey.expiration_days) : null,
        rate_limit_per_minute: rateLimit,
      };
      const res = await apiKeyService.create(payload);
      const rawKey = res?.raw_key ?? res?.data?.raw_key;
      if (!rawKey) throw new Error('No raw_key in response');
      setCreatedRawKey(rawKey);
      fetchData();
      showToast('API Key generated');
    } catch (err) {
      console.error('Create key failed:', err.response?.status, err.response?.data, err);
      showToast(getErrorMessage(err, 'Failed to generate API key.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokingKeyId) return;
    setSubmitting(true);
    try {
      await apiKeyService.revoke(revokingKeyId);
      setRevokingKeyId(null);
      fetchData();
      showToast('API Key revoked successfully.');
    } catch {
      showToast('Failed to revoke API key.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingKeyId) return;
    setSubmitting(true);
    try {
      await apiKeyService.delete(deletingKeyId);
      setDeletingKeyId(null);
      fetchData();
      showToast('API Key permanently deleted from database.');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to delete API key.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = (text) => {
    try {
      if (text) {
        navigator.clipboard.writeText(text);
        setCopied(true);
        showToast('API key copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  if (loading) return <LoadingState message="Loading API Keys..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#17212B]">API Keys</h1>
          <p className="text-xs text-[#687680]">Secure API credentials for authentication at PulseGate Gateway</p>
        </div>
        <Button
          onClick={() => {
            setCreatedRawKey('');
            const defaultProject = projects.find((p) => String(p.id) === String(selectedProjectId)) || projects[0];
            setNewKey({
              project_id: defaultProject ? defaultProject.id : '',
              name: '',
              environment: 'production',
              expiration_days: '7',
              rate_limit_per_minute: '5',
            });
            setIsCreateOpen(true);
          }}
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Create API Key
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white">
        <div className="flex items-center space-x-2 flex-1 max-w-xs">
          <Search className="w-4 h-4 text-[#8A969F]" />
          <input
            type="text"
            placeholder="Search keys by name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-white border border-[#DCE3E8] text-[#17212B] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#159A8A]"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-[#DCE3E8] text-[#34424D] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>

          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="bg-white border border-[#DCE3E8] text-[#34424D] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="">All Environments</option>
            <option value="production">Production</option>
            <option value="development">Development</option>
          </select>
        </div>
      </Card>

      {keys.length === 0 ? (
        <EmptyState
          title="No API keys found"
          description="Create an API key to start authenticating requests against PulseGate."
          actionText="Create API Key"
          onAction={() => { setCreatedRawKey(''); setIsCreateOpen(true); }}
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] border-b border-[#E4E9EE] text-[#687680] font-medium">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Key Prefix</th>
                <th className="py-3 px-4">Environment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Rate Limit</th>
                <th className="py-3 px-4">Expires</th>
                <th className="py-3 px-4">Last Used</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E9EE]">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-[#F4F7F9]">
                  <td className="py-3.5 px-4 font-semibold text-[#17212B]">{k.name}</td>
                  <td className="py-3.5 px-4 font-mono text-[#0F8F80]">{k.key_prefix}••••••••</td>
                  <td className="py-3.5 px-4">
                    <Badge variant={k.environment === 'production' ? 'success' : 'info'}>{k.environment}</Badge>
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant={k.status === 'active' ? 'success' : k.status === 'revoked' ? 'danger' : 'warning'}>
                      {k.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-[#34424D] font-medium">
                    {k.rate_limit_per_minute}/min
                  </td>
                  <td className="py-3.5 px-4 text-[#687680]">
                    {formatDateIST(k.expires_at)}
                  </td>
                  <td className="py-3.5 px-4 text-[#8A969F]">
                    {formatDateTimeIST(k.last_used_at)}
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-1.5">
                    {k.status === 'active' && (
                      <Button variant="danger" size="sm" onClick={() => setRevokingKeyId(k.id)}>
                        Revoke
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setDeletingKeyId(k.id)} title="Delete API Key">
                      <Trash2 className="w-3.5 h-3.5 text-[#8A969F] hover:text-[#E05B5B]" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Creation Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title={createdRawKey ? 'API Key Created' : 'Create API Key'}>
        {!createdRawKey ? (
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#687680]">Associated Project</label>
              <select
                value={newKey.project_id}
                onChange={(e) => setNewKey({ ...newKey, project_id: e.target.value })}
                className="w-full px-3.5 py-2 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-sm focus:outline-none focus:border-[#159A8A]"
                required
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <Input
              label="Key Name"
              placeholder="e.g. Production Server Key"
              value={newKey.name}
              onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#687680]">Environment</label>
              <select
                value={newKey.environment}
                onChange={(e) => setNewKey({ ...newKey, environment: e.target.value })}
                className="w-full px-3.5 py-2 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-sm focus:outline-none focus:border-[#159A8A]"
              >
                <option value="production">Production</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#687680]">Key Expiration</label>
              <select
                value={newKey.expiration_days || ''}
                onChange={(e) => setNewKey({ ...newKey, expiration_days: e.target.value })}
                className="w-full px-3.5 py-2 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-sm focus:outline-none focus:border-[#159A8A]"
              >
                <option value="">Never Expires</option>
                <option value="7">Expires in 7 Days</option>
                <option value="30">Expires in 30 Days</option>
                <option value="90">Expires in 90 Days</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#687680]">Rate Limit (requests/minute)</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={newKey.rate_limit_per_minute}
                onChange={(e) => setNewKey({ ...newKey, rate_limit_per_minute: e.target.value })}
                placeholder="e.g. 60"
                className="w-full px-3.5 py-2 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-sm focus:outline-none focus:border-[#159A8A]"
                required
              />
              <p className="text-[10px] text-[#8A969F]">How many requests this key can make per minute (1-1000)</p>
            </div>
            <div className="flex justify-end space-x-3 pt-3">
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={submitting}>
                Generate Key
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-[#FFF5E5] border border-[#E4A33B]/30 rounded-lg text-xs text-[#9A6817]">
              Save this secret API key now. Once you close this dialog, PulseGate will never show or
              store the full key again — only the prefix shown in the table below. If you lose it,
              you'll need to revoke this key and create a new one.
            </div>
            <div className="flex items-center space-x-2 bg-[#F9FAFB] p-3 rounded-lg border border-[#E4E9EE] font-mono text-sm text-[#237A50] select-all overflow-x-auto">
              <span>{createdRawKey}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <Button variant="secondary" onClick={() => handleCopy(createdRawKey)}>
                {copied ? <Check className="w-4 h-4 mr-1 text-[#237A50]" /> : <Copy className="w-4 h-4 mr-1 text-[#687680]" />}
                {copied ? 'Copied!' : 'Copy Key'}
              </Button>
              <Button onClick={() => setIsCreateOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke Confirmation Modal */}
      <ConfirmModal
        isOpen={!!revokingKeyId}
        onClose={() => setRevokingKeyId(null)}
        onConfirm={confirmRevoke}
        title="Revoke API key?"
        message="Are you sure you want to revoke this API key? Once revoked, this key can no longer be used to authenticate API requests. This action cannot be undone."
        confirmText="Revoke API Key"
        variant="danger"
        isLoading={submitting}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingKeyId}
        onClose={() => setDeletingKeyId(null)}
        onConfirm={confirmDelete}
        title="Delete API key record?"
        message="Are you sure you want to delete this API key record from database logs?"
        confirmText="Delete Key"
        variant="danger"
        isLoading={submitting}
      />

      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};
