import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, EmptyState } from '../components/UI'
import Modal from '../components/Modal'
import { UserPlus, Search, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

const statusMap = {
  pending: { label: '審査中', variant: 'warning' },
  analytics_requested: { label: 'Analytics依頼中', variant: 'info' },
  reviewing: { label: 'レビュー中', variant: 'purple' },
  approved: { label: '承認済み', variant: 'success' },
  rejected: { label: '却下', variant: 'danger' },
  snippet_sent: { label: 'スニペット送付済', variant: 'info' },
  snippet_verified: { label: 'スニペット確認済', variant: 'success' },
}

const filters = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '審査中' },
  { value: 'analytics_requested', label: 'Analytics依頼' },
  { value: 'reviewing', label: 'レビュー中' },
  { value: 'approved', label: '承認済み' },
  { value: 'rejected', label: '却下' },
]

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
    mutationFn: ({ id, action }) => api.post(`/api/partner-recruitment/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['partner-recruitment'])
      toast.success('操作が完了しました')
      setDetailOpen(false)
    },
    onError: () => toast.error('操作に失敗しました'),
  })

  const filtered = requests.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false
    if (search) {
      const s = search.toLowerCase()
      return (r.email || '').toLowerCase().includes(s) || (r.blogUrl || '').toLowerCase().includes(s)
    }
    return true
  })

  const pendingCount = requests.filter((r) => r.status === 'pending').length

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
                  return (
                    <tr key={r._id} className="hover:bg-slate-800/30 cursor-pointer" onClick={() => openDetail(r)}>
                      <td className="px-4 py-3 text-slate-400">{new Date(r.createdAt).toLocaleDateString('ja-JP')}</td>
                      <td className="px-4 py-3 text-slate-300">{r.email}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-blue-400 hover:underline">
                          {r.blogUrl} <ExternalLink size={12} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{r.currentStep || 'submitted'}</td>
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => actionMutation.mutate({ id: selected?._id, action: 'request-analytics' })}>
              Analytics依頼
            </Button>
            <Button variant="outline" size="sm" onClick={() => actionMutation.mutate({ id: selected?._id, action: 'send-snippet' })}>
              スニペット送付
            </Button>
            <Button variant="outline" size="sm" onClick={() => actionMutation.mutate({ id: selected?._id, action: 'verify-snippet' })}>
              スニペット確認
            </Button>
            <Button variant="danger" size="sm" onClick={() => actionMutation.mutate({ id: selected?._id, action: 'reject' })}>
              却下
            </Button>
          </div>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-400">メール:</span> <span className="text-white">{selected.email}</span></div>
              <div><span className="text-slate-400">ブログURL:</span> <span className="text-blue-400">{selected.blogUrl}</span></div>
              <div><span className="text-slate-400">ステータス:</span> <Badge variant={(statusMap[selected.status] || statusMap.pending).variant}>{(statusMap[selected.status] || statusMap.pending).label}</Badge></div>
              <div><span className="text-slate-400">ステップ:</span> <span className="text-white">{selected.currentStep}</span></div>
            </div>
            {selected.message && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-slate-300">メッセージ</h4>
                <p className="rounded-lg bg-slate-800 p-3 text-sm text-slate-300">{selected.message}</p>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">ステータス変更</label>
              <select
                value={selected.status}
                onChange={(e) => {
                  const newVal = e.target.value
                  setSelected((prev) => ({ ...prev, status: newVal }))
                  updateMutation.mutate({ id: selected._id, data: { status: newVal } })
                }}
                className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
              >
                {Object.entries(statusMap).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
