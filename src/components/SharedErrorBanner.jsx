import { motion, useReducedMotion } from 'framer-motion'
import '../pages/ProfilePage.css'

export function SharedErrorIcon() {
  return (
    <svg
      className="profile-error-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 8v5M12 16h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Same look as /profile errors: red icon + text, transparent container (see ProfilePage.css).
 */
export function SharedErrorBanner({ children, className = '', id }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      id={id}
      className={`profile-error ${className}`.trim()}
      role="alert"
      initial={reduceMotion ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    >
      <SharedErrorIcon />
      <span className="profile-error-text">{children}</span>
    </motion.div>
  )
}
