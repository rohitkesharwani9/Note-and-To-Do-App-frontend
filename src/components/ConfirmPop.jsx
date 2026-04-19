import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useId } from 'react'
import './ConfirmPop.css'

const defaultTitle = 'Finish?'
const defaultMessage =
  'Are you sure you are finished? You cannot come back to this later.'

/**
 * iOS–style centered confirmation with two equal blue actions (No / Yes).
 * White sheet, hairline dividers, both labels in system blue.
 * No backdrop dismiss.
 *
 * Usage (wire when ready): `open`, `onNo`, `onYes`.
 */
export function ConfirmPop({
  open,
  onNo,
  onYes,
  title = defaultTitle,
  message = defaultMessage,
  noLabel = 'No',
  yesLabel = 'Yes',
  warning = false,
  statusTags = [],
  /** When true, do not set body overflow / scrollbar padding (e.g. confirm on top of another modal). */
  skipDocumentScrollLock = false,
}) {
  const reduceMotion = useReducedMotion()
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    if (!open || skipDocumentScrollLock) return
    const prevOverflow = document.body.style.overflow
    const prevPaddingRight = document.body.style.paddingRight
    const scrollbarWidth =
      typeof window !== 'undefined'
        ? window.innerWidth - document.documentElement.clientWidth
        : 0
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPaddingRight
    }
  }, [open, skipDocumentScrollLock])

  const spring = reduceMotion
    ? { duration: 0.15 }
    : { type: 'spring', stiffness: 520, damping: 38 }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="ios-yn-confirm"
          className="ios-yn-confirm-backdrop"
          role="presentation"
          aria-hidden="true"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            className="ios-yn-confirm-sheet"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ios-yn-confirm-body">
              <h2 id={titleId} className="ios-yn-confirm-title">
                {title}
              </h2>
              {statusTags.length ? (
                <div className="ios-yn-confirm-status-row" aria-label="Selected statuses">
                  {statusTags.map((tag) => (
                    <span key={tag} className="ios-yn-confirm-status-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {warning ? (
                <div className="ios-yn-confirm-warning-row">
                  <div className="ios-yn-confirm-warning-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 3.5L21 19.5H3L12 3.5Z"
                        fill="#f5b300"
                        stroke="#c58800"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M12 8.2V13.2"
                        stroke="#4a3700"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx="12" cy="16.6" r="1.1" fill="#4a3700" />
                    </svg>
                  </div>
                  <span className="ios-yn-confirm-warning-label">Date warning</span>
                </div>
              ) : null}
              <p
                id={messageId}
                className={
                  warning
                    ? 'ios-yn-confirm-message ios-yn-confirm-message--warning'
                    : 'ios-yn-confirm-message'
                }
              >
                {message}
              </p>
            </div>
            <div className="ios-yn-confirm-hrule" aria-hidden />
            <div className="ios-yn-confirm-actions">
              <button
                type="button"
                className="ios-yn-confirm-btn"
                onClick={() => onNo?.()}
              >
                {noLabel}
              </button>
              <div className="ios-yn-confirm-vrule" aria-hidden />
              <button
                type="button"
                className="ios-yn-confirm-btn"
                onClick={() => onYes?.()}
              >
                {yesLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default ConfirmPop

