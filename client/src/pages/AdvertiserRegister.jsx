import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAdvertiser } from '../hooks/useAdvertiser'
import { Card, PageHeader, Button, Input } from '../components/UI'

export default function AdvertiserRegister() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasProfile, isLoading } = useAdvertiser()

  const [form, setForm] = useState({ companyName: '', contactName: '', website: '' })

  const mutation = useMutation({
    mutationFn: (data) => api.post('/api/advertiser/register', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['advertiser-profile'])
      toast.success('広告主として登録しました')
      navigate('/dashboard/advertiser')
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || '登録に失敗しました')
    },
  })

  if (isLoading) return null
  if (hasProfile) {
    navigate('/dashboard/advertiser', { replace: true })
    return null
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.companyName.trim() || !form.contactName.trim()) {
      toast.error('会社名と担当者名は必須です')
      return
    }
    mutation.mutate(form)
  }

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader
        title="広告主登録"
        subtitle="RakuAdoの自己配信広告プラットフォームに参加しましょう"
      />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="会社名 *"
            placeholder="株式会社サンプル"
            value={form.companyName}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            required
          />
          <Input
            label="担当者名 *"
            placeholder="山田 太郎"
            value={form.contactName}
            onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
            required
          />
          <Input
            label="ウェブサイト"
            placeholder="https://example.com"
            type="url"
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          />

          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 text-sm text-slate-400 space-y-1">
            <p className="font-medium text-slate-300">ご利用の流れ</p>
            <p>1. 登録 → 2. 予算チャージ（最低¥50,000） → 3. キャンペーン作成 → 4. 審査承認 → 5. 配信開始</p>
          </div>

          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? '登録中...' : '登録する'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
