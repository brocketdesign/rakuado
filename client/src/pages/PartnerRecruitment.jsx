import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, EmptyState } from '../components/UI'
import Modal from '../components/Modal'
import { UserPlus, Search, ExternalLink, Activity, Timer, CheckCircle, Code } from 'lucide-react'
import toast from 'react-hot-toast'

// Mirrors the STEPS in PartnerPortal
const STEP_LABELS = {
  submitted:            'サイト登録',
  metrics_snippet_sent: 'スクリプト設置',
  analytics_requested:  'データ収集中',
  data_waiting:         'データ収集中',
  reviewing:            '審査中',
  approved:             '承認済み',
  snippet_sent:         '広告設置',
  snippet_verified:     '稼働中',
  rejected:             '却下',
}

const statusMap = {
  pending:              { label: '申請済み',          variant: 'warning' },
  analytics_requested:  { label: 'データ収集中',      variant: 'info' },
  data_waiting:         { label: 'データ収集中',      variant: 'info' },
  reviewing:            { label: '審査中',            variant: 'purple' },
  approved:             { label: '承認済み',          variant: 'success' },
  rejected:             { label: '却下',              variant: 'danger' },
  snippet_sent:         { label: '広告設置待ち',      variant: 'info' },
  snippet_verified:     { label: '稼働中',            variant: 'success' },
  metrics_snippet_sent: { label: 'スクリプト設置済',  variant: 'purple' },
}

const filters = [
  { value: 'all',              label: 'すべて' },
  { value: 'pending',          label: '申請済み' },
  { value: 'data_waiting',     label: 'データ収集中' },
  { value: 'reviewing',        label: '審査中' },
  { value: 'approved',         label: '承認済み' },
  { value: 'snippet_sent',     label: '広告設置待ち' },
  { value: 'snippet_verified', label: '稼働中' },
  { value: 'rejected',         label: '却下' },
]

// Returns hours remaining in 72h window (or 0 if done)
function hoursLeft(startedAt) {
  if (!startedAt) return null
  const rem = 72 * 60 * 60 * 1000 - (Date.now() - new Date(startedAt).getTime())
  return rem <= 0 ? 0 : Math.ceil(rem / (60 * 60 * 1000))
}

