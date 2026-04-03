import { useState } from 'react'
import api from '../lib/api'
import { PageHeader, Card, Button, Input } from '../components/UI'
import { Search, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AffiliateStatus() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const checkStatus = async (e) => {
    e.preventDefault()
    if (!url) return
    setLoading(true)
    setResult(null)
    try {
      const res = await api.get('/api/affiliate/check-plugin-status', { params: { url } })
      setResult(res.data)
    } catch (err) {
      toast.error('確認に失敗しました')
      setResult({ status: 'error', message: err.response?.data?.message || 'エラー' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="プラグイン状態確認" subtitle="WordPressサイトのプラグインステータスを確認" />

      <Card className="max-w-xl">
        <form onSubmit={checkStatus} className="space-y-4">
          <Input
            label="WordPress サイトURL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
          <Button type="submit" disabled={loading} className="w-full">
            <Search size={16} /> {loading ? '確認中...' : 'ステータス確認'}
          </Button>
        </form>

        {result && (
          <div className={`mt-6 rounded-xl p-4 ${
            result.status === 'active'
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            <div className="flex items-center gap-3">
              {result.status === 'active' ? (
                <CheckCircle className="text-emerald-400" size={20} />
              ) : (
                <XCircle className="text-red-400" size={20} />
              )}
              <div>
                <p className={`font-medium ${result.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.status === 'active' ? 'プラグインはアクティブです' : 'プラグインが見つかりません'}
                </p>
                {result.message && <p className="text-sm text-slate-400 mt-1">{result.message}</p>}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
