import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, Input, EmptyState } from '../components/UI'
import Modal from '../components/Modal'
import { Megaphone, Plus, Trash2, GripVertical, Eye, MousePointerClick, ExternalLink, Power, PowerOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Referral() {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ popup: '', imageUrl: '', targetUrl: '', slug: '' })
  const [editing, setEditing] = useState(null)
  const queryClient = useQueryClient()

  const { data: popups = [], isLoading } = useQuery({
    queryKey: ['referral-popups'],
    queryFn: async () => {
      const res = await api.get('/api/referal/list')
      return res.data || []
    },
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: (data) => api.post('/api/referal/save', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['referral-popups'])
      setModalOpen(false)
      toast.success('保存しました')
    },
    onError: () => toast.error('保存に失敗しました'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/referal/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['referral-popups'])
      toast.success('削除しました')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => api.post('/api/referal/toggle', { id, enabled }),
    onSuccess: () => queryClient.invalidateQueries(['referral-popups']),
  })

  const resetMutation = useMutation({
    mutationFn: () => api.post('/api/referal/reset'),
    onSuccess: () => {
      queryClient.invalidateQueries(['referral-popups'])
      toast.success('アナリティクスをリセットしました')
    },
  })

  const openCreate = () => {
    setForm({ popup: '', imageUrl: '', targetUrl: '', slug: '' })
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (p) => {
    setForm({ popup: p.popup || '', imageUrl: p.imageUrl || '', targetUrl: p.targetUrl || '', slug: p.slug || '', _id: p._id })
    setEditing(p._id)
    setModalOpen(true)
  }

  const handleSave = (e) => {
    e.preventDefault()
    saveMutation.mutate(form)
  }

  const getMetrics = (p) => {
    const views = p.refery?.filter((e) => e.action === 'view').reduce((acc, e) => acc + (e.count || 0), 0) || 0
    const clicks = p.refery?.filter((e) => e.action === 'click').reduce((acc, e) => acc + (e.count || 0), 0) || 0
    return { views, clicks }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="リファラル管理" subtitle="ポップアップの管理とアナリティクス">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()}>
            リセット
          </Button>
          <Button onClick={openCreate}><Plus size={16} /> 新規ポップアップ</Button>
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
        </div>
      ) : popups.length === 0 ? (
        <EmptyState title="ポップアップがありません" icon={Megaphone}>
          <Button onClick={openCreate}><Plus size={16} /> 作成</Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {popups.map((p) => {
            const { views, clicks } = getMetrics(p)
            return (
              <Card key={p._id} className="group relative">
                <div className="absolute right-4 top-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleMutation.mutate({ id: p._id, enabled: !p.enabled })}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                  >
                    {p.enabled ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>
                  <button
                    onClick={() => window.confirm('削除しますか？') && deleteMutation.mutate(p._id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {p.imageUrl && (
                  <img src={p.imageUrl} alt="" className="mb-3 w-full rounded-lg object-cover h-32" />
                )}

                <h3
                  className="mb-2 font-medium text-white cursor-pointer hover:text-violet-400"
                  onClick={() => openEdit(p)}
                >
                  {p.popup || 'Untitled'}
                </h3>

                {p.targetUrl && (
                  <a href={p.targetUrl} target="_blank" rel="noopener noreferrer" className="mb-3 flex items-center gap-1 text-xs text-blue-400 hover:underline">
                    {p.targetUrl} <ExternalLink size={10} />
                  </a>
                )}

                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><Eye size={14} /> {views}</span>
                  <span className="flex items-center gap-1"><MousePointerClick size={14} /> {clicks}</span>
                  <Badge variant={p.enabled ? 'success' : 'default'}>
                    {p.enabled ? 'ON' : 'OFF'}
                  </Badge>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'ポップアップ編集' : '新規ポップアップ'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>保存</Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="ポップアップ名" value={form.popup} onChange={(e) => setForm({ ...form, popup: e.target.value })} required />
          <Input label="画像URL" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
          <Input label="ターゲットURL" value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} placeholder="https://..." />
          <Input label="スラッグ" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </form>
      </Modal>
    </div>
  )
}
