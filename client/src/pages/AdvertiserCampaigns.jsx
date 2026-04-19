import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { PlusCircle, Pause, Play, Trash2, Eye, Pencil, Send, Megaphone, Target, BarChart2 } from 'lucide-react'
import api from '../lib/api'
import { useAdvertiser } from '../hooks/useAdvertiser'
import { Card, PageHeader, Button, Badge, Table } from '../components/UI'
import { formatCurrency } from '../lib/utils'

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

export default function AdvertiserCampaigns() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasProfile, isLoading: profileLoading } = useAdvertiser()
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['advertiser-campaigns', statusFilter],
    queryFn: async () => {
      const res = await api.get('/api/advertiser/campaigns', { params: statusFilter ? { status: statusFilter } : {} })
      return res.data.campaigns
    },
    enabled: hasProfile,
  })

  const pauseMutation = useMutation({
    mutationFn: (id) => api.post(`/api/advertiser/campaigns/${id}/pause`),
    onSuccess: (res, id) => {
      queryClient.invalidateQueries(['advertiser-campaigns'])
      toast.success(res.data.status === 'paused' ? '一時停止しました' : '配信を再開しました')
    },
    onError: (err) => toast.error(err.response?.data?.error || '操作に失敗しました'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/advertiser/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['advertiser-campaigns'])
      toast.success('キャンペーンを終了しました')
    },
    onError: (err) => toast.error(err.response?.data?.error || '削除に失敗しました'),
  })

  const submitMutation = useMutation({
    mutationFn: (id) => api.post(`/api/advertiser/campaigns/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries(['advertiser-campaigns'])
      toast.success('審査に提出しました')
    },
    onError: (err) => toast.error(err.response?.data?.error || '提出に失敗しました'),
  })

  if (profileLoading) return null
  if (!hasProfile) {
    return (
      <div>
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-3">
            <Megaphone size={28} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Campaign Manager</h1>
            <p className="text-slate-400 text-sm">Create and manage your ad campaigns</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <Target size={22} className="mb-3 text-violet-400" />
            <p className="font-semibold text-white mb-1">Targeted Placements</p>
            <p className="text-sm text-slate-400">Choose banner, in-article, or product card formats to reach the right readers.</p>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <BarChart2 size={22} className="mb-3 text-blue-400" />
            <p className="font-semibold text-white mb-1">Real-time Stats</p>
            <p className="text-sm text-slate-400">Track impressions, clicks, and CTR for every campaign as they happen.</p>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <PlusCircle size={22} className="mb-3 text-emerald-400" />
            <p className="font-semibold text-white mb-1">Easy Setup</p>
            <p className="text-sm text-slate-400">Go live in minutes — set your bid, daily budget, and submit for review.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-800/20 p-12 text-center">
          <Megaphone size={48} className="mx-auto mb-4 text-slate-600" />
          <h2 className="text-xl font-bold text-white mb-2">No advertiser account yet</h2>
          <p className="text-slate-400 mb-6 max-w-sm mx-auto">
            You need an advertiser account before you can create campaigns.
          </p>
          <button
            onClick={() => navigate('/dashboard/advertiser/register')}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            <PlusCircle size={16} />
            Create an advertiser account
          </button>
        </div>
      </div>
    )
  }

  const campaigns = data || []

  return (
    <div>
      <PageHeader title="キャンペーン管理" subtitle="広告キャンペーンの作成・管理">
        <Button onClick={() => navigate('/dashboard/advertiser/campaigns/new')}>
          <PlusCircle size={16} />
          新規キャンペーン
        </Button>
      </PageHeader>

      {/* Filter */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {[
          { value: '', label: 'すべて' },
          { value: 'active', label: '配信中' },
          { value: 'draft', label: '下書き' },
          { value: 'pending_review', label: '審査中' },
          { value: 'paused', label: '一時停止' },
          { value: 'ended', label: '終了' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              statusFilter === value
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">読み込み中...</div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <Megaphone size={40} className="mx-auto mb-4 text-slate-600" />
            <p className="text-white font-semibold mb-1">No campaigns yet</p>
            <p className="text-slate-400 text-sm mb-5">Create your first campaign to start showing ads across the network.</p>
            <Button onClick={() => navigate('/dashboard/advertiser/campaigns/new')}>
              <PlusCircle size={16} />
              Create your first campaign
            </Button>
          </div>
        ) : (
          <Table headers={['キャンペーン名', '種別', 'ステータス', '入札', '日次予算', '表示', 'CTR', '操作']}>
            {campaigns.map((c) => {
              const statusInfo = STATUS_LABELS[c.status] || { label: c.status, variant: 'default' }
              const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : '0.0'
              return (
                <tr key={c._id} className="border-b border-slate-700/30 hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/dashboard/advertiser/campaigns/${c._id}`} className="text-white hover:text-violet-300 font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{TYPE_LABELS[c.type] || c.type}</td>
                  <td className="px-4 py-3"><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{formatCurrency(c.bidAmount)}/{c.bidType}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{formatCurrency(c.dailyBudget)}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{c.impressions.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{ctr}%</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link to={`/dashboard/advertiser/campaigns/${c._id}`}>
                        <Button variant="ghost" size="sm"><Eye size={14} /></Button>
                      </Link>
                      {c.status === 'draft' && (
                        <>
                          <Link to={`/dashboard/advertiser/campaigns/${c._id}/edit`}>
                            <Button variant="ghost" size="sm"><Pencil size={14} /></Button>
                          </Link>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => submitMutation.mutate(c._id)}
                            disabled={submitMutation.isPending}
                            title="審査に提出"
                          >
                            <Send size={14} />
                          </Button>
                        </>
                      )}
                      {['active', 'paused'].includes(c.status) && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => pauseMutation.mutate(c._id)}
                          disabled={pauseMutation.isPending}
                        >
                          {c.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                        </Button>
                      )}
                      {['draft', 'paused', 'ended', 'rejected'].includes(c.status) && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => {
                            if (confirm('このキャンペーンを終了しますか？')) deleteMutation.mutate(c._id)
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
    </div>
  )
}
