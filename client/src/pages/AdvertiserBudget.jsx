import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle, PlusCircle, BarChart2, ShieldCheck } from 'lucide-react'
import api from '../lib/api'
import { useAdvertiser } from '../hooks/useAdvertiser'
import { Card, PageHeader, Button, Input, Table, Badge } from '../components/UI'
import { formatCurrency, formatDate } from '../lib/utils'

const MIN_DEPOSIT = 50000

export default function AdvertiserBudget() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { advertiser, hasProfile, isLoading: profileLoading } = useAdvertiser()
  const [amount, setAmount] = useState('')

  useEffect(() => {
    if (searchParams.get('success') === '1') toast.success('入金が完了しました！')
    if (searchParams.get('cancelled') === '1') toast.info('支払いがキャンセルされました')
    if (searchParams.get('error')) toast.error('エラーが発生しました')
  }, [searchParams])

  const { data, isLoading } = useQuery({
    queryKey: ['advertiser-budget'],
    queryFn: async () => {
      const res = await api.get('/api/advertiser/budget')
      return res.data
    },
    enabled: hasProfile,
  })

  const depositMutation = useMutation({
    mutationFn: (amt) => api.post('/api/advertiser/budget/deposit', { amount: amt }),
    onSuccess: (res) => {
      window.location.href = res.data.url
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || '入金処理に失敗しました')
    },
  })

  if (profileLoading) return null
  if (!hasProfile) {
    return (
      <div>
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-3">
            <Wallet size={28} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Budget & Billing</h1>
            <p className="text-slate-400 text-sm">Top up your balance and track ad spend</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <Wallet size={22} className="mb-3 text-emerald-400" />
            <p className="font-semibold text-white mb-1">Prepaid Balance</p>
            <p className="text-sm text-slate-400">Add funds to your account and spend only what you choose — no surprise charges.</p>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <BarChart2 size={22} className="mb-3 text-blue-400" />
            <p className="font-semibold text-white mb-1">Transaction History</p>
            <p className="text-sm text-slate-400">See every deposit and deduction in a clear, itemised ledger.</p>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <ShieldCheck size={22} className="mb-3 text-violet-400" />
            <p className="font-semibold text-white mb-1">Secure Payments</p>
            <p className="text-sm text-slate-400">Top up safely via Stripe — your card details are never stored on our servers.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-800/20 p-12 text-center">
          <Wallet size={48} className="mx-auto mb-4 text-slate-600" />
          <h2 className="text-xl font-bold text-white mb-2">No advertiser account yet</h2>
          <p className="text-slate-400 mb-6 max-w-sm mx-auto">
            Create an advertiser account to manage your budget and start running campaigns.
          </p>
          <button
            onClick={() => navigate('/dashboard/advertiser/register')}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            <PlusCircle size={16} />
            Create an advertiser account
          </button>
        </div>
      </div>
    )
  }

  const amountNum = parseInt(amount, 10)
  const isValidAmount = !isNaN(amountNum) && amountNum >= MIN_DEPOSIT

  const handleDeposit = () => {
    if (!isValidAmount) return
    depositMutation.mutate(amountNum)
  }

  const txns = data?.transactions || []
  const balance = data?.balance || 0

  return (
    <div>
      <PageHeader
        title="予算管理"
        subtitle="広告予算のチャージと利用履歴"
      />

      {/* Balance + Deposit */}
      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 p-4">
              <Wallet size={28} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">現在の残高</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(balance)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-medium text-slate-300">予算チャージ</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                type="number"
                placeholder="50000"
                min={MIN_DEPOSIT}
                step={1000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amount && !isValidAmount && (
                <p className="mt-1 text-xs text-amber-400">最低チャージ金額は¥{MIN_DEPOSIT.toLocaleString()}です</p>
              )}
            </div>
            <Button
              onClick={handleDeposit}
              disabled={!isValidAmount || depositMutation.isPending}
            >
              <Plus size={16} />
              {depositMutation.isPending ? '処理中...' : 'チャージ'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Stripeの安全な決済ページに移動します（JPY）</p>
        </Card>
      </div>

      {/* Quick-select amounts */}
      <div className="mb-8 flex gap-2 flex-wrap">
        {[50000, 100000, 300000, 500000].map((preset) => (
          <button
            key={preset}
            onClick={() => setAmount(String(preset))}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-violet-500 hover:text-white transition-colors"
          >
            ¥{preset.toLocaleString()}
          </button>
        ))}
      </div>

      {/* Transaction History */}
      <Card className="p-0">
        <div className="border-b border-slate-700/50 px-6 py-4">
          <h3 className="font-semibold text-white">取引履歴</h3>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-slate-400">読み込み中...</div>
        ) : txns.length === 0 ? (
          <div className="p-6 text-center text-slate-400">取引履歴がありません</div>
        ) : (
          <Table headers={['日時', '種別', '金額', '参照']}>
            {txns.map((t) => (
              <tr key={t._id} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-slate-300 text-sm">{formatDate(t.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5">
                    {t.type === 'deposit' ? (
                      <><ArrowUpCircle size={14} className="text-emerald-400" /><Badge variant="success">入金</Badge></>
                    ) : (
                      <><ArrowDownCircle size={14} className="text-red-400" /><Badge variant="danger">利用</Badge></>
                    )}
                  </span>
                </td>
                <td className={`px-4 py-3 font-medium text-sm ${t.type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.type === 'deposit' ? '+' : ''}{formatCurrency(t.amount)}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[200px]">
                  {t.stripeSessionId || t.campaignId || '—'}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}
