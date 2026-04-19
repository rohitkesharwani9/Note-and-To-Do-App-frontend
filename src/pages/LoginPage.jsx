import { useCallback, useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SharedErrorBanner } from '../components/SharedErrorBanner'
import {
  fetchProfileWithToken,
  getApiBaseUrl,
  loginApi,
  requestPasswordReset,
} from '../lib/api'
import {
  EMAIL_MAX,
  EMAIL_MIN,
  PASS_MAX,
  PASS_MIN,
  validateEmailField,
  validatePasswordField,
} from '../lib/inputLimits'
import { isLoggedIn, saveSession } from '../lib/session'
import './LoginPage.css'

const EMAIL_STORAGE_KEY = 'to-do-app:last-login-email'

function readStoredEmail() {
  try {
    if (typeof window === 'undefined') return ''
    const raw = localStorage.getItem(EMAIL_STORAGE_KEY)
    if (raw == null || raw.length > EMAIL_MAX) return ''
    return raw
  } catch {
    return ''
  }
}

function writeStoredEmail(value) {
  try {
    if (typeof window === 'undefined') return
    const v = value.trim()
    if (v.length > EMAIL_MAX) return
    localStorage.setItem(EMAIL_STORAGE_KEY, v)
  } catch {
    /* private mode / quota — ignore (instruction 7) */
  }
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

const itemVariants = (reduceMotion) => ({
  hidden: reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 420, damping: 28 },
  },
})

