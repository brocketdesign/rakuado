import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Wand2 } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.message || (mode === 'signup' ? '\u767b\u9332\u306b\u5931\u6557\u3057\u307e\u3057\u305f' : '\u30ed\u30b0\u30a4\u30f3\u306b\u5931\u6557\u3057\u307e\u3057\u305f'))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    window.location.href = '/auth/google'
  }

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setSent(false)
    setEmail('')
  }

  const isSignup = mode === 'signup'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600">
            <Wand2 size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Rakuado</h1>
          <p className="mt-2 text-sm text-slate-400">
            {isSignup ? '\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u4f5c\u6210\u3057\u3066\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u3078' : '\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u306b\u30b5\u30a4\u30f3\u30a4\u30f3'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="mb-6 flex rounded-xl border border-slate-700 bg-slate-800/40 p-1">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              !isSignup
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            \u30b5\u30a4\u30f3\u30a4\u30f3
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              isSignup
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            \u65b0\u898f\u767b\u9332
          </button>
        </div>

        <div className="glass-card p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/20">
                <svg className="h-7 w-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white mb-2">\u30e1\u30fc\u30eb\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044</h3>
              <p className="text-sm text-slate-400">
                {isSignup
                  ? '\u30a2\u30ab\u30a6\u30f3\u30c8\u78ba\u8a8d\u30e1\u30fc\u30eb\u3092\u9001\u4fe1\u3057\u307e\u3057\u305f\u3002\u30e1\u30fc\u30eb\u5185\u306e\u30ea\u30f3\u30af\u3092\u30af\u30ea\u30c3\u30af\u3057\u3066\u304f\u3060\u3055\u3044\u3002'
                  : '\u30b5\u30a4\u30f3\u30a4\u30f3\u30ea\u30f3\u30af\u3092\u30e1\u30fc\u30eb\u3067\u9001\u4fe1\u3057\u307e\u3057\u305f\u3002\u30e1\u30fc\u30eb\u5185\u306e\u30ea\u30f3\u30af\u3092\u30af\u30ea\u30c3\u30af\u3057\u3066\u304f\u3060\u3055\u3044\u3002'}
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-6 text-sm text-violet-400 hover:text-violet-300 underline"
              >
                \u5225\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u3067\u8a66\u3059
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Google */}
              <button
                onClick={handleGoogleLogin}
                className="mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google{isSignup ? '\u3067\u767b\u9332' : '\u3067\u30b5\u30a4\u30f3\u30a4\u30f3'}
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#1e293b] px-4 text-slate-500">\u307e\u305f\u306f</span>
                </div>
              </div>

              {/* Email form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3 text-sm font-medium text-white hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 transition-all"
                >
                  {loading ? '\u9001\u4fe1\u4e2d...' : isSignup ? '\u78ba\u8a8d\u30e1\u30fc\u30eb\u3092\u9001\u4fe1' : '\u30b5\u30a4\u30f3\u30a4\u30f3\u30ea\u30f3\u30af\u3092\u9001\u4fe1'}
                </button>
              </form>

              {isSignup && (
                <p className="mt-4 text-center text-xs text-slate-500">
                  \u767b\u9332\u3059\u308b\u3053\u3068\u3067\u5229\u7528\u898f\u7d04\u3068\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc\u306b\u540c\u610f\u3059\u308b\u3082\u306e\u3068\u3057\u307e\u3059\u3002
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
