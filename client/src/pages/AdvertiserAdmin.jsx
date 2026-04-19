import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import {
  Users, DollarSign, TrendingUp, Megaphone, Eye, MousePointerClick,
  Wallet, Globe, ChevronDown, ChevronUp, BadgeCheck, Clock, XCircle, FileText,
} from 'lucide-react'
import api from '../lib/api'
import { PageHeader, StatCard, Card, Badge, Table } from '../components/UI'
import { formatCurrency, formatDate, formatNumber } from '../lib/utils'

// ── helpers ────────────────────────────────────────────────────────────────────
const STATUS_META = {
  active:         { label: '有効',       color: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' },
  draft:          { label: '下書き',     color: 'bg-slate-500/15 text-slate-400 ring-slate-500/20' },
  paused:         { label: '停止中',     color: 'bg-amber-500/15 text-amber-400 ring-amber-500/20' },
  pending_review: { label: '審査待ち',   color: 'bg-blue-500/15 text-blue-400 ring-blue-500/20' },
  rejected:       { label: '却下',       color: 'bg-red-500/15 text-red-400 ring-red-500/20' },
  completed:      { label: '完了',       color: 'bg-violet-500/15 text-violet-400 ring-violet-500/20' },
}
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-slate-500/15 text-slate-400' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${m.color}`}>
      {m.label}
    </span>
  )
}

const PIE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa']

function ctr(clicks, impressions) {
  if (!impressions) return '0.00%'
  return ((clicks / impressions) * 100).toFixed(2) + '%'
}

