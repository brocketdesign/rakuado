import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { PageHeader, Card, Button, Input } from '../components/UI'
import { Settings as SettingsIcon, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'

export default function Settings() {
  const { user, refetch } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData(e.target)
      await api.post('/user/updateProfile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('プロフィールを更新しました')
      refetch()
    } catch {
      toast.error('更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="設定" subtitle="アカウント設定" />

      <div className="max-w-2xl">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-300">プロフィール</h3>
          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white">
                {(user?.email || 'U')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">{user?.email || 'User'}</p>
              </div>
            </div>

            <Input label="メールアドレス" name="email" defaultValue={user?.email || ''} type="email" disabled />

            <Button type="submit" disabled={loading}>
              <Save size={16} /> {loading ? '保存中...' : '保存'}
            </Button>
          </form>
        </Card>

        <Card className="mt-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-300">メール設定</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.target)
              try {
                await api.post('/user/mailSettings', Object.fromEntries(formData))
                toast.success('メール設定を保存しました')
              } catch {
                toast.error('保存に失敗しました')
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">メールプロバイダー</label>
              <select
                name="provider"
                className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white"
              >
                <option value="gmail">Gmail</option>
                <option value="zoho">Zoho</option>
              </select>
            </div>
            <Input label="SMTPホスト" name="smtpHost" placeholder="smtp.gmail.com" />
            <Input label="SMTPポート" name="smtpPort" placeholder="587" type="number" />
            <Input label="メール" name="smtpEmail" type="email" />
            <Input label="パスワード" name="smtpPassword" type="password" />

            <div className="flex gap-3">
              <Button type="submit">
                <Save size={16} /> 保存
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await api.post('/user/sendTestMail')
                    toast.success('テストメールを送信しました')
                  } catch {
                    toast.error('送信に失敗しました')
                  }
                }}
              >
                テスト送信
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
