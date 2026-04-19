import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, Send, ToggleLeft, ToggleRight, CheckCircle, AlertCircle, Clock,
  Users, Megaphone, DollarSign, FileSearch, Handshake, FlaskConical,
} from 'lucide-react'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button } from '../components/UI'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'

// ── Category metadata ─────────────────────────────────────────────────────────
const CATEGORY_META = {
  users:       { label: 'Users',       color: 'info',    Icon: Users },
  advertisers: { label: 'Advertisers', color: 'purple',  Icon: Megaphone },
  partners:    { label: 'Partners',    color: 'success', Icon: Handshake },
}

// ── Icon per key ─────────────────────────────────────────────────────────────
const KEY_ICONS = {
  new_user_signup:             Users,
  new_advertiser_registration: Megaphone,
  advertiser_deposit:          DollarSign,
  campaign_submitted:          FileSearch,
  new_partner_application:     Handshake,
}

// ── Single notification row ──────────────────────────────────────────────────
function NotifRow({ config, onToggle, onTest, isTesting }) {
  const catMeta = CATEGORY_META[config.category] || { label: config.category, color: 'default', Icon: Mail }
  const KeyIcon = KEY_ICONS[config.key] || Mail

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Left: icon + info */}
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
          <KeyIcon size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-200">{config.name}</p>
            <Badge variant={catMeta.color}>{catMeta.label}</Badge>
            <span className="text-xs text-slate-500 font-mono">{config.template}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{config.description}</p>
          {config.lastTestAt && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Clock size={11} />
              Last tested: {new Date(config.lastTestAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Right: toggle + test button */}
      <div className="flex shrink-0 items-center gap-3 sm:ml-4">
        {/* Toggle */}
        <button
          onClick={() => onToggle(config.key, !config.enabled)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            config.enabled
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
          title={config.enabled ? 'Click to disable' : 'Click to enable'}
        >
          {config.enabled
            ? <><ToggleRight size={14} /> Enabled</>
            : <><ToggleLeft size={14} /> Disabled</>}
        </button>

        {/* Test */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onTest(config)}
          disabled={isTesting}
        >
          <FlaskConical size={13} />
          Test
        </Button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminEmailDashboard() {
  const queryClient = useQueryClient()
  const [testModal, setTestModal] = useState(null) // { config }
  const [testEmailInput, setTestEmailInput] = useState('')
  const [testingKey, setTestingKey] = useState(null)

  // Load configs
  const { data, isLoading } = useQuery({
    queryKey: ['admin-email-config'],
    queryFn: () => api.get('/api/admin/email-config').then((r) => r.data.configs),
  })

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }) => api.put(`/api/admin/email-config/${key}`, { enabled }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['admin-email-config'])
      toast.success(vars.enabled ? 'Notification enabled' : 'Notification disabled')
    },
    onError: () => toast.error('Failed to update'),
  })

  // Test mutation
  const testMutation = useMutation({
    mutationFn: ({ key, testEmail }) =>
      api.post(`/api/admin/email-config/${key}/test`, { testEmail }),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries(['admin-email-config'])
      toast.success(`Test email sent to ${res.data.sentTo}`)
      setTestModal(null)
      setTestEmailInput('')
      setTestingKey(null)
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Failed to send test email')
      setTestingKey(null)
    },
  })

  const configs = data || []
  const enabledCount = configs.filter((c) => c.enabled).length

  // Group by category
  const grouped = {}
  for (const c of configs) {
    if (!grouped[c.category]) grouped[c.category] = []
    grouped[c.category].push(c)
  }

  const handleToggle = (key, enabled) => {
    toggleMutation.mutate({ key, enabled })
  }

  const handleTestClick = (config) => {
    setTestModal(config)
    setTestEmailInput('')
  }

  const handleSendTest = () => {
    if (!testModal) return
    setTestingKey(testModal.key)
    testMutation.mutate({
      key: testModal.key,
      testEmail: testEmailInput.trim() || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Notifications"
        subtitle="Manage which admin emails are sent, and test them with sample data"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
            <CheckCircle size={13} />
            {enabledCount} / {configs.length} active
          </div>
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="py-20 text-center text-slate-400">Loading…</div>
      ) : configs.length === 0 ? (
        <Card>
          <div className="py-16 text-center text-slate-500">
            <Mail size={36} className="mx-auto mb-3 opacity-30" />
            <p>No notifications configured yet.</p>
          </div>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const catMeta = CATEGORY_META[category] || { label: category }
          return (
            <Card key={category}>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
                {catMeta.Icon && <catMeta.Icon size={15} className="text-slate-400" />}
                {catMeta.label}
                <span className="ml-1 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {items.length}
                </span>
              </h3>
              <div className="space-y-3">
                {items.map((config) => (
                  <NotifRow
                    key={config.key}
                    config={config}
                    onToggle={handleToggle}
                    onTest={handleTestClick}
                    isTesting={testingKey === config.key}
                  />
                ))}
              </div>
            </Card>
          )
        })
      )}

      {/* Info card */}
      <Card className="border border-blue-500/20 bg-blue-500/5">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-300">How it works</p>
            <p className="mt-1 text-xs text-blue-400/70 leading-relaxed">
              These notifications are sent to <strong>{import.meta.env.VITE_ADMIN_EMAIL || 'the admin email'}</strong> via Resend whenever
              a key business event occurs. Toggle any notification on or off at any time.
              Use the <strong>Test</strong> button to send a sample email using dummy data — useful for verifying
              your Resend setup and template rendering.
            </p>
          </div>
        </div>
      </Card>

      {/* Test modal */}
      {testModal && (
        <Modal
          isOpen={!!testModal}
          onClose={() => { setTestModal(null); setTestEmailInput('') }}
          title={`Test: ${testModal.name}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Send a sample email using dummy data to verify the template renders correctly.
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Recipient email <span className="text-slate-500">(leave blank for admin)</span>
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                placeholder="admin@example.com"
                value={testEmailInput}
                onChange={(e) => setTestEmailInput(e.target.value)}
              />
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">Template: <code className="font-mono text-violet-400">{testModal.template}</code></p>
              <p>{testModal.description}</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setTestModal(null); setTestEmailInput('') }}>
                Cancel
              </Button>
              <Button
                onClick={handleSendTest}
                disabled={testMutation.isPending}
              >
                <Send size={14} />
                {testMutation.isPending ? 'Sending…' : 'Send Test Email'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
