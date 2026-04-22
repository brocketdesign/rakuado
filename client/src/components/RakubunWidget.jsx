import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Globe, FileText, Calendar, Loader2, Link2, Unlink } from 'lucide-react'
import api from '../lib/api'

const RAKUBUN_DASHBOARD_URL = import.meta.env.VITE_RAKUBUN_DASHBOARD_URL || 'https://rakubun.vercel.app/dashboard'

export default function RakubunWidget() {
  const queryClient = useQueryClient()
  const [disconnecting, setDisconnecting] = useState(false)

  // Fetch Rakubun summary data
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rakubun-data'],
    queryFn: async () => {
      const res = await api.get('/api/rakubun/data')
      return res.data
    },
    retry: false,
    staleTime: 60_000, // 1 minute
  })

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/api/rakubun/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rakubun-data'] })
    },
  })

  const handleConnect = () => {
    window.location.href = '/api/rakubun/connect'
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Rakubunとの接続を解除しますか？')) return
    setDisconnecting(true)
    try {
      await disconnectMutation.mutateAsync()
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="glass-card p-6 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-slate-400" />
        <span className="text-sm text-slate-400">Rakubunデータを読み込み中...</span>
      </div>
    )
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  const isConnected = !isError && data?.connected

  if (!isConnected) {
    return (
      <div className="glass-card p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 p-3 text-blue-400">
            <Globe size={22} />
          </div>
          <div>
            <p className="font-semibold text-white">Rakubun</p>
            <p className="text-xs text-slate-400">WordPressブログ管理</p>
          </div>
        </div>

        <p className="text-sm text-slate-300">
          Rakubunと連携すると、AIによる記事生成・WordPressへの自動投稿をこのダッシュボードから確認できます。
        </p>

        <button
          onClick={handleConnect}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-blue-500/25"
        >
          <Link2 size={16} />
          Rakubunと連携する
        </button>

        {isError && data?.error && (
          <p className="text-xs text-red-400">{data.error}</p>
        )}
      </div>
    )
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  const stats = [
    {
      label: '接続サイト数',
      value: data.sitesCount ?? '—',
      icon: Globe,
      color: 'blue',
    },
    {
      label: '合計記事数',
      value: data.articlesCount ?? '—',
      icon: FileText,
      color: 'violet',
    },
    {
      label: '今月の記事',
      value: data.articlesThisMonth ?? '—',
      icon: Calendar,
      color: 'green',
    },
  ]

  const colorMap = {
    blue: 'from-blue-500/20 to-cyan-500/20 text-blue-400',
    violet: 'from-violet-500/20 to-purple-500/20 text-violet-400',
    green: 'from-emerald-500/20 to-green-500/20 text-emerald-400',
  }

  return (
    <div className="glass-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 p-3 text-blue-400">
            <Globe size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-white">Rakubun</p>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                接続済み
              </span>
            </div>
            {data.lastSite && (
              <p className="text-xs text-slate-400 truncate max-w-[180px]">
                最終: {data.lastSite.name}
              </p>
            )}
          </div>
        </div>

        <a
          href={RAKUBUN_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-blue-500/50 hover:text-white"
        >
          ダッシュボードを開く
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 text-center">
            <div className={`mx-auto mb-2 w-fit rounded-lg bg-gradient-to-br p-2 ${colorMap[color]}`}>
              <Icon size={14} />
            </div>
            <p className="text-xl font-bold text-white">{value}</p>
            <p className="mt-0.5 text-[10px] text-slate-400 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <a
          href={`${RAKUBUN_DASHBOARD_URL}/sites`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          サイトを管理する →
        </a>

        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {disconnecting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Unlink size={12} />
          )}
          連携を解除
        </button>
      </div>
    </div>
  )
}
