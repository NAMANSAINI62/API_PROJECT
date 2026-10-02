import React, { useState, useEffect } from 'react';
import { RefreshCw, Eye, Search, Code2, Layers, Clock, Globe, Copy, CheckCheck, Loader2 } from 'lucide-react';
import { logService, formatDateTimeIST } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Badge, Modal, EmptyState, LoadingState, ErrorState } from '../components/UIComponents';

export const Logs = () => {
  const { selectedProjectId } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [methodFilter, setMethodFilter] = useState('');
  const [statusCategoryFilter, setStatusCategoryFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // 300ms debounce timer for live typing auto-search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  // Log Detail Modal
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [copied, setCopied] = useState(false);

  const fetchLogs = async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setIsSearching(true);
    }
    setError(null);
    try {
      const filters = {
        project_id: selectedProjectId,
        limit: 100,
      };
      if (methodFilter) filters.method = methodFilter;
      if (statusCategoryFilter) filters.status_category = statusCategoryFilter;
      if (debouncedSearch.trim()) filters.search = debouncedSearch.trim();

      const logData = await logService.getAll(filters);
      setLogs(logData);
    } catch {
      setError('Failed to fetch request logs.');
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  useEffect(() => {
    fetchLogs(logs.length === 0);
  }, [selectedProjectId, methodFilter, statusCategoryFilter, debouncedSearch]);

  const getStatusVariant = (code) => {
    if (code >= 200 && code < 300) return 'success';
    if (code === 429) return 'warning';
    if (code >= 400 && code < 500) return 'warning';
    return 'danger';
  };

  const getMethodBadgeClass = (m) => {
    const method = (m || '').toUpperCase();
    if (method === 'GET') return 'bg-[#EEF1FF] text-[#4968A6] border-[#6578B8]/30';
    if (method === 'POST') return 'bg-[#EAF7EF] text-[#237A50] border-[#2FA36B]/30';
    if (method === 'PUT') return 'bg-[#FFF5E5] text-[#9A6817] border-[#E4A33B]/30';
    if (method === 'PATCH') return 'bg-[#F2EEFF] text-[#6049A6] border-[#8067C7]/30';
    if (method === 'DELETE') return 'bg-[#FDEEEE] text-[#B63F3F] border-[#E05B5B]/30';
    return 'bg-[#F1F4F6] text-[#687680] border-[#D7DEE5]';
  };

  const getStatusColor = (code) => {
    if (code >= 200 && code < 300) return 'text-[#237A50]';
    if (code === 429) return 'text-[#9A6817]';
    if (code >= 400) return 'text-[#B63F3F]';
    return 'text-[#687680]';
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parseJsonSafely = (str) => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  };

  const formatJson = (str) => {
    if (!str) return '// Empty';
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  if (loading) return <LoadingState message="Fetching Gateway Logs..." />;
  if (error) return <ErrorState message={error} onRetry={fetchLogs} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#17212B]">API Logs</h1>
          <p className="text-xs text-[#687680]">Real-time Gateway HTTP request audit log records processed by PulseGate</p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-[#687680]" /> Refresh Logs
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white">
        <div className="flex items-center space-x-2 flex-1 max-w-xs relative">
          <Search className="w-4 h-4 text-[#8A969F]" />
          <input
            type="text"
            placeholder="Search endpoint"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-white border border-[#DCE3E8] text-[#17212B] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#159A8A]"
          />
          {isSearching && (
            <Loader2 className="w-3.5 h-3.5 text-[#159A8A] animate-spin absolute right-2.5" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-white border border-[#DCE3E8] text-[#34424D] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="">All Methods</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>

          {/* Status Category Filter */}
          <select
            value={statusCategoryFilter}
            onChange={(e) => setStatusCategoryFilter(e.target.value)}
            className="bg-white border border-[#DCE3E8] text-[#34424D] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx Client Error (400, 401, 404, 405, 429)</option>
            <option value="5xx">5xx Server Error</option>
          </select>
        </div>
      </Card>

      {/* Summary Stats Row */}
      {logs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <Card className="p-3 bg-white border-[#E4E9EE]">
            <p className="text-[10px] text-[#687680] uppercase font-semibold">Total Requests</p>
            <p className="text-lg font-bold text-[#17212B] font-mono">{logs.length}</p>
          </Card>
          <Card className="p-3 bg-[#EAF7EF] border-[#2FA36B]/20">
            <p className="text-[10px] text-[#237A50] uppercase font-semibold">Success (2xx)</p>
            <p className="text-lg font-bold text-[#237A50] font-mono">
              {logs.filter(l => l.status_code >= 200 && l.status_code < 300).length}
            </p>
          </Card>
          <Card className="p-3 bg-[#FFF5E5] border-[#E4A33B]/20">
            <p className="text-[10px] text-[#9A6817] uppercase font-semibold">Rate Limited</p>
            <p className="text-lg font-bold text-[#9A6817] font-mono">
              {logs.filter(l => l.status_code === 429).length}
            </p>
          </Card>
          <Card className="p-3 bg-[#EEF1FF] border-[#6578B8]/20">
            <p className="text-[10px] text-[#4968A6] uppercase font-semibold">Redirects (3xx)</p>
            <p className="text-lg font-bold text-[#4968A6] font-mono">
              {logs.filter(l => l.status_code >= 300 && l.status_code < 400).length}
            </p>
          </Card>
          <Card className="p-3 bg-[#F2EEFF] border-[#8067C7]/20">
            <p className="text-[10px] text-[#6049A6] uppercase font-semibold">Server Errors (5xx)</p>
            <p className="text-lg font-bold text-[#6049A6] font-mono">
              {logs.filter(l => l.status_code >= 500 && l.status_code < 600).length}
            </p>
          </Card>
          <Card className="p-3 bg-white border-[#E4E9EE]">
            <p className="text-[10px] text-[#687680] uppercase font-semibold">Avg Latency</p>
            <p className="text-lg font-bold text-[#17212B] font-mono">
              {logs.length > 0 ? (logs.reduce((sum, l) => sum + l.latency_ms, 0) / logs.length).toFixed(1) : 0} ms
            </p>
          </Card>
        </div>
      )}

      {logs.length === 0 ? (
        <EmptyState
          title="No API requests found"
          description="Your API request activity will appear here in real-time as gateway requests are executed."
        />
      ) : (
        <Card className={`p-0 overflow-hidden relative transition-opacity duration-200 ${isSearching ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] border-b border-[#E4E9EE] text-[#687680] font-medium">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Endpoint</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Latency</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E9EE]">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-[#F4F7F9] transition-colors">
                  <td className="py-3 px-4 text-[#687680] font-mono text-[11px]">
                    {formatDateTimeIST(log.created_at)}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold">
                    <span className={`px-2 py-0.5 rounded text-[10px] border ${getMethodBadgeClass(log.method)}`}>
                      {log.method}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[#17212B] font-medium">{log.endpoint}</td>
                  <td className="py-3 px-4 font-mono font-bold">
                    <Badge variant={getStatusVariant(log.status_code)}>
                      {log.status_code}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-[#34424D] font-mono">{log.latency_ms} ms</td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedLog(log); setDetailTab('overview'); }}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Enhanced Log Detail Modal */}
      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="Request Audit Details">
        {selectedLog && (
          <div className="space-y-4 text-xs">
            {/* Status Summary Bar */}
            <div className="flex items-center justify-between bg-[#F9FAFB] p-3 rounded-lg border border-[#E4E9EE]">
              <div className="flex items-center space-x-3">
                <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${getMethodBadgeClass(selectedLog.method)}`}>
                  {selectedLog.method}
                </span>
                <code className="text-[#17212B] font-mono text-[11px]">{selectedLog.endpoint}</code>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`text-sm font-bold font-mono ${getStatusColor(selectedLog.status_code)}`}>
                  {selectedLog.status_code}
                </span>
                <span className="text-[#687680] flex items-center text-[11px]">
                  <Clock className="w-3 h-3 mr-1 text-[#159A8A]" />{selectedLog.latency_ms} ms
                </span>
              </div>
            </div>

            {/* Detail Tabs */}
            <div className="flex items-center space-x-1 bg-[#F1F4F6] rounded-lg p-1">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'request', label: 'Request' },
                { key: 'response', label: 'Response' },
                { key: 'headers', label: 'Req Headers' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all flex-1 text-center ${
                    detailTab === tab.key
                      ? 'bg-white text-[#0F8F80] border border-[#159A8A]/30 shadow-2xs'
                      : 'text-[#687680] hover:text-[#17212B]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {detailTab === 'overview' && (
              <div className="grid grid-cols-2 gap-3 bg-[#F9FAFB] p-4 rounded-lg border border-[#E4E9EE] font-mono">
                <div>
                  <span className="text-[#8A969F] block text-[10px]">REQUEST ID</span>
                  <span className="text-[#0F8F80] font-semibold truncate block">{selectedLog.request_id}</span>
                </div>
                <div>
                  <span className="text-[#8A969F] block text-[10px]">HTTP METHOD</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] border inline-block ${getMethodBadgeClass(selectedLog.method)}`}>
                    {selectedLog.method}
                  </span>
                </div>
                <div>
                  <span className="text-[#8A969F] block text-[10px]">ENDPOINT</span>
                  <span className="text-[#17212B]">{selectedLog.endpoint}</span>
                </div>
                <div>
                  <span className="text-[#8A969F] block text-[10px]">RESPONSE STATUS</span>
                  <span className={`font-bold ${getStatusColor(selectedLog.status_code)}`}>
                    HTTP {selectedLog.status_code}
                  </span>
                </div>
                <div>
                  <span className="text-[#8A969F] block text-[10px]">EXECUTION LATENCY</span>
                  <span className="text-[#34424D]">{selectedLog.latency_ms} ms</span>
                </div>
                <div>
                  <span className="text-[#8A969F] block text-[10px]">TIMESTAMP</span>
                  <span className="text-[#34424D]">{formatDateTimeIST(selectedLog.created_at)}</span>
                </div>
              </div>
            )}

            {/* Request Body Tab */}
            {detailTab === 'request' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#687680] font-semibold text-[11px] flex items-center">
                    <Code2 className="w-3.5 h-3.5 mr-1 text-[#159A8A]" /> Request Body
                  </span>
                  {selectedLog.request_body && (
                    <button
                      onClick={() => handleCopy(formatJson(selectedLog.request_body))}
                      className="text-[10px] text-[#687680] hover:text-[#159A8A] flex items-center transition-colors"
                    >
                      {copied ? <CheckCheck className="w-3 h-3 mr-0.5 text-[#237A50]" /> : <Copy className="w-3 h-3 mr-0.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <pre className="overflow-auto text-[11px] leading-relaxed p-3 bg-[#F9FAFB] rounded-lg border border-[#E4E9EE] max-h-60 font-mono text-[#17212B]">
                  {selectedLog.request_body ? formatJson(selectedLog.request_body) : '// No request body (GET/DELETE)'}
                </pre>
              </div>
            )}

            {/* Response Body Tab */}
            {detailTab === 'response' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#687680] font-semibold text-[11px] flex items-center">
                    <Layers className="w-3.5 h-3.5 mr-1 text-[#237A50]" /> Response Body
                  </span>
                  {selectedLog.response_body && (
                    <button
                      onClick={() => handleCopy(formatJson(selectedLog.response_body))}
                      className="text-[10px] text-[#687680] hover:text-[#159A8A] flex items-center transition-colors"
                    >
                      {copied ? <CheckCheck className="w-3 h-3 mr-0.5 text-[#237A50]" /> : <Copy className="w-3 h-3 mr-0.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <pre className="overflow-auto text-[11px] leading-relaxed p-3 bg-[#F9FAFB] rounded-lg border border-[#E4E9EE] max-h-60 font-mono text-[#17212B]">
                  {selectedLog.response_body ? formatJson(selectedLog.response_body) : '// 204 No Content'}
                </pre>
              </div>
            )}

            {/* Request Headers Tab */}
            {detailTab === 'headers' && (
              <div className="space-y-2">
                <span className="text-[#687680] font-semibold text-[11px] flex items-center">
                  <Globe className="w-3.5 h-3.5 mr-1 text-[#4968A6]" /> Request Headers (Sanitized)
                </span>
                {selectedLog.request_headers ? (
                  <div className="bg-[#F9FAFB] rounded-lg border border-[#E4E9EE] divide-y divide-[#E4E9EE] max-h-60 overflow-auto">
                    {Object.entries(parseJsonSafely(selectedLog.request_headers) || {}).map(([key, value]) => (
                      <div key={key} className="flex items-start px-3 py-2 text-[11px] hover:bg-[#F1F4F6] transition-colors">
                        <span className="text-[#0F8F80] font-mono font-semibold min-w-40 shrink-0">{key}</span>
                        <span className="text-[#34424D] font-mono break-all">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#8A969F] italic py-4 text-center">No request headers recorded for this log entry</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
