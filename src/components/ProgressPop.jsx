import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  isValidDateInput,
  toInputDate,
} from '../lib/dateInputLocal'
import { createModalFlySheetVariants } from '../lib/modalFlyVariants.js'
import { CalendarMonthPicker } from './CalendarStrip'
import { ConfirmPop } from './ConfirmPop'
import '../pages/LoginPage.css'
import './AddTask.css'
import './ProgressPop.css'

const COMMENT_MAX = 500

const PROGRESS_FLOW_SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 42,
  mass: 0.72,
}

const PROGRESS_MODAL_FLY_VARIANTS = createModalFlySheetVariants()

const STATUS_OPTIONS = [
  { key: 'NOT_STARTED', label: 'Not started' },
  { key: 'IN_PROGRESS', label: 'Progress' },
  { key: 'DONE', label: 'Done' },
]

function statusLabel(s) {
  if (s === 'DONE') return 'Done'
  if (s === 'IN_PROGRESS') return 'Progress'
  return 'Not started'
}

function formatDateDisplay(yyyyMmDd) {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return 'Select'
  const [y, mo, d] = yyyyMmDd.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  if (Number.isNaN(dt.getTime())) return 'Select'
  return dt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function MobileDateIcon({ reduceMotion }) {
  return (
    <motion.span
      className="add-task-m-cal-wrap"
      aria-hidden
      whileTap={reduceMotion ? undefined : { scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
    >
      <svg
        className="add-task-m-cal-svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="3" y="4" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M3 10.5h18" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 2.5V6M16 2.5V6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </motion.span>
  )
}

function friendlyError(e) {
  if (!(e instanceof Error)) return 'Could not save. Try again in a moment.'
  const lower = e.message.trim().toLowerCase()
  if (lower.includes("can't reach") || lower.includes('network') || lower.includes('fetch'))
    return "We can't reach the server right now. Check your connection and try again."
  if (lower.includes('column ') || lower.includes('internal server') || lower.includes('status code 5'))
    return 'Could not save. Try again in a moment.'
  return e.message.trim()
}

export function ProgressPop({
  open,
  onClose,
  onSubmit,
  task,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const saveSuccessTimerRef = useRef(null)
  const footerErrRef = useRef(null)
  const commentBlurTimerRef = useRef(null)
  const commentInputRef = useRef(null)
  const [status, setStatus] = useState('NOT_STARTED')
  const [comment, setComment] = useState('')
  const [commentDateStr, setCommentDateStr] = useState('')
  const [commentFocused, setCommentFocused] = useState(false)
  const [openCalendarFor, setOpenCalendarFor] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [saveSucceeded, setSaveSucceeded] = useState(false)
  const [err, setErr] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setStatus(task?.status ?? 'NOT_STARTED')
    setComment('')
    setCommentDateStr(toInputDate(new Date()))
    setCommentFocused(false)
    setOpenCalendarFor(null)
    setSubmitting(false)
    setSaveSucceeded(false)
    setErr(null)
    setConfirmOpen(false)
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    if (commentBlurTimerRef.current) {
      clearTimeout(commentBlurTimerRef.current)
      commentBlurTimerRef.current = null
    }
  }, [open, task])

  useEffect(() => {
    if (open) return
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setSaveSucceeded(false)
  }, [open])

  const flowTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : { layout: PROGRESS_FLOW_SPRING, opacity: PROGRESS_FLOW_SPRING },
    [reduceMotion],
  )

  const footerErrTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0.12 }
        : { height: PROGRESS_FLOW_SPRING, opacity: PROGRESS_FLOW_SPRING },
    [reduceMotion],
  )

  const commentFieldCompact = !commentFocused

  const handleCommentFocus = () => {
    if (commentBlurTimerRef.current) {
      clearTimeout(commentBlurTimerRef.current)
      commentBlurTimerRef.current = null
    }
    setCommentFocused(true)
  }

  const handleCommentBlur = (e) => {
    const next = e.relatedTarget
    if (next instanceof Element && next.closest?.('.progress-pop-options')) return
    if (commentBlurTimerRef.current) clearTimeout(commentBlurTimerRef.current)
    commentBlurTimerRef.current = setTimeout(() => {
      commentBlurTimerRef.current = null
      setCommentFocused(false)
    }, 100)
  }

  const handleOptionMouseDown = (e) => {
    e.preventDefault()
  }

  const openDateCalendar = () => {
    commentInputRef.current?.blur()
    setErr(null)
    setCommentFocused(false)
    setOpenCalendarFor('comment')
  }

  const parseDateOrToday = (value) => {
    const d = value ? new Date(value) : null
    return d && !Number.isNaN(d.getTime()) ? d : new Date()
  }

  const commentDateTaskRangeLiveError = useMemo(() => {
    if (!task) return ''
    const startKey =
      task.startDate != null ? String(task.startDate).slice(0, 10) : ''
    const dueKey = task.dueDate != null ? String(task.dueDate).slice(0, 10) : ''
    if (startKey.length !== 10 || dueKey.length !== 10) return ''
    if (
      !commentDateStr ||
      commentDateStr.length !== 10 ||
      !isValidDateInput(commentDateStr)
    ) {
      return ''
    }
    if (commentDateStr < startKey || commentDateStr > dueKey) {
      return `Select a date within the task date range (${formatDateDisplay(startKey)} – ${formatDateDisplay(dueKey)}).`
    }
    return ''
  }, [task?.id, task?.startDate, task?.dueDate, commentDateStr])

  const footerFormMessage = err || commentDateTaskRangeLiveError

  useEffect(() => {
    if (!footerFormMessage) return
    footerErrRef.current?.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    })
  }, [footerFormMessage, reduceMotion])

  const performSave = async () => {
    setSubmitting(true)
    try {
      await onSubmit?.({
        status,
        comment: comment.trim(),
        commentDate: commentDateStr,
      })
      setSubmitting(false)
      setSaveSucceeded(true)
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = setTimeout(() => {
        saveSuccessTimerRef.current = null
        setSaveSucceeded(false)
        onClose?.()
      }, 2000)
    } catch (e) {
      setErr(friendlyError(e))
      setSubmitting(false)
    }
  }

  const handleSave = () => {
    if (submitting || saveSucceeded) return
    setErr(null)
    const c = comment.trim()
    if (!c) {
      setErr('Comment is required')
      return
    }
    if (c.length > COMMENT_MAX) {
      setErr(`Comment can't be longer than ${COMMENT_MAX} characters`)
      return
    }
    if (!commentDateStr?.trim()) {
      setErr('Comment date is required')
      return
    }
    if (!isValidDateInput(commentDateStr)) {
      setErr('Comment date is not valid')
      return
    }
    if (commentDateTaskRangeLiveError) return
    setConfirmOpen(true)
  }

  const actionLocked = submitting || saveSucceeded
  const cancelDisabled = submitting

  return (
    <AnimatePresence onExitComplete={onSheetExitComplete}>
      {open ? (
        <motion.div
          className="modal-backdrop add-task-backdrop progress-pop-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0.15 : 0.38,
            ease: [0.22, 0.61, 0.36, 1],
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="progress-pop-title"
            className="modal-sheet add-task-sheet progress-pop-sheet"
            style={{ transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={PROGRESS_MODAL_FLY_VARIANTS}
            initial="fromOrigin"
            animate="expanded"
            exit="fromOrigin"
            transition={
              reduceMotion
                ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
                : { type: 'spring', stiffness: 360, damping: 30, mass: 0.72 }
            }
          >
            <motion.h2
              id="progress-pop-title"
              layout
              className="modal-title"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={flowTransition}
            >
              Update progress
            </motion.h2>

            <LayoutGroup id="progress-pop-flow">

            <motion.p
              layout
              transition={flowTransition}
              className="progress-pop-task-name"
            >
              {task?.title ?? ''}
            </motion.p>

            <motion.div className="progress-pop-options" role="group" aria-label="Task status" layout transition={flowTransition}>
              <motion.div className="progress-pop-status-bar" layout transition={flowTransition}>
                {STATUS_OPTIONS.map((opt, idx) => (
                  <motion.button
                    key={opt.key}
                    type="button"
                    layout
                    className={
                      status === opt.key
                        ? 'proj-filter-btn proj-filter-btn--active'
                        : 'proj-filter-btn'
                    }
                    initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            ...PROGRESS_FLOW_SPRING,
                            delay: 0.04 * idx,
                          }
                    }
                    onClick={() => {
                      commentInputRef.current?.blur()
                      setCommentFocused(false)
                      setStatus(opt.key)
                      setErr(null)
                    }}
                    onMouseDown={handleOptionMouseDown}
                    whileTap={{ scale: 0.96 }}
                    whileHover={reduceMotion ? {} : { y: -1 }}
                    aria-pressed={status === opt.key}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </motion.div>

              <div className="add-task-section add-task-section--fields">
                <motion.label
                  layout
                  transition={flowTransition}
                  className="login-field-label add-task-label-spaced"
                  htmlFor="progress-pop-comment"
                >
                  Comment
                </motion.label>
                <motion.textarea
                  ref={commentInputRef}
                  id="progress-pop-comment"
                  layout
                  className={
                    commentFieldCompact
                      ? 'login-input add-task-textarea add-task-textarea--title'
                      : 'login-input add-task-textarea add-task-textarea--body'
                  }
                  rows={commentFieldCompact ? 1 : 5}
                  maxLength={COMMENT_MAX}
                  value={comment}
                  placeholder="What did you do or plan to do?"
                  aria-describedby="progress-pop-comment-hint"
                  onFocus={handleCommentFocus}
                  onBlur={handleCommentBlur}
                  onChange={(e) => {
                    setComment(e.target.value)
                    setErr(null)
                  }}
                  transition={flowTransition}
                />
                <motion.p
                  layout
                  transition={flowTransition}
                  id="progress-pop-comment-hint"
                  className="add-task-char-hint"
                  style={{ marginBottom: 10 }}
                >
                  Up to {COMMENT_MAX} characters · {comment.length}/{COMMENT_MAX}
                </motion.p>
              </div>

              <motion.div
                className="add-task-m-pair"
                layout
                transition={flowTransition}
              >
                <button
                  type="button"
                  className="add-task-m-row"
                  onMouseDown={handleOptionMouseDown}
                  onClick={openDateCalendar}
                >
                  <span className="add-task-m-row-label">Comment date</span>
                  <span className="add-task-m-row-trail">
                    <span className="add-task-m-row-value">
                      {formatDateDisplay(commentDateStr)}
                    </span>
                    <MobileDateIcon reduceMotion={!!reduceMotion} />
                  </span>
                </button>
              </motion.div>
            </motion.div>

            <AnimatePresence initial={false} mode="popLayout">
              {footerFormMessage ? (
                <motion.div
                  key="progress-pop-err"
                  ref={footerErrRef}
                  className="add-task-footer-err-host"
                  style={{ overflow: 'hidden' }}
                  role="region"
                  aria-label="Form messages"
                  aria-live="assertive"
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={footerErrTransition}
                >
                  <div className="add-task-footer-err-wrap">
                    <p className="add-task-error add-task-footer-err-item" role="alert">
                      {footerFormMessage}
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <motion.div
              layout
              transition={flowTransition}
              className="modal-actions add-task-modal-actions"
            >
              <motion.button
                type="button"
                layout
                transition={flowTransition}
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                disabled={cancelDisabled}
              >
                Cancel
              </motion.button>
              <motion.button
                type="button"
                layout
                transition={flowTransition}
                className={
                  saveSucceeded
                    ? 'modal-btn modal-btn-primary add-task-btn--saved'
                    : 'modal-btn modal-btn-primary'
                }
                onClick={handleSave}
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion || saveSucceeded ? {} : { y: -1 }}
                disabled={actionLocked}
                aria-busy={submitting || undefined}
              >
                {saveSucceeded ? (
                  <span className="add-task-save-success-inner">
                    <svg
                      className="add-task-save-success-icon"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
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
                    <span className="add-task-save-success-text">Saved successfully</span>
                  </span>
                ) : submitting ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </motion.button>
            </motion.div>

            </LayoutGroup>
          </motion.div>

          <AnimatePresence>
            {openCalendarFor ? (
              <motion.div
                className="add-task-cal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.18 }}
              >
                <CalendarMonthPicker
                  selectedDate={parseDateOrToday(commentDateStr)}
                  showTrigger={false}
                  overlayTitle="Comment date"
                  onRequestClose={() => setOpenCalendarFor(null)}
                  onSelectDate={(d) => {
                    setCommentDateStr(toInputDate(d))
                    setErr(null)
                    setOpenCalendarFor(null)
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {createPortal(
            <ConfirmPop
              open={confirmOpen}
              title="Update progress"
              message={`Save comment and set status to "${statusLabel(status)}"?`}
              noLabel="No"
              yesLabel="Yes, save"
              skipDocumentScrollLock
              onNo={() => setConfirmOpen(false)}
              onYes={async () => {
                setConfirmOpen(false)
                await performSave()
              }}
            />,
            document.body,
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default ProgressPop
