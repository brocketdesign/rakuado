import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, BarChart3, Users, UserPlus, Mail,
  Globe, TestTubes, Megaphone, Key, FileText,
  MailPlus, Settings, LogOut, X, CreditCard, ChevronDown, ChevronRight,
  Briefcase, TrendingUp, LineChart, Wallet, PlusCircle, ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'

// Groups shown to all logged-in users (non-admins)
const userMenuGroups = [
  {
    label: 'マイページ',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'ホーム', end: true },
    ],
  },
]

// Additional groups shown only to admins
const adminMenuGroups = [
  {
    label: 'アナリティクス',
    items: [
      { to: '/dashboard/analytics', icon: BarChart3, label: 'アナリティクス' },
      { to: '/dashboard/google-analytics', icon: LineChart, label: 'Googleアナリティクス' },
    ],
  },
  {
    label: 'パートナー管理',
    items: [
      { to: '/dashboard/partners', icon: CreditCard, label: 'パートナー支払い' },
      { to: '/dashboard/partner-list', icon: Users, label: 'パートナー一覧' },
      { to: '/dashboard/partner-recruitment', icon: UserPlus, label: 'パートナー募集' },
      { to: '/dashboard/partner-emails', icon: Mail, label: 'パートナーメール' },
    ],
  },
  {
    label: '広告管理',
    items: [
      { to: '/dashboard/advertiser-admin', icon: Users, label: '広告主管理' },
      { to: '/dashboard/affiliate', icon: Globe, label: 'アフィリエイト' },
      { to: '/dashboard/ab-tests', icon: TestTubes, label: 'A/Bテスト' },
      { to: '/dashboard/referral', icon: Megaphone, label: 'リファラル' },
      { to: '/dashboard/ad-management', icon: ShieldCheck, label: '広告ネットワーク管理' },
    ],
  },
  {
    label: 'ツール',
    items: [
      { to: '/dashboard/mailing-lists', icon: MailPlus, label: 'メーリングリスト' },
      { to: '/dashboard/api-keys', icon: Key, label: 'APIキー' },
      { to: '/dashboard/api-docs', icon: FileText, label: 'APIドキュメント' },
      { to: '/dashboard/admin-email-dashboard', icon: Mail, label: 'メール通知設定' },
    ],
  },
]

function NavGroup({ group, collapsed, onToggle, onClose }) {
  return (
    <div className="mb-2">
      <button
        onClick={() => onToggle(group.label)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
      >
        {group.label}
        {collapsed[group.label] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      {!collapsed[group.label] && (
        <div className="space-y-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'active text-white'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ onClose }) {
  const { user, logout, isAdmin } = useAuth()
  const [collapsed, setCollapsed] = useState({})

  const accountType = user?.accountType // 'partner' | 'advertiser' | null

  const toggleGroup = (label) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  // Build the user-visible menu based on account type
  const filteredUserGroups = userMenuGroups
    .map((group) => {
      if (group.label === 'マイページ') return group // always show home
      return null
    })
    .filter(Boolean)

  // Partner section (only for partner accounts)
  const partnerGroup = accountType === 'partner'
    ? [{
        label: 'パートナー',
        items: [
          { to: '/dashboard/partner-portal', icon: Briefcase, label: 'パートナーポータル' },
        ],
      }]
    : []

  // Advertiser section (only for advertiser accounts)
  const advertiserGroup = accountType === 'advertiser'
    ? [{
        label: '広告主',
        items: [
          { to: '/dashboard/advertiser', icon: Megaphone, label: '広告ダッシュボード' },
          { to: '/dashboard/advertiser/campaigns', icon: PlusCircle, label: 'キャンペーン' },
          { to: '/dashboard/advertiser/budget', icon: Wallet, label: '予算管理' },
        ],
      }]
    : []

  const visibleGroups = isAdmin
    ? [...filteredUserGroups, ...partnerGroup, ...advertiserGroup, ...adminMenuGroups]
    : [...filteredUserGroups, ...partnerGroup, ...advertiserGroup]

  return (
    <div className="flex h-full flex-col bg-[#0f172a] border-r border-[#1e293b]">
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-[#1e293b]">
        <span className="text-xl font-bold gradient-text">Rakuado</span>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {visibleGroups.map((group) => (
          <NavGroup
            key={group.label}
            group={group}
            collapsed={collapsed}
            onToggle={toggleGroup}
            onClose={onClose}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#1e293b] p-3 space-y-1">
        <NavLink
          to="/dashboard/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
        >
          <Settings size={18} />
          設定
        </NavLink>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut size={18} />
          ログアウト
        </button>
      </div>
    </div>
  )
}
