import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, Input, EmptyState } from '../components/UI'
import { Rss, Plus, Trash2, Play, Pause, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function RSSFeeds() {
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [newFeedName, setNewFeedName] = useState('')
  const queryClient = useQueryClient()

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ['rss-feeds'],
    queryFn: async () => {
      const res = await api.get('/api/rss/feeds')
      return res.data || []
    },
    retry: false,
  })

  const addMutation = useMutation({
    mutationFn: () => api.post('/api/rss/feeds', { url: newFeedUrl, name: newFeedName }),
    onSuccess: () => {
      queryClient.invalidateQueries(['rss-feeds'])
      setNewFeedUrl('')
      setNewFeedName('')
      toast.success('フィードを追加しました')
    },
    onError: () => toast.error('追加に失敗しました'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/rss/feeds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['rss-feeds'])
      toast.success('削除しました')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/api/rss/feeds/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries(['rss-feeds']),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="RSSフィード" subtitle="RSSフィードの管理とインポート" />

      {/* Add new feed */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-300">新規フィード追加</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={newFeedName}
            onChange={(e) => setNewFeedName(e.target.value)}
            placeholder="フィード名"
            className="flex-1 rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500"
          />
          <input
            type="url"
            value={newFeedUrl}
            onChange={(e) => setNewFeedUrl(e.target.value)}
            placeholder="フィードURL"
            className="flex-[2] rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500"
          />
          <Button onClick={() => addMutation.mutate()} disabled={!newFeedUrl || addMutation.isPending}>
            <Plus size={16} /> 追加
          </Button>
        </div>
      </Card>

      {/* Feed List */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
        </div>
      ) : feeds.length === 0 ? (
        <EmptyState title="フィードがありません" description="RSSフィードを追加して開始しましょう" icon={Rss} />
      ) : (
        <div className="space-y-3">
          {feeds.map((feed) => (
            <Card key={feed._id} className="flex items-center justify-between p-4">
              <div className="flex-1">
                <h4 className="font-medium text-white">{feed.name || 'Unnamed Feed'}</h4>
                <p className="text-xs text-slate-400">{feed.url}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={feed.status === 'active' ? 'success' : 'warning'}>
                  {feed.status === 'active' ? 'アクティブ' : '停止中'}
                </Badge>
                <button
                  onClick={() => toggleMutation.mutate({ id: feed._id, status: feed.status === 'active' ? 'paused' : 'active' })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                >
                  {feed.status === 'active' ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  onClick={() => window.confirm('削除しますか？') && deleteMutation.mutate(feed._id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
