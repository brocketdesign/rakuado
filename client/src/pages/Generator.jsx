import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Button, Input, Select, Textarea } from '../components/UI'
import { Wand2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const generatorTypes = {
  0: { title: 'タイトル生成', description: 'キーワードからタイトルを生成' },
  1: { title: 'SEOタイトル生成', description: 'SEO最適化されたタイトルを生成' },
  2: { title: 'セクション生成', description: '記事のセクションを生成' },
  3: { title: '記事生成', description: '完全な記事を生成' },
  4: { title: 'SNS投稿生成', description: 'ソーシャルメディア投稿を生成' },
  7: { title: 'メタ説明生成', description: 'メタディスクリプションを生成' },
  8: { title: 'コンテンツ生成', description: 'カスタムコンテンツを生成' },
}

const languages = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
]

const writingStyles = ['informative', 'casual', 'professional', 'storytelling', 'persuasive']
const tones = ['neutral', 'friendly', 'formal', 'humorous', 'authoritative']

export default function Generator() {
  const { type } = useParams()
  const config = generatorTypes[type] || generatorTypes[0]
  const [form, setForm] = useState({
    keyword: '', description: '', sections: '', count: 3,
    language: 'ja', writingStyle: 'informative', tone: 'neutral',
  })
  const [results, setResults] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const resultRef = useRef(null)

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const generateMutation = useMutation({
    mutationFn: async () => {
      setResults([])
      setStreamContent('')
      setStreaming(true)

      const res = await api.post(`/api/generator/generate/${type}`, form)
      const { insertedId } = res.data

      return new Promise((resolve, reject) => {
        const evtSource = new EventSource(`/api/generator/stream/${type}?id=${insertedId}`)
        let content = ''

        evtSource.onmessage = (event) => {
          if (event.data === '[DONE]') {
            evtSource.close()
            setStreaming(false)
            resolve(content)
            return
          }
          try {
            const parsed = JSON.parse(event.data)
            const text = parsed.choices?.[0]?.delta?.content || parsed.content || event.data
            content += text
            setStreamContent(content)
          } catch {
            content += event.data
            setStreamContent(content)
          }
        }

        evtSource.onerror = () => {
          evtSource.close()
          setStreaming(false)
          if (content) resolve(content)
          else reject(new Error('ストリーミングエラー'))
        }
      })
    },
    onSuccess: (content) => {
      if (content) {
        const items = content.split('\n').filter((l) => l.trim())
        setResults(items)
      }
      toast.success('生成完了！')
    },
    onError: () => {
      setStreaming(false)
      toast.error('生成に失敗しました')
    },
  })

  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight
    }
  }, [streamContent])

  return (
    <div className="space-y-6">
      <PageHeader title={config.title} subtitle={config.description} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Form */}
        <Card className="lg:col-span-2">
          <div className="space-y-4">
            <Input
              label="キーワード"
              value={form.keyword}
              onChange={(e) => updateField('keyword', e.target.value)}
              placeholder="キーワードを入力..."
              required
            />

            {(type === '2' || type === '3') && (
              <Textarea
                label="説明"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                placeholder="コンテンツの説明..."
              />
            )}

            {(type === '2' || type === '3' || type === '4') && (
              <Textarea
                label="セクション"
                value={form.sections}
                onChange={(e) => updateField('sections', e.target.value)}
                rows={3}
                placeholder="セクションをカンマ区切りで..."
              />
            )}

            <Input
              label="生成数"
              type="number"
              min={1}
              max={10}
              value={form.count}
              onChange={(e) => updateField('count', Number(e.target.value))}
            />

            <Select label="言語" value={form.language} onChange={(e) => updateField('language', e.target.value)}>
              {languages.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>

            <Select label="文体" value={form.writingStyle} onChange={(e) => updateField('writingStyle', e.target.value)}>
              {writingStyles.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>

            <Select label="トーン" value={form.tone} onChange={(e) => updateField('tone', e.target.value)}>
              {tones.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>

            <Button
              className="w-full"
              onClick={() => generateMutation.mutate()}
              disabled={streaming || !form.keyword}
            >
              {streaming ? (
                <><Loader2 size={16} className="animate-spin" /> 生成中...</>
              ) : (
                <><Wand2 size={16} /> 生成しましょう！</>
              )}
            </Button>
          </div>
        </Card>

        {/* Results */}
        <Card className="lg:col-span-3">
          <h3 className="mb-4 text-sm font-semibold text-slate-300">生成結果</h3>
          <div
            ref={resultRef}
            className="min-h-[400px] max-h-[600px] overflow-y-auto rounded-xl bg-slate-800/50 p-4"
          >
            {streaming && streamContent ? (
              <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-sm text-slate-300">
                {streamContent}
                <span className="inline-block h-4 w-1 animate-pulse bg-violet-500 ml-0.5" />
              </div>
            ) : results.length > 0 ? (
              <ul className="space-y-2">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-slate-700/50 p-3 text-sm text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(r)
                      toast.success('コピーしました')
                    }}
                  >
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                <div className="text-center">
                  <Wand2 size={48} className="mx-auto mb-3 text-slate-600" />
                  <p>キーワードを入力して生成ボタンを押してください</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
