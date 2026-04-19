import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarMonthPicker } from './CalendarStrip'
import { ConfirmPop } from './ConfirmPop'
import { DeleteConfirmPop } from './DeleteConfirmPop'
import { deleteTaskComment, fetchTaskComments, patchTaskComment } from '../lib/api'
import { createModalFlySheetVariants } from '../lib/modalFlyVariants.js'
import './ViewCommentPop.css'

const PER_PAGE = 10
const COMMENT_MAX = 500
const REACTIONS = ['👍', '👎', '❤️', '😡', '😂', '😮', '🙏', '🙌', '✅', '❌']

const VIEW_COMMENT_MODAL_FLY_VARIANTS = createModalFlySheetVariants()

function fmtDate(input) {
  if (!input) return '—'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function toInputDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ViewCommentPop({ open, onClose, task, originRect = null, onSheetExitComplete }) {
  const reduceMotion = useReducedMotion()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [page, setPage] = useState(1)
  const [savingCommentId, setSavingCommentId] = useState(null)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [editCommentDate, setEditCommentDate] = useState('')
  const [editErr, setEditErr] = useState(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [reactionOpenId, setReactionOpenId] = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteCommentId, setDeleteCommentId] = useState(null)
  const [removingCommentId, setRemovingCommentId] = useState(null)
  const [openCalendarForEdit, setOpenCalendarForEdit] = useState(false)
  const [commentEditSaveSuccess, setCommentEditSaveSuccess] = useState(false)
  const commentEditSaveSuccessTimeoutRef = useRef(null)
  const [commentDeleteSucceeded, setCommentDeleteSucceeded] = useState(false)
  const commentDeleteSuccessTimerRef = useRef(null)

  useEffect(() => {
    if (!open || !task?.id) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setPage(1)
    fetchTaskComments(task.id)
      .then((data) => {
        if (cancelled) return
        setComments(data.comments ?? [])
      })
      .catch((e) => {
        if (cancelled) return
        setLoadError(
          e instanceof Error ? e.message : 'Could not load comments',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, task?.id])

  useEffect(() => {
    if (!open) {
      setComments([])
      setPage(1)
      setLoadError(null)
      setSavingCommentId(null)
      setEditingCommentId(null)
      setEditCommentText('')
      setEditCommentDate('')
      setEditErr(null)
      setSaveConfirmOpen(false)
      setReactionOpenId(null)
      setDeleteConfirmOpen(false)
      setDeleteCommentId(null)
      setRemovingCommentId(null)
      setOpenCalendarForEdit(false)
      setCommentEditSaveSuccess(false)
      if (commentEditSaveSuccessTimeoutRef.current) {
        clearTimeout(commentEditSaveSuccessTimeoutRef.current)
        commentEditSaveSuccessTimeoutRef.current = null
      }
      setCommentDeleteSucceeded(false)
      if (commentDeleteSuccessTimerRef.current) {
        clearTimeout(commentDeleteSuccessTimerRef.current)
        commentDeleteSuccessTimerRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (commentEditSaveSuccessTimeoutRef.current) {
        clearTimeout(commentEditSaveSuccessTimeoutRef.current)
        commentEditSaveSuccessTimeoutRef.current = null
      }
      if (commentDeleteSuccessTimerRef.current) {
        clearTimeout(commentDeleteSuccessTimerRef.current)
        commentDeleteSuccessTimerRef.current = null
      }
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(comments.length / PER_PAGE))
  const pageComments = useMemo(
    () => comments.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [comments, page],
  )

  const bodyRef = useRef(null)
  const cancelEditRef = useRef(() => {})

  const clearCommentEditSaveSuccessTimer = () => {
    if (commentEditSaveSuccessTimeoutRef.current) {
      clearTimeout(commentEditSaveSuccessTimeoutRef.current)
      commentEditSaveSuccessTimeoutRef.current = null
    }
    setCommentEditSaveSuccess(false)
  }

  const flowTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : { type: 'spring', stiffness: 380, damping: 42, mass: 0.72 },
    [reduceMotion],
  )

  const layoutTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : { layout: { type: 'spring', stiffness: 380, damping: 42, mass: 0.72 } },
    [reduceMotion],
  )

  const hasEditing = !!editingCommentId

  const beginEdit = (c) => {
    clearCommentEditSaveSuccessTimer()
    if (commentDeleteSuccessTimerRef.current) {
      clearTimeout(commentDeleteSuccessTimerRef.current)
      commentDeleteSuccessTimerRef.current = null
    }
    if (commentDeleteSucceeded && editingCommentId != null) {
      setCommentDeleteSucceeded(false)
      setComments((prev) => prev.filter((x) => x.id !== editingCommentId))
      setRemovingCommentId(null)
    }
    setReactionOpenId(null)
    setEditErr(null)
    setEditingCommentId(c.id)
    setEditCommentText(c.comment ?? '')
    setEditCommentDate(c.commentDate ? String(c.commentDate).slice(0, 10) : '')
    setOpenCalendarForEdit(false)
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector?.(`[data-comment-id="${c.id}"]`)
      if (el?.scrollIntoView) {
        el.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        })
      }
    })
  }

  const cancelEdit = () => {
    clearCommentEditSaveSuccessTimer()
    if (commentDeleteSuccessTimerRef.current) {
      clearTimeout(commentDeleteSuccessTimerRef.current)
      commentDeleteSuccessTimerRef.current = null
    }
    if (commentDeleteSucceeded && editingCommentId != null) {
      const id = editingCommentId
      setCommentDeleteSucceeded(false)
      setComments((prev) => prev.filter((x) => x.id !== id))
      setRemovingCommentId(null)
    }
    setEditingCommentId(null)
    setEditCommentText('')
    setEditCommentDate('')
    setEditErr(null)
    setSaveConfirmOpen(false)
    setDeleteConfirmOpen(false)
    setDeleteCommentId(null)
    setOpenCalendarForEdit(false)
  }

  cancelEditRef.current = cancelEdit

  const saveEdit = async () => {
    if (!editingCommentId || !task?.id) return
    const txt = String(editCommentText ?? '').trim()
    if (!txt) {
      setEditErr('Comment must be at least 1 character')
      return
    }
    if (txt.length > COMMENT_MAX) {
      setEditErr(`Comment can't be longer than ${COMMENT_MAX} characters`)
      return
    }
    if (!editCommentDate) {
      setEditErr('Comment date is required')
      return
    }
    const startKey =
      task.startDate != null ? String(task.startDate).slice(0, 10) : ''
    const dueKey = task.dueDate != null ? String(task.dueDate).slice(0, 10) : ''
    if (
      startKey.length === 10 &&
      dueKey.length === 10 &&
      editCommentDate.length === 10
    ) {
      if (editCommentDate < startKey || editCommentDate > dueKey) {
        setEditErr(
          `Select a date within the task date range (${fmtDate(startKey)} – ${fmtDate(dueKey)})`,
        )
        return
      }
    }
    setEditErr(null)
    setSaveConfirmOpen(true)
  }

  const applyEdit = async () => {
    if (!editingCommentId || !task?.id) return
    setSaveConfirmOpen(false)
    setSavingCommentId(editingCommentId)
    try {
      const data = await patchTaskComment(task.id, editingCommentId, {
        comment: editCommentText,
        commentDate: editCommentDate,
      })
      setComments((prev) =>
        prev.map((c) => (c.id === editingCommentId ? (data.comment ?? c) : c)),
      )
      if (commentEditSaveSuccessTimeoutRef.current) {
        clearTimeout(commentEditSaveSuccessTimeoutRef.current)
        commentEditSaveSuccessTimeoutRef.current = null
      }
      setCommentEditSaveSuccess(true)
      commentEditSaveSuccessTimeoutRef.current = setTimeout(() => {
        commentEditSaveSuccessTimeoutRef.current = null
        cancelEdit()
      }, 2000)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Could not update comment')
    } finally {
      setSavingCommentId(null)
    }
  }

  const onReactionPick = async (commentId, emoji) => {
    if (!task?.id) return
    setReactionOpenId(null)
    setSavingCommentId(commentId)
    try {
      const data = await patchTaskComment(task.id, commentId, { emoji })
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? (data.comment ?? c) : c)),
      )
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not save reaction')
    } finally {
      setSavingCommentId(null)
    }
  }

  const queueDeleteComment = (commentId) => {
    setDeleteCommentId(commentId)
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteComment = async () => {
    if (!deleteCommentId || !task?.id) return
    const id = deleteCommentId
    setDeleteConfirmOpen(false)
    setSavingCommentId(id)
    try {
      await deleteTaskComment(task.id, id)
      if (commentDeleteSuccessTimerRef.current) {
        clearTimeout(commentDeleteSuccessTimerRef.current)
        commentDeleteSuccessTimerRef.current = null
      }
      setCommentDeleteSucceeded(true)
      commentDeleteSuccessTimerRef.current = setTimeout(() => {
        commentDeleteSuccessTimerRef.current = null
        setCommentDeleteSucceeded(false)
        setRemovingCommentId(id)
        window.setTimeout(() => {
          setComments((prev) => prev.filter((c) => c.id !== id))
          cancelEditRef.current()
          setRemovingCommentId(null)
        }, 260)
      }, 2000)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not delete comment')
      setRemovingCommentId(null)
    } finally {
      setSavingCommentId(null)
      setDeleteCommentId(null)
    }
  }

  const parseDateOrToday = (input) => {
    const d = input ? new Date(input) : null
    return d && !Number.isNaN(d.getTime()) ? d : new Date()
  }

  return (
    <AnimatePresence onExitComplete={onSheetExitComplete}>
      {open ? (
        <motion.div
          className="modal-backdrop add-task-backdrop view-comment-backdrop"
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
            aria-labelledby="view-comment-title"
            className="modal-sheet view-comment-sheet"
            style={{ transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={VIEW_COMMENT_MODAL_FLY_VARIANTS}
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
              id="view-comment-title"
              className="modal-title"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={flowTransition}
            >
              Comments for &ldquo;{task?.title ?? ''}&rdquo; Task
            </motion.h2>

            <motion.p
              className="view-comment-scroll-hint"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={flowTransition}
            >
              Scroll up or down to view
            </motion.p>

            <LayoutGroup id="view-comment-flow">

            <motion.div
              ref={bodyRef}
              className={`view-comment-body${hasEditing ? ' view-comment-body--locked' : ''}`}
              layout
              transition={layoutTransition}
            >
              {loading ? (
                <motion.p
                  className="view-comment-muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  Loading comments…
                </motion.p>
              ) : loadError ? (
                <motion.p
                  className="view-comment-error"
                  role="alert"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {loadError}
                </motion.p>
              ) : comments.length === 0 ? (
                <motion.p
                  className="view-comment-muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  No comments yet
                </motion.p>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.ul
                    key={`page-${page}`}
                    className={hasEditing ? 'view-comment-list view-comment-list--editing' : 'view-comment-list'}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={flowTransition}
                  >
                    <AnimatePresence initial={false}>
                    {pageComments.map((c, idx) => (
                      <motion.li
                        key={c.id}
                        data-comment-id={c.id}
                        className={
                          editingCommentId === c.id
                            ? 'view-comment-item view-comment-item--editing'
                            : 'view-comment-item'
                        }
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={
                          removingCommentId === c.id
                            ? {
                                opacity: 0,
                                y: -6,
                                backgroundColor: 'rgba(254, 202, 202, 0.92)',
                                borderColor: 'rgba(220, 38, 38, 0.42)',
                              }
                            : { opacity: 1, y: 0 }
                        }
                        exit={{ opacity: 0, y: -8 }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : {
                                type: 'spring',
                                stiffness: 380,
                                damping: 32,
                                delay: 0.03 * idx,
                              }
                        }
                      >
                        <div className="view-comment-head">
                          <span className="view-comment-date">{fmtDate(c.commentDate)}</span>
                          <div className="view-comment-actions">
                            <motion.button
                              type="button"
                              className="view-comment-icon-btn"
                              onClick={() => beginEdit(c)}
                              whileTap={{ scale: 0.92 }}
                              whileHover={reduceMotion ? {} : { y: -1 }}
                              disabled={!!savingCommentId || (hasEditing && editingCommentId !== c.id)}
                              aria-label="Edit comment"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                <path d="M13 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </motion.button>
                            <motion.button
                              type="button"
                              className="view-comment-icon-btn"
                              onClick={() => setReactionOpenId((v) => (v === c.id ? null : c.id))}
                              whileTap={{ scale: 0.92 }}
                              whileHover={reduceMotion ? {} : { y: -1 }}
                              disabled={!!savingCommentId || hasEditing}
                              aria-label="Add reaction"
                            >
                              {savingCommentId === c.id ? (
                                <motion.svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  aria-hidden
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                                >
                                  <circle cx="12" cy="12" r="8" stroke="#22c55e" strokeWidth="2.4" opacity="0.28" />
                                  <path
                                    d="M12 4a8 8 0 0 1 8 8"
                                    stroke="#22c55e"
                                    strokeWidth="2.4"
                                    strokeLinecap="round"
                                  />
                                </motion.svg>
                              ) : c.emoji ? (
                                <span className="view-comment-icon-emoji" aria-hidden>{c.emoji}</span>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                                  <path d="M8.5 14.5c.9 1.1 2 1.7 3.5 1.7 1.5 0 2.6-.6 3.5-1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                  <circle cx="9" cy="10" r="1" fill="currentColor" />
                                  <circle cx="15" cy="10" r="1" fill="currentColor" />
                                </svg>
                              )}
                            </motion.button>
                          </div>
                        </div>
                        <AnimatePresence>
                          {reactionOpenId === c.id ? (
                            <motion.div
                              className="view-comment-reaction-row"
                              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                              transition={flowTransition}
                            >
                              {REACTIONS.map((emoji) => (
                                <motion.button
                                  key={`${c.id}-${emoji}`}
                                  type="button"
                                  className="view-comment-reaction-btn"
                                  onClick={() => onReactionPick(c.id, emoji)}
                                  whileTap={{ scale: 0.9 }}
                                  whileHover={reduceMotion ? {} : { y: -1 }}
                                >
                                  {emoji}
                                </motion.button>
                              ))}
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        {editingCommentId === c.id ? (
                          <motion.div
                            className="view-comment-edit-wrap"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={flowTransition}
                          >
                            <textarea
                              className="login-input view-comment-edit-input"
                              minLength={1}
                              maxLength={COMMENT_MAX}
                              value={editCommentText}
                              onWheelCapture={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                setEditCommentText(e.target.value)
                                setEditErr(null)
                              }}
                            />
                            <button
                              type="button"
                              className="login-input view-comment-edit-date view-comment-edit-date-btn"
                              onClick={() => setOpenCalendarForEdit((v) => !v)}
                            >
                              {editCommentDate ? fmtDate(editCommentDate) : 'Select date'}
                            </button>
                            <AnimatePresence>
                              {openCalendarForEdit ? (
                                <motion.div
                                  className="view-comment-cal-wrap"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: reduceMotion ? 0.12 : 0.18 }}
                                >
                                  <CalendarMonthPicker
                                    selectedDate={parseDateOrToday(editCommentDate)}
                                    showTrigger={false}
                                    overlayTitle="Comment date"
                                    onRequestClose={() => setOpenCalendarForEdit(false)}
                                    onSelectDate={(d) => {
                                      setEditCommentDate(toInputDate(d))
                                      setEditErr(null)
                                      setOpenCalendarForEdit(false)
                                    }}
                                  />
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                            {editErr ? <p className="view-comment-error-inline">{editErr}</p> : null}
                            <div className="view-comment-edit-actions">
                              <motion.button
                                type="button"
                                className={
                                  commentDeleteSucceeded
                                    ? 'edit-task-delete-btn edit-task-delete-btn--done'
                                    : 'edit-task-delete-btn'
                                }
                                onClick={() => {
                                  if (savingCommentId !== c.id && !commentDeleteSucceeded) {
                                    queueDeleteComment(c.id)
                                  }
                                }}
                                whileTap={
                                  commentDeleteSucceeded || savingCommentId === c.id
                                    ? {}
                                    : { scale: 0.92 }
                                }
                                whileHover={
                                  reduceMotion || commentDeleteSucceeded || savingCommentId === c.id
                                    ? {}
                                    : { y: -1 }
                                }
                                disabled={savingCommentId === c.id || commentDeleteSucceeded}
                                aria-label={commentDeleteSucceeded ? 'Deleted' : 'Delete comment'}
                              >
                                {commentDeleteSucceeded ? (
                                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <circle cx="12" cy="12" r="10" stroke="#dc2626" strokeWidth="2" />
                                    <path
                                      d="M8 12l3 3 5-6"
                                      stroke="#dc2626"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                ) : savingCommentId === c.id ? (
                                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <circle cx="12" cy="12" r="9" stroke="#dc2626" strokeWidth="2" opacity="0.4" />
                                  </svg>
                                ) : (
                                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <path
                                      d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z"
                                      stroke="#dc2626"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <path d="M10 11v6M14 11v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
                                  </svg>
                                )}
                              </motion.button>
                              <motion.button
                                type="button"
                                className="modal-btn modal-btn-secondary"
                                onClick={cancelEdit}
                                whileTap={commentDeleteSucceeded ? {} : { scale: 0.97 }}
                                whileHover={reduceMotion || commentDeleteSucceeded ? {} : { y: -1 }}
                                disabled={commentDeleteSucceeded}
                              >
                                Cancel
                              </motion.button>
                              <motion.button
                                type="button"
                                className={
                                  commentEditSaveSuccess
                                    ? 'modal-btn modal-btn-primary add-task-btn--saved'
                                    : 'modal-btn modal-btn-primary'
                                }
                                onClick={saveEdit}
                                whileTap={
                                  commentEditSaveSuccess || commentDeleteSucceeded
                                    ? {}
                                    : { scale: 0.97 }
                                }
                                whileHover={
                                  reduceMotion || commentEditSaveSuccess || commentDeleteSucceeded
                                    ? {}
                                    : { y: -1 }
                                }
                                disabled={
                                  savingCommentId === c.id ||
                                  commentEditSaveSuccess ||
                                  commentDeleteSucceeded
                                }
                              >
                                {commentEditSaveSuccess ? (
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
                                ) : savingCommentId === c.id ? (
                                  'Saving…'
                                ) : (
                                  'Save'
                                )}
                              </motion.button>
                            </div>
                          </motion.div>
                        ) : (
                          <>
                            <p className="view-comment-text">{c.comment}</p>
                          </>
                        )}
                      </motion.li>
                    ))}
                    </AnimatePresence>
                  </motion.ul>
                </AnimatePresence>
              )}
            </motion.div>

            {!loading && comments.length > PER_PAGE ? (
              <motion.div
                className="view-comment-pagination"
                layout
                transition={layoutTransition}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.button
                  type="button"
                  className="proj-pagination-btn"
                  disabled={page <= 1 || hasEditing}
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1))
                    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  whileTap={{ scale: 0.96 }}
                  whileHover={reduceMotion ? {} : { y: -1 }}
                >
                  Previous
                </motion.button>
                <span className="proj-pagination-info">
                  Page {page} of {totalPages}
                </span>
                <motion.button
                  type="button"
                  className="proj-pagination-btn"
                  disabled={page >= totalPages || hasEditing}
                  onClick={() => {
                    setPage((p) => Math.min(totalPages, p + 1))
                    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  whileTap={{ scale: 0.96 }}
                  whileHover={reduceMotion ? {} : { y: -1 }}
                >
                  Next
                </motion.button>
              </motion.div>
            ) : null}

            <motion.div
              className="modal-actions"
              style={{ marginTop: 14 }}
              layout
              transition={layoutTransition}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <motion.button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                Close
              </motion.button>
            </motion.div>

            </LayoutGroup>
            <ConfirmPop
              open={saveConfirmOpen}
              title="Save comment changes?"
              message="Do you want to save this comment update?"
              noLabel="No"
              yesLabel="Yes"
              skipDocumentScrollLock
              onNo={() => setSaveConfirmOpen(false)}
              onYes={applyEdit}
            />
            <DeleteConfirmPop
              open={deleteConfirmOpen}
              skipDocumentScrollLock
              title="Delete comment"
              message="Are you sure you want to delete this comment? This cannot be undone."
              onCancel={() => {
                setDeleteConfirmOpen(false)
                setDeleteCommentId(null)
              }}
              onConfirm={confirmDeleteComment}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default ViewCommentPop
