import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { formatNumber, formatCurrency } from '../lib/utils'
import { PageHeader, StatCard, Card, Button, Input, Tabs } from '../components/UI'
import {
  FileText, BarChart3, DollarSign, CheckCircle, Clock, XCircle,
  AlertCircle, Send, Eye, MousePointerClick, TrendingUp, Code, ExternalLink,
  Plus, Globe, ChevronLeft, Activity, HelpCircle, Smartphone, Link2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts'

// ─── Step definitions ──────────────────────────────────────────────────────────
const STEPS = [
  { key: 'submitted',             label: '申請提出',         desc: 'ブログを登録して申請を送信した状態です。' },
  { key: 'metrics_snippet_sent',  label: '計測スクリプト',   desc: '管理者からアクセス計測スクリプトが提供されました。スクリプトをサイトに設置してください。' },
  { key: 'analytics_requested',   label: 'GA提出',           desc: 'Googleアナリティクスレポートの提出が求められています。' },
  { key: 'reviewing',             label: '審査中',           desc: '管理者が申請内容を審査しています。' },
  { key: 'approved',              label: '承認済み',         desc: '申請が承認されました。' },
  { key: 'snippet_sent',          label: '広告スクリプト',   desc: 'RakuAdo広告スクリプトが提供されました。サイトに設置してください。' },
  { key: 'snippet_verified',      label: '稼働中',           desc: '広告スクリプトの設置が確認され、パートナーとして稼働中です。' },
]
const STEP_ORDER = STEPS.map((s) => s.key)

const STATUS_LABELS = {
  pending: { label: '審査待ち', color: 'amber' },
  analytics_requested: { label: 'GA確認中', color: 'blue' },
  reviewing: { label: '審査中', color: 'blue' },
  approved: { label: '承認済み', color: 'green' },
  snippet_sent: { label: 'スニペット送付済み', color: 'violet' },
  snippet_verified: { label: '稼働中', color: 'green' },
  rejected: { label: '却下', color: 'red' },
}

function cleanDomain(url) {
  if (!url) return ''
  let domain = url.trim().toLowerCase()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.replace(/^www\./, '')
  domain = domain.replace(/\/$/, '')
  return domain.split('/')[0]
}

// ─── Portal Tooltip ───────────────────────────────────────────────────────────
// Renders into document.body so it's never clipped by overflow:hidden parents.
function TooltipPortal({ anchorRef, text, visible }) {
  const [pos, setPos] = useState({ left: 0, top: 0, arrowLeft: 120 })
  const [ready, setReady] = useState(false)
  const TIP_W = 240

  useEffect(() => {
    if (!visible || !anchorRef.current) { setReady(false); return }

    const rect = anchorRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const GAP = 10

    let left = rect.left + rect.width / 2 - TIP_W / 2
    const rawLeft = left
    if (left < 12) left = 12
    if (left + TIP_W > vw - 12) left = vw - TIP_W - 12

    // Arrow points at the centre of the button regardless of clamping
    const arrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - left, 16), TIP_W - 16)

    setPos({ left, top: rect.top - GAP, arrowLeft })
    // Tiny delay so the element is mounted before we switch opacity to 1
    requestAnimationFrame(() => setReady(true))
  }, [visible, anchorRef])

  if (!visible) return null

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: TIP_W,
        transform: 'translateY(-100%)',
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: ready ? 1 : 0,
        scale: ready ? '1' : '0.94',
        transition: 'opacity 140ms ease, scale 140ms ease',
        paddingBottom: 9,
      }}
    >
      {/* Bubble */}
      <div
        style={{
          background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(139,92,246,0.35)',
          borderRadius: 14,
          padding: '10px 14px',
          fontSize: 12,
          lineHeight: 1.65,
          color: '#e2e8f0',
          boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.1)',
          position: 'relative',
        }}
      >
        {/* Violet left accent bar */}
        <div style={{
          position: 'absolute', left: 0, top: 10, bottom: 10,
          width: 3, borderRadius: 99,
          background: 'linear-gradient(180deg, #8b5cf6, #6366f1)',
        }} />
        <span style={{ paddingLeft: 10, display: 'block' }}>{text}</span>
      </div>

      {/* Arrow — border layer */}
      <div style={{
        position: 'absolute', bottom: 0,
        left: pos.arrowLeft - 7,
        width: 0, height: 0,
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderTop: '9px solid rgba(139,92,246,0.35)',
      }} />
      {/* Arrow — fill layer */}
      <div style={{
        position: 'absolute', bottom: 1,
        left: pos.arrowLeft - 6,
        width: 0, height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: '8px solid #0f172a',
      }} />
    </div>,
    document.body
  )
}

