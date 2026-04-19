import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  changePassword,
  fetchProfile,
  patchProfile,
  requestPasswordReset,
} from '../lib/api'
import { SharedErrorBanner } from '../components/SharedErrorBanner'
import { ProfileSuccessAlert } from '../components/ProfileSuccessBanner.jsx'
import { ConfirmPop } from '../components/ConfirmPop.jsx'
import {
  EMAIL_MAX,
  EMAIL_MIN,
  FIRST_NAME_MAX,
  FIRST_NAME_MIN,
  LAST_NAME_MAX,
  PASS_MAX,
  PASS_MIN,
  validateEmailField,
  validateProfileFirstName,
  validateProfileLastName,
} from '../lib/inputLimits'
import { clearSession, getStoredUser, updateStoredUser } from '../lib/session'
import './LoginPage.css'
import './AppHomePage.css'
import './AppInstallPage.css'
import './ProfilePage.css'

const PROFILE_PASS_MIN = PASS_MIN
const PROFILE_PASS_MAX = PASS_MAX

export default function ProfilePage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const stored = getStoredUser()

  const firstNameId = useId()
  const lastNameId = useId()
  const emailId = useId()
  const emailHintId = useId()
  const currentPwdId = useId()
  const newPwdId = useId()
  const confirmPwdId = useId()
  const socialEmailId = useId()

  const [firstName, setFirstName] = useState(stored?.firstName ?? '')
  const [lastName, setLastName] = useState(stored?.lastName ?? '')
  const [email, setEmail] = useState(stored?.email ?? '')

  const [loading, setLoading] = useState(true)
  const [profileErr, setProfileErr] = useState(null)
  const [profileOk, setProfileOk] = useState(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [pwdConfirmOpen, setPwdConfirmOpen] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdErr, setPwdErr] = useState(null)
  const [pwdOk, setPwdOk] = useState(null)
  const [pwdBusy, setPwdBusy] = useState(false)

  const [resetEmail, setResetEmail] = useState(stored?.email ?? '')
  const [resetErr, setResetErr] = useState(null)
  const [resetOk, setResetOk] = useState(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  /** From GET /api/auth/me — only Google is implemented in this app. */
  const [oauthProvider, setOauthProvider] = useState(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { user } = await fetchProfile()
        if (cancelled) return
        setProfileErr(null)
        setFirstName(user.firstName ?? '')
        setLastName(user.lastName ?? '')
        setEmail(user.email ?? '')
        setResetEmail(user.email ?? '')
        setOauthProvider(
          typeof user.oauthProvider === 'string' && user.oauthProvider.trim()
            ? user.oauthProvider.trim()
            : null,
        )
        updateStoredUser({
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
        })
      } catch (e) {
        if (!cancelled) {
          setProfileErr(
            e instanceof Error ? e.message : 'Could not load your profile',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const manifestLink = document.createElement('link')
    manifestLink.rel = 'manifest'
    manifestLink.href = '/manifest.webmanifest'
    document.head.appendChild(manifestLink)

    let swRegistration = null
    ;(async () => {
      if (!('serviceWorker' in navigator)) return
      try {
        swRegistration = await navigator.serviceWorker.register('/service-worker.js')
      } catch {
        /* ignore */
      }
    })()

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      setIsInstalling(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      manifestLink.remove()
      if (swRegistration) {
        void swRegistration.unregister()
      }
    }
  }, [])

  const handleSignOut = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

  const saveProfile = async () => {
    setProfileErr(null)
    setProfileOk(null)
    const fnErr = validateProfileFirstName(firstName)
    if (fnErr) {
      setProfileErr(fnErr)
      return
    }
    const lnErr = validateProfileLastName(lastName)
    if (lnErr) {
      setProfileErr(lnErr)
      return
    }
    setSaveBusy(true)
    try {
      const { user } = await patchProfile({ firstName, lastName })
      setFirstName(user.firstName ?? '')
      setLastName(user.lastName ?? '')
      updateStoredUser({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
      })
      setProfileOk('Profile saved')
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : 'Could not save profile')
    } finally {
      setSaveBusy(false)
    }
  }

  const validateProfileBeforeConfirm = () => {
    setProfileErr(null)
    setProfileOk(null)
    const fnErr = validateProfileFirstName(firstName)
    if (fnErr) {
      setProfileErr(fnErr)
      return false
    }
    const lnErr = validateProfileLastName(lastName)
    if (lnErr) {
      setProfileErr(lnErr)
      return false
    }
    return true
  }

  const handleChangePassword = async () => {
    setPwdErr(null)
    setPwdOk(null)
    if (
      newPassword.length < PROFILE_PASS_MIN ||
      newPassword.length > PROFILE_PASS_MAX
    ) {
      setPwdErr(
        `Password must be between ${PROFILE_PASS_MIN} and ${PROFILE_PASS_MAX} characters`,
      )
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('New password and confirmation do not match')
      return
    }
    setPwdBusy(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setPwdOk('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      setPwdErr(
        e instanceof Error ? e.message : 'Could not update password',
      )
    } finally {
      setPwdBusy(false)
    }
  }

  const validatePasswordBeforeConfirm = () => {
    setPwdErr(null)
    setPwdOk(null)
    if (
      newPassword.length < PROFILE_PASS_MIN ||
      newPassword.length > PROFILE_PASS_MAX
    ) {
      setPwdErr(
        `Password must be between ${PROFILE_PASS_MIN} and ${PROFILE_PASS_MAX} characters`,
      )
      return false
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('New password and confirmation do not match')
      return false
    }
    return true
  }

  const validateResetBeforeConfirm = () => {
    setResetErr(null)
    setResetOk(null)
    const emailErr = validateEmailField(resetEmail)
    if (emailErr) {
      setResetErr(emailErr)
      return false
    }
    return true
  }

  const handleSendResetLink = async () => {
    setResetErr(null)
    setResetOk(null)
    const emailErr = validateEmailField(resetEmail)
    if (emailErr) {
      setResetErr(emailErr)
      return
    }
    setResetBusy(true)
    try {
      const data = await requestPasswordReset(resetEmail.trim())
      setResetOk(
        typeof data.message === 'string'
          ? data.message
          : 'Request received',
      )
    } catch (e) {
      setResetErr(
        e instanceof Error ? e.message : 'Could not send reset link',
      )
    } finally {
      setResetBusy(false)
    }
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setIsInstalling(true)
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setIsInstalling(false)
    setDeferredPrompt(null)
    if (choice?.outcome === 'accepted') {
      setInstalled(true)
    }
  }

  return (
    <div className="profile-root">
      <motion.header
        className="app-home-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <div className="app-home-header-inner">
          <div>
            <h1 className="app-home-title">Profile</h1>
            <p className="app-home-greet">
              Update your account and password settings
            </p>
          </div>
          <div className="app-home-header-actions">
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={() => navigate('/app-home')}
              whileTap={{ scale: 0.97 }}
            >
              Home
            </motion.button>
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={handleSignOut}
              whileTap={{ scale: 0.97 }}
            >
              Sign out
            </motion.button>
          </div>
        </div>
      </motion.header>

      <main className="profile-main">
        {loading ? (
          <p className="profile-muted">Loading…</p>
        ) : (
          <>
            <motion.section
              className="profile-card"
              aria-labelledby="profile-details"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.02 }}
            >
              <h2 id="profile-details" className="profile-card-title">
                Your details
              </h2>
              {profileErr ? (
                <SharedErrorBanner className="profile-error--spacing">
                  {profileErr}
                </SharedErrorBanner>
              ) : null}
              <div className="login-field-wrap">
                <label className="login-field-label" htmlFor={firstNameId}>
                  First name
                </label>
                <input
                  id={firstNameId}
                  className="login-input"
                  type="text"
                  minLength={FIRST_NAME_MIN}
                  maxLength={FIRST_NAME_MAX}
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    setProfileOk(null)
                  }}
                  autoComplete="given-name"
                />
              </div>
              <div className="login-field-wrap">
                <label className="login-field-label" htmlFor={lastNameId}>
                  Last name
                </label>
                <input
                  id={lastNameId}
                  className="login-input"
                  type="text"
                  maxLength={LAST_NAME_MAX}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value)
                    setProfileOk(null)
                  }}
                  autoComplete="family-name"
                />
              </div>
              <div className="login-field-wrap">
                <label className="login-field-label" htmlFor={emailId}>
                  Email
                </label>
                <p id={emailHintId} className="profile-email-helper">
                  Email can't be changed
                </p>
                <input
                  id={emailId}
                  className="login-input profile-input-readonly"
                  type="email"
                  readOnly
                  aria-readonly="true"
                  aria-describedby={emailHintId}
                  minLength={EMAIL_MIN}
                  maxLength={EMAIL_MAX}
                  value={email}
                />
              </div>
              {profileOk ? (
                <ProfileSuccessAlert>{profileOk}</ProfileSuccessAlert>
              ) : null}
              <motion.button
                type="button"
                className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
                onClick={() => {
                  if (saveBusy) return
                  if (validateProfileBeforeConfirm()) {
                    setSaveConfirmOpen(true)
                  }
                }}
                disabled={saveBusy || saveConfirmOpen}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                {saveBusy ? 'Saving…' : 'Save profile'}
              </motion.button>
            </motion.section>

            <motion.section
              className="profile-card"
              aria-labelledby="reset-password-heading"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.06 }}
            >
              <h2 id="reset-password-heading" className="profile-card-title">
                Reset password
              </h2>
              <p className="profile-hint" id="pwd-rules">
                * Min {PROFILE_PASS_MIN} and Max {PROFILE_PASS_MAX} characters
                allowed
              </p>
              <div className="login-field-wrap">
                <label className="login-field-label" htmlFor={currentPwdId}>
                  Current password
                </label>
                <input
                  id={currentPwdId}
                  className="login-input"
                  type="password"
                  autoComplete="current-password"
                  minLength={PROFILE_PASS_MIN}
                  maxLength={PROFILE_PASS_MAX}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value)
                    setPwdErr(null)
                  }}
                />
              </div>
              <div className="login-field-wrap">
                <label className="login-field-label" htmlFor={newPwdId}>
                  New password
                </label>
                <input
                  id={newPwdId}
                  className="login-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={PROFILE_PASS_MIN}
                  maxLength={PROFILE_PASS_MAX}
                  aria-describedby="pwd-rules"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setPwdErr(null)
                  }}
                />
              </div>
              <div className="login-field-wrap">
                <label className="login-field-label" htmlFor={confirmPwdId}>
                  Confirm new password
                </label>
                <input
                  id={confirmPwdId}
                  className="login-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={PROFILE_PASS_MIN}
                  maxLength={PROFILE_PASS_MAX}
                  aria-describedby="pwd-rules"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setPwdErr(null)
                  }}
                />
              </div>
              {pwdErr ? (
                <SharedErrorBanner className="profile-error--spacing">
                  {pwdErr}
                </SharedErrorBanner>
              ) : null}
              {pwdOk ? (
                <ProfileSuccessAlert>{pwdOk}</ProfileSuccessAlert>
              ) : null}
              <motion.button
                type="button"
                className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
                onClick={() => {
                  if (pwdBusy) return
                  if (validatePasswordBeforeConfirm()) {
                    setPwdConfirmOpen(true)
                  }
                }}
                disabled={pwdBusy || pwdConfirmOpen}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                {pwdBusy ? 'Updating…' : 'Update Password'}
              </motion.button>
            </motion.section>

            <motion.section
              className="profile-card"
              aria-labelledby="social-login-heading"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.1 }}
            >
              <h2 id="social-login-heading" className="profile-card-title">
                Social Login (Google)
              </h2>
              <ul className="profile-instructions">
                <li>
                  If you logged in using Google you may not have
                  a local password set yet.
                </li>
                <li>
                  Enter your email address in the input field below. Click{' '}
                  <strong>&quot;Send Reset Link&quot;</strong> to receive a
                  secure link in your email inbox.
                </li>
                <li>
                  Use that link to securely set up your password and unlock
                  standard email login.
                </li>
                <li>
                  After setting your password, you can log in both ways: using
                  your email &amp; password, or via Google Social
                  login.
                </li>
              </ul>
              <div className="login-field-wrap">
                <label className="login-field-label" htmlFor={socialEmailId}>
                  Email
                </label>
                <input
                  id={socialEmailId}
                  className="login-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  minLength={EMAIL_MIN}
                  maxLength={EMAIL_MAX}
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value)
                    setResetErr(null)
                    setResetOk(null)
                  }}
                />
              </div>
              {resetErr ? (
                <SharedErrorBanner className="profile-error--spacing">
                  {resetErr}
                </SharedErrorBanner>
              ) : null}
              {resetOk ? (
                <ProfileSuccessAlert>{resetOk}</ProfileSuccessAlert>
              ) : null}
              <motion.button
                type="button"
                className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
                onClick={() => {
                  if (resetBusy) return
                  if (validateResetBeforeConfirm()) {
                    setResetConfirmOpen(true)
                  }
                }}
                disabled={resetBusy || resetConfirmOpen}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                {resetBusy ? 'Sending…' : 'Send Reset Link'}
              </motion.button>
            </motion.section>

            <motion.section
              className="profile-card"
              aria-labelledby="download-app-heading"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.14 }}
            >
              <h2 id="download-app-heading" className="profile-card-title">
                Download App
              </h2>
              <img src="/app-logo.png" alt="App logo" className="app-install-logo" />
              <motion.button
                type="button"
                className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary app-install-btn"
                onClick={handleInstall}
                disabled={!deferredPrompt || isInstalling || installed}
                whileTap={{ scale: deferredPrompt ? 0.98 : 1 }}
                whileHover={reduceMotion || !deferredPrompt ? {} : { y: -1 }}
              >
                {installed
                  ? 'App Installed'
                  : isInstalling
                    ? 'Opening installer...'
                    : 'Download our app'}
              </motion.button>
              {!deferredPrompt && !installed ? (
                <p className="profile-hint">
                  Install prompt is not available yet on this device/browser.
                </p>
              ) : null}
            </motion.section>
          </>
        )}
      </main>

      <ConfirmPop
        open={saveConfirmOpen}
        onNo={() => setSaveConfirmOpen(false)}
        onYes={async () => {
          setSaveConfirmOpen(false)
          await saveProfile()
        }}
        title="Save changes?"
        message="Are you sure you want to save your profile changes?"
        noLabel="No"
        yesLabel="Yes"
      />

      <ConfirmPop
        open={pwdConfirmOpen}
        onNo={() => setPwdConfirmOpen(false)}
        onYes={async () => {
          setPwdConfirmOpen(false)
          await handleChangePassword()
        }}
        title="Update password?"
        message="Are you sure you want to update your password?"
        noLabel="No"
        yesLabel="Yes"
      />

      <ConfirmPop
        open={resetConfirmOpen}
        onNo={() => setResetConfirmOpen(false)}
        onYes={async () => {
          setResetConfirmOpen(false)
          await handleSendResetLink()
        }}
        title="Send reset link?"
        message="Are you sure you want to send reset instructions to your email?"
        noLabel="No"
        yesLabel="Yes"
      />
      <AnimatePresence>
        {isInstalling ? (
          <motion.div
            className="app-install-splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
          >
            <motion.img
              src="/app-logo.png"
              alt="Installing app"
              className="app-install-splash-logo"
              initial={reduceMotion ? { scale: 1 } : { scale: 0.9, opacity: 0.8 }}
              animate={reduceMotion ? { scale: 1 } : { scale: 1, opacity: 1 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.35 }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