function ForgotModal({ open, onClose, initialEmail }) {
  const reduceMotion = useReducedMotion()
  const forgotEmailId = useId()
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotSentOk, setForgotSentOk] = useState(false)
  const [forgotModalErr, setForgotModalErr] = useState(null)

  useEffect(() => {
    if (!open) {
      setForgotBusy(false)
      setForgotSentOk(false)
      setForgotModalErr(null)
      return
    }
    const seed =
      typeof initialEmail === 'string' && initialEmail.trim()
        ? initialEmail.trim().slice(0, EMAIL_MAX)
        : readStoredEmail()
    setForgotEmail(seed)
    setForgotSentOk(false)
    setForgotModalErr(null)
  }, [open, initialEmail])

  useEffect(() => {
    if (!forgotSentOk) return undefined
    const t = window.setTimeout(() => {
      onClose()
    }, 2000)
    return () => window.clearTimeout(t)
  }, [forgotSentOk, onClose])

  const handleSendResetEmail = async () => {
    setForgotModalErr(null)
    const eErr = validateEmailField(forgotEmail)
    if (eErr) {
      setForgotModalErr(eErr)
      return
    }
    const trimmed = forgotEmail.trim()
    setForgotBusy(true)
    try {
      await requestPasswordReset(trimmed)
      writeStoredEmail(trimmed)
      setForgotSentOk(true)
    } catch (err) {
      setForgotModalErr(
        err instanceof Error ? err.message : 'Could not send reset link. Try again shortly',
      )
    } finally {
      setForgotBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.22 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            initial={
              reduceMotion
                ? { opacity: 0, scale: 0.98 }
                : { opacity: 0, scale: 0.92, y: 18 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, scale: 0.98 }
                : { opacity: 0, scale: 0.96, y: 10 }
            }
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <motion.h2
              id="forgot-title"
              className="modal-title"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              Send reset link
            </motion.h2>
            <motion.p
              className="modal-text"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.09 }}
            >
              Enter your email — we&apos;ll send a secure link to reset your password. You can
              change the address below if needed.
            </motion.p>
            <div className="login-field-wrap" style={{ marginBottom: 14 }}>
              <label className="login-field-label" htmlFor={forgotEmailId}>
                Email
              </label>
              <motion.input
                id={forgotEmailId}
                className="login-input"
                type="email"
                name="forgot-reset-email"
                autoComplete="email"
                inputMode="email"
                minLength={EMAIL_MIN}
                maxLength={EMAIL_MAX}
                value={forgotEmail}
                disabled={forgotBusy || forgotSentOk}
                onChange={(e) => {
                  setForgotEmail(e.target.value.slice(0, EMAIL_MAX))
                  setForgotModalErr(null)
                }}
                whileFocus={reduceMotion || forgotBusy || forgotSentOk ? {} : { scale: 1.01 }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            </div>
            {forgotModalErr ? (
              <SharedErrorBanner className="profile-error--spacing login-error-below-pw">
                {forgotModalErr}
              </SharedErrorBanner>
            ) : null}
            <div className="modal-actions">
              <motion.button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                disabled={forgotBusy}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                Not now
              </motion.button>
              <motion.button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={handleSendResetEmail}
                disabled={forgotBusy || forgotSentOk}
                whileTap={{ scale: forgotBusy || forgotSentOk ? 1 : 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                {forgotBusy ? 'Sending…' : forgotSentOk ? 'Email sent ✓' : 'Send email'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default function LoginPage() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const emailId = useId()
  const passwordId = useId()
  const rememberId = useId()

  const [email, setEmail] = useState(readStoredEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [validationError, setValidationError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (hash.startsWith('#')) {
      const params = new URLSearchParams(hash.slice(1))
      const googleErr = params.get('google_error')
      if (googleErr) {
        try {
          setFormError(decodeURIComponent(googleErr))
        } catch {
          setFormError(googleErr)
        }
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
        return
      }
      const googleToken = params.get('google_token')
      if (googleToken) {
        let cancelled = false
        ;(async () => {
          try {
            const user = await fetchProfileWithToken(googleToken)
            saveSession(
              googleToken,
              {
                id: user.id,
                email: user.email,
                firstName: user.firstName ?? '',
                lastName: user.lastName ?? '',
              },
              remember,
            )
            if (user.email) writeStoredEmail(user.email)
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
            if (!cancelled) navigate('/app-home', { replace: true })
          } catch (err) {
            if (!cancelled) {
              const message =
                err instanceof Error ? err.message : 'Google sign-in failed. Try again'
              setFormError(message)
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
            }
          }
        })()
        return () => {
          cancelled = true
        }
      }
    }

    if (isLoggedIn()) {
      navigate('/app-home', { replace: true })
    }
  }, [navigate, remember])

  const clearErrors = useCallback(() => {
    setValidationError(null)
    setFormError(null)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setInfoMessage(null)
    // Keep API formError visible until user edits email or password; only reset client validation each attempt.
    setValidationError(null)

    const eErr = validateEmailField(email)
    if (eErr) {
      setValidationError({ field: 'email', message: eErr })
      return
    }
    const pErr = validatePasswordField(password)
    if (pErr) {
      setValidationError({ field: 'password', message: pErr })
      return
    }

    setSubmitting(true)
    try {
      const { token, user } = await loginApi(email.trim(), password)
      writeStoredEmail(email.trim())
      saveSession(token, user, remember)
      navigate('/app-home', { replace: true })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Invalid email or password. Try again'
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  /** Redirects to backend OAuth start (implement `GET /api/auth/google/start` per setup guide). */
  const handleGoogleLogin = useCallback(() => {
    setFormError(null)
    setValidationError(null)
    setInfoMessage(null)
    const api = getApiBaseUrl()
    const returnTo = `${window.location.origin}${window.location.pathname || '/'}`
    window.location.assign(
      `${api}/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`,
    )
  }, [])

  const iv = itemVariants(!!reduceMotion)
  const loginErrText = validationError?.message ?? formError ?? null
  const loginErrorDescribedBy = loginErrText ? 'login-validation-error' : undefined

  return (
    <div className="login-root">
      <motion.section
        className="login-shell"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <motion.div
          className="login-logo"
          aria-hidden
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 22,
            delay: reduceMotion ? 0 : 0.05,
          }}
          whileHover={
            reduceMotion
              ? {}
              : {
                  scale: 1.03,
                  rotate: [0, -2, 2, 0],
                  transition: { duration: 0.45 },
                }
          }
        >
          <img
            className="login-logo-img"
            src="/app-logo-512.png"
            alt=""
            decoding="async"
            draggable={false}
          />
        </motion.div>

        <motion.header variants={containerVariants} initial="hidden" animate="show">
          <motion.h1 className="login-title" variants={iv}>
            Welcome back
          </motion.h1>
          <motion.p className="login-sub" variants={iv}>
            Sign in to track builds, tasks, and releases in one calm place
          </motion.p>
        </motion.header>

        <motion.form
          onSubmit={handleSubmit}
          variants={containerVariants}
          initial="hidden"
          animate="show"
          noValidate
        >
          <motion.div className="login-field-wrap" variants={iv}>
            <label className="login-field-label" htmlFor={emailId}>
              Email
            </label>
            <motion.input
              id={emailId}
              className="login-input"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              minLength={EMAIL_MIN}
              maxLength={EMAIL_MAX}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearErrors()
              }}
              onBlur={() => {
                const t = email.trim()
                if (t.length > 0 && validateEmailField(t) === null) writeStoredEmail(t)
              }}
              aria-invalid={validationError?.field === 'email'}
              aria-describedby={loginErrorDescribedBy}
              whileFocus={reduceMotion ? {} : { scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          </motion.div>

          <motion.div className="login-field-wrap" variants={iv}>
            <label className="login-field-label" htmlFor={passwordId}>
              Password
            </label>
            <motion.input
              id={passwordId}
              className="login-input"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              minLength={PASS_MIN}
              maxLength={PASS_MAX}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearErrors()
              }}
              aria-invalid={validationError?.field === 'password'}
              aria-describedby={loginErrorDescribedBy}
              whileFocus={reduceMotion ? {} : { scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
            <motion.button
              type="button"
              className="login-toggle-pw"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              whileTap={{ scale: 0.96 }}
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </motion.button>
          </motion.div>

          <AnimatePresence mode="sync">
            {loginErrText ? (
              <SharedErrorBanner
                key={loginErrText}
                id="login-validation-error"
                className="profile-error--spacing login-error-below-pw"
              >
                {loginErrText}
              </SharedErrorBanner>
            ) : null}
            {infoMessage ? (
              <motion.div
                key="login-info-msg"
                className="login-info-banner"
                role="status"
                initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              >
                {infoMessage}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.div className="login-row-extra" variants={iv}>
            <motion.input
              id={rememberId}
              className="login-checkbox"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              whileTap={{ scale: 0.92 }}
            />
            <label htmlFor={rememberId} style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Keep me signed in on this device
            </label>
          </motion.div>

          <motion.div variants={iv}>
            <motion.button
              type="submit"
              className="login-primary"
              disabled={submitting}
              whileHover={reduceMotion || submitting ? {} : { y: -1 }}
              whileTap={submitting ? {} : { scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 480, damping: 26 }}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </motion.button>
          </motion.div>

          <motion.div className="login-google-wrap" variants={iv}>
            <motion.button
              type="button"
              className="login-google-btn"
              onClick={handleGoogleLogin}
              whileHover={reduceMotion ? {} : { y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 480, damping: 26 }}
            >
              <span className="login-google-icon" aria-hidden>
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </span>
              Continue with Google
            </motion.button>
          </motion.div>

          <motion.div variants={iv} style={{ textAlign: 'center' }}>
            <motion.button
              type="button"
              className="login-link-btn"
              onClick={() => setForgotOpen(true)}
              whileTap={{ scale: 0.97 }}
            >
              Forgot password?
            </motion.button>
          </motion.div>
        </motion.form>
      </motion.section>

      <ForgotModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
      />
    </div>
  )
}
