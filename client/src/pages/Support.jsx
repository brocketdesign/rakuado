import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HelpCircle, TicketCheck, ChevronDown, ChevronUp, Plus, Send,
  Clock, CheckCircle2, AlertCircle, XCircle, MessageSquare,
  RefreshCw, ShieldCheck, User, ChevronLeft,
} from 'lucide-react'
import api from '../lib/api'
import { PageHeader, Card, Badge, Button, Input } from '../components/UI'
import Modal from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  open:        { label: 'Open',        variant: 'info',    Icon: AlertCircle },
  in_progress: { label: 'In Progress', variant: 'warning', Icon: Clock },
  resolved:    { label: 'Resolved',    variant: 'success', Icon: CheckCircle2 },
  closed:      { label: 'Closed',      variant: 'default', Icon: XCircle },
}

const CATEGORY_COLORS = {
  General:    'bg-slate-700/60 text-slate-300',
  Partner:    'bg-violet-500/20 text-violet-400',
  Advertiser: 'bg-blue-500/20 text-blue-400',
  Admin:      'bg-amber-500/20 text-amber-400',
}

// ── FAQ Accordion item ────────────────────────────────────────────────────────
function FaqItem({ item }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.General}`}>
            {item.category}
          </span>
          <span className="text-sm font-medium text-slate-200">{item.question}</span>
        </div>
        {open ? <ChevronUp size={16} className="shrink-0 text-slate-400 mt-0.5" /> : <ChevronDown size={16} className="shrink-0 text-slate-400 mt-0.5" />}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0">
          <p className="text-sm text-slate-400 leading-relaxed pl-0 border-t border-slate-700/40 pt-3">{item.answer}</p>
        </div>
      )}
    </div>
  )
}

// ── Ticket status badge ───────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.open
  return (
    <Badge variant={s.variant} className="flex items-center gap-1">
      <s.Icon size={11} />
      {s.label}
    </Badge>
  )
}

// ── Ticket list row ───────────────────────────────────────────────────────────
function TicketRow({ ticket, onSelect }) {
  const createdAt = new Date(ticket.createdAt)
  return (
    <button
      onClick={() => onSelect(ticket)}
      className="w-full flex items-start gap-4 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 text-left hover:bg-slate-800/70 hover:border-violet-500/40 transition-all"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
        <TicketCheck size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-medium text-slate-200 truncate">{ticket.subject}</span>
          <StatusBadge status={ticket.status} />
          {ticket.accountType && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CATEGORY_COLORS[ticket.accountType] || CATEGORY_COLORS.General}`}>
              {ticket.accountType}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">{ticket.message}</p>
        <p className="mt-1 text-xs text-slate-600">
          {ticket.replies?.length > 0
            ? `${ticket.replies.length} repl${ticket.replies.length === 1 ? 'y' : 'ies'} · `
            : 'No replies · '}
          {createdAt.toLocaleDateString()}
        </p>
      </div>
    </button>
  )
}

