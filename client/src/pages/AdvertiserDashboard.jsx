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
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Megaphone size={48} className="mb-4 text-slate-600" />
      <h2 className="text-xl font-bold text-white mb-2">広告主アカウントがありません</h2>
      <Link to="/dashboard/advertiser/register">
        <Button>
          <PlusCircle size={16} />
          広告を出稿する
        </Button>
      </Link>
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
