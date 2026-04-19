import { motion, useReducedMotion } from 'framer-motion'
import '../pages/ProfilePage.css'

function ProfileSuccessIcon() {
  return (
    <svg
      className="profile-success-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 12l3 3 5-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Same look as profile success lines (green icon + text, transparent wrap). */
export function ProfileSuccessAlert({ children, className = '' }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className={`profile-success-banner ${className}`.trim()}
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    >
      <ProfileSuccessIcon />
      <span className="profile-success-text">{children}</span>
    </motion.div>
  )
}
