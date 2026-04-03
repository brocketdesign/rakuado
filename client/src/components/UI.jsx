import { cn } from '../lib/utils'

export function Card({ children, className, ...props }) {
  return (
    <div className={cn('glass-card p-6', className)} {...props}>
      {children}
    </div>
  )
}

export function StatCard({ title, value, icon: Icon, trend, color = 'violet' }) {
  const colorMap = {
    violet: 'from-violet-500/20 to-purple-500/20 text-violet-400',
    blue: 'from-blue-500/20 to-cyan-500/20 text-blue-400',
    green: 'from-emerald-500/20 to-green-500/20 text-emerald-400',
    amber: 'from-amber-500/20 to-yellow-500/20 text-amber-400',
    red: 'from-red-500/20 to-rose-500/20 text-red-400',
  }

  return (
    <div className="stat-card glass-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          {trend && (
            <p className={`mt-1 text-xs ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {trend > 0 ? '+' : ''}{trend}%
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-xl bg-gradient-to-br p-3', colorMap[color])}>
            <Icon size={22} />
          </div>
        )}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}

export function Badge({ children, variant = 'default', className }) {
  const variants = {
    default: 'bg-slate-700 text-slate-300',
    success: 'bg-emerald-500/20 text-emerald-400',
    warning: 'bg-amber-500/20 text-amber-400',
    danger: 'bg-red-500/20 text-red-400',
    info: 'bg-blue-500/20 text-blue-400',
    purple: 'bg-purple-500/20 text-purple-400',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}

export function Button({ children, variant = 'primary', size = 'md', className, ...props }) {
  const variants = {
    primary: 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/25',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
    ghost: 'hover:bg-slate-800 text-slate-400 hover:text-white',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
    outline: 'border border-slate-600 hover:border-violet-500 text-slate-300 hover:text-white',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({ label, className, ...props }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>}
      <input
        className={cn(
          'w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500',
          className
        )}
        {...props}
      />
    </div>
  )
}

export function Select({ label, children, className, ...props }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>}
      <select
        className={cn(
          'w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

export function Textarea({ label, className, ...props }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>}
      <textarea
        className={cn(
          'w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500',
          className
        )}
        {...props}
      />
    </div>
  )
}

export function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 bg-slate-800/30">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {children}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyState({ title, description, icon: Icon, children }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="mb-4 rounded-2xl bg-slate-800 p-4">
          <Icon size={32} className="text-slate-500" />
        </div>
      )}
      <h3 className="text-lg font-medium text-slate-300">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-800/50 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            active === tab.value
              ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