function JTooltip({ text, children }) {
  const [show, setShow] = useState(false)
  const btnRef = useRef(null)
  const open = useCallback(() => setShow(true), [])
  const close = useCallback(() => setShow(false), [])

  return (
    <span className="inline-flex items-center">
      {children}
      <button
        ref={btnRef}
        type="button"
        className="ml-1 shrink-0 text-slate-500 hover:text-violet-400 focus:outline-none transition-colors duration-150"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        aria-label="ヘルプ"
      >
        <HelpCircle size={13} />
      </button>
      <TooltipPortal anchorRef={btnRef} text={text} visible={show} />
    </span>
  )
}

// ─── Info card ────────────────────────────────────────────────────────────────
function InfoCard({ title, children, variant = 'default' }) {
  const styles = {
    default: 'border-slate-700/50',
    blue:    'border-blue-500/30 bg-blue-500/5',
    amber:   'border-amber-500/30 bg-amber-500/5',
    green:   'border-green-500/30 bg-green-500/5',
    violet:  'border-violet-500/30 bg-violet-500/5',
    red:     'border-red-500/30 bg-red-500/5',
  }
  const icons = {
    default: <HelpCircle size={18} className="text-slate-400 shrink-0 mt-0.5" />,
    blue:    <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />,
    amber:   <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />,
    green:   <CheckCircle size={18} className="text-green-400 shrink-0 mt-0.5" />,
    violet:  <Code size={18} className="text-violet-400 shrink-0 mt-0.5" />,
    red:     <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />,
  }
  return (
    <div className={`rounded-xl border p-4 ${styles[variant]}`}>
      <div className="flex items-start gap-3">
        {icons[variant]}
        <div className="flex-1 min-w-0">
          {title && <h4 className="mb-1 text-sm font-semibold text-white">{title}</h4>}
          <div className="text-sm text-slate-300 space-y-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const info = STATUS_LABELS[status] || { label: status, color: 'slate' }
  const colorMap = {
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    green: 'bg-green-500/20 text-green-300 border-green-500/30',
    violet: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    red: 'bg-red-500/20 text-red-300 border-red-500/30',
    slate: 'bg-slate-700 text-slate-300 border-slate-600',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorMap[info.color]}`}>
      {info.label}
    </span>
  )
}

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
                <JTooltip text={step.desc || step.label}>{step.label}</JTooltip>
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
function GAForm({ onSubmit, isLoading, alreadySubmitted, existingUrl }) {
  return (
    <Card className={alreadySubmitted ? 'border border-green-500/30 bg-green-500/5' : 'border border-amber-500/30 bg-amber-500/5'}>
      <div className="flex items-start gap-3 mb-4">
        {alreadySubmitted
          ? <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
          : <AlertCircle size={20} className="text-amber-400 shrink-0 mt-0.5" />
        }
        <div>
          <h4 className={`text-sm font-semibold ${alreadySubmitted ? 'text-green-300' : 'text-amber-300'}`}>
            <JTooltip text="Googleアナリティクスのレポートページ（またはビューURL）を共有してください。管理者がアクセス状況を確認し、報酬額の算定に使用します。計測スクリプトと併用することでより正確な審査が可能です。">
              Googleアナリティクス情報の提出
            </JTooltip>
          </h4>
          <p className="mt-1 text-sm text-slate-400">
            {alreadySubmitted
              ? '送信済みです。内容を更新する場合は下記から再送信できます。'
              : '任意ですが、Googleアナリティクスのレポートを提出いただくと審査がスムーズに進みます。'}
          </p>
        </div>
      </div>

      {alreadySubmitted && existingUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2.5 text-sm">
          <CheckCircle size={14} className="shrink-0 text-green-400" />
          <a href={existingUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-green-400 hover:underline truncate">
            {existingUrl}
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label={alreadySubmitted ? 'URLを更新する' : 'GoogleアナリティクスURL（任意）'}
          name="googleAnalyticsUrl"
          type="url"
          placeholder="https://analytics.google.com/analytics/web/..."
        />
        <Button type="submit" variant={alreadySubmitted ? 'secondary' : 'primary'} disabled={isLoading}>
          <Send size={16} />
          {isLoading ? '送信中...' : alreadySubmitted ? '更新する' : '送信する'}
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

// ─── Metrics Snippet Card ────────────────────────────────────────────────────
function MetricsSnippetCard({ code }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Card className="border border-blue-500/30 bg-blue-500/5">
      <div className="flex items-start gap-3 mb-4">
        <Activity size={20} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-blue-300">
            <JTooltip text="このスクリプトはGoogleアナリティクスなしでもアクセス数・セッション数・流入元などを計測できます。設置後すぐに集計が始まります。">
              アクセス計測スクリプト
            </JTooltip>
          </h4>
          <p className="mt-1 text-sm text-slate-400">
            以下のコードをブログのすべてのページの <code className="text-blue-300">&lt;head&gt;</code> または <code className="text-blue-300">&lt;body&gt;</code> タグ内に設置してください。
          </p>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5">
          <p className="font-semibold text-blue-300 mb-1">📊 計測できること</p>
          <ul className="text-slate-400 space-y-0.5">
            <li>• ページビュー数</li>
            <li>• ユニークセッション</li>
            <li>• 流入元（参照元サイト）</li>
            <li>• デバイス種別</li>
            <li>• 人気ページ TOP10</li>
          </ul>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5">
          <p className="font-semibold text-green-300 mb-1">✅ 設置方法</p>
          <ol className="text-slate-400 space-y-0.5 list-decimal list-inside">
            <li>下のコードをコピー</li>
            <li>全ページの &lt;head&gt; に貼り付け</li>
            <li>サイトを公開・更新</li>
            <li>翌日から数値が反映</li>
          </ol>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5">
          <p className="font-semibold text-amber-300 mb-1">⚠️ 注意事項</p>
          <ul className="text-slate-400 space-y-0.5">
            <li>• 個人情報は収集しません</li>
            <li>• Google Analytics不要</li>
            <li>• 設置確認後に審査が進みます</li>
          </ul>
        </div>
      </div>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-300 whitespace-pre-wrap break-all">
          {code}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
        >
          {copied ? '✓ コピー済み' : 'コピー'}
        </button>
      </div>
    </Card>
  )
}

// ─── Device pie chart ─────────────────────────────────────────────────────────
const PIE_COLORS = ['#667eea', '#10b981']
function DevicePieChart({ mobile, desktop }) {
  const data = [
    { name: 'モバイル', value: mobile || 0 },
    { name: 'デスクトップ', value: desktop || 0 },
  ]
  const total = (mobile || 0) + (desktop || 0)
  if (total === 0) return <p className="text-sm text-slate-500 text-center py-6">データなし</p>
  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={3}>
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex gap-6 text-xs">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#667eea]" />モバイル {Math.round((mobile / total) * 100)}%</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />デスクトップ {Math.round((desktop / total) * 100)}%</span>
      </div>
    </div>
  )
}

// ─── Site card (in the grid list) ────────────────────────────────────────────
function SiteDetail({ site, onBack, queryClient }) {
  const [tab, setTab] = useState('application')
  const [analyticsPeriod, setAnalyticsPeriod] = useState('current')
  const [metricsDays, setMetricsDays] = useState('30')

  const getSnippetMutation = useMutation({
    mutationFn: () =>
      api.post('/api/partner-portal/get-metrics-snippet', { requestId: site._id }).then((r) => r.data),
    onSuccess: () => {
      toast.success('計測スクリプトを取得しました')
      queryClient.invalidateQueries({ queryKey: ['partner-portal'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || '取得に失敗しました'),
  })

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['partner-metrics', site._id, metricsDays],
    queryFn: () =>
      api.get('/api/partner-metrics/data', { params: { requestId: site._id, days: metricsDays } }).then((r) => r.data),
    enabled: tab === 'metrics',
  })

  const analyticsUrlMutation = useMutation({
    mutationFn: (data) => api.put('/api/partner-portal/analytics-url', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('送信しました')
      queryClient.invalidateQueries({ queryKey: ['partner-portal'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || '送信に失敗しました'),
  })

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['partner-portal-analytics', site._id, analyticsPeriod],
    queryFn: () =>
      api
        .get('/api/partner-portal/analytics', { params: { period: analyticsPeriod, requestId: site._id } })
        .then((r) => r.data),
    enabled: tab === 'analytics',
  })

  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['partner-portal-earnings', site._id],
    queryFn: () =>
      api.get('/api/partner-portal/earnings', { params: { requestId: site._id } }).then((r) => r.data),
    enabled: tab === 'earnings',
  })

  const handleGASubmit = (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    analyticsUrlMutation.mutate({ googleAnalyticsUrl: fd.get('googleAnalyticsUrl'), requestId: site._id })
  }

  const statusInfo = STATUS_LABELS[site.status] || STATUS_LABELS.pending
  const chartData = analyticsData?.data || []
  const totalViews = analyticsData?.totalViews || 0
  const totalClicks = analyticsData?.totalClicks || 0

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
        <ChevronLeft size={16} />
        サイト一覧へ戻る
      </button>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-5 py-4">
        <div className="flex-1 min-w-0">
          <span className="text-sm text-slate-400">ステータス: </span>
          <span className={`ml-1 text-sm font-semibold text-${statusInfo.color}-400`}>{statusInfo.label}</span>
        </div>
        <a
          href={site.blogUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 truncate text-sm text-slate-500 hover:text-violet-400"
        >
          {cleanDomain(site.blogUrl)}
          <ExternalLink size={12} />
        </a>
      </div>

      <Tabs
        tabs={[
          { value: 'application', label: '申請状況' },
          { value: 'metrics', label: 'サイト計測' },
          { value: 'analytics', label: '広告分析' },
          { value: 'earnings', label: '収益' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'application' && (
        <div className="space-y-6">
          {site.status !== 'rejected' && (
            <Card>
              <h3 className="mb-6 text-sm font-semibold text-slate-300">申請の進捗</h3>
              <StepIndicator currentStep={site.currentStep} status={site.status} />
            </Card>
          )}

          {site.status === 'rejected' && (
            <Card className="border border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-3">
                <XCircle size={20} className="shrink-0 mt-0.5 text-red-400" />
                <div>
                  <h4 className="text-sm font-semibold text-red-300">申請が却下されました</h4>
                  {site.notes && <p className="mt-1 text-sm text-slate-400">{site.notes}</p>}
                </div>
              </div>
            </Card>
          )}

          {/* Metrics snippet — shown immediately after applying so evaluation can start */}
          {site.metricsSnippetCode && (
            <MetricsSnippetCard code={site.metricsSnippetCode} />
          )}

          {/* GA form — available from the moment of first submission, not just when admin requests it */}
          {site.status !== 'rejected' && site.status !== 'snippet_verified' && (
            <GAForm
              onSubmit={handleGASubmit}
              isLoading={analyticsUrlMutation.isPending}
              alreadySubmitted={site.googleAnalyticsSubmitted}
              existingUrl={site.googleAnalyticsUrl}
            />
          )}

          {site.snippetCode && <SnippetCard snippetCode={site.snippetCode} />}

          {site.snippetSent && !site.snippetVerified && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <Clock size={18} className="shrink-0 mt-0.5 text-amber-400" />
                <p className="text-sm text-amber-300">
                  スニペットの設置確認中です。ブログに設置後、担当者が確認いたします。
                </p>
              </div>
            </div>
          )}

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-slate-300">申請詳細</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-400">ブログURL</dt>
                <dd>
                  <a href={site.blogUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-violet-400 hover:underline">
                    {site.blogUrl}
                    <ExternalLink size={12} />
                  </a>
                </dd>
              </div>
              {site.googleAnalyticsUrl && (
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-400">GoogleアナリティクスURL</dt>
                  <dd>
                    <a href={site.googleAnalyticsUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-violet-400 hover:underline">
                      リンクを確認
                      <ExternalLink size={12} />
                    </a>
                  </dd>
                </div>
              )}
              {site.estimatedMonthlyAmount != null && (
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-400">月額報酬（予定）</dt>
                  <dd className="font-semibold text-white">{formatCurrency(site.estimatedMonthlyAmount)}</dd>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-400">申請日</dt>
                <dd className="text-slate-300">{new Date(site.createdAt).toLocaleDateString('ja-JP')}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {tab === 'metrics' && (
        <div className="space-y-6">
          {/* ── Snippet section ─────────────────────────────────────────── */}
          {site.metricsSnippetCode ? (
            <MetricsSnippetCard code={site.metricsSnippetCode} />
          ) : (
            <Card className="border border-blue-500/30 bg-blue-500/5">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20">
                  <Activity size={28} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <h3 className="text-sm font-semibold text-white">アクセス計測スクリプトを取得する</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Google Analytics なしでもページビュー・セッション・流入元を計測できます。
                    ボタンを押すとスクリプトコードが発行されます。
                  </p>
                </div>
                <Button
                  onClick={() => getSnippetMutation.mutate()}
                  disabled={getSnippetMutation.isPending}
                  className="shrink-0"
                >
                  <Activity size={15} />
                  {getSnippetMutation.isPending ? '生成中...' : 'スクリプトを取得'}
                </Button>
              </div>
            </Card>
          )}

          {/* ── Chart / data section ─────────────────────────────────────── */}
          {site.metricsSnippetCode && (
            metricsLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
              </div>
            ) : !metricsData?.available ? (
              <Card>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 rounded-2xl bg-slate-800 p-4">
                    <BarChart3 size={28} className="text-slate-500" />
                  </div>
                  <h3 className="mb-1 text-sm font-semibold text-slate-300">データ待機中</h3>
                  <p className="text-xs text-slate-500 max-w-xs">
                    スクリプトをサイトに設置後、最初の訪問者が来ると自動でデータが記録されます。
                  </p>
                </div>
              </Card>
            ) : (
              <>
              {/* Day range selector */}
              <div className="flex justify-end gap-2">
                {[['7', '7日'], ['30', '30日'], ['90', '90日']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setMetricsDays(val)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      metricsDays === val ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  title={<JTooltip text="スクリプトが読み込まれた回数です。1人のユーザーが複数ページを閲覧すると複数カウントされます。">ページビュー</JTooltip>}
                  value={formatNumber(metricsData.totalPageviews)}
                  icon={Eye}
                  color="blue"
                />
                <StatCard
                  title={<JTooltip text="一定時間内の連続したページ閲覧をまとめて1セッションとして計測します。ユニーク訪問者の推定値です。">セッション数</JTooltip>}
                  value={formatNumber(metricsData.totalSessions)}
                  icon={Activity}
                  color="violet"
                />
                <StatCard
                  title={<JTooltip text="1セッションあたりの平均ページビュー数です。数値が高いほど回遊率が良いことを示します。">平均PV/セッション</JTooltip>}
                  value={
                    metricsData.totalSessions > 0
                      ? (metricsData.totalPageviews / metricsData.totalSessions).toFixed(1)
                      : '—'
                  }
                  icon={TrendingUp}
                  color="green"
                />
                <StatCard
                  title={<JTooltip text="スマートフォン・タブレットからのアクセス比率です。">モバイル率</JTooltip>}
                  value={
                    (metricsData.devices?.mobile || 0) + (metricsData.devices?.desktop || 0) > 0
                      ? `${Math.round((metricsData.devices.mobile / (metricsData.devices.mobile + metricsData.devices.desktop)) * 100)}%`
                      : '—'
                  }
                  icon={Smartphone}
                  color="amber"
                />
              </div>

              {/* Daily chart */}
              <Card>
                <h3 className="mb-4 text-sm font-semibold text-slate-300">
                  <JTooltip text="日別のページビュー数とセッション数の推移を表示しています。">日別アクセス推移</JTooltip>
                </h3>
                {metricsData.daily.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={metricsData.daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }} />
                      <Legend />
                      <Line type="monotone" dataKey="pageviews" name="ページビュー" stroke="#667eea" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="sessions" name="セッション" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-slate-500 py-12">この期間のデータがありません</p>
                )}
              </Card>

              {/* Top pages + Referrers + Devices */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                  <h3 className="mb-4 text-sm font-semibold text-slate-300">
                    <JTooltip text="最も多く閲覧されたページのパス（URL末尾）ランキングです。">人気ページ TOP10</JTooltip>
                  </h3>
                  {metricsData.topPaths.length > 0 ? (
                    <ol className="space-y-2">
                      {metricsData.topPaths.map(({ path, count }, i) => (
                        <li key={path} className="flex items-center gap-2 text-xs">
                          <span className="w-4 shrink-0 text-slate-500">{i + 1}.</span>
                          <span className="flex-1 truncate text-slate-300" title={path}>{path}</span>
                          <span className="shrink-0 font-semibold text-blue-400">{formatNumber(count)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-xs text-slate-500">データなし</p>}
                </Card>

                <Card className="lg:col-span-1">
                  <h3 className="mb-4 text-sm font-semibold text-slate-300">
                    <JTooltip text="どのサイトからの流入が多いかを示します。ダイレクト流入・ブックマーク・SNSなどからは参照元が記録されない場合があります。">流入元 TOP10</JTooltip>
                  </h3>
                  {metricsData.topReferrers.length > 0 ? (
                    <ol className="space-y-2">
                      {metricsData.topReferrers.map(({ referrer, count }, i) => (
                        <li key={referrer} className="flex items-center gap-2 text-xs">
                          <span className="w-4 shrink-0 text-slate-500">{i + 1}.</span>
                          <span className="flex items-center gap-1 flex-1 truncate text-slate-300" title={referrer}>
                            <Link2 size={10} className="shrink-0 text-slate-500" />
                            {referrer}
                          </span>
                          <span className="shrink-0 font-semibold text-violet-400">{formatNumber(count)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-xs text-slate-500">データなし</p>}
                </Card>

                <Card className="lg:col-span-1">
                  <h3 className="mb-4 text-sm font-semibold text-slate-300">
                    <JTooltip text="モバイル（スマートフォン・タブレット）とデスクトップのアクセス比率です。">デバイス比率</JTooltip>
                  </h3>
                  <DevicePieChart mobile={metricsData.devices?.mobile} desktop={metricsData.devices?.desktop} />
                </Card>
              </div>
            </>
          )
          )}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-6">
          {!site.snippetSent && !site.snippetVerified ? (
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
                tabs={[{ value: 'current', label: '今月' }, { value: 'previous', label: '先月' }]}
                active={analyticsPeriod}
                onChange={setAnalyticsPeriod}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard title="合計閲覧数" value={formatNumber(totalViews)} icon={Eye} color="blue" />
                <StatCard title="合計クリック数" value={formatNumber(totalClicks)} icon={MousePointerClick} color="violet" />
                <StatCard
                  title="CTR"
                  value={totalViews > 0 ? `${((totalClicks / totalViews) * 100).toFixed(1)}%` : '0.0%'}
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
                      <Line type="monotone" dataKey="views" name="閲覧数" stroke="#667eea" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="clicks" name="クリック数" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                    データがありません
                  </div>
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
                              {row.views ? `${((row.clicks / row.views) * 100).toFixed(1)}%` : '0.0%'}
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

      {tab === 'earnings' && (
        <div className="space-y-6">
          {!site.estimatedMonthlyAmount ? (
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

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
                  今月の期間（{earningsData?.currentPeriod?.start} 〜 {earningsData?.currentPeriod?.end}）
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="合計日数" value={`${earningsData?.currentPeriod?.totalDays || 0}日`} icon={FileText} color="blue" />
                  <StatCard title="稼働日数" value={`${earningsData?.currentPeriod?.activeDays || 0}日`} icon={CheckCircle} color="green" />
                  <StatCard title="日額単価" value={formatCurrency(earningsData?.currentPeriod?.dailyRate || 0)} icon={TrendingUp} color="amber" />
                  <StatCard title="見込み収益" value={formatCurrency(earningsData?.currentPeriod?.estimatedEarnings || 0)} icon={DollarSign} color="violet" />
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
                  先月の期間（{earningsData?.previousPeriod?.start} 〜 {earningsData?.previousPeriod?.end}）
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="合計日数" value={`${earningsData?.previousPeriod?.totalDays || 0}日`} icon={FileText} color="blue" />
                  <StatCard title="稼働日数" value={`${earningsData?.previousPeriod?.activeDays || 0}日`} icon={CheckCircle} color="green" />
                  <StatCard title="日額単価" value={formatCurrency(earningsData?.previousPeriod?.dailyRate || 0)} icon={TrendingUp} color="amber" />
                  <StatCard title="確定収益" value={formatCurrency(earningsData?.previousPeriod?.estimatedEarnings || 0)} icon={DollarSign} color="violet" />
                </div>
              </div>

              {!earningsData?.snippetActive && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-400" />
                    <p className="text-sm text-amber-300">
                      スニペットがまだ設置されていないため稼働日数は0日です。
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

function SiteCard({ site, onClick }) {
  const domain = cleanDomain(site.blogUrl)
  return (
    <button
      onClick={onClick}
      className="group glass-card flex flex-col gap-3 p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-500/10 w-full"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={16} className="shrink-0 text-slate-400" />
          <span className="truncate text-sm font-medium text-slate-200 group-hover:text-white">{domain}</span>
        </div>
        <StatusBadge status={site.status} />
      </div>
      <p className="text-xs text-slate-500">申請日: {new Date(site.createdAt).toLocaleDateString('ja-JP')}</p>
    </button>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PartnerPortal() {
  const [selectedSiteId, setSelectedSiteId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const queryClient = useQueryClient()

  const { data: portalData, isLoading } = useQuery({
    queryKey: ['partner-portal'],
    queryFn: () => api.get('/api/partner-portal').then((r) => r.data),
  })

  const applyMutation = useMutation({
    mutationFn: (data) => api.post('/api/partner-portal/apply', data).then((r) => r.data),
    onSuccess: (data) => {
      toast.success('申請を送信しました')
      queryClient.invalidateQueries({ queryKey: ['partner-portal'] })
      setShowAddForm(false)
      if (data?.request?._id) setSelectedSiteId(data.request._id)
    },
    onError: (err) => toast.error(err.response?.data?.error || '申請に失敗しました'),
  })

  const handleApply = (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    applyMutation.mutate({ blogUrl: fd.get('blogUrl'), message: fd.get('message') })
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
      </div>
    )
  }

  const sites = portalData?.requests || []
  const selectedSite = sites.find((s) => s._id === selectedSiteId) || null

  if (selectedSite) {
    return (
      <div className="space-y-6">
        <PageHeader title="パートナーポータル" subtitle={cleanDomain(selectedSite.blogUrl)} />
        <SiteDetail site={selectedSite} onBack={() => setSelectedSiteId(null)} queryClient={queryClient} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="パートナーポータル" subtitle="登録サイトの管理・申請・収益確認">
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus size={16} />
            サイトを追加
          </Button>
        )}
      </PageHeader>

      {showAddForm && (
        <ApplicationForm onSubmit={handleApply} isLoading={applyMutation.isPending} onCancel={() => setShowAddForm(false)} />
      )}

      {sites.length === 0 && !showAddForm ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-2xl bg-slate-800 p-5"><Globe size={36} className="text-slate-500" /></div>
            <h3 className="mb-2 text-base font-semibold text-slate-200">まだサイトが登録されていません</h3>
            <p className="mb-6 text-sm text-slate-400 max-w-sm">
              パートナーとして参加するには、ブログを登録して申請を送信してください。審査後にスニペットコードを提供いたします。
            </p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              最初のサイトを登録する
            </Button>
          </div>
        </Card>
      ) : sites.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <SiteCard key={site._id} site={site} onClick={() => setSelectedSiteId(site._id)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

