import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import DashboardLayout from './layouts/DashboardLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Partners from './pages/Partners'
import PartnerList from './pages/PartnerList'
import PartnerRecruitment from './pages/PartnerRecruitment'
import PartnerEmails from './pages/PartnerEmails'
import Autoblog from './pages/Autoblog'
import AutoblogConfig from './pages/AutoblogConfig'
import BotConfig from './pages/BotConfig'
import Generator from './pages/Generator'
import Affiliate from './pages/Affiliate'
import AffiliateStatus from './pages/AffiliateStatus'
import ABTests from './pages/ABTests'
import CreateABTest from './pages/CreateABTest'
import RSSFeeds from './pages/RSSFeeds'
import Referral from './pages/Referral'
import ApiKeys from './pages/ApiKeys'
import ApiDocs from './pages/ApiDocs'
import MailingLists from './pages/MailingLists'
import Settings from './pages/Settings'
import PartnerPortal from './pages/PartnerPortal'
import GoogleAnalytics from './pages/GoogleAnalytics'
import Loading from './components/Loading'

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="google-analytics" element={<GoogleAnalytics />} />
        <Route path="partners" element={<Partners />} />
        <Route path="partner-list" element={<PartnerList />} />
        <Route path="partner-recruitment" element={<PartnerRecruitment />} />
        <Route path="partner-emails" element={<PartnerEmails />} />
        <Route path="autoblog" element={<Autoblog />} />
        <Route path="autoblog/blog-info/:blogId?" element={<AutoblogConfig />} />
        <Route path="autoblog/bot" element={<BotConfig />} />
        <Route path="generator/:type" element={<Generator />} />
        <Route path="affiliate" element={<Affiliate />} />
        <Route path="affiliate/status" element={<AffiliateStatus />} />
        <Route path="ab-tests" element={<ABTests />} />
        <Route path="create-ab-test" element={<CreateABTest />} />
        <Route path="rss" element={<RSSFeeds />} />
        <Route path="referral" element={<Referral />} />
        <Route path="api-keys" element={<ApiKeys />} />
        <Route path="api-docs" element={<ApiDocs />} />
        <Route path="mailing-lists" element={<MailingLists />} />
        <Route path="settings" element={<Settings />} />
        <Route path="partner-portal" element={<PartnerPortal />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
