import { Menu, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function TopBar({ onMenuToggle }) {
  const { user } = useAuth()

  return (
    <header className="flex h-16 items-center justify-between border-b border-[#1e293b] bg-[#0f172a]/80 backdrop-blur-md px-4 md:px-6">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
      >
        <Menu size={20} />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-4">
        <button className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
          <Bell size={20} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
        </button>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-200">
              {user?.email || 'User'}
            </p>
          </div>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
            {(user?.email || 'U')[0].toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  )
}