// ── sub-components ─────────────────────────────────────────────────────────────
function AdvertiserRow({ row }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        className="border-b border-slate-800 hover:bg-slate-800/40 cursor-pointer transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-3 pl-4 pr-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 shrink-0 text-sm font-bold">
              {(row.companyName || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">{row.companyName}</p>
              <p className="text-xs text-slate-500">{row.contactName}</p>
            </div>
          </div>
        </td>
        <td className="py-3 px-3 text-sm text-slate-300 text-right font-mono">
          {formatCurrency(row.totalDeposited)}
        </td>
        <td className="py-3 px-3 text-sm text-right">
          <span className={row.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatCurrency(row.balance)}
          </span>
        </td>
        <td className="py-3 px-3 text-sm text-slate-300 text-center">{row.campaignCount}</td>
        <td className="py-3 px-3 text-sm text-slate-300 text-center">{formatNumber(row.impressions)}</td>
        <td className="py-3 px-3 text-sm text-slate-300 text-center">{formatNumber(row.clicks)}</td>
        <td className="py-3 px-3 text-sm text-slate-400 text-center">{ctr(row.clicks, row.impressions)}</td>
        <td className="py-3 pl-3 pr-4 text-center">
          <StatusBadge status={row.status} />
        </td>
        <td className="py-3 pl-3 pr-4 text-center text-slate-500">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-800 bg-slate-900/50">
          <td colSpan={9} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-800/60 p-3">
                <p className="text-xs text-slate-500 mb-1">合計入金</p>
                <p className="text-sm font-semibold text-slate-200">{formatCurrency(row.totalDeposited)}</p>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-3">
                <p className="text-xs text-slate-500 mb-1">合計消化</p>
                <p className="text-sm font-semibold text-slate-200">{formatCurrency(row.totalSpent)}</p>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-3">
                <p className="text-xs text-slate-500 mb-1">有効キャンペーン</p>
                <p className="text-sm font-semibold text-emerald-400">{row.activeCampaigns}</p>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-3">
                <p className="text-xs text-slate-500 mb-1">登録日</p>
                <p className="text-sm font-semibold text-slate-200">{formatDate(row.createdAt)}</p>
              </div>
            </div>
            {row.website && (
              <a
                href={row.website.startsWith('http') ? row.website : `https://${row.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                onClick={(e) => e.stopPropagation()}
              >
                <Globe size={12} /> {row.website}
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── main component ─────────────────────────────────────────────────────────────
export default function AdvertiserAdmin() {
  const [sortKey, setSortKey] = useState('totalDeposited')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-advertiser-overview'],
    queryFn: () => api.get('/api/admin/advertiser-overview').then((r) => r.data),
    staleTime: 30000,
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
      </div>
    )
  }

  const { summary, monthlyDeposits = [], campaignStatusBreakdown = [], advertisers = [] } = data || {}

  // ── sort & filter ──────────────────────────────────────────────────────────
  const filtered = advertisers
    .filter((a) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        a.companyName.toLowerCase().includes(q) ||
        a.contactName.toLowerCase().includes(q) ||
        (a.website || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  // ── chart data ─────────────────────────────────────────────────────────────
  const monthlyChartData = monthlyDeposits.map((m) => ({
    month: m._id,
    入金額: m.deposited,
    件数: m.count,
  }))

  const pieData = campaignStatusBreakdown.map((s) => ({
    name: STATUS_META[s._id]?.label || s._id,
    value: s.count,
  }))

  const topDepositors = [...advertisers]
    .sort((a, b) => b.totalDeposited - a.totalDeposited)
    .slice(0, 5)
    .map((a) => ({
      name: a.companyName.length > 14 ? a.companyName.slice(0, 14) + '…' : a.companyName,
      入金額: a.totalDeposited,
      残高: a.balance,
    }))

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span className="ml-1 text-slate-700">↕</span>
    return <span className="ml-1 text-violet-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const thClass = 'py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap cursor-pointer hover:text-slate-300 select-none'

  return (
    <div className="space-y-6">
      <PageHeader title="広告主管理" subtitle="全広告主の概要・収益・キャンペーン" />

      {/* ── KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="広告主数"
          value={formatNumber(summary?.totalAdvertisers ?? 0)}
          icon={Users}
          color="violet"
        />
        <StatCard
          title="累計入金総額"
          value={formatCurrency(summary?.totalDeposited ?? 0)}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="累計消化金額"
          value={formatCurrency(summary?.totalSpent ?? 0)}
          icon={Wallet}
          color="amber"
        />
        <StatCard
          title="全キャンペーン数"
          value={formatNumber(summary?.totalCampaigns ?? 0)}
          icon={Megaphone}
          color="blue"
        />
      </div>

      {/* ── second KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="累計インプレッション"
          value={formatNumber(summary?.totalImpressions ?? 0)}
          icon={Eye}
          color="blue"
        />
        <StatCard
          title="累計クリック数"
          value={formatNumber(summary?.totalClicks ?? 0)}
          icon={MousePointerClick}
          color="violet"
        />
        <StatCard
          title="全体残高"
          value={formatCurrency(summary?.totalBalance ?? 0)}
          icon={TrendingUp}
          color="green"
        />
      </div>

      {/* ── charts row ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly deposits line chart */}
        <Card className="lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">月次入金額（過去6ヶ月）</h3>
          {monthlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyChartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
                  formatter={(v) => [formatCurrency(v), '入金額']}
                />
                <Line
                  type="monotone"
                  dataKey="入金額"
                  stroke="#818cf8"
                  strokeWidth={2}
                  dot={{ fill: '#818cf8', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">データなし</div>
          )}
        </Card>

        {/* Campaign status pie */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-200">キャンペーンステータス</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-1.5">
                {pieData.map((d, i) => (
                  <li key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      {d.name}
                    </span>
                    <span className="font-semibold text-slate-200">{d.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">データなし</div>
          )}
        </Card>
      </div>

      {/* ── Top depositors bar chart ── */}
      {topDepositors.length > 0 && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-200">入金額 TOP 5 広告主</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topDepositors} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
                formatter={(v, name) => [formatCurrency(v), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar dataKey="入金額" fill="#818cf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="残高" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── Advertiser table ── */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-200">
            広告主一覧 <span className="ml-2 text-slate-500 font-normal">({filtered.length}社)</span>
          </h3>
          <input
            type="text"
            placeholder="会社名・担当者・URLで検索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 border border-slate-700 focus:border-violet-500 focus:outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText size={32} className="mb-3 text-slate-600" />
            <p className="text-sm text-slate-500">該当する広告主がいません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className={`${thClass} pl-4`} onClick={() => toggleSort('companyName')}>
                    会社名 <SortIcon k="companyName" />
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('totalDeposited')}>
                    累計入金 <SortIcon k="totalDeposited" />
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('balance')}>
                    残高 <SortIcon k="balance" />
                  </th>
                  <th className={`${thClass} text-center`} onClick={() => toggleSort('campaignCount')}>
                    件数 <SortIcon k="campaignCount" />
                  </th>
                  <th className={`${thClass} text-center`} onClick={() => toggleSort('impressions')}>
                    IMP <SortIcon k="impressions" />
                  </th>
                  <th className={`${thClass} text-center`} onClick={() => toggleSort('clicks')}>
                    CL <SortIcon k="clicks" />
                  </th>
                  <th className={`${thClass} text-center`}>CTR</th>
                  <th className={`${thClass} text-center`}>状態</th>
                  <th className="py-3 pl-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <AdvertiserRow key={row._id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
