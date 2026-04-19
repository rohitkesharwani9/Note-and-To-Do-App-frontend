import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useId } from 'react'
import './DeleteConfirmPop.css'

export function DeleteConfirmPop({
  open,
  onCancel,
  onConfirm,
  skipDocumentScrollLock = false,
  title = 'Delete task',
  message = 'Are you sure you want to delete this task? This cannot be undone.',
  confirmLabel = 'Yes, delete',
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
          key="delete-confirm"
          className="delete-confirm-backdrop"
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
            className="delete-confirm-sheet"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-confirm-body">
              <h2 id={titleId} className="delete-confirm-title">
                {title}
              </h2>
              <p id={messageId} className="delete-confirm-message">
                {message}
              </p>
            </div>
            <div className="delete-confirm-hrule" aria-hidden />
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-confirm-btn delete-confirm-btn--cancel"
                onClick={() => onCancel?.()}
              >
                Cancel
              </button>
              <div className="delete-confirm-vrule" aria-hidden />
              <button
                type="button"
                className="delete-confirm-btn delete-confirm-btn--delete"
                onClick={() => onConfirm?.()}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default DeleteConfirmPop
