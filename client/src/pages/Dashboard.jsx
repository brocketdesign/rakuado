import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, StatCard, Card } from '../components/UI'
import {
  BarChart3, CreditCard, Mail, Users, UserPlus, TestTubes,
  Globe, Megaphone, Bot, Wand2, Key, MailPlus, Rss, FileText, Eye,
  Briefcase, TrendingUp, Settings,
} from 'lucide-react'

// User-facing quick links (shown to non-admins only)
const userLinks = [
  {
    label: 'パートナーポータル',
    to: '/dashboard/partner-portal',
    icon: Briefcase,
    color: 'from-violet-500 to-purple-500',
    desc: 'サイト登録・申請状況・収益確認',
  },
  {
    label: '設定',
    to: '/dashboard/settings',
    icon: Settings,
    color: 'from-slate-500 to-slate-600',
    desc: 'アカウント設定の変更',
  },
]

// Admin-only quick links
const adminLinks = [
  { label: 'パートナー支払い', to: '/dashboard/partners', icon: CreditCard, color: 'from-violet-500 to-purple-500' },
  { label: 'パートナーメール', to: '/dashboard/partner-emails', icon: Mail, color: 'from-emerald-500 to-green-500' },
  { label: 'パートナー一覧', to: '/dashboard/partner-list', icon: Users, color: 'from-amber-500 to-orange-500' },
  { label: 'パートナー募集', to: '/dashboard/partner-recruitment', icon: UserPlus, color: 'from-rose-500 to-pink-500' },
  { label: 'メーリングリスト', to: '/dashboard/mailing-lists', icon: MailPlus, color: 'from-teal-500 to-emerald-500' },
]

const toolLinks = [
  { label: 'A/Bテスト', to: '/dashboard/ab-tests', icon: TestTubes },
  { label: 'アフィリエイト', to: '/dashboard/affiliate', icon: Globe },
  { label: 'リファラル', to: '/dashboard/referral', icon: Megaphone },
  { label: 'オートブログ', to: '/dashboard/autoblog', icon: Bot },
  { label: 'コンテンツ生成', to: '/dashboard/generator/0', icon: Wand2 },
  { label: 'RSSフィード', to: '/dashboard/rss', icon: Rss },
  { label: 'APIキー', to: '/dashboard/api-keys', icon: Key },
  { label: 'APIドキュメント', to: '/dashboard/api-docs', icon: FileText },
]

export default function Dashboard() {
  const { user, isAdmin } = useAuth()

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => {
      const res = await api.get('/api/analytics/data', { params: { period: 'current', site: 'all' } })
      return res.data
    },
    retry: false,
  })

  const todayViews = analyticsData?.totalViews ?? '—'

  // ── Regular user view ──────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="space-y-8">
        {/* Welcome */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-600/20 border border-violet-500/20 p-8">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              ようこそ、<span className="gradient-text">{user?.name || user?.email || 'ユーザー'}</span>
            </h1>
            <p className="mt-2 text-slate-300">Rakuadoダッシュボードへようこそ。下記からご利用いただけます。</p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-violet-500/10 to-transparent" />
        </div>

        {/* User quick links */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">メニュー</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {userLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="group glass-card flex items-start gap-4 p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-500/10"
              >
                <div className={`rounded-xl bg-gradient-to-br ${link.color} p-3 text-white shrink-0`}>
                  <link.icon size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white">{link.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Admin view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-600/20 border border-violet-500/20 p-8">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            ようこそ <span className="gradient-text">Rakuado</span> へ
          </h1>
          <p className="mt-2 text-slate-300">パートナー管理とコンテンツ作成をスマートに</p>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-violet-500/10 to-transparent" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="今日の閲覧数" value={todayViews} icon={Eye} color="blue" />
        <StatCard title="パートナー" value="—" icon={Users} color="violet" />
        <StatCard title="コンテンツ" value="—" icon={Wand2} color="green" />
        <StatCard title="クレジット" value="—" icon={CreditCard} color="amber" />
      </div>

      {/* Partner Management */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">パートナー管理</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adminLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group glass-card flex items-center gap-4 p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-500/10"
            >
              <div className={`rounded-xl bg-gradient-to-br ${link.color} p-3 text-white`}>
                <link.icon size={22} />
              </div>
              <span className="text-sm font-medium text-slate-200 group-hover:text-white">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Tools */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">広告管理 & ツール</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {toolLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="glass-card flex flex-col items-center gap-3 p-5 text-center transition-all hover:bg-slate-700/30"
            >
              <link.icon size={24} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-300">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
