import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { formatCurrency } from '../lib/utils'
import { PageHeader, Card, Badge, Button, Tabs, StatCard } from '../components/UI'
import Modal from '../components/Modal'
import { Mail, FileText, Send, AlertCircle, CheckCircle, Clock, SendHorizonal, PenLine } from 'lucide-react'
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
  const [customEmailOpen, setCustomEmailOpen] = useState(false)
  const [customSubject, setCustomSubject] = useState('')
  const [customBody, setCustomBody] = useState('')
  const [customRecipients, setCustomRecipients] = useState(['all'])
  const [customPreview, setCustomPreview] = useState(false)
  const queryClient = useQueryClient()

  const { data: partnersData } = useQuery({
    queryKey: ['partners-list'],
    queryFn: async () => {
      const res = await api.get('/api/partners')
      return res.data
    },
  })
  const partners = partnersData?.partners || []

  const customEmailMutation = useMutation({
    mutationFn: ({ subject, htmlBody, partnerIds }) =>
      api.post('/api/partners/emails/send-custom', { subject, htmlBody, partnerIds }),
    onSuccess: (res) => {
      const { sent, failed, skipped } = res.data.results
      toast.success(`送信完了: ${sent.length}件送信、${failed.length}件失敗、${skipped.length}件スキップ`)
      setCustomEmailOpen(false)
      setCustomSubject('')
      setCustomBody('')
      setCustomRecipients(['all'])
      setCustomPreview(false)
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'カスタムメールの送信に失敗しました'),
  })

  const handleSendCustomEmail = () => {
    if (!customSubject.trim() || !customBody.trim()) {
      toast.error('件名と本文を入力してください')
      return
    }
    if (customRecipients.length === 0) {
      toast.error('送信先を選択してください')
      return
    }
    const partnerIds = customRecipients.includes('all') ? 'all' : customRecipients
    const label = customRecipients.includes('all') ? 'すべてのパートナー' : `${customRecipients.length}名`
    if (!confirm(`${label}にカスタムメールを送信してもよろしいですか？`)) return
    customEmailMutation.mutate({ subject: customSubject, htmlBody: customBody, partnerIds })
  }

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
          <Button
            className="bg-amber-500 hover:bg-amber-400 text-slate-900"
            onClick={() => {
              setCustomSubject('')
              setCustomBody('')
              setCustomRecipients(['all'])
              setCustomPreview(false)
              setCustomEmailOpen(true)
            }}
          >
            <PenLine size={16} />
            カスタムメール
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
                    <td className="px-4 py-3 text-slate-300">{d.activeDays ?? 0}日</td>
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

      {/* Custom Email Modal */}
      <Modal
        isOpen={customEmailOpen}
        onClose={() => setCustomEmailOpen(false)}
        title="カスタムメール送信 / Send Custom Email"
        size="lg"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setCustomEmailOpen(false)}>キャンセル</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-400 text-slate-900"
              onClick={handleSendCustomEmail}
              disabled={customEmailMutation.isPending}
            >
              <Send size={16} />
              {customEmailMutation.isPending ? '送信中...' : '送信 / Send'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-900/30 border border-blue-700/50 px-4 py-3 text-sm text-blue-300">
            選択したパートナー（またはすべて）に任意の内容でメールを送信します。
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">送信先 / Recipients</label>
            <div className="rounded-xl border border-slate-600 bg-slate-800/50 divide-y divide-slate-700/50 max-h-56 overflow-y-auto">
              {/* All partners row */}
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700/40 transition-colors">
                <input
                  type="checkbox"
                  checked={customRecipients.includes('all')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setCustomRecipients(['all'])
                    } else {
                      setCustomRecipients([])
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-500 accent-violet-500 cursor-pointer"
                />
                <span className="text-sm font-semibold text-amber-400">★ すべてのパートナー / All Partners</span>
              </label>
              {/* Individual partner rows */}
              {partners.map((p) => {
                const checked = customRecipients.includes('all') || customRecipients.includes(p._id)
                return (
                  <label
                    key={p._id}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${p.email ? 'cursor-pointer hover:bg-slate-700/40' : 'opacity-40 cursor-not-allowed'}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!p.email || customRecipients.includes('all')}
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCustomRecipients((prev) => [...prev.filter((x) => x !== 'all'), p._id])
                        } else {
                          setCustomRecipients((prev) => prev.filter((x) => x !== p._id && x !== 'all'))
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-500 accent-violet-500 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{p.name || '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{p.email || 'メールなし'}</p>
                    </div>
                  </label>
                )
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {customRecipients.includes('all')
                ? `すべての有効なパートナーに送信します (${partners.filter((p) => p.email).length}名)`
                : `${customRecipients.length}名 選択中`}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">件名 / Subject</label>
            <input
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="件名を入力してください"
              className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">本文 (HTML可) / Body</label>
            <textarea
              rows={10}
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              placeholder="メール本文を入力してください。HTMLタグ使用可。"
              className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 font-mono"
            />
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={() => setCustomPreview((v) => !v)}>
              {customPreview ? 'プレビューを閉じる' : 'プレビュー / Preview'}
            </Button>
            {customPreview && customBody && (
              <iframe
                key={customBody}
                srcDoc={customBody}
                sandbox="allow-same-origin"
                title="Email Preview"
                className="mt-3 rounded-xl border border-slate-600 w-full bg-white"
                style={{ height: '300px' }}
              />
            )}
          </div>
        </div>
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