// ── Ticket Detail ─────────────────────────────────────────────────────────────
function TicketDetail({ ticket, onBack, onUpdated, isAdmin }) {
  const queryClient = useQueryClient()
  const [replyText, setReplyText] = useState('')

  const updateMutation = useMutation({
    mutationFn: (body) => api.put(`/api/support/tickets/${ticket._id}`, body).then((r) => r.data),
    onSuccess: (data) => {
      onUpdated(data.ticket)
      queryClient.invalidateQueries(['support-tickets'])
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update ticket'),
  })

  const handleReply = () => {
    if (!replyText.trim()) return
    updateMutation.mutate({ replyMessage: replyText }, {
      onSuccess: () => setReplyText(''),
    })
  }

  const handleStatus = (status) => {
    updateMutation.mutate({ status }, {
      onSuccess: () => toast.success(`Ticket marked as ${STATUS[status]?.label || status}`),
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{ticket.subject}</h2>
            <StatusBadge status={ticket.status} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Opened by {ticket.userName} · {new Date(ticket.createdAt).toLocaleString()}
          </p>
        </div>
        {/* Admin status controls */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
              <button
                key={s}
                onClick={() => handleStatus(s)}
                disabled={ticket.status === s || updateMutation.isLoading}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-default ${
                  ticket.status === s
                    ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                    : 'border-slate-600 text-slate-400 hover:border-violet-400 hover:text-violet-300'
                }`}
              >
                {STATUS[s]?.label || s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thread */}
      <div className="space-y-3">
        {/* Original message */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-violet-400">
              <User size={14} />
            </div>
            <span className="text-sm font-medium text-slate-300">{ticket.userName}</span>
            <span className="text-xs text-slate-600">{new Date(ticket.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{ticket.message}</p>
        </div>

        {/* Replies */}
        {(ticket.replies || []).map((reply) => (
          <div
            key={reply.replyId}
            className={`rounded-xl border p-4 ${
              reply.isAdmin
                ? 'border-violet-500/30 bg-violet-500/5'
                : 'border-slate-700/60 bg-slate-800/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full ${reply.isAdmin ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-700 text-slate-400'}`}>
                {reply.isAdmin ? <ShieldCheck size={14} /> : <User size={14} />}
              </div>
              <span className="text-sm font-medium text-slate-300">
                {reply.isAdmin ? `${reply.authorName} (Support)` : reply.authorName}
              </span>
              <span className="text-xs text-slate-600">{new Date(reply.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{reply.message}</p>
          </div>
        ))}
      </div>

      {/* Reply box (hidden if closed) */}
      {ticket.status !== 'closed' && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 space-y-3">
          <p className="text-sm font-medium text-slate-300">
            {isAdmin ? 'Reply to this ticket' : 'Add a message'}
          </p>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            placeholder="Type your message…"
            className="w-full rounded-lg bg-slate-900/60 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleReply}
              disabled={!replyText.trim() || updateMutation.isLoading}
              size="sm"
            >
              <Send size={14} />
              {updateMutation.isLoading ? 'Sending…' : 'Send Reply'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── New Ticket Modal ──────────────────────────────────────────────────────────
function NewTicketModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ subject: '', message: '' })

  const mutation = useMutation({
    mutationFn: (body) => api.post('/api/support/tickets', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Ticket submitted! Our team will respond shortly.')
      queryClient.invalidateQueries(['support-tickets'])
      setForm({ subject: '', message: '' })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to submit ticket'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(form)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Open a Support Ticket"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isLoading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isLoading || !form.subject.trim() || !form.message.trim()}>
            <Send size={14} />
            {mutation.isLoading ? 'Submitting…' : 'Submit Ticket'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
          <input
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Brief description of your issue"
            maxLength={200}
            className="w-full rounded-lg bg-slate-900/60 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Message</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            rows={5}
            placeholder="Describe your issue in detail…"
            maxLength={5000}
            className="w-full rounded-lg bg-slate-900/60 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none"
          />
          <p className="mt-1 text-right text-xs text-slate-600">{form.message.length}/5000</p>
        </div>
      </form>
    </Modal>
  )
}

// ── Main Support Page ─────────────────────────────────────────────────────────
export default function Support() {
  const { user, isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('faq')
  const [faqSearch, setFaqSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  // FAQ
  const { data: faqData, isLoading: faqLoading } = useQuery({
    queryKey: ['support-faq'],
    queryFn: () => api.get('/api/support/faq').then((r) => r.data.faq),
    staleTime: 300000,
  })

  // Tickets
  const { data: ticketsData, isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api.get('/api/support/tickets').then((r) => r.data.tickets),
    enabled: activeTab === 'tickets',
  })

  const faqItems = (faqData || []).filter((item) => {
    if (!faqSearch.trim()) return true
    const q = faqSearch.toLowerCase()
    return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
  })

  const filteredTickets = (ticketsData || []).filter((t) =>
    filterStatus === 'all' ? true : t.status === filterStatus
  )

  const openCount = (ticketsData || []).filter((t) => t.status === 'open').length

  const handleTicketUpdated = (updated) => {
    setSelectedTicket(updated)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle="Browse FAQs or open a ticket to get help from our team"
      >
        <Button onClick={() => { setActiveTab('tickets'); setShowNewTicket(true) }}>
          <Plus size={16} />
          New Ticket
        </Button>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1 w-fit">
        {[
          { key: 'faq', label: 'FAQ', icon: HelpCircle },
          { key: 'tickets', label: `Tickets${openCount > 0 ? ` (${openCount})` : ''}`, icon: TicketCheck },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-violet-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── FAQ Tab ── */}
      {activeTab === 'faq' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <HelpCircle size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search FAQs…"
              className="w-full rounded-xl bg-slate-800/60 border border-slate-700 pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          {faqLoading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading FAQ…</div>
          ) : faqItems.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No results found.</div>
          ) : (
            <div className="space-y-2">
              {faqItems.map((item) => (
                <FaqItem key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* CTA to open ticket */}
          <Card className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Can't find what you're looking for?</p>
              <p className="text-xs text-slate-500 mt-0.5">Our support team is here to help.</p>
            </div>
            <Button onClick={() => { setActiveTab('tickets'); setShowNewTicket(true) }}>
              <MessageSquare size={15} />
              Open a Ticket
            </Button>
          </Card>
        </div>
      )}

      {/* ── Tickets Tab ── */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {selectedTicket ? (
            <TicketDetail
              ticket={selectedTicket}
              onBack={() => setSelectedTicket(null)}
              onUpdated={handleTicketUpdated}
              isAdmin={isAdmin}
            />
          ) : (
            <>
              {/* Filters + actions */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1">
                  {['all', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        filterStatus === s
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s === 'all' ? 'All' : STATUS[s]?.label || s}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => refetchTickets()}
                  className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>

              {ticketsLoading ? (
                <div className="text-sm text-slate-500 py-8 text-center">Loading tickets…</div>
              ) : filteredTickets.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <TicketCheck size={36} className="mx-auto text-slate-700" />
                  <p className="text-sm text-slate-500">
                    {filterStatus === 'all' ? 'No tickets yet.' : `No ${STATUS[filterStatus]?.label.toLowerCase()} tickets.`}
                  </p>
                  <Button size="sm" onClick={() => setShowNewTicket(true)}>
                    <Plus size={14} /> Open a Ticket
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTickets.map((ticket) => (
                    <TicketRow key={ticket._id} ticket={ticket} onSelect={setSelectedTicket} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* New Ticket Modal */}
      <NewTicketModal
        isOpen={showNewTicket}
        onClose={() => setShowNewTicket(false)}
      />
    </div>
  )
}
