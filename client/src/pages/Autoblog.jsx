import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, EmptyState } from '../components/UI'
import { Bot, Plus, Settings, Trash2, Copy, Power, PowerOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Autoblog() {
  const [searchParams] = useSearchParams()
  const blogId = searchParams.get('blogId')
  const botId = searchParams.get('botId')
  const queryClient = useQueryClient()

  const { data: blogs = [], isLoading } = useQuery({
    queryKey: ['autoblog-blogs'],
    queryFn: async () => {
      // Get blog list from the autoblog page data
      const res = await api.get('/api/autoblog/blogs')
      return res.data || []
    },
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/autoblog/blog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['autoblog-blogs'])
      toast.success('削除しました')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id) => api.post(`/api/autoblog/duplicate-blog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['autoblog-blogs'])
      toast.success('複製しました')
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="オートブログ" subtitle="WordPressブログの自動投稿管理">
        <Link to="/dashboard/autoblog/blog-info">
          <Button><Plus size={16} /> 新規ブログ</Button>
        </Link>
      </PageHeader>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
        </div>
      ) : blogs.length === 0 ? (
        <EmptyState
          title="ブログが登録されていません"
          description="新しいWordPressブログを追加して自動投稿を始めましょう"
          icon={Bot}
        >
          <Link to="/dashboard/autoblog/blog-info">
            <Button><Plus size={16} /> ブログを追加</Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {blogs.map((blog) => (
            <Card key={blog._id} className="group relative">
              <div className="absolute right-4 top-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => duplicateMutation.mutate(blog._id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                  title="複製"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => window.confirm('削除しますか？') && deleteMutation.mutate(blog._id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                  title="削除"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mb-4">
                <h3 className="font-medium text-white">{blog.blogName || blog.blogUrl || 'Untitled'}</h3>
                {blog.blogUrl && (
                  <a href={blog.blogUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                    {blog.blogUrl}
                  </a>
                )}
              </div>

              <div className="mb-4 flex items-center gap-2">
                <Badge variant={blog.isActive ? 'success' : 'default'}>
                  {blog.isActive ? 'アクティブ' : '停止中'}
                </Badge>
                {blog.postFrequency && (
                  <span className="text-xs text-slate-500">{blog.postFrequency}</span>
                )}
              </div>

              {/* Bots */}
              {blog.bots && blog.bots.length > 0 && (
                <div className="space-y-2 border-t border-slate-700/50 pt-3">
                  <p className="text-xs font-medium text-slate-400">ボット ({blog.bots.length})</p>
                  {blog.bots.map((bot) => (
                    <div key={bot._id} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2">
                      <span className="text-sm text-slate-300">{bot.botName}</span>
                      <Badge variant={bot.isActive ? 'success' : 'default'} className="text-xs">
                        {bot.isActive ? 'ON' : 'OFF'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Link to={`/dashboard/autoblog/blog-info/${blog._id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Settings size={14} /> 設定
                  </Button>
                </Link>
                <Link to={`/dashboard/autoblog/bot?blogId=${blog._id}`} className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full">
                    <Bot size={14} /> ボット
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
