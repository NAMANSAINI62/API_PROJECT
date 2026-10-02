import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Activity, CheckCircle2, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usageService, logService, formatDateTimeIST } from '../services/api';
import { Card, Badge, LoadingState, EmptyState, ErrorState, Button } from '../components/UIComponents';

export const Overview = () => {
  const { selectedProjectId } = useAuth();
  const [usage, setUsage] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usageData, logsData] = await Promise.all([
        usageService.getStats({ project_id: selectedProjectId }),
        logService.getAll({ project_id: selectedProjectId, limit: 5 }),
      ]);
      setUsage(usageData);
      setLogs(logsData);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch overview metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedProjectId]);

  if (loading) return <LoadingState message="Loading API Gateway Metrics..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const hasData = usage && usage.total_requests > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#17212B]">Overview</h1>
          <p className="text-xs text-[#687680]">Live API gateway traffic and health summary</p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchData}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-[#687680]" /> Refresh
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Requests - Teal Tint */}
        <Card className="flex items-center space-x-3.5 bg-[#EAF8F5] border-[#159A8A]/20">
          <div className="p-2.5 bg-[#159A8A]/15 text-[#159A8A] border border-[#159A8A]/30 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Total Requests</p>
            <p className="text-xl font-bold text-[#17212B]">{hasData ? usage.total_requests.toLocaleString() : '0'}</p>
          </div>
        </Card>

        {/* Success Rate - Muted Green Tint */}
        <Card className="flex items-center space-x-3.5 bg-[#EAF7EF] border-[#2FA36B]/20">
          <div className="p-2.5 bg-[#2FA36B]/15 text-[#237A50] border border-[#2FA36B]/30 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Success Rate</p>
            <p className="text-xl font-bold text-[#17212B]">{hasData ? `${usage.success_rate}%` : '100%'}</p>
          </div>
        </Card>

        {/* Invalid Keys - Soft Red Tint */}
        <Card className="flex items-center space-x-3.5 bg-[#FDEEEE] border-[#E05B5B]/20">
          <div className="p-2.5 bg-[#E05B5B]/15 text-[#B63F3F] border border-[#E05B5B]/30 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Invalid Keys (401)</p>
            <p className="text-xl font-bold text-[#B63F3F]">{hasData ? (usage.status_401_count || 0).toLocaleString() : '0'}</p>
          </div>
        </Card>

        {/* Rate Limited - Soft Amber Tint */}
        <Card className="flex items-center space-x-3.5 bg-[#FFF5E5] border-[#E4A33B]/20">
          <div className="p-2.5 bg-[#E4A33B]/15 text-[#9A6817] border border-[#E4A33B]/30 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Rate Limited (429)</p>
            <p className="text-xl font-bold text-[#9A6817]">{hasData ? (usage.status_429_count || 0).toLocaleString() : '0'}</p>
          </div>
        </Card>

        {/* Avg Latency - Soft Purple Tint */}
        <Card className="flex items-center space-x-3.5 bg-[#F2EEFF] border-[#8067C7]/20">
          <div className="p-2.5 bg-[#8067C7]/15 text-[#6049A6] border border-[#8067C7]/30 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Avg Latency</p>
            <p className="text-xl font-bold text-[#17212B]">{hasData ? `${usage.avg_latency_ms} ms` : '0 ms'}</p>
          </div>
        </Card>
      </div>

      {/* Chart Section */}
      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-[#17212B]">Request Activity (7 Days)</h2>
        {!hasData ? (
          <EmptyState
            title="No API requests yet"
            description="Use an API key in Playground to send your first request through the gateway."
          />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usage.time_series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7ECEF" />
                <XAxis dataKey="timestamp" stroke="#7D8992" fontSize={12} />
                <YAxis stroke="#7D8992" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E4E9EE', borderRadius: '8px', color: '#17212B', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Area type="monotone" dataKey="count" stroke="#159A8A" strokeWidth={2} fill="#159A8A" fillOpacity={0.10} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Recent API Requests Table */}
      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-[#17212B]">Recent API Requests</h2>
        {logs.length === 0 ? (
          <p className="text-xs text-[#8A969F] py-4 text-center">No recent request logs recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E4E9EE] text-[#687680] font-medium bg-[#F9FAFB]">
                <tr>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Endpoint</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9EE]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F4F7F9]">
                    <td className="py-3 px-3 font-mono font-semibold text-[#4968A6]">{log.method}</td>
                    <td className="py-3 px-3 font-mono text-[#34424D]">{log.endpoint}</td>
                    <td className="py-3 px-3">
                      <Badge variant={log.status_code >= 200 && log.status_code < 300 ? 'success' : log.status_code === 429 ? 'warning' : 'danger'}>
                        {log.status_code}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-[#687680]">{log.latency_ms} ms</td>
                    <td className="py-3 px-3 text-[#8A969F]">{formatDateTimeIST(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
