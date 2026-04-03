import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, EmptyState } from '../components/UI'
import { TestTubes, Plus, Trash2, Eye, MousePointerClick } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ABTests() {
  const queryClient = useQueryClient()

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ['ab-tests'],
    queryFn: async () => {
      const res = await api.get('/api/abtest/tests')
      return res.data || []
    },
    retry: false,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ testId, isActive }) =>
      api.patch('/api/abtest/activate-test', { testId, isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries(['ab-tests'])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (testId) => api.delete(`/api/abtest/delete-ab-test/${testId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['ab-tests'])
      toast.success('削除しました')
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="A/Bテスト" subtitle="バリエーションテストの管理">
        <Link to="/dashboard/create-ab-test">
          <Button><Plus size={16} /> 新規テスト</Button>
        </Link>
      </PageHeader>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
        </div>
      ) : tests.length === 0 ? (
        <EmptyState title="テストがありません" icon={TestTubes}>
          <Link to="/dashboard/create-ab-test">
            <Button><Plus size={16} /> テストを作成</Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {tests.map((test) => {
            const cvrA = test.variantA?.views ? ((test.variantA.clicks / test.variantA.views) * 100).toFixed(1) : '0.0'
            const cvrB = test.variantB?.views ? ((test.variantB.clicks / test.variantB.views) * 100).toFixed(1) : '0.0'

            return (
              <Card key={test._id} className="relative">
                <div className="absolute right-4 top-4 flex gap-2">
                  <button
                    onClick={() => toggleMutation.mutate({ testId: test._id, isActive: !test.isActive })}
                    className={`h-6 w-11 rounded-full transition-colors ${test.isActive ? 'bg-violet-600' : 'bg-slate-600'}`}
                  >
                    <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${test.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <button
                    onClick={() => window.confirm('削除しますか？') && deleteMutation.mutate(test._id)}
                    className="rounded-lg p-1 text-slate-400 hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <p className="mb-4 text-xs text-slate-500">
                  作成: {new Date(test.createdAt).toLocaleDateString('ja-JP')}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {/* Variant A */}
                  <div className="rounded-xl border border-slate-700 p-3">
                    <p className="mb-2 text-xs font-semibold text-violet-400">バリアント A</p>
                    {test.variantA?.imageUrl && (
                      <img src={test.variantA.imageUrl} alt="A" className="mb-2 w-full rounded-lg object-cover h-24" />
                    )}
                    <p className="text-sm text-white">{test.variantA?.name || 'A'}</p>
                    <div className="mt-2 flex gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Eye size={12} /> {test.variantA?.views || 0}</span>
                      <span className="flex items-center gap-1"><MousePointerClick size={12} /> {test.variantA?.clicks || 0}</span>
                      <span className="text-emerald-400">{cvrA}%</span>
                    </div>
                  </div>

                  {/* Variant B */}
                  <div className="rounded-xl border border-slate-700 p-3">
                    <p className="mb-2 text-xs font-semibold text-blue-400">バリアント B</p>
                    {test.variantB?.imageUrl && (
                      <img src={test.variantB.imageUrl} alt="B" className="mb-2 w-full rounded-lg object-cover h-24" />
                    )}
                    <p className="text-sm text-white">{test.variantB?.name || 'B'}</p>
                    <div className="mt-2 flex gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Eye size={12} /> {test.variantB?.views || 0}</span>
                      <span className="flex items-center gap-1"><MousePointerClick size={12} /> {test.variantB?.clicks || 0}</span>
                      <span className="text-emerald-400">{cvrB}%</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <Badge variant={test.isActive ? 'success' : 'default'}>
                    {test.isActive ? 'アクティブ' : '停止中'}
                  </Badge>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
