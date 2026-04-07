import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { formatCurrency } from '../lib/utils'
import { PageHeader, Card, Badge, Button, Input, EmptyState } from '../components/UI'
import Modal from '../components/Modal'
import { Users, Plus, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const statusColors = {
  active: 'success',
  stopped: 'danger',
  paused: 'warning',
  pending: 'info',
}

const emptyPartner = {
  domain: '', name: '', nameKatakana: '', monthlyAmount: 0,
  status: 'active', paymentCycle: 'monthly', startDate: '', endDate: '',
  email: '', phone: '', address: '',
  bankName: '', bankBranch: '', accountType: '', accountNumber: '', accountHolder: '',
  notes: '',
  gaPropertyId: '',
}

export default function PartnerList() {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyPartner)
  const [editing, setEditing] = useState(null)
  const queryClient = useQueryClient()

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ['partners'],
    queryFn: async () => {
      const res = await api.get('/api/partners')
      return res.data?.partners || res.data || []
    },
  })

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editing
        ? api.put(`/api/partners/${editing}`, data)
        : api.post('/api/partners', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['partners'])
      setModalOpen(false)
      toast.success(editing ? '更新しました' : '作成しました')
    },
    onError: () => toast.error('保存に失敗しました'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/partners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['partners'])
      toast.success('削除しました')
    },
  })

  const openCreate = () => {
    setForm(emptyPartner)
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (p) => {
    setForm({ ...emptyPartner, ...p })
    setEditing(p._id)
    setModalOpen(true)
  }

  const handleDelete = (id) => {
    if (window.confirm('本当に削除しますか？')) {
      deleteMutation.mutate(id)
    }
  }

  const handleSave = (e) => {
    e.preventDefault()
    saveMutation.mutate(form)
  }

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="space-y-6">
      <PageHeader title="パートナー一覧" subtitle={`合計 ${partners.length} パートナー`}>
        <Button onClick={openCreate}><Plus size={16} /> 新規パートナー</Button>
      </PageHeader>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
        </div>
      ) : partners.length === 0 ? (
        <EmptyState title="パートナーがいません" icon={Users} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {partners.map((p) => (
            <Card key={p._id} className="relative group">
              <div className="absolute right-4 top-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(p._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                  {(p.name || '?')[0]}
                </div>
                <div>
                  <h3 className="font-medium text-white">{p.name}</h3>
                  {p.nameKatakana && <p className="text-xs text-slate-500">{p.nameKatakana}</p>}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">ドメイン</span>
                  <span className="text-slate-300">{p.domain || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">月額</span>
                  <span className="text-white font-medium">{formatCurrency(p.monthlyAmount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ステータス</span>
                  <Badge variant={statusColors[p.status] || 'default'}>{p.status || 'active'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">支払いサイクル</span>
                  <span className="text-slate-300">{p.paymentCycle || 'monthly'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">GA連携</span>
                  {p.gaPropertyId
                    ? <Badge variant="success">連携済み</Badge>
                    : <Badge variant="default">未設定</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'パートナー編集' : '新規パートナー'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">基本情報</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="ドメイン" value={form.domain} onChange={(e) => updateField('domain', e.target.value)} />
              <Input label="名前" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
              <Input label="カタカナ" value={form.nameKatakana} onChange={(e) => updateField('nameKatakana', e.target.value)} />
              <Input label="月額" type="number" value={form.monthlyAmount} onChange={(e) => updateField('monthlyAmount', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">契約情報</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">ステータス</label>
                <select
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
                >
                  <option value="active">Active</option>
                  <option value="stopped">Stopped</option>
                  <option value="paused">Paused</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">支払いサイクル</label>
                <select
                  value={form.paymentCycle}
                  onChange={(e) => updateField('paymentCycle', e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <Input label="開始日" type="date" value={form.startDate?.split('T')[0] || ''} onChange={(e) => updateField('startDate', e.target.value)} />
              <Input label="終了日" type="date" value={form.endDate?.split('T')[0] || ''} onChange={(e) => updateField('endDate', e.target.value)} />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">連絡先</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="メール" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
              <Input label="電話" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">銀行情報</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="銀行名" value={form.bankName} onChange={(e) => updateField('bankName', e.target.value)} />
              <Input label="支店" value={form.bankBranch} onChange={(e) => updateField('bankBranch', e.target.value)} />
              <Input label="口座番号" value={form.accountNumber} onChange={(e) => updateField('accountNumber', e.target.value)} />
              <Input label="口座名義" value={form.accountHolder} onChange={(e) => updateField('accountHolder', e.target.value)} />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Google Analytics</h3>
            <Input
              label="GA4 プロパティ ID (例: properties/123456789)"
              value={form.gaPropertyId || ''}
              onChange={(e) => updateField('gaPropertyId', e.target.value)}
              placeholder="properties/XXXXXXXXX"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">メモ</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
