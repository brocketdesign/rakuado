import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import toast from 'react-hot-toast'
import { ArrowLeft, Pause, Play, Send, Pencil, Eye, MousePointerClick, Wallet, TrendingUp } from 'lucide-react'
import api from '../lib/api'
import { useAdvertiser } from '../hooks/useAdvertiser'
import { Card, PageHeader, Button, Badge, StatCard } from '../components/UI'
import { formatCurrency, formatDate } from '../lib/utils'

const STATUS_LABELS = {
  draft: { label: '下書き', variant: 'default' },
  pending_review: { label: '審査中', variant: 'warning' },
  active: { label: '配信中', variant: 'success' },
  paused: { label: '一時停止', variant: 'info' },
  ended: { label: '終了', variant: 'default' },
  rejected: { label: '却下', variant: 'danger' },
}

export default function AdvertiserCampaignDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasProfile, isLoading: profileLoading } = useAdvertiser()

  const { data, isLoading } = useQuery({
    queryKey: ['advertiser-campaign', id],
    queryFn: async () => {
      const res = await api.get(`/api/advertiser/campaigns/${id}`)
      return res.data
    },
    enabled: hasProfile && !!id,
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/api/advertiser/campaigns/${id}/pause`),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['advertiser-campaign', id])
      queryClient.invalidateQueries(['advertiser-campaigns'])
      toast.success(res.data.status === 'paused' ? '一時停止しました' : '配信を再開しました')
    },
    onError: (err) => toast.error(err.response?.data?.error || '操作に失敗しました'),
  })

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/api/advertiser/campaigns/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries(['advertiser-campaign', id])
      queryClient.invalidateQueries(['advertiser-campaigns'])
      toast.success('審査に提出しました')
    },
    onError: (err) => toast.error(err.response?.data?.error || '提出に失敗しました'),
  })

  if (profileLoading) return null
  if (!hasProfile) {
    navigate('/dashboard/advertiser/register', { replace: true })
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">読み込み中...</div>
    )
  }

  if (!data) return <div className="text-slate-400 py-12 text-center">キャンペーンが見つかりません</div>

  const { campaign, creatives, impressionSeries, clickSeries, totalSpend } = data
  const statusInfo = STATUS_LABELS[campaign?.status] || { label: campaign?.status, variant: 'default' }

  // Merge impression + click series into unified chart data by date
  const impMap = Object.fromEntries((impressionSeries || []).map((r) => [r._id, r.count]))
  const clkMap = Object.fromEntries((clickSeries || []).map((r) => [r._id, r.count]))
  const allDates = [...new Set([...(impressionSeries || []).map((r) => r._id), ...(clickSeries || []).map((r) => r._id)])].sort()
  const chartData = allDates.map((d) => ({
    date: d.slice(5), // MM-DD
    impressions: impMap[d] || 0,
    clicks: clkMap[d] || 0,
  }))

  const totalImpressions = (impressionSeries || []).reduce((s, r) => s + r.count, 0)
  const totalClicks = (clickSeries || []).reduce((s, r) => s + r.count, 0)
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00'
  const remaining = (campaign?.totalBudget || 0) - (totalSpend || 0)

  return (
    <div>
      <PageHeader title={campaign?.name || 'キャンペーン詳細'}>
        <div className="flex items-center gap-3">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          {campaign?.status === 'draft' && (
            <>
              <Link to={`/dashboard/advertiser/campaigns/${id}/edit`}>
                <Button variant="outline" size="sm"><Pencil size={14} />編集</Button>
              </Link>
              <Button size="sm" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                <Send size={14} />
                {submitMutation.isPending ? '提出中...' : '審査に提出'}
              </Button>
            </>
          )}
          {['active', 'paused'].includes(campaign?.status) && (
            <Button
              variant={campaign.status === 'active' ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
            >
              {campaign.status === 'active' ? <><Pause size={14} />一時停止</> : <><Play size={14} />再開</>}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/advertiser/campaigns')}>
            <ArrowLeft size={14} />戻る
          </Button>
        </div>
      </PageHeader>

      {/* KPI Row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="累計インプレッション" value={totalImpressions.toLocaleString()} icon={Eye} color="blue" />
        <StatCard title="累計クリック" value={totalClicks.toLocaleString()} icon={MousePointerClick} color="violet" />
        <StatCard title="CTR" value={`${ctr}%`} icon={TrendingUp} color="amber" />
        <StatCard title="残予算" value={formatCurrency(remaining)} icon={Wallet} color="green" />
      </div>

      {/* Campaign details + Spend bar */}
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-3 font-semibold text-white">キャンペーン設定</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ['広告種別', campaign?.type],
              ['入札方式', campaign?.bidType],
              ['入札単価', formatCurrency(campaign?.bidAmount)],
              ['日次予算', formatCurrency(campaign?.dailyBudget)],
              ['合計予算', formatCurrency(campaign?.totalBudget)],
              ['累計消化', formatCurrency(totalSpend)],
              ['開始日', campaign?.startDate ? formatDate(campaign.startDate) : '未設定'],
              ['終了日', campaign?.endDate ? formatDate(campaign.endDate) : '未設定'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-slate-200 font-medium mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
          {campaign?.rejectionReason && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <span className="font-medium">却下理由: </span>{campaign.rejectionReason}
            </div>
          )}
        </Card>

        {/* Creative preview */}
        <Card>
          <h3 className="mb-3 font-semibold text-white">クリエイティブ</h3>
          {creatives && creatives.length > 0 ? (
            creatives.map((cr) => (
              <div key={cr._id} className="mb-3">
                <img
                  src={cr.imageUrl}
                  alt={cr.altText || 'banner'}
                  className="w-full rounded-lg object-contain max-h-32 bg-slate-800/50 p-2"
                />
                <p className="mt-2 text-xs text-slate-500 truncate">{cr.destinationUrl}</p>
              </div>
            ))
          ) : (
            <p className="text-slate-500 text-sm">クリエイティブなし</p>
          )}
        </Card>
      </div>

      {/* Performance Chart */}
      {chartData.length > 0 && (
        <Card>
          <h3 className="mb-4 font-semibold text-white">日別パフォーマンス（直近30日）</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
              />
              <Legend />
              <Bar dataKey="impressions" name="表示回数" fill="#818cf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="clicks" name="クリック数" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  )
}
