import { useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronRight, ChevronLeft, Upload, X, Check, Send } from 'lucide-react'
import api from '../lib/api'
import { useAdvertiser } from '../hooks/useAdvertiser'
import { Card, PageHeader, Button, Input, Select } from '../components/UI'

const STEPS = ['キャンペーン情報', 'クリエイティブ', '確認・提出']

const INITIAL_CAMPAIGN = {
  name: '',
  type: 'banner',
  bidType: 'CPM',
  bidAmount: 500,
  dailyBudget: 10000,
  totalBudget: 100000,
  startDate: '',
  endDate: '',
}

const INITIAL_CREATIVE = {
  altText: '',
  destinationUrl: '',
  file: null,
  preview: null,
}

export default function AdvertiserCampaignForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const { hasProfile, isLoading: profileLoading } = useAdvertiser()
  const fileRef = useRef(null)

  const isEdit = !!id
  const [step, setStep] = useState(0)
  const [campaign, setCampaign] = useState(INITIAL_CAMPAIGN)
  const [creative, setCreative] = useState(INITIAL_CREATIVE)
  const [savedCampaignId, setSavedCampaignId] = useState(null)

  // Load existing campaign in edit mode
  useQuery({
    queryKey: ['advertiser-campaign-edit', id],
    queryFn: async () => {
      const res = await api.get(`/api/advertiser/campaigns/${id}`)
      const c = res.data.campaign
      setCampaign({
        name: c.name,
        type: c.type,
        bidType: c.bidType,
        bidAmount: c.bidAmount,
        dailyBudget: c.dailyBudget,
        totalBudget: c.totalBudget,
        startDate: c.startDate ? c.startDate.slice(0, 10) : '',
        endDate: c.endDate ? c.endDate.slice(0, 10) : '',
      })
      setSavedCampaignId(id)
      return c
    },
    enabled: isEdit,
  })

  const campaignMutation = useMutation({
    mutationFn: (data) =>
      isEdit && savedCampaignId
        ? api.put(`/api/advertiser/campaigns/${savedCampaignId}`, data)
        : api.post('/api/advertiser/campaigns', data),
    onSuccess: (res) => {
      if (!isEdit || !savedCampaignId) {
        setSavedCampaignId(res.data.campaign._id)
      }
      queryClient.invalidateQueries(['advertiser-campaigns'])
      setStep(1)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'キャンペーンの保存に失敗しました'),
  })

  const creativeMutation = useMutation({
    mutationFn: (formData) => api.post('/api/advertiser/creatives', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    onSuccess: () => {
      setStep(2)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'クリエイティブのアップロードに失敗しました'),
  })

  const submitMutation = useMutation({
    mutationFn: (cid) => api.post(`/api/advertiser/campaigns/${cid}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries(['advertiser-campaigns'])
      toast.success('審査に提出しました！承認後に配信開始されます。')
      navigate('/dashboard/advertiser/campaigns')
    },
    onError: (err) => toast.error(err.response?.data?.error || '提出に失敗しました'),
  })

  if (profileLoading) return null
  if (!hasProfile) {
    navigate('/dashboard/advertiser/register', { replace: true })
    return null
  }

  const handleFileSelect = (file) => {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) { toast.error('JPEG / PNG / GIF / WEBP のみ対応'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('2MB以下のファイルを選択してください'); return }
    setCreative((prev) => ({ ...prev, file, preview: URL.createObjectURL(file) }))
  }

  const handleStep0 = (e) => {
    e.preventDefault()
    if (!campaign.name.trim()) { toast.error('キャンペーン名を入力してください'); return }
    if (campaign.bidAmount < 1) { toast.error('入札単価は1以上にしてください'); return }
    if (campaign.dailyBudget < campaign.bidAmount) { toast.error('日次予算は入札単価以上にしてください'); return }
    if (campaign.totalBudget < campaign.dailyBudget) { toast.error('合計予算は日次予算以上にしてください'); return }
    campaignMutation.mutate(campaign)
  }

  const handleStep1 = (e) => {
    e.preventDefault()
    if (!creative.file && !isEdit) { toast.error('バナー画像をアップロードしてください'); return }
    if (!creative.destinationUrl.trim()) { toast.error('遷移先URLを入力してください'); return }
    if (creative.file) {
      const formData = new FormData()
      formData.append('image', creative.file)
      formData.append('campaignId', savedCampaignId)
      formData.append('altText', creative.altText)
      formData.append('destinationUrl', creative.destinationUrl)
      creativeMutation.mutate(formData)
    } else {
      setStep(2)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title={isEdit ? 'キャンペーン編集' : '新規キャンペーン作成'}
        subtitle="審査通過後に配信が開始されます"
      />

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              {i < step ? <Check size={13} /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'text-white font-medium' : 'text-slate-500'}`}>{label}</span>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-600 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 0: Campaign Info */}
      {step === 0 && (
        <Card>
          <form onSubmit={handleStep0} className="space-y-5">
            <Input
              label="キャンペーン名 *"
              placeholder="春キャンペーン2025"
              value={campaign.name}
              onChange={(e) => setCampaign((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="広告種別 *"
                value={campaign.type}
                onChange={(e) => setCampaign((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="banner">バナー</option>
                <option value="in-article">記事内</option>
                <option value="product-card">商品カード</option>
              </Select>
              <Select
                label="入札方式 *"
                value={campaign.bidType}
                onChange={(e) => setCampaign((f) => ({ ...f, bidType: e.target.value }))}
              >
                <option value="CPM">CPM（1000表示あたり）</option>
                <option value="CPC">CPC（クリックあたり）</option>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label={`入札単価 (¥/${campaign.bidType}) *`}
                type="number"
                min={1}
                value={campaign.bidAmount}
                onChange={(e) => setCampaign((f) => ({ ...f, bidAmount: parseInt(e.target.value, 10) || 0 }))}
              />
              <Input
                label="日次予算 (¥) *"
                type="number"
                min={100}
                value={campaign.dailyBudget}
                onChange={(e) => setCampaign((f) => ({ ...f, dailyBudget: parseInt(e.target.value, 10) || 0 }))}
              />
              <Input
                label="合計予算 (¥) *"
                type="number"
                min={100}
                value={campaign.totalBudget}
                onChange={(e) => setCampaign((f) => ({ ...f, totalBudget: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="開始日"
                type="date"
                value={campaign.startDate}
                onChange={(e) => setCampaign((f) => ({ ...f, startDate: e.target.value }))}
              />
              <Input
                label="終了日"
                type="date"
                value={campaign.endDate}
                onChange={(e) => setCampaign((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>キャンセル</Button>
              <Button type="submit" disabled={campaignMutation.isPending}>
                {campaignMutation.isPending ? '保存中...' : '次へ'}
                <ChevronRight size={16} />
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Step 1: Creative */}
      {step === 1 && (
        <Card>
          <form onSubmit={handleStep1} className="space-y-5">
            {/* Drop zone */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                バナー画像 {!isEdit && '*'} <span className="text-slate-500 font-normal">(JPEG/PNG/GIF/WEBP, 最大2MB)</span>
              </label>
              <div
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  creative.preview ? 'border-violet-500/50 bg-violet-500/5' : 'border-slate-600 hover:border-slate-500'
                }`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]) }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                />
                {creative.preview ? (
                  <>
                    <img src={creative.preview} alt="preview" className="max-h-32 rounded-lg object-contain mb-2" />
                    <button
                      type="button"
                      className="absolute top-2 right-2 rounded-full bg-slate-700 p-1 hover:bg-red-600 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setCreative((p) => ({ ...p, file: null, preview: null })) }}
                    >
                      <X size={14} />
                    </button>
                    <p className="text-xs text-slate-400">{creative.file?.name}</p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="mb-3 text-slate-500" />
                    <p className="text-slate-400 text-sm">クリックまたはドラッグ&ドロップ</p>
                  </>
                )}
              </div>
            </div>

            <Input
              label="代替テキスト (alt)"
              placeholder="春の新商品バナー"
              value={creative.altText}
              onChange={(e) => setCreative((f) => ({ ...f, altText: e.target.value }))}
            />
            <Input
              label="遷移先URL *"
              type="url"
              placeholder="https://example.com/lp"
              value={creative.destinationUrl}
              onChange={(e) => setCreative((f) => ({ ...f, destinationUrl: e.target.value }))}
              required
            />

            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                <ChevronLeft size={16} />
                戻る
              </Button>
              <Button type="submit" disabled={creativeMutation.isPending}>
                {creativeMutation.isPending ? 'アップロード中...' : '次へ'}
                <ChevronRight size={16} />
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <Card>
          <h3 className="mb-5 font-semibold text-white">内容を確認して審査に提出</h3>
          <dl className="space-y-3 text-sm mb-6">
            {[
              ['キャンペーン名', campaign.name],
              ['広告種別', campaign.type],
              ['入札方式', campaign.bidType],
              ['入札単価', `¥${campaign.bidAmount.toLocaleString()}`],
              ['日次予算', `¥${campaign.dailyBudget.toLocaleString()}`],
              ['合計予算', `¥${campaign.totalBudget.toLocaleString()}`],
              ['開始日', campaign.startDate || '未設定'],
              ['終了日', campaign.endDate || '未設定'],
              ['遷移先URL', creative.destinationUrl],
            ].map(([key, val]) => (
              <div key={key} className="flex gap-4">
                <dt className="w-32 flex-shrink-0 text-slate-400">{key}</dt>
                <dd className="text-slate-200 break-all">{val}</dd>
              </div>
            ))}
          </dl>
          {creative.preview && (
            <div className="mb-6 rounded-xl border border-slate-700/50 p-3">
              <img src={creative.preview} alt="banner preview" className="max-h-32 rounded-lg object-contain" />
            </div>
          )}
          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              <ChevronLeft size={16} />
              戻る
            </Button>
            <Button
              onClick={() => submitMutation.mutate(savedCampaignId)}
              disabled={submitMutation.isPending}
            >
              <Send size={16} />
              {submitMutation.isPending ? '提出中...' : '審査に提出する'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
