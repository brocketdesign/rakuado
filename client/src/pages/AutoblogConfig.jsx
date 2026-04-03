import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Button, Input, Select } from '../components/UI'
import { Save, Plus, Trash2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AutoblogConfig() {
  const { blogId } = useParams()
  const navigate = useNavigate()
  const isEditing = !!blogId

  const [form, setForm] = useState({
    blogName: '', blogUrl: '', username: '', password: '',
    additionalUrls: [], language: 'ja', gptModel: 'gpt-4',
    postFrequency: '0 9 * * *',
  })

  const { data: blogData } = useQuery({
    queryKey: ['autoblog-blog', blogId],
    queryFn: async () => {
      const res = await api.get(`/api/autoblog/blog-info/${blogId}`)
      return res.data
    },
    enabled: isEditing,
  })

  useEffect(() => {
    if (blogData) setForm({ ...form, ...blogData })
  }, [blogData])

  const saveMutation = useMutation({
    mutationFn: (data) => api.post('/api/autoblog/blog-info', { ...data, blogId }),
    onSuccess: () => {
      toast.success('保存しました')
      navigate('/dashboard/autoblog')
    },
    onError: () => toast.error('保存に失敗しました'),
  })

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))
  const addUrl = () => setForm((prev) => ({ ...prev, additionalUrls: [...prev.additionalUrls, ''] }))
  const removeUrl = (i) => setForm((prev) => ({ ...prev, additionalUrls: prev.additionalUrls.filter((_, idx) => idx !== i) }))
  const updateUrl = (i, val) => setForm((prev) => ({
    ...prev,
    additionalUrls: prev.additionalUrls.map((u, idx) => idx === i ? val : u),
  }))

  return (
    <div className="space-y-6">
      <PageHeader title={isEditing ? 'ブログ設定' : '新規ブログ'}>
        <Button variant="ghost" onClick={() => navigate('/dashboard/autoblog')}>
          <ArrowLeft size={16} /> 戻る
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-300">ブログ情報</h3>
          <div className="space-y-4">
            <Input label="ブログ名" value={form.blogName} onChange={(e) => updateField('blogName', e.target.value)} />
            <Input label="ブログURL" value={form.blogUrl} onChange={(e) => updateField('blogUrl', e.target.value)} placeholder="https://example.com" />
            <Input label="ユーザー名" value={form.username} onChange={(e) => updateField('username', e.target.value)} />
            <Input label="パスワード" type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} />

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">追加URL</label>
                <button onClick={addUrl} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                  <Plus size={14} /> 追加
                </button>
              </div>
              {form.additionalUrls.map((url, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    value={url}
                    onChange={(e) => updateUrl(i, e.target.value)}
                    className="flex-1 rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
                    placeholder="https://..."
                  />
                  <button onClick={() => removeUrl(i)} className="rounded-lg p-2 text-slate-400 hover:text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-300">投稿設定</h3>
          <div className="space-y-4">
            <Select label="言語" value={form.language} onChange={(e) => updateField('language', e.target.value)}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
            </Select>
            <Select label="GPTモデル" value={form.gptModel} onChange={(e) => updateField('gptModel', e.target.value)}>
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </Select>
            <Input
              label="投稿頻度 (Cron式)"
              value={form.postFrequency}
              onChange={(e) => updateField('postFrequency', e.target.value)}
              placeholder="0 9 * * *"
            />
          </div>

          <Button
            className="mt-6 w-full"
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
          >
            <Save size={16} /> {saveMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </Card>
      </div>
    </div>
  )
}
