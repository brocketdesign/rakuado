import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import DashboardLayout from './layouts/DashboardLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Partners from './pages/Partners'
import PartnerList from './pages/PartnerList'
import PartnerRecruitment from './pages/PartnerRecruitment'
import PartnerEmails from './pages/PartnerEmails'
import Referral from './pages/Referral'
import ApiKeys from './pages/ApiKeys'
import ApiDocs from './pages/ApiDocs'
import MailingLists from './pages/MailingLists'
import Settings from './pages/Settings'
import PartnerPortal from './pages/PartnerPortal'
import GoogleAnalytics from './pages/GoogleAnalytics'
import AdvertiserDashboard from './pages/AdvertiserDashboard'
import AdvertiserRegister from './pages/AdvertiserRegister'
import AdvertiserBudget from './pages/AdvertiserBudget'
import AdvertiserCampaigns from './pages/AdvertiserCampaigns'
import AdvertiserCampaignForm from './pages/AdvertiserCampaignForm'
import AdvertiserCampaignDetail from './pages/AdvertiserCampaignDetail'
import AdManagement from './pages/AdManagement'
import AdvertiserAdmin from './pages/AdvertiserAdmin'
import AdminEmailDashboard from './pages/AdminEmailDashboard'
import AccountTypeSelection from './pages/AccountTypeSelection'
import Support from './pages/Support'
import RakubunPage from './pages/RakubunPage'
import Loading from './components/Loading'

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Redirects to onboarding if the user hasn't chosen an account type yet
function OnboardedRoute({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!user.accountType) return <Navigate to="/onboarding" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, isAdmin, isLoading } = useAuth()
  if (isLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return children
}

function PartnerRoute({ children }) {
  const { user, isAdmin, isLoading } = useAuth()
  if (isLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin && user.accountType !== 'partner') return <Navigate to="/dashboard" replace />
  return children
}

function AdvertiserRoute({ children }) {
  const { user, isAdmin, isLoading } = useAuth()
  if (isLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin && user.accountType !== 'advertiser') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    const handle = () => navigate('/login', { replace: true })
    window.addEventListener('auth:unauthorized', handle)
    return () => window.removeEventListener('auth:unauthorized', handle)
  }, [navigate])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <AccountTypeSelection />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/*"
        element={
          <OnboardedRoute>
            <DashboardLayout />
          </OnboardedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
        <Route path="google-analytics" element={<AdminRoute><GoogleAnalytics /></AdminRoute>} />
        <Route path="partners" element={<AdminRoute><Partners /></AdminRoute>} />
        <Route path="partner-list" element={<AdminRoute><PartnerList /></AdminRoute>} />
        <Route path="partner-recruitment" element={<AdminRoute><PartnerRecruitment /></AdminRoute>} />
        <Route path="partner-emails" element={<AdminRoute><PartnerEmails /></AdminRoute>} />
        <Route path="referral" element={<AdminRoute><Referral /></AdminRoute>} />
        <Route path="api-keys" element={<AdminRoute><ApiKeys /></AdminRoute>} />
        <Route path="api-docs" element={<AdminRoute><ApiDocs /></AdminRoute>} />
        <Route path="mailing-lists" element={<AdminRoute><MailingLists /></AdminRoute>} />
        <Route path="settings" element={<Settings />} />
        <Route path="partner-portal" element={<PartnerRoute><PartnerPortal /></PartnerRoute>} />
        <Route path="advertiser" element={<AdvertiserRoute><AdvertiserDashboard /></AdvertiserRoute>} />
        <Route path="advertiser/register" element={<AdvertiserRoute><AdvertiserRegister /></AdvertiserRoute>} />
        <Route path="advertiser/budget" element={<AdvertiserRoute><AdvertiserBudget /></AdvertiserRoute>} />
        <Route path="advertiser/campaigns" element={<AdvertiserRoute><AdvertiserCampaigns /></AdvertiserRoute>} />
        <Route path="advertiser/campaigns/new" element={<AdvertiserRoute><AdvertiserCampaignForm /></AdvertiserRoute>} />
        <Route path="advertiser/campaigns/:id" element={<AdvertiserRoute><AdvertiserCampaignDetail /></AdvertiserRoute>} />
        <Route path="advertiser/campaigns/:id/edit" element={<AdvertiserRoute><AdvertiserCampaignForm /></AdvertiserRoute>} />
        <Route path="ad-management" element={<AdminRoute><AdManagement /></AdminRoute>} />
        <Route path="advertiser-admin" element={<AdminRoute><AdvertiserAdmin /></AdminRoute>} />
        <Route path="admin-email-dashboard" element={<AdminRoute><AdminEmailDashboard /></AdminRoute>} />
        <Route path="support" element={<Support />} />
        <Route path="rakubun" element={<RakubunPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
