import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, Table, EmptyState } from '../components/UI'
import { Globe, Trash2, Power, PowerOff, Activity } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Affiliate() {
  const queryClient = useQueryClient()

  const { data: affiliates = [], isLoading } = useQuery({
    queryKey: ['affiliates'],
    queryFn: async () => {
      const res = await api.get('/api/affiliate/all-affiliate-data')
      return res.data || []
    },
    retry: false,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) =>
      api.put(`/api/affiliate/toggle/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries(['affiliates'])
      toast.success('ステータスを更新しました')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/affiliate/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['affiliates'])
      toast.success('削除しました')
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="アフィリエイト管理" subtitle="パートナーサイトの管理">
        <Link to="/dashboard/affiliate/status">
          <Button variant="outline"><Activity size={16} /> プラグイン状態確認</Button>
        </Link>
      </PageHeader>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
          </div>
        ) : affiliates.length === 0 ? (
          <EmptyState title="アフィリエイトがありません" icon={Globe} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">名前</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ウェブサイト</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">クリック数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ステータス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {affiliates.map((a) => (
                  <tr key={a._id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-medium">{a.name || a.domain || '—'}</td>
                    <td className="px-4 py-3">
                      <a href={a.wordpressUrl || a.domain} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        {a.wordpressUrl || a.domain || '—'}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{a.clicks || 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={a.isActive ? 'success' : 'default'}>
                        {a.isActive ? 'アクティブ' : '停止中'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleMutation.mutate({ id: a._id, isActive: !a.isActive })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                          title={a.isActive ? '停止' : '有効化'}
                        >
                          {a.isActive ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                        <Link to={`/dashboard/affiliate/graph/${a._id}`}>
                          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white" title="グラフ">
                            <Activity size={16} />
                          </button>
                        </Link>
                        <button
                          onClick={() => window.confirm('削除しますか？') && deleteMutation.mutate(a._id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
