import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { formatNumber } from '../lib/utils'
import { PageHeader, StatCard, Card, Tabs, Button, Badge } from '../components/UI'
import { BarChart3, Eye, MousePointerClick, TrendingUp, ExternalLink, Users, Clock, CheckCircle, XCircle, PlayCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const SITE_COLORS = [
  '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#a78bfa',
]

const CANDIDATE_STATUS_MAP = {
  pending:              { label: '申請済み',         variant: 'warning' },
  analytics_requested:  { label: 'データ収集中',     variant: 'info' },
  data_waiting:         { label: 'データ収集中',     variant: 'info' },
  reviewing:            { label: '審査中',           variant: 'purple' },
  metrics_snippet_sent: { label: 'スクリプト設置済', variant: 'purple' },
}

const CANDIDATE_STEP_LABELS = {
  submitted:            'サイト登録',
  metrics_snippet_sent: 'スクリプト設置',
  analytics_requested:  'データ収集中',
  data_waiting:         'データ収集中',
  reviewing:            '審査中',
}

function hoursLeftFrom(startedAt) {
  if (!startedAt) return null
  const rem = 72 * 60 * 60 * 1000 - (Date.now() - new Date(startedAt).getTime())
  return rem <= 0 ? 0 : Math.ceil(rem / (60 * 60 * 1000))
}

export default function Analytics() {
  const [period, setPeriod] = useState('current')
  const [tab, setTab] = useState('simple')
  const [selectedSite, setSelectedSite] = useState('all')
  const [visibleCount, setVisibleCount] = useState(5)
  const [comparisonMetric, setComparisonMetric] = useState('views')
  const [hiddenSites, setHiddenSites] = useState(new Set())
  const loadMoreRef = useRef(null)
  const queryClient = useQueryClient()

  // Reset infinite scroll count when period changes
  useEffect(() => { setVisibleCount(5) }, [period])

  // ── Queries ──────────────────────────────────────────────
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics', period, selectedSite],
    queryFn: async () => {
      const res = await api.get('/api/analytics/data', { params: { period, site: selectedSite } })
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

  const { data: sitesSummary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['analytics-sites-summary', period],
    queryFn: async () => {
      const res = await api.get('/api/analytics/sites-summary', { params: { period } })
      return res.data
    },
    enabled: tab === 'simple',
  })

  const { data: comparisonData, isLoading: isCompLoading } = useQuery({
    queryKey: ['analytics-comparison', period],
    queryFn: async () => {
      const res = await api.get('/api/analytics/comparison', { params: { period } })
      return res.data
    },
    enabled: tab === 'comparison',
  })

  const { data: candidatesData, isLoading: isCandidatesLoading } = useQuery({
    queryKey: ['analytics-candidate-sites'],
    queryFn: async () => {
      const res = await api.get('/api/analytics/candidate-sites')
      return res.data
    },
    enabled: tab === 'candidates',
  })
  const candidates = candidatesData?.candidates || []

  const candidateActionMutation = useMutation({
    mutationFn: ({ id, action }) => api.post(`/api/partner-recruitment/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['analytics-candidate-sites'])
      toast.success('更新しました')
    },
    onError: () => toast.error('操作に失敗しました'),
  })

  // ── Infinite scroll sentinel ──────────────────────────────
  const summaryList = sitesSummary?.sites || []
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || visibleCount >= summaryList.length) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount((c) => c + 5) },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visibleCount, summaryList.length])

  // ── Derived values (详细 view) ────────────────────────────
  const rawData = analyticsData?.data || []
  const latestDay = [...rawData].reverse().find((d) => (d.views || 0) > 0 || (d.clicks || 0) > 0) || { date: '', views: 0, clicks: 0 }
  const latestViews = latestDay.views || 0
  const latestClicks = latestDay.clicks || 0
  const latestDate = latestDay.date ? latestDay.date.slice(5) : ''
  const periodTotalViews = rawData.reduce((s, d) => s + (d.views || 0), 0)
  const periodTotalClicks = rawData.reduce((s, d) => s + (d.clicks || 0), 0)
  const chartData = rawData.map((d) => ({ date: d.date, views: d.views || 0, clicks: d.clicks || 0 }))
  const ctr = latestViews ? (latestClicks / latestViews * 100).toFixed(1) : '0.0'

  // ── Derived values (comparison view) ─────────────────────
  const compSites = comparisonData?.sites || []
  const compChartData = (comparisonData?.data || []).map((row) => {
    const entry = { date: row.date }
    for (const site of compSites) entry[site] = row[site]?.[comparisonMetric] || 0
    return entry
  })

  const toggleSite = (site) =>
    setHiddenSites((prev) => {
      const next = new Set(prev)
      next.has(site) ? next.delete(site) : next.add(site)
      return next
    })

  // ── Render ────────────────────────────────────────────────
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

      {/* View Tabs + site selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs
          tabs={[
            { value: 'simple', label: 'シンプル' },
            { value: 'detailed', label: '詳細' },
            { value: 'comparison', label: '比較' },
            { value: 'candidates', label: '候補サイト' },
          ]}
          active={tab}
          onChange={setTab}
        />
        {tab === 'detailed' && sites?.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="rounded-xl border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-white"
            >
              <option value="all">全サイト</option>
              {sites.filter((s) => s !== 'all').map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {selectedSite !== 'all' && (
              <a
                href={`https://${selectedSite}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-violet-500 hover:text-violet-400"
                title={`${selectedSite}を新しいタブで開く`}
              >
                <ExternalLink size={14} />
                開く
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── SIMPLE VIEW: infinite scroll per-site cards ─────── */}
      {tab === 'simple' && (
        <div className="space-y-3">
          {isSummaryLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-violet-500" />
            </div>
          ) : summaryList.length === 0 ? (
            <Card>
              <div className="flex h-32 items-center justify-center text-sm text-slate-500">データがありません</div>
            </Card>
          ) : (
            <>
              {summaryList.slice(0, visibleCount).map((site, index) => {
                const maxViews = summaryList[0]?.views || 1
                const barWidth = Math.max(2, Math.round((site.views / maxViews) * 100))
                return (
                  <Card key={site.domain} className="transition-all hover:border-slate-600">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-sm font-bold text-violet-400">
                          #{index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold text-white">{site.domain}</span>
                            <a
                              href={`https://${site.domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-slate-500 transition-colors hover:text-violet-400"
                              title={`${site.domain}を開く`}
                            >
                              <ExternalLink size={13} />
                            </a>
                          </div>
                          <span className="text-xs text-slate-500">CTR {site.ctr}%</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-6 text-right">
                        <div>
                          <div className="text-xs text-slate-500">クリック</div>
                          <div className="font-semibold text-white">{formatNumber(site.clicks)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">閲覧数</div>
                          <div className="text-xl font-bold text-white">{formatNumber(site.views)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-700/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </Card>
                )
              })}
              {/* Infinite scroll sentinel */}
              {visibleCount < summaryList.length && (
                <div ref={loadMoreRef} className="flex h-12 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-violet-500" />
                </div>
              )}
              {visibleCount >= summaryList.length && summaryList.length > 5 && (
                <p className="py-4 text-center text-xs text-slate-600">
                  全 {summaryList.length} サイト表示済み
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── DETAILED VIEW: chart + table ─────────────────────── */}
      {tab === 'detailed' && (
        <>
          <Card>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-violet-500" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="views" name="閲覧数" stroke="#667eea" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="clicks" name="クリック数" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">データがありません</div>
            )}
          </Card>

          {chartData.length > 0 && (
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
        </>
      )}

      {/* ── COMPARISON VIEW: all sites multi-line chart ──────── */}
      {tab === 'comparison' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              tabs={[
                { value: 'views', label: '閲覧数' },
                { value: 'clicks', label: 'クリック数' },
              ]}
              active={comparisonMetric}
              onChange={setComparisonMetric}
            />
            {compSites.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {compSites.map((site, i) => (
                  <button
                    key={site}
                    onClick={() => toggleSite(site)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all"
                    style={{
                      background: hiddenSites.has(site) ? 'rgba(51,65,85,0.5)' : `${SITE_COLORS[i % SITE_COLORS.length]}22`,
                      color: hiddenSites.has(site) ? '#64748b' : SITE_COLORS[i % SITE_COLORS.length],
                      border: `1px solid ${hiddenSites.has(site) ? '#334155' : SITE_COLORS[i % SITE_COLORS.length]}55`,
                    }}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: hiddenSites.has(site) ? '#334155' : SITE_COLORS[i % SITE_COLORS.length] }}
                    />
                    {site}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Card>
            {isCompLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-violet-500" />
              </div>
            ) : compChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={compChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
                  />
                  <Legend />
                  {compSites
                    .filter((s) => !hiddenSites.has(s))
                    .map((site, i) => (
                      <Line
                        key={site}
                        type="monotone"
                        dataKey={site}
                        name={site}
                        stroke={SITE_COLORS[compSites.indexOf(site) % SITE_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">データがありません</div>
            )}
          </Card>

          {/* Summary table for comparison */}
          {compSites.length > 0 && !isCompLoading && (
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-300">期間合計 — サイト別</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">サイト</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">閲覧数合計</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">クリック合計</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {compSites.map((site, i) => {
                      const rows = comparisonData?.data || []
                      const tv = rows.reduce((s, row) => s + (row[site]?.views || 0), 0)
                      const tc = rows.reduce((s, row) => s + (row[site]?.clicks || 0), 0)
                      const ctrVal = tv > 0 ? (tc / tv * 100).toFixed(1) : '0.0'
                      return (
                        <tr key={site} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ background: SITE_COLORS[i % SITE_COLORS.length] }}
                              />
                              <span className="text-slate-300">{site}</span>
                              <a
                                href={`https://${site}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-500 transition-colors hover:text-violet-400"
                              >
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-white">{formatNumber(tv)}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{formatNumber(tc)}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{ctrVal}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── CANDIDATES VIEW: unconfirmed sites with metrics ── */}
      {tab === 'candidates' && (
        <div className="space-y-3">
          {isCandidatesLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-violet-500" />
            </div>
          ) : candidates.length === 0 ? (
            <Card>
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-slate-500">
                <Users size={24} className="text-slate-600" />
                審査待ちの候補サイトはありません
              </div>
            </Card>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                スクリプト設置済みでまだ承認されていないサイト — 過去{candidatesData?.days || 30}日間のデータ
              </p>
              {candidates.map((c) => {
                const statusInfo = CANDIDATE_STATUS_MAP[c.status] || { label: c.status, variant: 'default' }
                const stepLabel = CANDIDATE_STEP_LABELS[c.status] || c.currentStep || '—'
                const hours = c.status === 'data_waiting' ? hoursLeftFrom(c.dataWaitingStartedAt) : null
                const hasData = c.metrics.totalPageviews > 0 || c.metrics.totalSessions > 0
                const maxPV = Math.max(...candidates.map((x) => x.metrics.totalPageviews), 1)
                const barWidth = Math.max(2, Math.round((c.metrics.totalPageviews / maxPV) * 100))

                return (
                  <Card key={c.id} className="transition-all hover:border-slate-600">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* Left: site info */}
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {c.blogUrl ? (
                            <a
                              href={c.blogUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-violet-400 transition-colors hover:text-violet-300"
                            >
                              {c.domain || c.blogUrl}
                              <ExternalLink size={13} />
                            </a>
                          ) : (
                            <span className="font-semibold text-slate-300">—</span>
                          )}
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          {c.email && <span>{c.email}</span>}
                          <span>ステップ: {stepLabel}</span>
                          {hours !== null && hours > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <Clock size={11} />
                              あと{hours}h
                            </span>
                          )}
                          {hours === 0 && (
                            <span className="text-green-400">収集完了</span>
                          )}
                        </div>
                      </div>

                      {/* Right: metrics + actions */}
                      <div className="flex shrink-0 flex-col items-end gap-3">
                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <div className="text-xs text-slate-500">セッション</div>
                            <div className="font-semibold text-white">{formatNumber(c.metrics.totalSessions)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">PV</div>
                            <div className={`text-xl font-bold ${hasData ? 'text-white' : 'text-slate-600'}`}>
                              {formatNumber(c.metrics.totalPageviews)}
                            </div>
                          </div>
                        </div>
                        {/* Admin action buttons */}
                        <div className="flex flex-wrap gap-2">
                          {/* Move to review: for sites in data_waiting / analytics_requested */}
                          {['data_waiting', 'analytics_requested', 'metrics_snippet_sent'].includes(c.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={candidateActionMutation.isPending}
                              onClick={() => candidateActionMutation.mutate({ id: c.id, action: 'move-to-review' })}
                            >
                              <PlayCircle size={13} />
                              審査開始
                            </Button>
                          )}
                          {/* Approve: for sites already in reviewing */}
                          {c.status === 'reviewing' && (
                            <Button
                              size="sm"
                              disabled={candidateActionMutation.isPending}
                              onClick={() => candidateActionMutation.mutate({ id: c.id, action: 'approve' })}
                            >
                              <CheckCircle size={13} />
                              承認する
                            </Button>
                          )}
                          {/* Reject: always available */}
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={candidateActionMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`${c.domain || c.blogUrl} を却下しますか？`)) {
                                candidateActionMutation.mutate({ id: c.id, action: 'reject' })
                              }
                            }}
                          >
                            <XCircle size={13} />
                            却下
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-700/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${hasData ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-slate-700'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    {/* Mini daily sparkline (last 7 days) */}
                    {c.metrics.daily.length > 0 && (
                      <div className="mt-3">
                        <ResponsiveContainer width="100%" height={60}>
                          <LineChart data={c.metrics.daily.slice(-14)}>
                            <Line type="monotone" dataKey="pageviews" name="PV" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                            <Tooltip
                              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: 11 }}
                              formatter={(v) => [formatNumber(v), 'PV']}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </Card>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
