import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { Briefcase, Megaphone, CheckCircle, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

const TYPES = [
  {
    value: 'partner',
    icon: Briefcase,
    title: 'パートナー（ブログ・メディア）',
    titleEn: 'Partner',
    description:
      'WordPressや独自ブログに広告を設置して収益を得たい方向けです。サイトを登録し、審査を通過するとクリック報酬が発生します。',
    highlights: ['広告スクリプトを設置するだけ', '月次報酬を受け取れる', 'アクセス解析も確認できる'],
    color: 'violet',
  },
  {
    value: 'advertiser',
    icon: Megaphone,
    title: '広告主（プロモーション）',
    titleEn: 'Advertiser',
    description:
      'パートナーサイトに広告を出稿してサービスや商品を宣伝したい方向けです。キャンペーンを作成し予算を設定するだけで広告配信が始まります。',
    highlights: ['キャンペーンを簡単に作成', '予算・入札額を自由設定', '効果測定レポートを確認できる'],
    color: 'blue',
  },
]

const COLOR = {
  violet: {
    ring: 'ring-violet-500',
    bg: 'bg-violet-500/10',
    icon: 'text-violet-400',
    check: 'text-violet-400',
    btn: 'bg-violet-600 hover:bg-violet-500',
    dot: 'bg-violet-400',
  },
  blue: {
    ring: 'ring-blue-500',
    bg: 'bg-blue-500/10',
    icon: 'text-blue-400',
    check: 'text-blue-400',
    btn: 'bg-blue-600 hover:bg-blue-500',
    dot: 'bg-blue-400',
  },
}

export default function AccountTypeSelection() {
  const [selected, setSelected] = useState(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (accountType) => api.post('/user/account-type', { accountType }).then((r) => r.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] })
      navigate('/dashboard', { replace: true })
    },
    onError: () => toast.error('保存に失敗しました。もう一度お試しください。'),
  })

  const chosen = TYPES.find((t) => t.value === selected)

  return (
    <div className="min-h-screen bg-[#0b1120] flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="mb-10 text-center">
        <span className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
          Rakuado
        </span>
        <h1 className="mt-4 text-2xl font-bold text-slate-100">アカウントの種類を選んでください</h1>
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">
          ご利用目的に合った機能だけを表示します。後から設定で変更することもできます。
        </p>
      </div>

      {/* Cards */}
      <div className="grid w-full max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
        {TYPES.map((type) => {
          const c = COLOR[type.color]
          const isSelected = selected === type.value
          return (
            <button
              key={type.value}
              onClick={() => setSelected(type.value)}
              className={`relative flex flex-col rounded-2xl border p-6 text-left transition-all duration-200 focus:outline-none
                ${isSelected
                  ? `border-transparent ring-2 ${c.ring} ${c.bg}`
                  : 'border-slate-700/60 bg-slate-800/60 hover:border-slate-600 hover:bg-slate-800'
                }`}
            >
              {/* Selected checkmark */}
              {isSelected && (
                <CheckCircle
                  size={20}
                  className={`absolute right-4 top-4 ${c.check}`}
                />
              )}

              {/* Icon */}
              <div className={`mb-4 w-fit rounded-xl p-3 ${c.bg}`}>
                <type.icon size={26} className={c.icon} />
              </div>

              <h2 className="mb-1 text-base font-bold text-slate-100">{type.title}</h2>
              <p className="mb-4 text-xs leading-relaxed text-slate-400">{type.description}</p>

              <ul className="space-y-1.5">
                {type.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
                    {h}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      {/* CTA */}
      <div className="mt-8 w-full max-w-2xl">
        <button
          disabled={!selected || mutation.isPending}
          onClick={() => mutation.mutate(selected)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition-all duration-200
            ${selected ? (chosen ? COLOR[chosen.color].btn : '') : 'bg-slate-700 cursor-not-allowed opacity-50'}
            ${mutation.isPending ? 'opacity-60 cursor-not-allowed' : ''}
          `}
        >
          {mutation.isPending ? (
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <>
              {selected
                ? `「${TYPES.find((t) => t.value === selected)?.titleEn}」として始める`
                : 'アカウントの種類を選んでください'}
              {selected && <ArrowRight size={16} />}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
