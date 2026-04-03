import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, Input, EmptyState } from '../components/UI'
import Modal from '../components/Modal'
import {
  MailPlus, Plus, Trash2, Pencil, Users, Download, Copy,
  ArrowLeft, Globe, Tag, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function MailingLists() {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedList, setSelectedList] = useState(null)
  const [detailView, setDetailView] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', serviceConfig: {} })
  const [editing, setEditing] = useState(null)
  const queryClient = useQueryClient()

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['mailing-lists'],
    queryFn: async () => {
      const res = await api.get('/api/mailing-lists')
      return res.data?.mailingLists || res.data || []
    },
  })

  const { data: listDetail } = useQuery({
    queryKey: ['mailing-list-detail', selectedList?._id],
    queryFn: async () => {
      const res = await api.get(`/api/mailing-lists/${selectedList._id}`)
      return res.data || {}
    },
    enabled: !!selectedList?._id && detailView,
  })
  const subscribers = listDetail?.subscribers || []

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editing ? api.post(`/api/mailing-lists/${editing}`, data) : api.post('/api/mailing-lists', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['mailing-lists'])
      setModalOpen(false)
      toast.success(editing ? '更新しました' : '作成しました')
    },
    onError: () => toast.error('保存に失敗しました'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/mailing-lists/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['mailing-lists'])
      toast.success('削除しました')
    },
  })

  const welcomeMutation = useMutation({
    mutationFn: (id) => api.post(`/api/mailing-lists/${id}/send-welcome`),
    onSuccess: () => toast.success('ウェルカムメールを送信しました'),
    onError: () => toast.error('送信に失敗しました'),
  })

  const openCreate = () => {
    setForm({ name: '', description: '', serviceConfig: {} })
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (list) => {
    setForm({ name: list.name, description: list.description, serviceConfig: list.serviceConfig || {} })
    setEditing(list._id)
    setModalOpen(true)
  }

  const openDetail = (list) => {
    setSelectedList(list)
    setDetailView(true)
  }

  const copyFormUrl = (list) => {
    const url = `${window.location.origin}/api/mailing-lists/subscribe/${list._id}`
    navigator.clipboard.writeText(url)
    toast.success('フォームURLをコピーしました')
  }

  const exportCsv = () => {
    if (!subscribers.length) return
    const csv = 'Email,Domain,Tags,Subscribed\n' +
      subscribers.map((s) =>
        `${s.email},${s.domain || ''},${(s.tags || []).join(';')},${new Date(s.subscribedAt).toLocaleDateString('ja-JP')}`
      ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedList?.name || 'list'}-subscribers.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (detailView && selectedList) {
    return (
      <div className="space-y-6">
        <PageHeader title={selectedList.name} subtitle={selectedList.description}>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setDetailView(false); setSelectedList(null) }}>
              <ArrowLeft size={16} /> 戻る
            </Button>
            <Button variant="outline" size="sm" onClick={() => welcomeMutation.mutate(selectedList._id)}>
              <Send size={14} /> ウェルカムメール
            </Button>
            <Button variant="outline" size="sm" onClick={() => copyFormUrl(selectedList)}>
              <Copy size={14} /> フォームURL
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download size={14} /> CSV
            </Button>
          </div>
        </PageHeader>

        {/* Domain Summary */}
        {subscribers.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(
              subscribers.reduce((acc, s) => {
                const d = s.domain || 'unknown'
                acc[d] = (acc[d] || 0) + 1
                return acc
              }, {})
            ).map(([domain, count]) => (
              <Card key={domain} className="p-3 text-center">
                <Globe size={16} className="mx-auto mb-1 text-slate-400" />
                <p className="text-xs text-slate-400">{domain}</p>
                <p className="text-lg font-bold text-white">{count}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Subscribers Table */}
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">メール</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ドメイン</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">タグ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">登録日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {subscribers.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white">{s.email}</td>
                    <td className="px-4 py-3 text-slate-300">{s.domain || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(s.tags || []).map((t) => (
                          <Badge key={t} variant="purple">{t}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{new Date(s.subscribedAt).toLocaleDateString('ja-JP')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {subscribers.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">購読者がいません</div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="メーリングリスト" subtitle="メーリングリストの管理">
        <Button onClick={openCreate}><Plus size={16} /> 新規リスト</Button>
      </PageHeader>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <EmptyState title="メーリングリストがありません" icon={MailPlus}>
          <Button onClick={openCreate}><Plus size={16} /> 作成</Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Card
              key={list._id}
              className="group cursor-pointer transition-all hover:scale-[1.01]"
              onClick={() => openDetail(list)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                    <MailPlus size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{list.name}</h3>
                    <p className="text-xs text-slate-500">{list.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(list) }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); window.confirm('削除しますか？') && deleteMutation.mutate(list._id) }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-sm text-slate-400">
                <Users size={14} /> {list.subscriberCount || 0} 購読者
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'リスト編集' : '新規リスト'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>キャンセル</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">リスト名</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">説明</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
