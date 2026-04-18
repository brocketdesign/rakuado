import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/utils'
import { PageHeader, StatCard, Card, Tabs, Badge, Button, Input } from '../components/UI'
import { CreditCard, CheckCircle, Clock, Users, Search, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

export default function Partners() {
  const [period, setPeriod] = useState('current')
  const [tab, setTab] = useState('payments')
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['partner-payments', period],
    queryFn: async () => {
      const res = await api.get('/api/partners/payments/calculate', { params: { period } })
      return res.data.data
    },
  })

  const recalcMutation = useMutation({
    mutationFn: () => api.post('/api/partners/payments/recalculate', { period }),
    onSuccess: () => {
      queryClient.invalidateQueries(['partner-payments'])
      toast.success('アクティブ日数を再計算しました')
    },
    onError: () => toast.error('再計算に失敗しました'),
  })

  const payments = data?.payments || []
  const filteredPayments = payments.filter((p) =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.domain || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalPayment = data?.totalPayment || payments.reduce((sum, p) => sum + (p.amount || 0), 0)
  const confirmed = payments.filter((p) => p.paymentConfirmed).length
  const pending = payments.filter((p) => !p.paymentConfirmed).length
  const active = payments.filter((p) => (p.daysActive || 0) > 0).length

  return (
    <div className="space-y-6">
      <PageHeader title="パートナー支払い管理" subtitle="支払い計算と確認">
        <div className="flex items-center gap-3">
          <Tabs
            tabs={[
              { value: 'current', label: '今月' },
              { value: 'previous', label: '先月' },
            ]}
            active={period}
            onChange={setPeriod}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
          >
            <RefreshCw size={16} className={recalcMutation.isPending ? 'animate-spin' : ''} />
            再計算
          </Button>
        </div>
      </PageHeader>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="合計支払額" value={formatCurrency(totalPayment)} icon={CreditCard} color="violet" />
        <StatCard title="確認済み" value={confirmed} icon={CheckCircle} color="green" />
        <StatCard title="未確認" value={pending} icon={Clock} color="amber" />
        <StatCard title="アクティブパートナー" value={active} icon={Users} color="blue" />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { value: 'payments', label: '支払い' },
          { value: 'history', label: '履歴' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'payments' && (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="パートナー名で検索..."
              className="w-full rounded-xl border border-slate-600 bg-slate-800/50 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500"
            />
          </div>

          {/* Payment Table */}
          <Card className="p-0 overflow-hidden">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-800/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">サイト</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">パートナー名</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">月額</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">稼働日数</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">支払額</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">ステータス</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">確認</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {filteredPayments.map((p, i) => (
                      <tr key={p._id || i} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3 text-slate-300">{p.domain || '—'}</td>
                        <td className="px-4 py-3 text-white font-medium">{p.name || '—'}</td>
                        <td className="px-4 py-3 text-slate-300">{formatCurrency(p.monthlyAmount || 0)}</td>
                        <td className="px-4 py-3 text-slate-300">{p.daysActive || 0}日</td>
                        <td className="px-4 py-3 text-white font-medium">{formatCurrency(p.amount || 0)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={p.paymentCycle === '翌月' ? 'purple' : 'info'}>
                            {p.paymentCycle || '当月'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={p.paymentConfirmed ? 'success' : 'warning'}>
                            {p.paymentConfirmed ? '確認済み' : '未確認'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPayments.length === 0 && (
                  <div className="py-12 text-center text-sm text-slate-500">データがありません</div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'history' && (
        <Card>
          <h3 className="mb-4 text-sm font-medium text-slate-300">支払い履歴 (6ヶ月)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.history || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  color: '#f1f5f9',
                }}
              />
              <Bar dataKey="total" name="支払額" fill="#667eea" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  )
}
