import { Outlet, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import SeoHead from './components/SeoHead.jsx'
import {
  AppHomePage,
  CalendarPage,
  LoginPage,
  NotePage,
  NotFoundPage,
  ProfilePage,
  ProjectPage,
  ResetPasswordPage,
  SavedLinksPage,
} from './pages'

/** Keeps `<SeoHead />` inside `<Routes>` so `useLocation()` tracks the active URL. */
function SeoLayout() {
  return (
    <>
      <SeoHead />
      <Outlet />
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<SeoLayout />}>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/app-home"
          element={
            <ProtectedRoute>
              <AppHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/saved-links"
          element={
            <ProtectedRoute>
              <SavedLinksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/note"
          element={
            <ProtectedRoute>
              <NotePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:projectId"
          element={
            <ProtectedRoute>
              <ProjectPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
