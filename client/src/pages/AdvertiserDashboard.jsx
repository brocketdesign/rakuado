import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { PlusCircle, Wallet, Megaphone, MousePointerClick, Eye } from 'lucide-react'
import api from '../lib/api'
import { useAdvertiser } from '../hooks/useAdvertiser'
import { Card, StatCard, PageHeader, Button, Badge } from '../components/UI'
import { formatCurrency } from '../lib/utils'

function NoProfile() {
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="rounded-xl bg-violet-500/10 p-3">
            <Megaphone size={28} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">広告主ダッシュボード</h1>
            <p className="text-slate-400 text-sm">Rakuadoネットワークで商品・サービスを宣伝しましょう</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
          <Megaphone size={22} className="mb-3 text-violet-400" />
          <p className="font-semibold text-white mb-1">キャンペーンを掲載</p>
          <p className="text-sm text-slate-400">バナー・記事内・商品カード広告を作成して、多くの読者にリーチしましょう。</p>
        </div>
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
          <Wallet size={22} className="mb-3 text-emerald-400" />
          <p className="font-semibold text-white mb-1">予算をコントロール</p>
          <p className="text-sm text-slate-400">残高をチャージして日次上限を設定し、予算超過を防ぎましょう。</p>
        </div>
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
          <Eye size={22} className="mb-3 text-blue-400" />
          <p className="font-semibold text-white mb-1">効果を把握</p>
          <p className="text-sm text-slate-400">インプレッション・クリック・消化金額をリアルタイムで一元管理。</p>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-800/20 p-12 text-center">
        <Megaphone size={48} className="mx-auto mb-4 text-slate-600" />
        <h2 className="text-xl font-bold text-white mb-2">広告主アカウントがありません</h2>
        <p className="text-slate-400 mb-6 max-w-sm mx-auto">
          Rakuadoで広告を配信し、オーディエンスを広げるために広告主アカウントを作成しましょう。
        </p>
        <Link to="/dashboard/advertiser/register">
          <Button>
            <PlusCircle size={16} />
            広告主アカウントを作成
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default function AdvertiserDashboard() {
  const navigate = useNavigate()
  const { advertiser, hasProfile, isLoading: profileLoading } = useAdvertiser()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['advertiser-stats'],
    queryFn: async () => {
      const res = await api.get('/api/advertiser/stats')
      return res.data
    },
    enabled: hasProfile,
  })

  const { data: campaignStats, isLoading: campaignStatsLoading } = useQuery({
    queryKey: ['advertiser-stats-campaigns'],
    queryFn: async () => {
      const res = await api.get('/api/advertiser/stats/campaigns')
      return res.data.campaigns
    },
    enabled: hasProfile,
  })

  if (profileLoading) return null
  if (!hasProfile) return <NoProfile />

  // Build 7-day chart from campaigns (placeholder with today's data)
  const chartData = campaignStats
    ? campaignStats.slice(0, 5).map((c) => ({
        name: c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
        impressions: c.impressions,
        clicks: c.clicks,
      }))
    : []

  return (
    <div>
      <PageHeader title="広告ダッシュボード" subtitle={advertiser?.companyName}>
        <Button onClick={() => navigate('/dashboard/advertiser/campaigns/new')}>
          <PlusCircle size={16} />
          新規キャンペーン
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="残高"
          value={formatCurrency(stats?.balance ?? 0)}
          icon={Wallet}
          color="green"
        />
        <StatCard
          title="本日のインプレッション"
          value={(stats?.todayImpressions ?? 0).toLocaleString()}
          icon={Eye}
          color="blue"
        />
        <StatCard
          title="本日のクリック"
          value={(stats?.todayClicks ?? 0).toLocaleString()}
          icon={MousePointerClick}
          color="violet"
        />
        <StatCard
          title="本日の消化金額"
          value={formatCurrency(stats?.todaySpend ?? 0)}
          icon={Megaphone}
          color="amber"
        />
      </div>

      {/* Charts */}
      {chartData.length > 0 && (
        <Card className="mb-8">
          <h3 className="mb-4 font-semibold text-white">キャンペーン別パフォーマンス</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
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

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/dashboard/advertiser/campaigns">
          <Card className="hover:border-violet-500/50 transition-colors cursor-pointer">
            <Megaphone size={24} className="mb-3 text-violet-400" />
            <p className="font-medium text-white">キャンペーン管理</p>
            <p className="text-sm text-slate-400 mt-1">キャンペーンの作成・管理</p>
          </Card>
        </Link>
        <Link to="/dashboard/advertiser/budget">
          <Card className="hover:border-emerald-500/50 transition-colors cursor-pointer">
            <Wallet size={24} className="mb-3 text-emerald-400" />
            <p className="font-medium text-white">予算管理</p>
            <p className="text-sm text-slate-400 mt-1">残高チャージ・取引履歴</p>
          </Card>
        </Link>
        <Link to="/dashboard/advertiser/campaigns/new">
          <Card className="hover:border-blue-500/50 transition-colors cursor-pointer">
            <PlusCircle size={24} className="mb-3 text-blue-400" />
            <p className="font-medium text-white">新規キャンペーン</p>
            <p className="text-sm text-slate-400 mt-1">バナー・記事内広告を作成</p>
          </Card>
        </Link>
      </div>
    </div>
  )
}
