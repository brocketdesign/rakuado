import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { formatNumber } from '../lib/utils'
import { PageHeader, StatCard, Card, Tabs } from '../components/UI'
import { BarChart3, Eye, MousePointerClick, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

export default function Analytics() {
  const [period, setPeriod] = useState('current')
  const [tab, setTab] = useState('simple')
  const [selectedSite, setSelectedSite] = useState('all')

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics', period, selectedSite],
    queryFn: async () => {
      const res = await api.get('/api/analytics/data', {
        params: { period, site: selectedSite },
      })
      return res.data
    },
  })

  const { data: sitesData } = useQuery({
    queryKey: ['analytics-sites'],
    queryFn: async () => {
      const res = await api.get('/api/analytics/sites')
      return res.data
    },
  })
  const sites = sitesData?.sites || []

  const rawData = analyticsData?.data || []
  // Find the latest day that has actual data (views or clicks > 0)
  const latestDay = [...rawData].reverse().find((d) => (d.views || 0) > 0 || (d.clicks || 0) > 0) || { date: '', views: 0, clicks: 0 }
  const latestViews = latestDay.views || 0
  const latestClicks = latestDay.clicks || 0
  const latestDate = latestDay.date ? latestDay.date.slice(5) : '' // MM-DD
  const periodTotalViews = rawData.reduce((s, d) => s + (d.views || 0), 0)
  const periodTotalClicks = rawData.reduce((s, d) => s + (d.clicks || 0), 0)
  const chartData = rawData.map((d) => ({
    date: d.date,
    views: d.views || 0,
    clicks: d.clicks || 0,
  }))

  const ctr = latestViews
    ? (latestClicks / latestViews * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-6">
      <PageHeader title="アナリティクス" subtitle="サイトパフォーマンスの概要">
        <Tabs
          tabs={[
            { value: 'current', label: '今月' },
            { value: 'previous', label: '先月' },
          ]}
          active={period}
          onChange={setPeriod}
        />
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={`閲覧数 (${latestDate})`} value={formatNumber(latestViews)} icon={Eye} color="blue" />
        <StatCard title={`クリック数 (${latestDate})`} value={formatNumber(latestClicks)} icon={MousePointerClick} color="violet" />
        <StatCard title={`CTR (${latestDate})`} value={`${ctr}%`} icon={TrendingUp} color="green" />
        <StatCard title="今月の合計閲覧数" value={formatNumber(periodTotalViews)} icon={BarChart3} color="amber" />
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs
          tabs={[
            { value: 'simple', label: 'シンプル' },
            { value: 'detailed', label: '詳細' },
          ]}
          active={tab}
          onChange={setTab}
        />
        {tab === 'detailed' && sites?.length > 0 && (
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="rounded-xl border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-white"
          >
            <option value="all">全サイト</option>
            {sites.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {/* Chart */}
      <Card>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  color: '#f1f5f9',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="views"
                name="閲覧数"
                stroke="#667eea"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="clicks"
                name="クリック数"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-slate-500">
            データがありません
          </div>
        )}
      </Card>

      {/* Data Table (Detailed) */}
      {tab === 'detailed' && chartData.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">日付</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">閲覧数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">クリック数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {chartData.map((row) => (
                  <tr key={row.date} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-300">{row.date}</td>
                    <td className="px-4 py-3 text-slate-300">{formatNumber(row.views)}</td>
                    <td className="px-4 py-3 text-slate-300">{formatNumber(row.clicks)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {row.views ? (row.clicks / row.views * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
