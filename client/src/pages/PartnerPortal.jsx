import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { formatNumber, formatCurrency } from '../lib/utils'
import { PageHeader, StatCard, Card, Button, Input, Tabs } from '../components/UI'
import {
  FileText, BarChart3, DollarSign, CheckCircle, Clock, XCircle,
  AlertCircle, Send, Eye, MousePointerClick, TrendingUp, Code, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// ─── Step definitions for the progress indicator ────────────────────────────
const STEPS = [
  { key: 'submitted', label: '申請提出' },
  { key: 'analytics_requested', label: 'GA提出' },
  { key: 'reviewing', label: '審査中' },
  { key: 'approved', label: '承認済み' },
  { key: 'snippet_sent', label: 'スニペット送付' },
  { key: 'snippet_verified', label: '設置確認済み' },
]
const STEP_ORDER = STEPS.map((s) => s.key)

// ─── Step progress bar ───────────────────────────────────────────────────────
function StepIndicator({ currentStep, status }) {
  const currentIdx = STEP_ORDER.indexOf(currentStep)
  const isRejected = status === 'rejected'

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-start">
        {STEPS.map((step, idx) => {
          const isDone = !isRejected && idx < currentIdx
          const isCurrent = !isRejected && idx === currentIdx

          return (
            <div key={step.key} className="flex flex-1 flex-col items-center min-w-[80px]">
              <div className="relative flex w-full items-center">
                {idx > 0 && (
                  <div className={`flex-1 h-0.5 ${isDone ? 'bg-violet-500' : 'bg-slate-700'}`} />
                )}
                <div
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isRejected && isCurrent
                      ? 'border-red-500 bg-red-500/20'
                      : isDone
                      ? 'border-violet-500 bg-violet-500'
                      : isCurrent
                      ? 'border-violet-500 bg-violet-500/20'
                      : 'border-slate-600 bg-slate-800'
                  }`}
                >
                  {isRejected && isCurrent ? (
                    <XCircle size={14} className="text-red-400" />
                  ) : isDone ? (
                    <CheckCircle size={14} className="text-white" />
                  ) : isCurrent ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-violet-500 animate-pulse" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-slate-600" />
                  )}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 ${isDone ? 'bg-violet-500' : 'bg-slate-700'}`} />
                )}
              </div>
              <p
                className={`mt-2 text-center text-xs font-medium leading-tight ${
                  isCurrent && !isRejected
                    ? 'text-violet-400'
                    : isDone
                    ? 'text-slate-300'
                    : 'text-slate-500'
                }`}
              >
                {step.label}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Application form (first-time apply) ────────────────────────────────────
function ApplicationForm({ onSubmit, isLoading }) {
  return (
    <Card>
      <h3 className="mb-1 text-base font-semibold text-white">パートナー申請</h3>
      <p className="mb-6 text-sm text-slate-400">
        ブログの情報を入力して申請を送信してください。審査後にご連絡いたします。
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="ブログURL *"
          name="blogUrl"
          type="url"
          placeholder="https://yourblog.com"
          required
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            メッセージ（任意）
          </label>
          <textarea
            name="message"
            rows={4}
            placeholder="ブログの紹介や PR をご記入ください..."
            className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          <Send size={16} />
          {isLoading ? '送信中...' : '申請を送信'}
        </Button>
      </form>
    </Card>
  )
}

// ─── Google Analytics URL form ───────────────────────────────────────────────
function GAForm({ onSubmit, isLoading, alreadySubmitted }) {
  return (
    <Card className="border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-start gap-3 mb-4">
        <AlertCircle size={20} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-amber-300">
            Googleアナリティクス情報のご提出をお願いします
          </h4>
          <p className="mt-1 text-sm text-slate-400">
            審査を進めるため、ブログのGoogleアナリティクスレポートページのURLを共有してください。
          </p>
        </div>
      </div>
      {alreadySubmitted && (
        <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          ✓ すでにGoogleアナリティクス情報を送信済みです。引き続き審査中をお待ちください。
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="GoogleアナリティクスURL"
          name="googleAnalyticsUrl"
          type="url"
          placeholder="https://analytics.google.com/..."
          required
        />
        <Button type="submit" disabled={isLoading || alreadySubmitted}>
          <Send size={16} />
          {isLoading ? '送信中...' : '送信'}
        </Button>
      </form>
    </Card>
  )
}

// ─── Snippet display card ────────────────────────────────────────────────────
function SnippetCard({ snippetCode }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(snippetCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border border-violet-500/30 bg-violet-500/5">
      <div className="flex items-start gap-3 mb-4">
        <Code size={20} className="text-violet-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-violet-300">スニペットコード</h4>
          <p className="mt-1 text-sm text-slate-400">
            以下のコードをブログの <code className="text-violet-300">&lt;body&gt;</code> タグ内に設置してください。
          </p>
        </div>
      </div>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-300">
          {snippetCode}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
        >
          {copied ? '✓ コピー済み' : 'コピー'}
        </button>
      </div>
    </Card>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PartnerPortal() {
  const [tab, setTab] = useState('application')
  const [analyticsPeriod, setAnalyticsPeriod] = useState('current')
  const queryClient = useQueryClient()

  // ── Data fetching ──
  const { data: portalData, isLoading: portalLoading } = useQuery({
    queryKey: ['partner-portal'],
    queryFn: () => api.get('/api/partner-portal').then((r) => r.data),
  })

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['partner-portal-analytics', analyticsPeriod],
    queryFn: () =>
      api.get('/api/partner-portal/analytics', { params: { period: analyticsPeriod } }).then((r) => r.data),
    enabled: tab === 'analytics' && !!portalData?.request,
  })

  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['partner-portal-earnings'],
    queryFn: () => api.get('/api/partner-portal/earnings').then((r) => r.data),
    enabled: tab === 'earnings' && !!portalData?.request,
  })

  // ── Mutations ──
  const applyMutation = useMutation({
    mutationFn: (data) => api.post('/api/partner-portal/apply', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('申請を送信しました')
      queryClient.invalidateQueries({ queryKey: ['partner-portal'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || '申請に失敗しました'),
  })

  const analyticsUrlMutation = useMutation({
    mutationFn: (data) => api.put('/api/partner-portal/analytics-url', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('送信しました')
      queryClient.invalidateQueries({ queryKey: ['partner-portal'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || '送信に失敗しました'),
  })

  // ── Handlers ──
  const handleApply = (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    applyMutation.mutate({ blogUrl: fd.get('blogUrl'), message: fd.get('message') })
  }

  const handleGASubmit = (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    analyticsUrlMutation.mutate({ googleAnalyticsUrl: fd.get('googleAnalyticsUrl') })
  }

  // ── Derived state ──
  const request = portalData?.request

  const statusLabels = {
    pending: { label: '審査待ち', color: 'amber' },
    analytics_requested: { label: 'アナリティクス確認中', color: 'blue' },
    reviewing: { label: '審査中', color: 'blue' },
    approved: { label: '承認済み', color: 'green' },
    snippet_sent: { label: 'スニペット送付済み', color: 'violet' },
    snippet_verified: { label: '設置確認済み', color: 'green' },
    rejected: { label: '却下', color: 'red' },
  }
  const statusInfo = statusLabels[request?.status] || statusLabels.pending

  const chartData = analyticsData?.data || []
  const totalViews = analyticsData?.totalViews || 0
  const totalClicks = analyticsData?.totalClicks || 0

  if (portalLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="パートナーポータル"
        subtitle="パートナー申請の管理・アナリティクス・収益の確認"
      />

      {/* Current status banner */}
      {request && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-5 py-4">
          <div className="flex-1 min-w-0">
            <span className="text-sm text-slate-400">ステータス: </span>
            <span className={`ml-1 text-sm font-semibold text-${statusInfo.color}-400`}>
              {statusInfo.label}
            </span>
          </div>
          <a
            href={request.blogUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-sm text-slate-500 hover:text-violet-400"
          >
            {request.blogUrl}
            <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Main tabs */}
      <Tabs
        tabs={[
          { value: 'application', label: '申請状況' },
          { value: 'analytics', label: 'アナリティクス' },
          { value: 'earnings', label: '収益' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ─── APPLICATION TAB ───────────────── */}
      {tab === 'application' && (
        <div className="space-y-6">
          {!request ? (
            <ApplicationForm onSubmit={handleApply} isLoading={applyMutation.isPending} />
          ) : (
            <>
              {/* Progress stepper */}
              {request.status !== 'rejected' && (
                <Card>
                  <h3 className="mb-6 text-sm font-semibold text-slate-300">申請の進捗</h3>
                  <StepIndicator currentStep={request.currentStep} status={request.status} />
                </Card>
              )}

              {/* Rejected state */}
              {request.status === 'rejected' && (
                <Card className="border border-red-500/30 bg-red-500/5">
                  <div className="flex items-start gap-3">
                    <XCircle size={20} className="shrink-0 mt-0.5 text-red-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-red-300">申請が却下されました</h4>
                      {request.notes && (
                        <p className="mt-1 text-sm text-slate-400">{request.notes}</p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* GA URL form when requested */}
              {(request.currentStep === 'analytics_requested' ||
                request.status === 'analytics_requested') && (
                <GAForm
                  onSubmit={handleGASubmit}
                  isLoading={analyticsUrlMutation.isPending}
                  alreadySubmitted={request.googleAnalyticsSubmitted}
                />
              )}

              {/* Snippet code when sent */}
              {request.snippetCode && <SnippetCard snippetCode={request.snippetCode} />}

              {/* Snippet verification pending notice */}
              {request.snippetSent && !request.snippetVerified && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Clock size={18} className="shrink-0 mt-0.5 text-amber-400" />
                    <p className="text-sm text-amber-300">
                      スニペットの設置確認中です。ブログに設置後、担当者が確認いたします。
                    </p>
                  </div>
                </div>
              )}

              {/* Application detail card */}
              <Card>
                <h3 className="mb-4 text-sm font-semibold text-slate-300">申請詳細</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-400">ブログURL</dt>
                    <dd>
                      <a
                        href={request.blogUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-violet-400 hover:underline"
                      >
                        {request.blogUrl}
                        <ExternalLink size={12} />
                      </a>
                    </dd>
                  </div>
                  {request.googleAnalyticsUrl && (
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-slate-400">GoogleアナリティクスURL</dt>
                      <dd>
                        <a
                          href={request.googleAnalyticsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-violet-400 hover:underline"
                        >
                          リンクを確認
                          <ExternalLink size={12} />
                        </a>
                      </dd>
                    </div>
                  )}
                  {request.estimatedMonthlyAmount != null && (
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-slate-400">月額報酬（予定）</dt>
                      <dd className="font-semibold text-white">
                        {formatCurrency(request.estimatedMonthlyAmount)}
                      </dd>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-400">申請日</dt>
                    <dd className="text-slate-300">
                      {new Date(request.createdAt).toLocaleDateString('ja-JP')}
                    </dd>
                  </div>
                </dl>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ─── ANALYTICS TAB ──────────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          {!request || (!request.snippetSent && !request.snippetVerified) ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="mb-4 rounded-2xl bg-slate-800 p-4">
                  <BarChart3 size={32} className="text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">
                  スニペットが設置・確認されると、アナリティクスデータが表示されます。
                </p>
              </div>
            </Card>
          ) : (
            <>
              <Tabs
                tabs={[
                  { value: 'current', label: '今月' },
                  { value: 'previous', label: '先月' },
                ]}
                active={analyticsPeriod}
                onChange={setAnalyticsPeriod}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  title="合計閲覧数"
                  value={formatNumber(totalViews)}
                  icon={Eye}
                  color="blue"
                />
                <StatCard
                  title="合計クリック数"
                  value={formatNumber(totalClicks)}
                  icon={MousePointerClick}
                  color="violet"
                />
                <StatCard
                  title="CTR"
                  value={
                    totalViews > 0
                      ? `${((totalClicks / totalViews) * 100).toFixed(1)}%`
                      : '0.0%'
                  }
                  icon={TrendingUp}
                  color="green"
                />
              </div>

              <Card>
                {analyticsLoading ? (
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

              {/* Detailed table */}
              {chartData.length > 0 && (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                            日付
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                            閲覧数
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                            クリック数
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                            CTR
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/30">
                        {chartData.map((row) => (
                          <tr key={row.date} className="hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-slate-300">{row.date}</td>
                            <td className="px-4 py-3 text-slate-300">
                              {formatNumber(row.views)}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {formatNumber(row.clicks)}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {row.views
                                ? `${((row.clicks / row.views) * 100).toFixed(1)}%`
                                : '0.0%'}
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
        </div>
      )}

      {/* ─── EARNINGS TAB ───────────────────── */}
      {tab === 'earnings' && (
        <div className="space-y-6">
          {!request ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="mb-4 rounded-2xl bg-slate-800 p-4">
                  <DollarSign size={32} className="text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">
                  申請を提出すると収益情報が表示されます。
                </p>
              </div>
            </Card>
          ) : !request.estimatedMonthlyAmount ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="mb-4 rounded-2xl bg-slate-800 p-4">
                  <Clock size={32} className="text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">
                  審査完了後に月額報酬が確定し、収益情報が表示されます。
                </p>
              </div>
            </Card>
          ) : earningsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Monthly rate hero */}
              <Card className="border border-violet-500/30">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/20">
                    <DollarSign size={28} className="text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">月額固定報酬</p>
                    <p className="text-3xl font-bold text-white">
                      {formatCurrency(earningsData?.monthlyAmount || 0)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      日額単価: {formatCurrency(earningsData?.currentPeriod?.dailyRate || 0)}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Current period */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
                  今月の期間（{earningsData?.currentPeriod?.start} 〜 {earningsData?.currentPeriod?.end}）
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    title="合計日数"
                    value={`${earningsData?.currentPeriod?.totalDays || 0}日`}
                    icon={FileText}
                    color="blue"
                  />
                  <StatCard
                    title="稼働日数"
                    value={`${earningsData?.currentPeriod?.activeDays || 0}日`}
                    icon={CheckCircle}
                    color="green"
                  />
                  <StatCard
                    title="日額単価"
                    value={formatCurrency(earningsData?.currentPeriod?.dailyRate || 0)}
                    icon={TrendingUp}
                    color="amber"
                  />
                  <StatCard
                    title="見込み収益"
                    value={formatCurrency(earningsData?.currentPeriod?.estimatedEarnings || 0)}
                    icon={DollarSign}
                    color="violet"
                  />
                </div>
              </div>

              {/* Previous period */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
                  先月の期間（{earningsData?.previousPeriod?.start} 〜 {earningsData?.previousPeriod?.end}）
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    title="合計日数"
                    value={`${earningsData?.previousPeriod?.totalDays || 0}日`}
                    icon={FileText}
                    color="blue"
                  />
                  <StatCard
                    title="稼働日数"
                    value={`${earningsData?.previousPeriod?.activeDays || 0}日`}
                    icon={CheckCircle}
                    color="green"
                  />
                  <StatCard
                    title="日額単価"
                    value={formatCurrency(earningsData?.previousPeriod?.dailyRate || 0)}
                    icon={TrendingUp}
                    color="amber"
                  />
                  <StatCard
                    title="確定収益"
                    value={formatCurrency(earningsData?.previousPeriod?.estimatedEarnings || 0)}
                    icon={DollarSign}
                    color="violet"
                  />
                </div>
              </div>

              {!earningsData?.snippetActive && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-400" />
                    <p className="text-sm text-amber-300">
                      スニペットがまだ設置されていないため稼働日数は0日です。
                      スニペットをブログに設置すると収益が計上されます。
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
