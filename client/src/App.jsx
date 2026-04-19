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
import Affiliate from './pages/Affiliate'
import AffiliateStatus from './pages/AffiliateStatus'
import ABTests from './pages/ABTests'
import CreateABTest from './pages/CreateABTest'
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
import AccountTypeSelection from './pages/AccountTypeSelection'
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
        <Route path="partners" element={<Partners />} />
        <Route path="partner-list" element={<PartnerList />} />
        <Route path="partner-recruitment" element={<PartnerRecruitment />} />
        <Route path="partner-emails" element={<PartnerEmails />} />
        <Route path="affiliate" element={<Affiliate />} />
        <Route path="affiliate/status" element={<AffiliateStatus />} />
        <Route path="ab-tests" element={<ABTests />} />
        <Route path="create-ab-test" element={<CreateABTest />} />
        <Route path="referral" element={<AdminRoute><Referral /></AdminRoute>} />
        <Route path="api-keys" element={<ApiKeys />} />
        <Route path="api-docs" element={<ApiDocs />} />
        <Route path="mailing-lists" element={<MailingLists />} />
        <Route path="settings" element={<Settings />} />
        <Route path="partner-portal" element={<PartnerPortal />} />
        <Route path="advertiser" element={<AdvertiserDashboard />} />
        <Route path="advertiser/register" element={<AdvertiserRegister />} />
        <Route path="advertiser/budget" element={<AdvertiserBudget />} />
        <Route path="advertiser/campaigns" element={<AdvertiserCampaigns />} />
        <Route path="advertiser/campaigns/new" element={<AdvertiserCampaignForm />} />
        <Route path="advertiser/campaigns/:id" element={<AdvertiserCampaignDetail />} />
        <Route path="advertiser/campaigns/:id/edit" element={<AdvertiserCampaignForm />} />
        <Route path="ad-management" element={<AdminRoute><AdManagement /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
