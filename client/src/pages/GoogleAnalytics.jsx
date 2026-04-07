import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { formatNumber } from '../lib/utils'
import { PageHeader, StatCard, Card, Button, Input } from '../components/UI'
import {
  BarChart3, Users, Eye, Link, Unlink, RefreshCw, Settings, Globe,
  AlertCircle, CheckCircle, ChevronDown, ExternalLink,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import toast from 'react-hot-toast'

const DATE_RANGES = [
  { value: '7daysAgo', label: '7日間' },
  { value: '28daysAgo', label: '28日間' },
  { value: '90daysAgo', label: '90日間' },
]

// Merge daily arrays from multiple sites by date
function mergeDailyData(sites) {
  const map = {}
  for (const site of sites) {
    for (const d of site.dailyData || []) {
      if (!map[d.date]) map[d.date] = { date: d.date, users: 0, pageviews: 0 }
      map[d.date].users += d.users
      map[d.date].pageviews += d.pageviews
    }
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
}

function formatDate(raw) {
  if (!raw || raw.length !== 8) return raw
  return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`
}

const CHART_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#f97316',
]

export default function GoogleAnalytics() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [range, setRange] = useState('28daysAgo')
  const [selectedPropertyId, setSelectedPropertyId] = useState('all')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ mainSitePropertyId: '', mainSiteUrl: '' })
  const [showProperties, setShowProperties] = useState(false)

  // Show toast on redirect from OAuth
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      toast.success('Google Analytics に接続しました')
    } else if (searchParams.get('error')) {
      toast.error('Google Analytics の接続に失敗しました')
    }
  }, [searchParams])

  // Fetch connection status
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['ga-status'],
    queryFn: async () => {
      const res = await api.get('/api/ga/status')
      return res.data
    },
  })

  // Prefill settings form when status loads
  useEffect(() => {
    if (status?.connected) {
      setSettingsForm({
        mainSitePropertyId: status.mainSitePropertyId || '',
        mainSiteUrl: status.mainSiteUrl || '',
      })
    }
  }, [status])

  // Fetch GA data
  const { data: gaData, isLoading: dataLoading, refetch: refetchData } = useQuery({
    queryKey: ['ga-data', range, selectedPropertyId],
    queryFn: async () => {
      const params = { startDate: range, endDate: 'today' }
      if (selectedPropertyId !== 'all') params.propertyId = selectedPropertyId
      const res = await api.get('/api/ga/data', { params })
      return res.data
    },
    enabled: !!status?.connected,
  })

  // Fetch available GA properties
  const { data: propertiesData, isLoading: propertiesLoading } = useQuery({
    queryKey: ['ga-properties'],
    queryFn: async () => {
      const res = await api.get('/api/ga/properties')
      return res.data
    },
    enabled: !!status?.connected && showProperties,
  })

  // Start OAuth
  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get('/api/ga/auth')
      return res.data
    },
    onSuccess: (data) => {
      window.location.href = data.url
    },
    onError: () => toast.error('接続の開始に失敗しました'),
  })

  // Disconnect GA
  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/api/ga/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries(['ga-status'])
      queryClient.invalidateQueries(['ga-data'])
      toast.success('Google Analytics の接続を解除しました')
    },
    onError: () => toast.error('接続解除に失敗しました'),
  })

  // Save settings
  const settingsMutation = useMutation({
    mutationFn: (data) => api.put('/api/ga/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['ga-status'])
      queryClient.invalidateQueries(['ga-data'])
      setShowSettings(false)
      toast.success('設定を保存しました')
    },
    onError: () => toast.error('設定の保存に失敗しました'),
  })

  const sites = gaData?.sites || []
  const totals = gaData?.totals || { users: 0, pageviews: 0 }

  // Chart data: merged across all sites, or single site daily
  const chartData = selectedPropertyId === 'all'
    ? mergeDailyData(sites).map((d) => ({ ...d, date: formatDate(d.date) }))
    : (sites.find((s) => s.propertyId === selectedPropertyId)?.dailyData || [])
        .map((d) => ({ ...d, date: formatDate(d.date) }))

  // Per-site breakdown chart (bar chart)
  const siteBreakdown = sites.map((s) => ({
    name: s.name || s.domain || s.propertyId,
    users: s.totalUsers,
    pageviews: s.totalPageviews,
  }))

  if (statusLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Google Analytics" subtitle="サイトのユーザー数とページビュー">
        <div className="flex items-center gap-3">
          {status?.connected && (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
                <CheckCircle size={12} />
                {status.connectedEmail}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchData()}
                disabled={dataLoading}
              >
                <RefreshCw size={14} className={dataLoading ? 'animate-spin' : ''} />
                更新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings size={14} />
                設定
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unlink size={14} />
                切断
              </Button>
            </>
          )}
          {!status?.connected && (
            <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
              <Link size={16} />
              {connectMutation.isPending ? '接続中...' : 'Google Analytics に接続'}
            </Button>
          )}
        </div>
      </PageHeader>

      {/* Not connected state */}
      {!status?.connected && (
        <Card className="flex flex-col items-center gap-6 py-16">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 p-6">
            <BarChart3 size={48} className="text-orange-400" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">Google Analytics 未接続</h2>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              Google Analytics に接続すると、あなたのサイトとパートナーサイトの
              ユーザー数・ページビューをここで確認できます。
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-300 max-w-lg">
            <p className="font-semibold mb-1 flex items-center gap-1"><AlertCircle size={12} /> セットアップ手順</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>「Google Analytics に接続」をクリックしてアカウントを認証してください</li>
              <li>認証後、各パートナーの GA4 プロパティ ID を「パートナー一覧」で設定してください</li>
              <li>メインサイトの GA4 プロパティ ID を「設定」から設定してください</li>
            </ol>
          </div>
          <Button size="lg" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
            <Link size={18} />
            {connectMutation.isPending ? '接続中...' : 'Google Analytics に接続する'}
          </Button>
        </Card>
      )}

      {/* Settings panel */}
      {status?.connected && showSettings && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-300">メインサイト設定</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="メインサイト URL"
              value={settingsForm.mainSiteUrl}
              onChange={(e) => setSettingsForm((p) => ({ ...p, mainSiteUrl: e.target.value }))}
              placeholder="rakuado.net"
            />
            <div className="space-y-1.5">
              <Input
                label="GA4 プロパティ ID (例: properties/123456789)"
                value={settingsForm.mainSitePropertyId}
                onChange={(e) => setSettingsForm((p) => ({ ...p, mainSitePropertyId: e.target.value }))}
                placeholder="properties/XXXXXXXXX"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowProperties(!showProperties)}
              className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300"
            >
              <ChevronDown size={14} className={showProperties ? 'rotate-180 transition-transform' : 'transition-transform'} />
              利用可能なプロパティを表示
            </button>
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={() => setShowSettings(false)}>キャンセル</Button>
              <Button
                size="sm"
                onClick={() => settingsMutation.mutate(settingsForm)}
                disabled={settingsMutation.isPending}
              >
                {settingsMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>

          {/* Available properties dropdown */}
          {showProperties && (
            <div className="mt-4 rounded-xl border border-slate-700 overflow-hidden">
              {propertiesLoading ? (
                <div className="p-4 text-center text-sm text-slate-500">読み込み中...</div>
              ) : (propertiesData?.properties || []).length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">プロパティが見つかりません</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/80">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">アカウント</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">プロパティ名</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">プロパティ ID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {(propertiesData?.properties || []).map((prop) => (
                      <tr key={prop.propertyId} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2 text-slate-400">{prop.accountName}</td>
                        <td className="px-4 py-2 text-white">{prop.displayName}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-300">{prop.propertyId}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            className="text-xs text-violet-400 hover:text-violet-300"
                            onClick={() => setSettingsForm((p) => ({ ...p, mainSitePropertyId: prop.propertyId }))}
                          >
                            使用する
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Connected: Analytics Dashboard */}
      {status?.connected && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date range tabs */}
            <div className="flex rounded-xl border border-slate-700 overflow-hidden">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    range === r.value
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Site selector */}
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2 text-sm text-white outline-none focus:border-violet-500"
            >
              <option value="all">全サイト</option>
              {sites.map((s) => (
                <option key={s.propertyId} value={s.propertyId}>
                  {s.name || s.domain} ({s.type === 'main' ? 'メイン' : 'パートナー'})
                </option>
              ))}
            </select>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="ユニークユーザー（合計）"
              value={dataLoading ? '—' : formatNumber(
                selectedPropertyId === 'all'
                  ? totals.users
                  : (sites.find((s) => s.propertyId === selectedPropertyId)?.totalUsers ?? 0)
              )}
              icon={Users}
              color="violet"
            />
            <StatCard
              title="ページビュー（合計）"
              value={dataLoading ? '—' : formatNumber(
                selectedPropertyId === 'all'
                  ? totals.pageviews
                  : (sites.find((s) => s.propertyId === selectedPropertyId)?.totalPageviews ?? 0)
              )}
              icon={Eye}
              color="blue"
            />
            <StatCard
              title="連携サイト数"
              value={sites.length}
              icon={Globe}
              color="green"
            />
            <StatCard
              title="期間"
              value={DATE_RANGES.find((r) => r.value === range)?.label || ''}
              icon={BarChart3}
              color="amber"
            />
          </div>

          {dataLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
            </div>
          ) : sites.length === 0 ? (
            <Card className="flex flex-col items-center gap-4 py-12">
              <AlertCircle size={32} className="text-amber-400" />
              <p className="text-slate-400 text-sm text-center">
                連携されたサイトがありません。メインサイトの GA4 プロパティ ID を設定するか、
                パートナーに GA4 プロパティ ID を設定してください。
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                <Settings size={14} /> 設定を開く
              </Button>
            </Card>
          ) : (
            <>
              {/* Combined trend chart */}
              <Card>
                <h3 className="mb-4 text-sm font-semibold text-slate-300">
                  {selectedPropertyId === 'all' ? '全サイト合算トレンド' : (sites.find((s) => s.propertyId === selectedPropertyId)?.name || 'サイトトレンド')}
                </h3>
                {chartData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">データがありません</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="users" name="ユーザー" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="pageviews" name="PV" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {/* Per-site breakdown (only shown in "all" mode when > 1 site) */}
              {selectedPropertyId === 'all' && sites.length > 1 && (
                <Card>
                  <h3 className="mb-4 text-sm font-semibold text-slate-300">サイト別集計</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={siteBreakdown} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="users" name="ユーザー" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pageviews" name="PV" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Detailed table */}
              <Card>
                <h3 className="mb-4 text-sm font-semibold text-slate-300">サイト別詳細</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="pb-3 text-left text-xs font-medium text-slate-400">サイト</th>
                        <th className="pb-3 text-left text-xs font-medium text-slate-400">種別</th>
                        <th className="pb-3 text-right text-xs font-medium text-slate-400">ユーザー数</th>
                        <th className="pb-3 text-right text-xs font-medium text-slate-400">ページビュー</th>
                        <th className="pb-3 text-right text-xs font-medium text-slate-400">PV/User</th>
                        <th className="pb-3 text-left text-xs font-medium text-slate-400">ステータス</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {sites
                        .filter((s) => selectedPropertyId === 'all' || s.propertyId === selectedPropertyId)
                        .map((site, i) => {
                          const ratio = site.totalUsers > 0
                            ? (site.totalPageviews / site.totalUsers).toFixed(1)
                            : '—'
                          return (
                            <tr key={site.propertyId} className="hover:bg-slate-800/40">
                              <td className="py-3 pr-4">
                                <div className="font-medium text-white">{site.name || site.domain}</div>
                                {site.domain && (
                                  <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <Globe size={10} />
                                    {site.domain}
                                  </div>
                                )}
                                <div className="font-mono text-xs text-slate-600">{site.propertyId}</div>
                              </td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  site.type === 'main'
                                    ? 'bg-violet-500/20 text-violet-400'
                                    : 'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {site.type === 'main' ? 'メイン' : 'パートナー'}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-right font-medium text-white">
                                {formatNumber(site.totalUsers)}
                              </td>
                              <td className="py-3 pr-4 text-right font-medium text-white">
                                {formatNumber(site.totalPageviews)}
                              </td>
                              <td className="py-3 pr-4 text-right text-slate-300">{ratio}</td>
                              <td className="py-3">
                                {site.error ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                                    <AlertCircle size={10} /> エラー
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                                    <CheckCircle size={10} /> 正常
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                    {/* Totals row */}
                    {selectedPropertyId === 'all' && sites.length > 1 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-600">
                          <td className="pt-3 font-semibold text-white" colSpan={2}>合計</td>
                          <td className="pt-3 text-right font-bold text-violet-400">{formatNumber(totals.users)}</td>
                          <td className="pt-3 text-right font-bold text-cyan-400">{formatNumber(totals.pageviews)}</td>
                          <td className="pt-3 text-right text-slate-400">
                            {totals.users > 0 ? (totals.pageviews / totals.users).toFixed(1) : '—'}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
