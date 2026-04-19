import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Check, X, Users, Megaphone } from 'lucide-react'
import api from '../lib/api'
import { Card, PageHeader, Button, Badge, Table, Tabs } from '../components/UI'
import { formatCurrency, formatDate } from '../lib/utils'

const STATUS_LABELS = {
  draft: { label: '下書き', variant: 'default' },
  pending_review: { label: '審査中', variant: 'warning' },
  active: { label: '配信中', variant: 'success' },
  paused: { label: '一時停止', variant: 'info' },
  ended: { label: '終了', variant: 'default' },
  rejected: { label: '却下', variant: 'danger' },
}

const TYPE_LABELS = {
  banner: 'バナー',
  'in-article': '記事内',
  'product-card': '商品カード',
}

function CampaignTable({ campaigns, onApprove, onReject, approving, rejecting }) {
  const [rejectReason, setRejectReason] = useState({})

  if (!campaigns || campaigns.length === 0) {
    return <div className="p-8 text-center text-slate-400">キャンペーンがありません</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 bg-slate-800/30">
            {['キャンペーン名', '広告主', '種別', 'ステータス', '入札', '日次予算', '表示/クリック', '操作'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const statusInfo = STATUS_LABELS[c.status] || { label: c.status, variant: 'default' }
            return (
              <tr key={c._id} className="border-b border-slate-700/30 hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  <div>{c.advertiser?.companyName || '—'}</div>
                  <div className="text-slate-600">{c.advertiser?.contactName}</div>
                </td>
                <td className="px-4 py-3 text-slate-400">{TYPE_LABELS[c.type] || c.type}</td>
                <td className="px-4 py-3"><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></td>
                <td className="px-4 py-3 text-slate-300">{formatCurrency(c.bidAmount)}/{c.bidType}</td>
                <td className="px-4 py-3 text-slate-300">{formatCurrency(c.dailyBudget)}</td>
                <td className="px-4 py-3 text-slate-400">{c.impressions?.toLocaleString() || 0} / {c.clicks?.toLocaleString() || 0}</td>
                <td className="px-4 py-3">
                  {c.status === 'pending_review' && (
                    <div className="flex flex-col gap-2 min-w-[200px]">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onApprove(c._id)}
                          disabled={approving === c._id}
                        >
                          <Check size={13} />
                          承認
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (!rejectReason[c._id]?.trim()) {
                              toast.error('却下理由を入力してください')
                              return
                            }
                            onReject(c._id, rejectReason[c._id])
                          }}
                          disabled={rejecting === c._id}
                        >
                          <X size={13} />
                          却下
                        </Button>
                      </div>
                      <input
                        className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-2 py-1 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                        placeholder="却下理由（必須）"
                        value={rejectReason[c._id] || ''}
                        onChange={(e) => setRejectReason((r) => ({ ...r, [c._id]: e.target.value }))}
                      />
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function AdManagement() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('pending_review')
  const [approving, setApproving] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['admin-campaigns', tab],
    queryFn: async () => {
      const params = tab === 'all' ? {} : { status: tab }
      const res = await api.get('/api/admin/campaigns', { params })
      return res.data.campaigns
    },
  })

  const { data: advertisersData, isLoading: advertisersLoading } = useQuery({
    queryKey: ['admin-advertisers'],
    queryFn: async () => {
      const res = await api.get('/api/admin/advertisers')
      return res.data.advertisers
    },
    enabled: tab === 'advertisers',
  })

  const approveMutation = useMutation({
    mutationFn: (id) => api.put(`/api/admin/campaigns/${id}/approve`),
    onSuccess: (_, id) => {
      setApproving(null)
      queryClient.invalidateQueries(['admin-campaigns'])
      toast.success('キャンペーンを承認しました')
    },
    onError: (err) => {
      setApproving(null)
      toast.error(err.response?.data?.error || '承認に失敗しました')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => api.put(`/api/admin/campaigns/${id}/reject`, { reason }),
    onSuccess: () => {
      setRejecting(null)
      queryClient.invalidateQueries(['admin-campaigns'])
      toast.success('キャンペーンを却下しました')
    },
    onError: (err) => {
      setRejecting(null)
      toast.error(err.response?.data?.error || '却下に失敗しました')
    },
  })

  const handleApprove = (id) => {
    setApproving(id)
    approveMutation.mutate(id)
  }

  const handleReject = (id, reason) => {
    setRejecting(id)
    rejectMutation.mutate({ id, reason })
  }

  const tabs = [
    { value: 'pending_review', label: '審査待ち' },
    { value: 'active', label: '配信中' },
    { value: 'all', label: 'すべてのキャンペーン' },
    { value: 'advertisers', label: '広告主一覧' },
  ]

  return (
    <div>
      <PageHeader title="広告ネットワーク管理" subtitle="キャンペーン審査・広告主管理" />

      {/* Tab strip */}
      <div className="mb-6 flex gap-2 border-b border-slate-700/50 pb-0">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.value
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'advertisers' ? (
        <Card className="p-0">
          {campaignsLoading ? (
            <div className="p-8 text-center text-slate-400">読み込み中...</div>
          ) : (
            <CampaignTable
              campaigns={campaignsData}
              onApprove={handleApprove}
              onReject={handleReject}
              approving={approving}
              rejecting={rejecting}
            />
          )}
        </Card>
      ) : (
        <Card className="p-0">
          {advertisersLoading ? (
            <div className="p-8 text-center text-slate-400">読み込み中...</div>
          ) : !advertisersData || advertisersData.length === 0 ? (
            <div className="p-8 text-center text-slate-400">広告主がいません</div>
          ) : (
            <Table headers={['会社名', '担当者', 'ウェブサイト', 'キャンペーン数', '残高', '登録日']}>
              {advertisersData.map((a) => (
                <tr key={a._id} className="border-b border-slate-700/30 hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{a.companyName}</td>
                  <td className="px-4 py-3 text-slate-400">{a.contactName}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {a.website ? <a href={a.website} target="_blank" rel="noopener noreferrer" className="hover:text-violet-300">{a.website}</a> : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.campaignCount}</td>
                  <td className={`px-4 py-3 font-medium ${a.balance > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {formatCurrency(a.balance)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  )
}
