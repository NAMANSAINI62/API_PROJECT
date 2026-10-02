import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Activity, CheckCircle2, AlertTriangle, Clock, ShieldAlert, RefreshCw } from 'lucide-react';
import { usageService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, LoadingState, EmptyState, ErrorState, Button } from '../components/UIComponents';

export const Usage = () => {
  const { selectedProjectId } = useAuth();
  const [stats, setStats] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await usageService.getStats({ project_id: selectedProjectId, days });
      setStats(data);
    } catch {
      setError('Failed to fetch usage analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, [selectedProjectId, days]);

  if (loading) return <LoadingState message="Calculating Usage Analytics & Redis Rate Limit Stats..." />;
  if (error) return <ErrorState message={error} onRetry={fetchUsage} />;

  const hasData = stats && stats.total_requests > 0;

  const statusCards = [
    {
      title: 'HTTP 2xx SUCCESS',
      value: stats?.status_200_count || 0,
      className: 'bg-[#EAF7EF] border-[#2FA36B]/30',
      titleClass: 'text-[#237A50]',
      valueClass: 'text-[#17212B]',
      badge: 'Success',
      badgeVariant: 'success',
      description: 'All 2xx responses (200, 201, etc.)',
    },
    {
      title: 'HTTP 3xx REDIRECT',
      value: stats?.status_3xx_count || 0,
      className: 'bg-[#EEF1FF] border-[#6578B8]/30',
      titleClass: 'text-[#4968A6]',
      valueClass: 'text-[#17212B]',
      badge: 'Redirect',
      badgeVariant: 'info',
      description: 'Resource redirected',
    },
    {
      title: 'HTTP 401 INVALID',
      value: stats?.status_401_count || 0,
      className: 'bg-[#FDEEEE] border-[#E05B5B]/30',
      titleClass: 'text-[#B63F3F]',
      valueClass: 'text-[#B63F3F]',
      badge: 'Invalid Key',
      badgeVariant: 'danger',
      description: 'Revoked or wrong API key',
    },
    {
      title: 'HTTP 429 EXCEEDED',
      value: stats?.status_429_count || 0,
      className: 'bg-[#FFF5E5] border-[#E4A33B]/30',
      titleClass: 'text-[#9A6817]',
      valueClass: 'text-[#9A6817]',
      badge: 'Rate Limited',
      badgeVariant: 'warning',
      description: 'Redis threshold triggered',
    },
    {
      title: 'HTTP 400 BAD REQ',
      value: stats?.status_400_count || 0,
      className: 'bg-[#FFF5E5] border-[#E4A33B]/30',
      titleClass: 'text-[#9A6817]',
      valueClass: 'text-[#17212B]',
      badge: 'Client Error',
      badgeVariant: 'warning',
      description: 'Simulated client error',
    },
    {
      title: 'HTTP 404 NOT FOUND',
      value: stats?.status_404_count || 0,
      className: 'bg-[#FFF5E5] border-[#E4A33B]/30',
      titleClass: 'text-[#9A6817]',
      valueClass: 'text-[#17212B]',
      badge: 'Client Error',
      badgeVariant: 'warning',
      description: 'Missing gateway resource',
    },
    {
      title: 'HTTP 405 METHOD',
      value: stats?.status_405_count || 0,
      className: 'bg-[#EEF1FF] border-[#6578B8]/30',
      titleClass: 'text-[#4968A6]',
      valueClass: 'text-[#17212B]',
      badge: 'Not Allowed',
      badgeVariant: 'info',
      description: 'Unsupported gateway method',
    },
    {
      title: 'HTTP 5xx SERVER',
      value: stats?.status_500_count || 0,
      className: 'bg-[#FDEEEE] border-[#E05B5B]/30',
      titleClass: 'text-[#B63F3F]',
      valueClass: 'text-[#17212B]',
      badge: 'Server Error',
      badgeVariant: 'danger',
      description: 'Upstream service error',
    },
    {
      title: 'OTHER / UNKNOWN',
      value: stats?.status_other_count || 0,
      className: 'bg-[#F9FAFB] border-[#E4E9EE]',
      titleClass: 'text-[#687680]',
      valueClass: 'text-[#17212B]',
      badge: 'Other',
      badgeVariant: 'neutral',
      description: 'Unclassified status codes',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#17212B]">Usage Analytics</h1>
          <p className="text-xs text-[#687680]">Detailed breakdown of traffic volume, status code distributions, and Redis rate limit hits</p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="bg-white border border-[#DCE3E8] text-[#34424D] text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
          <Button variant="secondary" size="sm" onClick={fetchUsage}>
            <RefreshCw className="w-3.5 h-3.5 text-[#687680]" />
          </Button>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex items-center space-x-4 bg-[#EAF8F5] border-[#159A8A]/20">
          <div className="p-3 bg-[#159A8A]/15 text-[#159A8A] border border-[#159A8A]/30 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Total Gateway Requests</p>
            <p className="text-2xl font-bold text-[#17212B]">{hasData ? stats.total_requests.toLocaleString() : '--'}</p>
          </div>
        </Card>

        <Card className="flex items-center space-x-4 bg-[#EAF7EF] border-[#2FA36B]/20">
          <div className="p-3 bg-[#2FA36B]/15 text-[#237A50] border border-[#2FA36B]/30 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Success Rate</p>
            <p className="text-2xl font-bold text-[#17212B]">{hasData ? `${stats.success_rate}%` : '--'}</p>
          </div>
        </Card>

        <Card className="flex items-center space-x-4 bg-[#FFF5E5] border-[#E4A33B]/20">
          <div className="p-3 bg-[#E4A33B]/15 text-[#9A6817] border border-[#E4A33B]/30 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Rate Limit Hits (429)</p>
            <p className="text-2xl font-bold text-[#9A6817]">{hasData ? (stats.status_429_count || 0).toLocaleString() : '0'}</p>
          </div>
        </Card>

        <Card className="flex items-center space-x-4 bg-[#F2EEFF] border-[#8067C7]/20">
          <div className="p-3 bg-[#8067C7]/15 text-[#6049A6] border border-[#8067C7]/30 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-[#687680] font-medium">Avg Latency</p>
            <p className="text-2xl font-bold text-[#17212B]">{hasData ? `${stats.avg_latency_ms} ms` : '--'}</p>
          </div>
        </Card>
      </div>

      {/* HTTP Status Code Distribution Grid */}
      <Card title="HTTP Status Code Distribution">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {statusCards.map((card, idx) => (
            <div key={idx} className={`p-3.5 border rounded-xl space-y-1 ${card.className}`}>
              <div className={`flex items-center justify-between text-xs font-bold ${card.titleClass}`}>
                <span>{card.title}</span>
                <Badge variant={card.badgeVariant}>{card.badge}</Badge>
              </div>
              <p className={`text-2xl font-bold ${card.valueClass}`}>{card.value}</p>
              <p className="text-[11px] text-[#687680]">{card.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Traffic Chart */}
      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-[#17212B]">Daily Request Traffic Volume</h2>
        {!hasData ? (
          <EmptyState
            title="No usage data yet"
            description="Send gateway requests using an API key to view traffic graphs."
          />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.time_series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7ECEF" />
                <XAxis dataKey="timestamp" stroke="#7D8992" fontSize={12} />
                <YAxis stroke="#7D8992" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E4E9EE', borderRadius: '8px', color: '#17212B', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Area type="monotone" dataKey="count" stroke="#8067C7" strokeWidth={2} fill="#8067C7" fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
};
