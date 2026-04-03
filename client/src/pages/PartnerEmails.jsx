import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { formatCurrency } from '../lib/utils'
import { PageHeader, Card, Badge, Button, Tabs, StatCard } from '../components/UI'
import Modal from '../components/Modal'
import { Mail, FileText, Send, AlertCircle, CheckCircle, Clock, SendHorizonal } from 'lucide-react'
import toast from 'react-hot-toast'

const statusColors = {
  draft: 'warning', sent: 'success', no_data: 'default', error: 'danger',
}
const statusLabels = {
  draft: '下書き', sent: '送信済み', no_data: 'データなし', error: 'エラー',
}
const filterTabs = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'sent', label: '送信済み' },
  { value: 'no_data', label: 'データなし' },
  { value: 'error', label: 'エラー' },
]

export default function PartnerEmails() {
  const [period, setPeriod] = useState('current')
  const [filter, setFilter] = useState('all')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState(null)
  const [testEmailOpen, setTestEmailOpen] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['partner-emails', period],
    queryFn: async () => {
      const res = await api.get('/api/partners/emails/drafts', { params: { period } })
      return res.data
    },
  })

  const generateMutation = useMutation({
    mutationFn: () => api.post('/api/partners/emails/generate', { period }),
    onSuccess: () => {
      queryClient.invalidateQueries(['partner-emails'])
      toast.success('下書きを生成しました')
    },
    onError: () => toast.error('生成に失敗しました'),
  })

  const drafts = data?.drafts || []
  const filtered = filter === 'all' ? drafts : drafts.filter((d) => d.status === filter)

  const counts = {
    draft: drafts.filter((d) => d.status === 'draft').length,
    sent: drafts.filter((d) => d.status === 'sent').length,
    no_data: drafts.filter((d) => d.status === 'no_data').length,
    error: drafts.filter((d) => d.status === 'error').length,
  }

  const openPreview = (draft) => {
    setSelectedDraft(draft)
    setPreviewOpen(true)
  }

  const openEdit = (draft) => {
    setSelectedDraft({ ...draft })
    setEditOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="パートナーメール管理" subtitle="支払い通知メールの管理">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            tabs={[
              { value: 'current', label: '今月' },
              { value: 'previous', label: '先月' },
            ]}
            active={period}
            onChange={setPeriod}
          />
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <FileText size={16} />
            {generateMutation.isPending ? '生成中...' : '下書き生成'}
          </Button>
          <Button variant="secondary" onClick={() => setTestEmailOpen(true)}>
            テストメール
          </Button>
        </div>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="下書き" value={counts.draft} icon={FileText} color="amber" />
        <StatCard title="送信済み" value={counts.sent} icon={CheckCircle} color="green" />
        <StatCard title="データなし" value={counts.no_data} icon={AlertCircle} color="blue" />
        <StatCard title="エラー" value={counts.error} icon={AlertCircle} color="red" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === t.value ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Email Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">パートナー名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ドメイン</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">メール</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">稼働日数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">支払金額</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ステータス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {filtered.map((d) => (
                  <tr key={d._id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-medium">{d.partnerName || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{d.domain || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{d.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{d.operatingDays || 0}日</td>
                    <td className="px-4 py-3 text-white font-medium">{formatCurrency(d.paymentAmount || 0)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusColors[d.status] || 'default'}>
                        {statusLabels[d.status] || d.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openPreview(d)}>プレビュー</Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>編集</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">データがありません</div>
            )}
          </div>
        )}
      </Card>

      {/* Preview Modal */}
      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title="メールプレビュー" size="lg">
        {selectedDraft && (
          <div className="rounded-lg bg-white p-4" dangerouslySetInnerHTML={{ __html: selectedDraft.htmlContent || '<p>プレビューなし</p>' }} />
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="下書き編集" size="md">
        {selectedDraft && (
          <div className="space-y-4">
            <div><label className="text-sm text-slate-400">パートナー名</label><p className="text-white">{selectedDraft.partnerName}</p></div>
            <div>
              <label className="mb-1.5 block text-sm text-slate-300">休止日数</label>
              <input
                type="number"
                value={selectedDraft.inactiveDays || 0}
                onChange={(e) => setSelectedDraft((prev) => ({ ...prev, inactiveDays: Number(e.target.value) }))}
                className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Test Email Modal */}
      <Modal
        isOpen={testEmailOpen}
        onClose={() => setTestEmailOpen(false)}
        title="テストメール送信"
        size="sm"
        footer={
          <Button onClick={() => { setTestEmailOpen(false); toast.success('テストメールを送信しました') }}>
            <Send size={16} /> 送信
          </Button>
        }
      >
        <div>
          <label className="mb-1.5 block text-sm text-slate-300">送信先メールアドレス</label>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
            placeholder="test@example.com"
          />
        </div>
      </Modal>
    </div>
  )
}
