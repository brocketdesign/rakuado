import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Button, Input, Select, Textarea } from '../components/UI'
import { Save, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

const categoryOptions = [
  'テクノロジー', 'ビジネス', 'マーケティング', '健康', 'ライフスタイル',
  '旅行', '食べ物', 'エンタメ', 'スポーツ', '教育', 'ニュース', 'ファッション',
  '美容', 'ペット', 'DIY', '金融', '不動産', '自動車', 'ゲーム', '音楽',
]

const writingStyles = ['informative', 'casual', 'professional', 'storytelling', 'persuasive']
const tones = ['neutral', 'friendly', 'formal', 'humorous', 'authoritative']

export default function BotConfig() {
  const [searchParams] = useSearchParams()
  const blogId = searchParams.get('blogId')
  const navigate = useNavigate()

  const [form, setForm] = useState({
    blogId,
    botName: '', description: '', articleLength: 1000,
    categories: [], targetAudience: '',
    language: 'ja', gptModel: 'gpt-4', postFrequency: '0 9 * * *',
    isActive: true, writingStyle: 'informative', tone: 'neutral',
  })

  const saveMutation = useMutation({
    mutationFn: (data) => api.post('/api/autoblog/bot-info', data),
    onSuccess: () => {
      toast.success('ボットを保存しました')
      navigate('/dashboard/autoblog')
    },
    onError: () => toast.error('保存に失敗しました'),
  })

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="space-y-6">
      <PageHeader title="ボット設定">
        <Button variant="ghost" onClick={() => navigate('/dashboard/autoblog')}>
          <ArrowLeft size={16} /> 戻る
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-300">ボット情報</h3>
          <div className="space-y-4">
            <Input label="ボット名" value={form.botName} onChange={(e) => updateField('botName', e.target.value)} required />
            <Textarea label="説明" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
            <Input label="記事の長さ (文字数)" type="number" value={form.articleLength} onChange={(e) => updateField('articleLength', Number(e.target.value))} />
            <Input label="ターゲットオーディエンス" value={form.targetAudience} onChange={(e) => updateField('targetAudience', e.target.value)} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">カテゴリ</label>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      const selected = form.categories.includes(cat)
                        ? form.categories.filter((c) => c !== cat)
                        : [...form.categories, cat]
                      updateField('categories', selected)
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      form.categories.includes(cat)
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="lg:sticky lg:top-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-300">コンテンツ設定</h3>
            <div className="space-y-4">
              <Select label="言語" value={form.language} onChange={(e) => updateField('language', e.target.value)}>
                <option value="ja">日本語</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </Select>
              <Select label="GPTモデル" value={form.gptModel} onChange={(e) => updateField('gptModel', e.target.value)}>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </Select>
              <Input label="投稿頻度 (Cron式)" value={form.postFrequency} onChange={(e) => updateField('postFrequency', e.target.value)} />
              <Select label="文体" value={form.writingStyle} onChange={(e) => updateField('writingStyle', e.target.value)}>
                {writingStyles.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Select label="トーン" value={form.tone} onChange={(e) => updateField('tone', e.target.value)}>
                {tones.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-300">アクティブ</label>
                <button
                  onClick={() => updateField('isActive', !form.isActive)}
                  className={`h-6 w-11 rounded-full transition-colors ${
                    form.isActive ? 'bg-violet-600' : 'bg-slate-600'
                  }`}
                >
                  <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    form.isActive ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>

            <Button
              className="mt-6 w-full"
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending}
            >
              <Save size={16} /> {saveMutation.isPending ? '保存中...' : '送信'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
