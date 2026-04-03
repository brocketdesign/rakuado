import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, EmptyState } from '../components/UI'
import Modal from '../components/Modal'
import { Key, Plus, Trash2, Copy, Power, PowerOff, Shield, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ApiKeys() {
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [newKey, setNewKey] = useState(null)
  const queryClient = useQueryClient()

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await api.get('/api/api-keys')
      return res.data?.apiKeys || res.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: (name) => api.post('/api/api-keys', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['api-keys'])
      setNewKey(res.data?.apiKey?.key || res.data?.key || null)
      setCreateOpen(false)
      setKeyName('')
    },
    onError: () => toast.error('作成に失敗しました'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.put(`/api/api-keys/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries(['api-keys']),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['api-keys'])
      toast.success('削除しました')
    },
  })

  const copyKey = (key) => {
    navigator.clipboard.writeText(key)
    toast.success('コピーしました')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="APIキー管理" subtitle="APIキーの生成と管理">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> 新規キー作成
        </Button>
      </PageHeader>

      {/* Security Info */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
        <Shield className="text-amber-400 mt-0.5" size={20} />
        <div className="text-sm">
          <p className="font-medium text-amber-400">セキュリティに関する注意</p>
          <p className="text-amber-400/80">APIキーは作成時にのみ表示されます。安全な場所に保管してください。</p>
        </div>
      </div>

      {/* New Key Display */}
      {newKey && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <p className="mb-2 text-sm font-medium text-emerald-400">新しいAPIキーが作成されました</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-slate-800 p-3 text-sm text-white font-mono break-all">{newKey}</code>
            <Button variant="secondary" size="sm" onClick={() => copyKey(newKey)}>
              <Copy size={14} />
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">このキーを安全な場所にコピーしてください。再度表示されません。</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNewKey(null)}>閉じる</Button>
        </Card>
      )}

      {/* Keys Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <EmptyState title="APIキーがありません" icon={Key}>
            <Button onClick={() => setCreateOpen(true)}><Plus size={16} /> 作成</Button>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">名前</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">キー</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">作成日</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">使用回数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ステータス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {keys.map((k) => (
                  <tr key={k._id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-medium">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{k.keyPreview || 'rk_live_****'}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(k.createdAt).toLocaleDateString('ja-JP')}</td>
                    <td className="px-4 py-3 text-slate-300">{k.usageCount || 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={k.isActive ? 'success' : 'danger'}>
                        {k.isActive ? '有効' : '無効'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleMutation.mutate(k._id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                        >
                          {k.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                        </button>
                        <button
                          onClick={() => window.confirm('削除しますか？') && deleteMutation.mutate(k._id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                        >
                          <Trash2 size={14} />
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

      {/* Create Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新規APIキー作成"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>キャンセル</Button>
            <Button onClick={() => createMutation.mutate(keyName)} disabled={!keyName || createMutation.isPending}>
              {createMutation.isPending ? '作成中...' : '作成'}
            </Button>
          </>
        }
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">キー名</label>
          <input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="例: Production API Key"
            className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500"
          />
        </div>
      </Modal>
    </div>
  )
}
