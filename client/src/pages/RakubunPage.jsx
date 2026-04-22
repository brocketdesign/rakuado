import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Wand2, Globe, FileText, Calendar, ExternalLink,
  Loader2, Link2, Unlink, ArrowRight, CheckCircle2, AlertCircle,
} from 'lucide-react'
import api from '../lib/api'
import { PageHeader } from '../components/UI'
import toast from 'react-hot-toast'

const RAKUBUN_DASHBOARD_URL = import.meta.env.VITE_RAKUBUN_DASHBOARD_URL || 'https://rakubun.com/dashboard'

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }) {
  const colorMap = {
    blue: 'from-blue-500/20 to-cyan-500/20 text-blue-400',
    violet: 'from-violet-500/20 to-purple-500/20 text-violet-400',
    green: 'from-emerald-500/20 to-green-500/20 text-emerald-400',
  }
  return (
    <div className="glass-card p-5 flex flex-col items-center text-center gap-3">
      <div className={`rounded-xl bg-gradient-to-br p-3 ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <p className="text-3xl font-bold text-white">{value ?? '—'}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}

// ─── Quick action link ────────────────────────────────────────────────────────

function QuickAction({ href, label, description, icon: Icon }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group glass-card flex items-center gap-4 p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg hover:shadow-blue-500/10"
    >
      <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 p-3 text-blue-400 shrink-0">
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 group-hover:text-white">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <ArrowRight size={16} className="text-slate-500 group-hover:text-blue-400 transition-colors shrink-0" />
    </a>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RakubunPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  // Handle OAuth callback status from URL params
  useEffect(() => {
    const status = searchParams.get('rakubun')
    if (status === 'connected') {
      toast.success('Rakubunと連携しました！')
      queryClient.invalidateQueries({ queryKey: ['rakubun-data'] })
      setSearchParams({}, { replace: true })
    } else if (status === 'denied') {
      toast('連携をキャンセルしました', { icon: 'ℹ️' })
      setSearchParams({}, { replace: true })
    } else if (status === 'error') {
      toast.error('連携中にエラーが発生しました。もう一度お試しください。')
      setSearchParams({}, { replace: true })
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['rakubun-data'],
    queryFn: async () => {
      const res = await api.get('/api/rakubun/data')
      return res.data
    },
    retry: false,
    staleTime: 60_000,
  })

  const isConnected = !isLoading && data?.connected

  const handleConnect = () => {
    window.location.href = '/api/rakubun/connect'
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Rakubunとの連携を解除しますか？')) return
    try {
      await api.delete('/api/rakubun/disconnect')
      queryClient.invalidateQueries({ queryKey: ['rakubun-data'] })
      toast.success('連携を解除しました')
    } catch {
      toast.error('解除に失敗しました')
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Rakubun" subtitle="WordPressブログ管理" />
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">読み込み中...</span>
        </div>
      </div>
    )
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Rakubun"
          subtitle="WordPressブログをAIで自動管理"
        />

        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20 p-8 md:p-10">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-2xl bg-blue-500/20 p-3">
                <Wand2 size={28} className="text-blue-400" />
              </div>
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">連携サービス</span>
            </div>

            <h2 className="text-2xl font-bold text-white md:text-3xl">
              Rakubunでブログ管理を<br />
              <span className="text-blue-400">スマートに</span>自動化しよう
            </h2>

            <p className="text-slate-300 text-sm leading-relaxed">
              RakubunはAIを活用してWordPressブログの記事生成・自動投稿・SEO最適化を一括管理できるサービスです。
              アカウントを連携することで、このダッシュボードからサイト数や記事数などのデータをリアルタイムで確認できます。
            </p>

            <ul className="space-y-2 pt-1">
              {[
                '接続しているWordPressサイト数を確認',
                '生成・公開済みの記事数をリアルタイム表示',
                '詳細な操作はRakubunダッシュボードへシームレスに移動',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle2 size={15} className="text-blue-400 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleConnect}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-blue-500/30"
              >
                <Link2 size={16} />
                Rakubunと連携する
              </button>
              <a
                href="https://rakubun.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-slate-600 px-6 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-blue-500/50 hover:text-white"
              >
                Rakubunについて詳しく
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Decorative background */}
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none" />
          <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-blue-500/5 blur-2xl pointer-events-none" />
        </div>

        {/* Feature cards */}
        <div>
          <h3 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wider">連携後にできること</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { icon: Globe, title: 'サイト管理', desc: '接続中のWordPressサイトを一覧表示', color: 'blue' },
              { icon: FileText, title: '記事統計', desc: 'AI生成した記事の合計数と推移', color: 'violet' },
              { icon: Calendar, title: '今月の記事', desc: '当月に生成・公開した記事数', color: 'green' },
            ].map(({ icon: Icon, title, desc, color }) => {
              const cm = {
                blue: 'from-blue-500/20 to-cyan-500/20 text-blue-400',
                violet: 'from-violet-500/20 to-purple-500/20 text-violet-400',
                green: 'from-emerald-500/20 to-green-500/20 text-emerald-400',
              }
              return (
                <div key={title} className="glass-card p-5 space-y-3">
                  <div className={`w-fit rounded-xl bg-gradient-to-br p-3 ${cm[color]}`}>
                    <Icon size={18} />
                  </div>
                  <p className="font-semibold text-slate-200">{title}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <PageHeader
        title="Rakubun"
        subtitle="WordPressブログ管理"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 size={12} /> 連携済み
          </span>
          <a
            href={RAKUBUN_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-blue-500/50 hover:text-white"
          >
            Rakubunを開く
            <ExternalLink size={12} />
          </a>
        </div>
      </PageHeader>

      {/* Stats */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wider">概要</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="接続サイト数" value={data.sitesCount} icon={Globe} color="blue" />
          <StatCard label="合計記事数" value={data.articlesCount} icon={FileText} color="violet" />
          <StatCard label="今月の記事" value={data.articlesThisMonth} icon={Calendar} color="green" />
        </div>
      </div>

      {/* Last site */}
      {data.lastSite && (
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 p-3 text-blue-400 shrink-0">
            <Globe size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 mb-0.5">最近のサイト</p>
            <p className="font-semibold text-white truncate">{data.lastSite.name}</p>
            <p className="text-xs text-slate-400 truncate">{data.lastSite.url}</p>
          </div>
          <a
            href={`${RAKUBUN_DASHBOARD_URL}/sites`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            すべて見る →
          </a>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wider">クイックアクション</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickAction
            href={`${RAKUBUN_DASHBOARD_URL}/sites`}
            icon={Globe}
            label="サイトを管理する"
            description="WordPressサイトの追加・設定変更"
          />
          <QuickAction
            href={`${RAKUBUN_DASHBOARD_URL}/articles`}
            icon={FileText}
            label="記事を管理する"
            description="AI生成した記事の確認・編集・公開"
          />
          <QuickAction
            href={`${RAKUBUN_DASHBOARD_URL}/cron-scheduler`}
            icon={Calendar}
            label="自動投稿を設定する"
            description="スケジュール投稿の管理"
          />
          <QuickAction
            href={RAKUBUN_DASHBOARD_URL}
            icon={Wand2}
            label="Rakubunダッシュボードを開く"
            description="すべての機能にアクセス"
          />
        </div>
      </div>

      {/* Disconnect */}
      <div className="pt-2">
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
        >
          <Unlink size={13} />
          連携を解除する
        </button>
      </div>
    </div>
  )
}
