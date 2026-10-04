import React, { useState, useCallback } from 'react';
import {
  Send, Plus, Trash2, Clock, Terminal, Zap,
  History, Copy, CheckCheck, BookOpen,
  KeyRound, Layers, Code2, Globe
} from 'lucide-react';
import { gatewayService, formatTimeIST } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Badge, Input, Toast } from '../components/UIComponents';

export const Playground = () => {
  const { selectedProjectId } = useAuth();
  const [rawKeyInput, setRawKeyInput] = useState('');

  const [method, setMethod] = useState('GET');
  const [endpoint, setEndpoint] = useState('/test/users');

  const [activeTab, setActiveTab] = useState('params');
  const [queryParams, setQueryParams] = useState([]);
  const [customHeaders, setCustomHeaders] = useState([]);
  const [requestBody, setRequestBody] = useState('{}');

  const [submitting, setSubmitting] = useState(false);
  const [bursting, setBursting] = useState(false);
  const [response, setResponse] = useState(null);
  const [toast, setToast] = useState(null);

  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [responseTab, setResponseTab] = useState('body');
  const [copied, setCopied] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAddParam = () => setQueryParams([...queryParams, { key: '', value: '' }]);
  const handleRemoveParam = (idx) => setQueryParams(queryParams.filter((_, i) => i !== idx));
  const handleAddHeader = () => setCustomHeaders([...customHeaders, { key: '', value: '' }]);
  const handleRemoveHeader = (idx) => setCustomHeaders(customHeaders.filter((_, i) => i !== idx));

  const addHistoryEntry = useCallback((entry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const handleCopyResponse = () => {
    if (response?.data) {
      navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getActiveKey = () => rawKeyInput.trim();

  const isValidRawKeyFormat = (key) => /^pk_(live|test)_[a-f0-9]{16,}$/i.test(key);

  const handleSendRequest = async () => {
    const activeKey = getActiveKey();
    if (!activeKey) {
      showToast('Paste your full raw API key to send a request', 'info');
      return;
    }
    if (!isValidRawKeyFormat(activeKey)) {
      showToast('That doesn\'t look like a full raw API key (expected pk_live_... / pk_test_...)', 'error');
      return;
    }

    setSubmitting(true);
    setResponse(null);
    setResponseTab('body');
    const startMs = performance.now();

    try {
      const qObj = {};
      queryParams.forEach(p => {
        if (p.key.trim()) qObj[p.key.trim()] = p.value;
      });

      const hObj = {};
      if (selectedProjectId) {
        hObj['X-Project-ID'] = selectedProjectId;
      }
      customHeaders.forEach(h => {
        if (h.key.trim()) hObj[h.key.trim()] = h.value;
      });

      let parsedBody = null;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        if (requestBody.trim()) {
          try {
            parsedBody = JSON.parse(requestBody);
          } catch {
            showToast('Invalid JSON in request body', 'error');
            setSubmitting(false);
            return;
          }
        }
      }

      const res = await gatewayService.executeRealRequest({
        apiKey: activeKey,
        method,
        endpoint,
        queryParams: qObj,
        headers: hObj,
        body: parsedBody
      });

      const latency = Math.round(performance.now() - startMs);
      const resHeaders = res.headers || {};
      const limit = resHeaders['x-ratelimit-limit'];
      const remaining = resHeaders['x-ratelimit-remaining'];
      const reset = resHeaders['x-ratelimit-reset'];
      const requestId = resHeaders['x-request-id'] || 'N/A';

      const responseObj = {
        status: res.status,
        statusText: getStatusText(res.status),
        latency,
        headers: resHeaders,
        data: res.data || null,
        requestId,
        rateLimit: limit ? { limit: parseInt(limit), remaining: parseInt(remaining), reset: parseInt(reset) } : null
      };

      setResponse(responseObj);

      addHistoryEntry({
        id: Date.now(),
        method,
        endpoint,
        status: res.status,
        latency,
        requestId,
        timestamp: new Date().toISOString(),
        apiKeyPrefix: activeKey.substring(0, 12) + '••••',
        response: responseObj
      });

      if (res.status >= 200 && res.status < 300) {
        showToast(`Request Succeeded (${res.status})`, 'success');
      } else if (res.status === 429) {
        showToast('Rate Limit Exceeded (429)', 'error');
      } else {
        showToast(`Server returned HTTP ${res.status}`, 'error');
      }
    } catch (err) {
      const latency = Math.round(performance.now() - startMs);
      const status = err.response?.status || 0;
      const resHeaders = err.response?.headers || {};
      const requestId = resHeaders['x-request-id'] || 'N/A';

      const errorResponse = {
        status,
        statusText: status ? getStatusText(status) : 'Network Error',
        latency,
        headers: resHeaders,
        data: err.response?.data || { detail: 'Unable to reach the API gateway or server unreachable.' },
        requestId,
        rateLimit: null
      };
      setResponse(errorResponse);
      addHistoryEntry({
        id: Date.now(),
        method,
        endpoint,
        status,
        latency,
        requestId,
        timestamp: new Date().toISOString(),
        apiKeyPrefix: activeKey.substring(0, 12) + '••••',
        response: errorResponse
      });
      if (status) {
        showToast(`Server returned HTTP ${status}`, 'error');
      } else {
        showToast('Network error or server unreachable', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBurstTest = async () => {
    const activeKey = getActiveKey();
    if (!activeKey) {
      showToast('Paste your full raw API key to run a burst test', 'info');
      return;
    }
    if (!isValidRawKeyFormat(activeKey)) {
      showToast('That does not look like a full raw API key', 'error');
      return;
    }

    setBursting(true);
    setResponse(null);

    const burstCount = 6;

    showToast(`Sending ${burstCount} rapid requests to trigger rate limiter...`, 'info');

    for (let i = 1; i <= burstCount; i++) {
      const startMs = performance.now();
      try {
        const res = await gatewayService.executeRealRequest({
          apiKey: activeKey,
          method: 'GET',
          endpoint,
        });
        const latency = Math.round(performance.now() - startMs);
        const resHeaders = res.headers || {};
        const limit = resHeaders['x-ratelimit-limit'];
        const remaining = resHeaders['x-ratelimit-remaining'];
        const reset = resHeaders['x-ratelimit-reset'];

        const responseObj = {
          status: res.status,
          statusText: getStatusText(res.status),
          latency,
          headers: resHeaders,
          data: res.data,
          requestId: resHeaders['x-request-id'] || 'N/A',
          rateLimit: limit ? { limit: parseInt(limit), remaining: parseInt(remaining), reset: parseInt(reset) } : null,
          burstProgress: `Request ${i} of ${burstCount}`
        };

        setResponse(responseObj);

        addHistoryEntry({
          id: Date.now() + i,
          method: 'GET',
          endpoint,
          status: res.status,
          latency,
          requestId: resHeaders['x-request-id'] || 'N/A',
          timestamp: new Date().toISOString(),
          apiKeyPrefix: activeKey.substring(0, 12) + '••••',
          response: responseObj
        });
      } catch (err) {
        const latency = Math.round(performance.now() - startMs);
        const status = err.response?.status || 0;
        const resHeaders = err.response?.headers || {};

        const responseObj = {
          status,
          statusText: status ? getStatusText(status) : 'Network Error',
          latency,
          headers: resHeaders,
          data: err.response?.data || { detail: 'Request failed' },
          requestId: resHeaders['x-request-id'] || 'N/A',
          rateLimit: null,
          burstProgress: `Request ${i} of ${burstCount}`
        };

        setResponse(responseObj);

        addHistoryEntry({
          id: Date.now() + i,
          method: 'GET',
          endpoint,
          status,
          latency,
          requestId: resHeaders['x-request-id'] || 'N/A',
          timestamp: new Date().toISOString(),
          apiKeyPrefix: activeKey.substring(0, 12) + '••••',
          response: responseObj
        });
      }
      await new Promise(r => setTimeout(r, 80));
    }
    setBursting(false);
    showToast('Burst test complete. Check rate limit response status.', 'success');
  };

  const getStatusText = (status) => {
    const map = {
      200: 'OK', 201: 'Created', 204: 'No Content',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests',
      500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
    };
    return map[status] || 'Unknown Status';
  };

  const getStatusBadge = (status) => {
    if (status >= 200 && status < 300) return 'success';
    if (status === 429) return 'warning';
    if (status >= 400 && status < 500) return 'danger';
    return 'danger';
  };

  const getMethodBadgeClass = (m) => {
    const met = (m || '').toUpperCase();
    if (met === 'GET') return 'bg-[#EEF1FF] text-[#4968A6] border-[#6578B8]/30';
    if (met === 'POST') return 'bg-[#EAF7EF] text-[#237A50] border-[#2FA36B]/30';
    if (met === 'PUT') return 'bg-[#FFF5E5] text-[#9A6817] border-[#E4A33B]/30';
    if (met === 'PATCH') return 'bg-[#F2EEFF] text-[#6049A6] border-[#8067C7]/30';
    if (met === 'DELETE') return 'bg-[#FDEEEE] text-[#B63F3F] border-[#E05B5B]/30';
    return 'bg-[#F1F4F6] text-[#687680] border-[#D7DEE5]';
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#17212B]">API Playground</h1>
          <p className="text-xs text-[#687680]">
            Send real HTTP requests through the PulseGate Gateway — every request is validated, rate-limited, rate-tracked, & logged.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="secondary" size="sm" onClick={() => setShowDocs(!showDocs)}>
            <BookOpen className="w-3.5 h-3.5 mr-1 text-[#687680]" /> API Docs
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="w-3.5 h-3.5 mr-1 text-[#687680]" /> History {history.length > 0 && `(${history.length})`}
          </Button>
        </div>
      </div>

      {/* Docs Panel Drawer */}
      {showDocs && (
        <Card className="p-4 bg-[#F9FAFB] border-[#DCE3E8] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#17212B] flex items-center">
              <BookOpen className="w-4 h-4 mr-1.5 text-[#159A8A]" /> Gateway Endpoints Documentation
            </h3>
            <button onClick={() => setShowDocs(false)} className="text-[#8A969F] hover:text-[#17212B] text-xs">Close</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white border border-[#E4E9EE] rounded-lg space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EEF1FF] text-[#4968A6] border border-[#6578B8]/30">GET</span>
                <code className="font-mono text-[#17212B]">/test/users</code>
              </div>
              <p className="text-[11px] text-[#687680]">Returns a mock list of users. Accepts optional <code className="text-[#159A8A]">limit</code> query param.</p>
            </div>
            <div className="p-3 bg-white border border-[#E4E9EE] rounded-lg space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EAF7EF] text-[#237A50] border border-[#2FA36B]/30">POST</span>
                <code className="font-mono text-[#17212B]">/test/users</code>
              </div>
              <p className="text-[11px] text-[#687680]">Creates a mock user. Requires JSON body with name & email.</p>
            </div>
            <div className="p-3 bg-white border border-[#E4E9EE] rounded-lg space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FDEEEE] text-[#B63F3F] border border-[#E05B5B]/30">DELETE</span>
                <code className="font-mono text-[#17212B]">/test/users/:id</code>
              </div>
              <p className="text-[11px] text-[#687680]">Simulates deleting a user by ID. Returns 200 OK confirmation.</p>
            </div>
            <div className="p-3 bg-white border border-[#E4E9EE] rounded-lg space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FFF5E5] text-[#9A6817] border border-[#E4A33B]/30">GET</span>
                <code className="font-mono text-[#17212B]">/test/status/:code</code>
              </div>
              <p className="text-[11px] text-[#687680]">Returns the specified HTTP status code (e.g. /test/status/400, /test/status/500).</p>
            </div>
          </div>
        </Card>
      )}

      {/* History Drawer */}
      {showHistory && (
        <Card className="p-4 bg-[#F9FAFB] border-[#DCE3E8] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#17212B] flex items-center">
              <History className="w-4 h-4 mr-1.5 text-[#159A8A]" /> Request Execution History ({history.length})
            </h3>
            <button onClick={() => setShowHistory(false)} className="text-[#8A969F] hover:text-[#17212B] text-xs">Close</button>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-[#8A969F] italic py-2">No past requests recorded in this session yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {history.map((h) => (
                <div
                  key={h.id}
                  onClick={() => { setResponse(h.response); setShowHistory(false); }}
                  className="flex items-center justify-between p-2 bg-white border border-[#E4E9EE] rounded-lg text-xs hover:border-[#159A8A]/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-2 font-mono">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getMethodBadgeClass(h.method)}`}>{h.method}</span>
                    <span className="text-[#17212B] font-medium">{h.endpoint}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px]">
                    <Badge variant={getStatusBadge(h.status)}>{h.status}</Badge>
                    <span className="text-[#687680] font-mono">{h.latency} ms</span>
                    <span className="text-[#8A969F]">{formatTimeIST(h.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Main Builder & Response Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Request Builder Panel (7 Columns) */}
        <div className="lg:col-span-7 space-y-4">
          <Card title="Request Builder">
            <div className="space-y-4">
              {/* API Key Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#687680] flex items-center">
                  <KeyRound className="w-3.5 h-3.5 mr-1.5 text-[#159A8A]" /> API Key
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Paste raw key (e.g. pk_live_...)"
                    value={rawKeyInput}
                    onChange={(e) => setRawKeyInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-xs font-mono placeholder-[#94A0AA] focus:outline-none focus:border-[#159A8A]"
                  />
                  {rawKeyInput && (
                    <span className="absolute right-3 top-2.5 text-[10px] text-[#237A50] font-mono bg-[#EAF7EF] px-1.5 py-0.5 rounded border border-[#2FA36B]/30">
                      Key Provided
                    </span>
                  )}
                </div>
              </div>

              {/* Method & Endpoint Input Row */}
              <div className="flex items-center space-x-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="bg-white border border-[#DCE3E8] text-[#17212B] text-xs rounded-lg px-3 py-2.5 font-mono font-bold focus:outline-none focus:border-[#159A8A]"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>

                <div className="flex-1">
                  <Input
                    placeholder="/test/users"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="font-mono text-xs py-2.5"
                  />
                </div>

                <Button onClick={handleSendRequest} isLoading={submitting} disabled={bursting} size="md" className="shrink-0 bg-[#159A8A] hover:bg-[#118274]">
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Send
                </Button>
                
                <Button onClick={handleBurstTest} isLoading={bursting} disabled={submitting} variant="danger" size="md" className="shrink-0" title="Send 6 rapid requests to test rate limit 429 response">
                  <Zap className="w-3.5 h-3.5 mr-1" /> Burst
                </Button>
              </div>

              {/* Request Details Tabs */}
              <div className="pt-2">
                <div className="flex items-center space-x-1 border-b border-[#E4E9EE] pb-2">
                  {[
                    { key: 'params', label: 'Params', count: queryParams.length },
                    { key: 'headers', label: 'Headers', count: customHeaders.length },
                    { key: 'body', label: 'Body', show: ['POST', 'PUT', 'PATCH'].includes(method) },
                  ].map(tab => {
                    if (tab.show === false) return null;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5 ${
                          activeTab === tab.key
                            ? 'bg-[#DDF5F0] text-[#0F8F80] border border-[#159A8A]/30'
                            : 'text-[#687680] hover:text-[#17212B]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {tab.count !== undefined && tab.count > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#159A8A]/20 text-[#0F8F80]">
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Query Parameters */}
                {activeTab === 'params' && (
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#687680]">
                      <span>Query Parameters</span>
                      <button onClick={handleAddParam} className="text-[#159A8A] hover:text-[#118274] font-medium flex items-center">
                        <Plus className="w-3 h-3 mr-1" /> Add Parameter
                      </button>
                    </div>
                    {queryParams.length === 0 ? (
                      <p className="text-xs text-[#8A969F] italic py-2">No query parameters set. (e.g. limit=10, page=1)</p>
                    ) : (
                      queryParams.map((p, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="Key (e.g. limit)"
                            value={p.key}
                            onChange={(e) => {
                              const copy = [...queryParams];
                              copy[idx].key = e.target.value;
                              setQueryParams(copy);
                            }}
                            className="flex-1 bg-white border border-[#DCE3E8] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#17212B] focus:outline-none focus:border-[#159A8A]"
                          />
                          <input
                            type="text"
                            placeholder="Value"
                            value={p.value}
                            onChange={(e) => {
                              const copy = [...queryParams];
                              copy[idx].value = e.target.value;
                              setQueryParams(copy);
                            }}
                            className="flex-1 bg-white border border-[#DCE3E8] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#17212B] focus:outline-none focus:border-[#159A8A]"
                          />
                          <button onClick={() => handleRemoveParam(idx)} className="p-1.5 text-[#E05B5B] hover:bg-[#FDEEEE] rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Custom Headers */}
                {activeTab === 'headers' && (
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#687680]">
                      <span>Custom Request Headers</span>
                      <button onClick={handleAddHeader} className="text-[#159A8A] hover:text-[#118274] font-medium flex items-center">
                        <Plus className="w-3 h-3 mr-1" /> Add Header
                      </button>
                    </div>
                    {customHeaders.length === 0 ? (
                      <p className="text-xs text-[#8A969F] italic py-2">No custom headers added. Authorization header is sent automatically.</p>
                    ) : (
                      customHeaders.map((h, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="Header Name"
                            value={h.key}
                            onChange={(e) => {
                              const copy = [...customHeaders];
                              copy[idx].key = e.target.value;
                              setCustomHeaders(copy);
                            }}
                            className="flex-1 bg-white border border-[#DCE3E8] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#17212B] focus:outline-none focus:border-[#159A8A]"
                          />
                          <input
                            type="text"
                            placeholder="Header Value"
                            value={h.value}
                            onChange={(e) => {
                              const copy = [...customHeaders];
                              copy[idx].value = e.target.value;
                              setCustomHeaders(copy);
                            }}
                            className="flex-1 bg-white border border-[#DCE3E8] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#17212B] focus:outline-none focus:border-[#159A8A]"
                          />
                          <button onClick={() => handleRemoveHeader(idx)} className="p-1.5 text-[#E05B5B] hover:bg-[#FDEEEE] rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Request Body */}
                {activeTab === 'body' && ['POST', 'PUT', 'PATCH'].includes(method) && (
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#687680]">
                      <span>JSON Request Payload</span>
                      <span className="text-[10px] text-[#8A969F]">application/json</span>
                    </div>
                    <textarea
                      rows={6}
                      value={requestBody}
                      onChange={(e) => setRequestBody(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#DCE3E8] rounded-lg p-3 text-xs font-mono text-[#17212B] focus:outline-none focus:border-[#159A8A] leading-relaxed"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Response Audit Panel (5 Columns) */}
        <div className="lg:col-span-5 space-y-4">
          <Card title="Response">
            {!response ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#8A969F] space-y-2 text-center">
                <Terminal className="w-10 h-10 stroke-1 text-[#A5AFB7]" />
                <p className="text-xs font-medium text-[#687680]">No request sent yet</p>
                <p className="text-[11px] max-w-xs text-[#8A969F]">
                  Paste an API key and click <strong className="text-[#159A8A]">Send</strong> to execute a real request through PulseGate.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status Bar */}
                <div className="flex items-center justify-between bg-[#F9FAFB] p-3 rounded-lg border border-[#E4E9EE]">
                  <div className="flex items-center space-x-2">
                    <Badge variant={getStatusBadge(response.status)}>
                      {response.status} {response.statusText}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-[#687680] font-mono">
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1 text-[#159A8A]" />
                      {response.latency} ms
                    </span>
                    <span>
                      {JSON.stringify(response.data || '').length} B
                    </span>
                  </div>
                </div>

                {/* Rate Limit Stats Box */}
                {response.rateLimit && (
                  <div className="p-3 bg-[#EEF1FF] border border-[#6578B8]/30 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between text-[#4968A6] font-semibold text-[11px]">
                      <span>REDIS RATE LIMIT HEADERS</span>
                      <span>{response.rateLimit.remaining} / {response.rateLimit.limit} remaining</span>
                    </div>
                    <div className="w-full bg-[#D7DEE5] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#159A8A] h-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (response.rateLimit.remaining / response.rateLimit.limit) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[#687680] flex justify-between">
                      <span>Window Reset: {response.rateLimit.reset}s</span>
                      <span>Request ID: {response.requestId.substring(0, 16)}...</span>
                    </p>
                  </div>
                )}

                {/* Response Tabs */}
                <div className="flex items-center justify-between border-b border-[#E4E9EE] pb-2">
                  <div className="flex items-center space-x-1">
                    {[
                      { key: 'body', label: 'Body' },
                      { key: 'headers', label: 'Headers' },
                      { key: 'raw', label: 'Raw' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setResponseTab(tab.key)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          responseTab === tab.key
                            ? 'bg-[#DDF5F0] text-[#0F8F80] border border-[#159A8A]/30'
                            : 'text-[#687680] hover:text-[#17212B]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleCopyResponse}
                    className="text-[11px] text-[#687680] hover:text-[#159A8A] flex items-center transition-colors"
                  >
                    {copied ? <CheckCheck className="w-3.5 h-3.5 mr-1 text-[#237A50]" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {/* Response Content View */}
                {responseTab === 'body' && (
                  <pre className="p-3 bg-[#F9FAFB] border border-[#E4E9EE] rounded-lg text-[11px] font-mono text-[#17212B] overflow-x-auto max-h-80 leading-relaxed">
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                )}

                {responseTab === 'headers' && (
                  <div className="p-3 bg-[#F9FAFB] border border-[#E4E9EE] rounded-lg text-xs font-mono max-h-80 overflow-y-auto space-y-1">
                    {Object.entries(response.headers || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-[#E4E9EE] py-1 text-[11px]">
                        <span className="text-[#0F8F80] font-semibold">{k}:</span>
                        <span className="text-[#34424D]">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {responseTab === 'raw' && (
                  <pre className="p-3 bg-[#F9FAFB] border border-[#E4E9EE] rounded-lg text-[10px] font-mono text-[#687680] overflow-x-auto max-h-80">
                    {`HTTP/1.1 ${response.status} ${response.statusText}\n` +
                      Object.entries(response.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n') +
                      '\n\n' + JSON.stringify(response.data, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};