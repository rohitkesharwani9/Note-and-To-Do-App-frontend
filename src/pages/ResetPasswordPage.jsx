import { useCallback, useEffect, useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SharedErrorBanner } from '../components/SharedErrorBanner'
import { completePasswordReset } from '../lib/api'
import { PASS_MAX, PASS_MIN, validatePasswordField } from '../lib/inputLimits'
import { isLoggedIn } from '../lib/session'
import './LoginPage.css'
import './ResetPasswordPage.css'

const LOGGED_IN_RESET_MESSAGE =
  'You are already signed in to your account. To set a new password, open your Profile page and change your password there, or sign out and then open the link from your email again to set a new password on this page.'

function friendlyResetError(raw) {
  if (raw == null || typeof raw !== 'string') {
    return 'Something went wrong while updating your password. Please wait a moment and try again.'
  }
  const t = raw.trim()
  const lower = t.toLowerCase()
  if (
    lower.includes('invalid') &&
    (lower.includes('expired') || lower.includes('link') || lower.includes('reset'))
  ) {
    return 'This reset link is not valid anymore. It may have expired. Request a new reset email from the sign-in page and try again.'
  }
  if (lower.includes("can't reach the server") || lower.includes('check that the api is running')) {
    return "We can't reach the server right now. Make sure the app is running and try again."
  }
  if (lower.includes('unexpected response')) {
    return 'We could not read the server response. Check your connection and try again.'
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return "We can't reach the server right now. Check your internet connection and try again."
  }
  if (lower.includes('password must be') || lower.includes("can't be longer")) {
    return t
  }
  if (t.length < 120 && !/[{}[\]\\]/.test(t)) {
    return t
  }
  return 'We could not update your password. Please try again in a few minutes. If it keeps happening, request a new reset link from the sign-in page.'
}