export default function PartnerRecruitment() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['partner-recruitment'],
    queryFn: async () => {
      const res = await api.get('/api/partner-recruitment')
      return res.data?.requests || res.data || []
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/api/partner-recruitment/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['partner-recruitment'])
      toast.success('更新しました')
    },
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }) => api.post(`/api/partner-recruitment/${id}/${action}`).then((r) => r.data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['partner-recruitment'])
      toast.success('操作が完了しました')
      if (variables.action === 'send-metrics-snippet' && data?.metricsSnippetCode) {
        setSelected((prev) => ({ ...prev, metricsSnippetCode: data.metricsSnippetCode, metricsSnippetSent: true }))
      } else {
        setDetailOpen(false)
      }
    },
    onError: () => toast.error('操作に失敗しました'),
  })

  const pendingCount = requests.filter((r) => ['pending', 'data_waiting', 'reviewing'].includes(r.status)).length

  const filtered = requests.filter((r) => {
    if (filter !== 'all') {
      // data_waiting also covers analytics_requested (same logical step)
      if (filter === 'data_waiting') {
        if (!['data_waiting', 'analytics_requested'].includes(r.status)) return false
      } else if (r.status !== filter) return false
    }
    if (search) {
      const s = search.toLowerCase()
      return (r.email || '').toLowerCase().includes(s) || (r.blogUrl || '').toLowerCase().includes(s)
    }
    return true
  })

  const openDetail = async (r) => {
    try {
      const res = await api.get(`/api/partner-recruitment/${r._id}`)
      setSelected(res.data)
      setDetailOpen(true)
    } catch {
      setSelected(r)
      setDetailOpen(true)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="パートナー募集" subtitle={`${pendingCount} 件の申請が審査待ち`} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filter === f.value
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="メール・URLで検索"
            className="rounded-xl border border-slate-600 bg-slate-800/50 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500"
          />
        </div>
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="申請がありません" icon={UserPlus} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">申請日</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">メール</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ブログURL</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ステップ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ステータス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {filtered.map((r) => {
                  const st = statusMap[r.status] || statusMap.pending
                  const stepLabel = STEP_LABELS[r.currentStep] || r.currentStep || 'submitted'
                  const h = hoursLeft(r.dataWaitingStartedAt)
                  return (
                    <tr key={r._id} className="hover:bg-slate-800/30 cursor-pointer" onClick={() => openDetail(r)}>
                      <td className="px-4 py-3 text-slate-400">{new Date(r.createdAt).toLocaleDateString('ja-JP')}</td>
                      <td className="px-4 py-3 text-slate-300">{r.email}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-blue-400 hover:underline">
                          {r.blogUrl} <ExternalLink size={12} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-300">{stepLabel}</span>
                        {(r.currentStep === 'data_waiting' || r.currentStep === 'analytics_requested') && h !== null && (
                          <span className="ml-1.5 text-xs text-amber-400">
                            {h > 0 ? `あと${h}h` : '完了'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(r) }}>
                          詳細
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="申請詳細"
        size="lg"
        footer={
          selected && (
            <div className="flex flex-wrap gap-2">
              {/* Approve — only when reviewing */}
              {selected.currentStep === 'reviewing' && (
                <Button size="sm" disabled={actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ id: selected._id, action: 'approve' })}>
                  <CheckCircle size={14} /> 承認する
                </Button>
              )}
              {/* Send ad snippet — once approved */}
              {selected.status === 'approved' && !selected.snippetSent && (
                <Button variant="outline" size="sm" disabled={actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ id: selected._id, action: 'send-snippet' })}>
                  <Code size={14} /> 広告スニペットを送付
                </Button>
              )}
              {/* Verify ad snippet — once sent */}
              {selected.snippetSent && !selected.snippetVerified && (
                <Button variant="outline" size="sm" disabled={actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ id: selected._id, action: 'verify-snippet' })}>
                  <CheckCircle size={14} /> 広告確認済みにする
                </Button>
              )}
              {/* Reject — not already rejected/verified */}
              {!['rejected', 'snippet_verified'].includes(selected.status) && (
                <Button variant="danger" size="sm" disabled={actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ id: selected._id, action: 'reject' })}>
                  却下
                </Button>
              )}
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-4">

            {/* ── Header info grid ─────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-400">メール:</span> <span className="text-white ml-1">{selected.email}</span></div>
              <div className="break-all"><span className="text-slate-400">ブログURL:</span> <a href={selected.blogUrl} target="_blank" rel="noreferrer" className="text-blue-400 ml-1 hover:underline">{selected.blogUrl}</a></div>
              <div>
                <span className="text-slate-400">ステータス:</span>
                <Badge className="ml-1" variant={(statusMap[selected.status] || statusMap.pending).variant}>
                  {(statusMap[selected.status] || statusMap.pending).label}
                </Badge>
              </div>
              <div>
                <span className="text-slate-400">ステップ:</span>
                <span className="text-white ml-1">{STEP_LABELS[selected.currentStep] || selected.currentStep}</span>
              </div>
            </div>

            {/* ── Timeline indicators ───────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-xs">
              <div className="flex items-center gap-2">
                <Activity size={13} className={selected.metricsSnippetSent ? 'text-green-400' : 'text-slate-500'} />
                <span className="text-slate-400">計測スクリプト:</span>
                <span className={selected.metricsSnippetSent ? 'text-green-400 font-semibold' : 'text-slate-500'}>
                  {selected.metricsSnippetSent ? '設置済み ✓' : '未設置'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Activity size={13} className={selected.metricsScriptVerified ? 'text-green-400' : 'text-slate-500'} />
                <span className="text-slate-400">スクリプト確認:</span>
                <span className={selected.metricsScriptVerified ? 'text-green-400 font-semibold' : 'text-slate-500'}>
                  {selected.metricsScriptVerified ? '検出済み ✓' : '未確認'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Timer size={13} className={(selected.currentStep === 'data_waiting' || selected.currentStep === 'analytics_requested') ? 'text-amber-400' : 'text-slate-500'} />
                <span className="text-slate-400">データ収集:</span>
                <span className="text-slate-300">
                  {selected.dataWaitingStartedAt
                    ? (hoursLeft(selected.dataWaitingStartedAt) > 0
                      ? `あと約 ${hoursLeft(selected.dataWaitingStartedAt)}h`
                      : '収集完了')
                    : '未開始'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Code size={13} className={selected.snippetSent ? 'text-green-400' : 'text-slate-500'} />
                <span className="text-slate-400">広告スニペット:</span>
                <span className={selected.snippetSent ? (selected.snippetVerified ? 'text-green-400 font-semibold' : 'text-amber-400') : 'text-slate-500'}>
                  {selected.snippetVerified ? '確認済み ✓' : selected.snippetSent ? '送付済み（未確認）' : '未送付'}
                </span>
              </div>
            </div>

            {/* ── GA URL if submitted ───────────────────────────────── */}
            {selected.googleAnalyticsUrl && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-slate-300">Google Analytics URL</h4>
                <a href={selected.googleAnalyticsUrl} target="_blank" rel="noreferrer"
                  className="break-all text-sm text-blue-400 hover:underline">
                  {selected.googleAnalyticsUrl}
                </a>
              </div>
            )}

            {/* ── Metrics snippet code ─────────────────────────────── */}
            {selected.metricsSnippetCode && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-300">
                  <Activity size={14} className="text-blue-400" />
                  アクセス計測スクリプト
                </h4>
                <pre className="overflow-x-auto rounded-lg border border-blue-500/30 bg-slate-900 px-3 py-2.5 text-xs text-slate-300 whitespace-pre-wrap break-all">{selected.metricsSnippetCode}</pre>
              </div>
            )}

            {/* ── Message ─────────────────────────────────────────── */}
            {selected.message && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-slate-300">メッセージ</h4>
                <p className="rounded-lg bg-slate-800 p-3 text-sm text-slate-300">{selected.message}</p>
              </div>
            )}

            {/* ── Notes + payment proposal ────────────────────────── */}
            {selected.currentStep === 'reviewing' && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">社内メモ</label>
                  <textarea
                    defaultValue={selected.notes || ''}
                    onBlur={(e) => updateMutation.mutate({ id: selected._id, data: { notes: e.target.value } })}
                    rows={2}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">月額報酬（予定）</label>
                  <input
                    type="number"
                    defaultValue={selected.estimatedMonthlyAmount || ''}
                    onBlur={(e) => updateMutation.mutate({ id: selected._id, data: { estimatedMonthlyAmount: e.target.value, sendPaymentProposal: !!e.target.value } })}
                    placeholder="例：30000"
                    className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
