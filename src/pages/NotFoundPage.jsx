import { Link, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import './NotFoundPage.css'

const PATH_DISPLAY_MAX = 80

function formatPathForDisplay(pathname) {
  const p = pathname || '/'
  if (p.length <= PATH_DISPLAY_MAX) return p
  return `${p.slice(0, PATH_DISPLAY_MAX - 1)}…`
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
}

const itemVariants = (reduceMotion) => ({
  hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 28 },
  },
})

export default function NotFoundPage() {
  const reduceMotion = useReducedMotion()
  const { pathname } = useLocation()
  const iv = itemVariants(!!reduceMotion)
  const friendlyPath = formatPathForDisplay(pathname)

  return (
    <motion.div
      className="not-found-root"
      role="main"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
    >
      <motion.section
        className="not-found-shell"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div
          className="not-found-badge"
          aria-hidden
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          whileHover={
            reduceMotion
              ? {}
              : { rotate: [0, -3, 3, 0], transition: { duration: 0.4 } }
          }
        >
          ?
        </motion.div>

        <motion.p className="not-found-code" variants={iv}>
          404
        </motion.p>

        <motion.h1 className="not-found-title" variants={iv}>
          Page not found
        </motion.h1>

        <motion.p className="not-found-sub" variants={iv}>
          We couldn&apos;t find that screen. The link may be wrong or the page may have moved.
        </motion.p>

        <motion.div
          className="not-found-path-inset"
          variants={iv}
          role="status"
          aria-label="Address you tried"
        >
          <span className="not-found-path-label">You tried</span>
          <span className="not-found-path-value">{friendlyPath}</span>
        </motion.div>

        <motion.div
          variants={iv}
          style={{ width: '100%', marginTop: 8 }}
          whileHover={reduceMotion ? {} : { y: -1 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 480, damping: 26 }}
        >
          <Link to="/" className="not-found-primary">
            Back to sign in
          </Link>
        </motion.div>

        <motion.p className="not-found-meta" variants={iv}>
          Check the address for typos, or go back to sign in and open what you need from there.
        </motion.p>
      </motion.section>
    </motion.div>
  )
}