function MemorisePasswordModal({ open, onClose, onConfirm, reduceMotion }) {
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
            aria-labelledby="reset-memorise-title"
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            initial={
              reduceMotion ? { opacity: 0, scale: 0.98 } : { opacity: 0, scale: 0.92, y: 18 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0, scale: 0.98 } : { opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <motion.h2 id="reset-memorise-title" className="modal-title">
              Remember your new password?
            </motion.h2>
            <motion.p className="modal-text">
              Are you sure you memorise this new password? You will need it the next time you sign
              in.
            </motion.p>
            <div className="modal-actions">
              <motion.button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                Not now
              </motion.button>
              <motion.button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={onConfirm}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                Yes, I remember it
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ClosePageModal({ open, onYes, reduceMotion }) {
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
            aria-labelledby="reset-close-tab-title"
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            initial={
              reduceMotion ? { opacity: 0, scale: 0.98 } : { opacity: 0, scale: 0.92, y: 18 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0, scale: 0.98 } : { opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <motion.h2 id="reset-close-tab-title" className="modal-title">
              Close this page
            </motion.h2>
            <motion.p className="modal-text">
              For your security, you can close this page now. Tap Yes to try closing this tab. If
              nothing happens, use your browser&apos;s tab close control or return to sign in.
            </motion.p>
            <div className="reset-pw-modal-actions-single">
              <motion.button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={onYes}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                Yes
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default function ResetPasswordPage() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const pwId = useId()
  const confirmId = useId()
  const hintId = useId()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [memoriseOpen, setMemoriseOpen] = useState(false)
  const [closePageOpen, setClosePageOpen] = useState(false)
  const loggedIn = isLoggedIn()

  const runSaveAfterConfirm = useCallback(async () => {
    if (!token.trim()) {
      setFormError('This page needs a valid link from your email. Open the reset link again.')
      return
    }
    setMemoriseOpen(false)
    setProcessing(true)
    setFormError(null)
    setValidationError(null)
    try {
      const data = await completePasswordReset(token.trim(), password)
      setSuccessMessage(
        typeof data.message === 'string'
          ? data.message
          : 'Your password has been updated. You can sign in with your new password.',
      )
      setPassword('')
      setConfirm('')
    } catch (err) {
      setFormError(friendlyResetError(err instanceof Error ? err.message : ''))
    } finally {
      setProcessing(false)
    }
  }, [password, token])

  useEffect(() => {
    if (!successMessage) return undefined
    const id = window.setTimeout(() => {
      setClosePageOpen(true)
    }, 10000)
    return () => window.clearTimeout(id)
  }, [successMessage])

  const handleTryCloseTab = useCallback(() => {
    setClosePageOpen(false)
    window.close()
    window.setTimeout(() => {
      navigate('/login', { replace: true })
    }, 280)
  }, [navigate])

  const validateBeforeConfirm = useCallback(() => {
    setFormError(null)
    setValidationError(null)
    if (loggedIn) return false
    if (!token.trim()) {
      setFormError('This page needs a valid link from your email. Open the reset link again.')
      return false
    }
    const pErr = validatePasswordField(password)
    if (pErr) {
      setValidationError({ field: 'password', message: pErr })
      return false
    }
    const cErr = validatePasswordField(confirm)
    if (cErr) {
      setValidationError({ field: 'confirm', message: cErr })
      return false
    }
    if (password !== confirm) {
      setValidationError({
        field: 'confirm',
        message: 'New password and confirmation must match each other before saving.',
      })
      return false
    }
    return true
  }, [confirm, loggedIn, password, token])

  const handleOpenMemoriseModal = useCallback(
    (e) => {
      e.preventDefault()
      if (successMessage || loggedIn || processing) return
      if (!validateBeforeConfirm()) return
      setMemoriseOpen(true)
    },
    [loggedIn, processing, successMessage, validateBeforeConfirm],
  )

  const errText = validationError?.message ?? formError ?? null
  const errId = errText ? 'reset-pw-validation-error' : undefined
  const saveDisabled =
    loggedIn ||
    !token.trim() ||
    Boolean(successMessage) ||
    processing ||
    memoriseOpen ||
    closePageOpen

  return (
    <div className="login-root">
      <motion.section
        className="login-shell"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.04 }}
        >
          <h1 className="login-title">Set a new password</h1>
          <p className="login-sub">
            Choose a new password for your account. The link from your email expires after one
            hour.
          </p>
        </motion.header>

        <motion.form
          onSubmit={handleOpenMemoriseModal}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          noValidate
        >
          {loggedIn ? (
            <SharedErrorBanner
              id="reset-pw-logged-in"
              className="profile-error--spacing login-error-below-pw"
            >
              {LOGGED_IN_RESET_MESSAGE}{' '}
              <Link to="/profile" className="login-link-btn" style={{ display: 'inline' }}>
                Open profile
              </Link>
            </SharedErrorBanner>
          ) : null}

          {!token.trim() ? (
            <SharedErrorBanner
              id="reset-pw-missing-token"
              className="profile-error--spacing login-error-below-pw"
            >
              This page needs a valid link from your email. Request a new reset from the sign-in
              page.
            </SharedErrorBanner>
          ) : null}

          <div className="login-field-wrap">
            <div className="reset-pw-label-row">
              <label className="login-field-label reset-pw-label-inline" htmlFor={pwId}>
                New password
              </label>
              <span id={hintId} className="reset-pw-notice-inline">
                (6-25 character only)
              </span>
            </div>
            <motion.input
              id={pwId}
              className="login-input"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={PASS_MIN}
              maxLength={PASS_MAX}
              value={password}
              disabled={loggedIn || Boolean(successMessage)}
              onChange={(e) => {
                const v = e.target.value.slice(0, PASS_MAX)
                setPassword(v)
                setValidationError(null)
                setFormError(null)
              }}
              aria-invalid={validationError?.field === 'password'}
              aria-describedby={hintId}
              whileFocus={reduceMotion || loggedIn ? {} : { scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          </div>

          <div className="login-field-wrap">
            <label className="login-field-label" htmlFor={confirmId}>
              Confirm new password
            </label>
            <motion.input
              id={confirmId}
              className="login-input"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={PASS_MIN}
              maxLength={PASS_MAX}
              value={confirm}
              disabled={loggedIn || Boolean(successMessage)}
              onChange={(e) => {
                const v = e.target.value.slice(0, PASS_MAX)
                setConfirm(v)
                setValidationError(null)
                setFormError(null)
              }}
              aria-invalid={validationError?.field === 'confirm'}
              whileFocus={reduceMotion || loggedIn ? {} : { scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          </div>

          <div className="reset-pw-toggle-row">
            <motion.button
              type="button"
              className="login-toggle-pw"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              disabled={loggedIn || Boolean(successMessage)}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </motion.button>
          </div>

          {errText && token.trim() && !loggedIn ? (
            <SharedErrorBanner id={errId} className="profile-error--spacing login-error-below-pw">
              {errText}
            </SharedErrorBanner>
          ) : null}

          {successMessage ? (
            <motion.div
              className="reset-pw-success-panel"
              role="status"
              aria-live="polite"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            >
              {successMessage}
            </motion.div>
          ) : null}

          {!successMessage ? (
            <motion.button
              type="submit"
              className="login-primary"
              disabled={saveDisabled}
              whileHover={reduceMotion || saveDisabled ? {} : { y: -1 }}
              whileTap={saveDisabled ? {} : { scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 480, damping: 26 }}
            >
              {processing ? 'Processing…' : 'Save new password'}
            </motion.button>
          ) : null}

          <p className="login-meta" style={{ marginTop: '20px' }}>
            <Link to="/login" className="login-link-btn" style={{ display: 'inline' }}>
              Back to sign in
            </Link>
          </p>
        </motion.form>
      </motion.section>

      <MemorisePasswordModal
        open={memoriseOpen}
        reduceMotion={!!reduceMotion}
        onClose={() => setMemoriseOpen(false)}
        onConfirm={runSaveAfterConfirm}
      />

      <ClosePageModal
        open={closePageOpen}
        reduceMotion={!!reduceMotion}
        onYes={handleTryCloseTab}
      />
    </div>
  )
}
