import { useState } from 'react'
import { PageHeader, Card } from '../components/UI'
import { FileText, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

const sections = [
  {
    title: '認証',
    content: `APIキーをヘッダーまたはクエリパラメータで送信します。

**ヘッダー認証:**
\`\`\`
x-api-key: rk_live_your_api_key_here
\`\`\`

**クエリパラメータ:**
\`\`\`
GET /api/v1/affiliates?api_key=rk_live_your_api_key_here
\`\`\``,
  },
  {
    title: 'アフィリエイト',
    endpoints: [
      { method: 'GET', path: '/api/v1/affiliates', desc: '全アフィリエイト取得', params: 'limit, offset' },
      { method: 'GET', path: '/api/v1/affiliates/:id', desc: 'アフィリエイト詳細取得' },
      { method: 'POST', path: '/api/v1/affiliates', desc: 'アフィリエイト作成/更新', params: 'wordpressUrl (必須)' },
    ],
  },
  {
    title: 'アナリティクス',
    endpoints: [
      { method: 'GET', path: '/api/analytics/data', desc: 'アナリティクスデータ取得', params: 'period (current/previous), site (all/domain)' },
      { method: 'GET', path: '/api/analytics/sites', desc: 'サイト一覧取得' },
    ],
  },
  {
    title: 'パートナー',
    endpoints: [
      { method: 'GET', path: '/api/partners', desc: '全パートナー取得' },
      { method: 'POST', path: '/api/partners', desc: 'パートナー作成' },
      { method: 'PUT', path: '/api/partners/:id', desc: 'パートナー更新' },
      { method: 'DELETE', path: '/api/partners/:id', desc: 'パートナー削除' },
    ],
  },
  {
    title: 'パートナー募集',
    endpoints: [
      { method: 'GET', path: '/api/partner-recruitment', desc: '全募集リクエスト取得' },
      { method: 'GET', path: '/api/partner-recruitment/:id', desc: '募集リクエスト詳細' },
      { method: 'PUT', path: '/api/partner-recruitment/:id', desc: 'ステータス更新' },
    ],
  },
]

const methodColors = {
  GET: 'bg-emerald-500/20 text-emerald-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-amber-500/20 text-amber-400',
  DELETE: 'bg-red-500/20 text-red-400',
}

export default function ApiDocs() {
  const [expanded, setExpanded] = useState({})

  const toggle = (title) => setExpanded((prev) => ({ ...prev, [title]: !prev[title] }))

  const copySection = (section) => {
    let text = `## ${section.title}\n\n`
    if (section.content) text += section.content + '\n'
    if (section.endpoints) {
      section.endpoints.forEach((ep) => {
        text += `### ${ep.method} ${ep.path}\n${ep.desc}\n`
        if (ep.params) text += `パラメータ: ${ep.params}\n`
        text += '\n'
      })
    }
    navigator.clipboard.writeText(text)
    toast.success('コピーしました')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="APIドキュメント" subtitle="API利用ガイド" />

      <div className="space-y-3">
        {sections.map((section) => (
          <Card key={section.title} className="p-0 overflow-hidden">
            <button
              onClick={() => toggle(section.title)}
              className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-800/30"
            >
              <h3 className="text-sm font-semibold text-white">{section.title}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); copySection(section) }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                >
                  <Copy size={14} />
                </button>
                {expanded[section.title] ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </div>
            </button>

            {expanded[section.title] && (
              <div className="border-t border-slate-700/50 p-5">
                {section.content && (
                  <div className="prose prose-invert prose-sm max-w-none mb-4">
                    <pre className="rounded-lg bg-slate-900 p-4 text-sm text-slate-300 whitespace-pre-wrap">{section.content}</pre>
                  </div>
                )}

                {section.endpoints && (
                  <div className="space-y-3">
                    {section.endpoints.map((ep, i) => (
                      <div key={i} className="rounded-lg bg-slate-800/50 p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${methodColors[ep.method]}`}>
                            {ep.method}
                          </span>
                          <code className="text-sm font-mono text-violet-300">{ep.path}</code>
                        </div>
                        <p className="text-sm text-slate-400">{ep.desc}</p>
                        {ep.params && (
                          <p className="mt-1 text-xs text-slate-500">パラメータ: {ep.params}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
