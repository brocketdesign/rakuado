import { useState, useRef, useEffect } from 'react'
import { Menu, Bell, Settings, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function TopBar({ onMenuToggle }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayName = user?.name || user?.email || 'User'
  const initials = displayName[0].toUpperCase()

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

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(prev => !prev)}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-800 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-200 leading-none">{displayName}</p>
            </div>
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt={displayName}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-violet-500/40"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white ring-2 ring-violet-500/40">
                {initials}
              </div>
            )}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[#1e293b] bg-[#0f172a] shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e293b]">
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setOpen(false); navigate('/settings') }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Settings size={16} />
                Settings
              </button>
              <button
                onClick={() => { setOpen(false); logout() }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors"
              >
                <LogOut size={16} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
