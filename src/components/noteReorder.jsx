import {
  AnimatePresence,
  motion,
  Reorder,
  usePresence,
  useReducedMotion,
} from 'framer-motion'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createModalFlySheetVariants,
  MODAL_FLY_SORT_VIA_MAX_W,
} from '../lib/modalFlyVariants.js'
import '../pages/LoginPage.css'
import './AddTask.css'
import './AddNote.css'
import './noteReorder.css'

const NOTE_REORDER_MODAL_MAX_H = 480
const NOTE_REORDER_FLY_VARIANTS = createModalFlySheetVariants(
  MODAL_FLY_SORT_VIA_MAX_W,
  NOTE_REORDER_MODAL_MAX_H,
)

function formatStripTitle(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 'Untitled'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function NoteReorderPresenceBackdrop({ reduceMotion, children }) {
  const [isPresent] = usePresence()
  return (
    <motion.div
      className="modal-backdrop add-task-backdrop add-note-fly-layer note-reorder-fly-layer"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: reduceMotion ? 0.15 : 0.38,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Reorder pinned notes / to-dos (Add task / Add note modal shell + Framer Motion Reorder).
 */
export function NoteReorder({
  open,
  onClose,
  originRect = null,
  onSheetExitComplete,
  pinnedRows,
  onSave,
}) {
  const reduceMotion = useReducedMotion()
  const titleId = useId()
  const saveSuccessTimerRef = useRef(null)
  const pinnedRowsRef = useRef(pinnedRows)
  const [orderedIds, setOrderedIds] = useState([])
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveSucceeded, setSaveSucceeded] = useState(false)

  pinnedRowsRef.current = pinnedRows

  const rowById = useMemo(() => {
    const m = new Map()
    for (const r of pinnedRows) m.set(r.id, r)
    return m
  }, [pinnedRows])

  const stripTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0.12 }
        : { type: 'spring', stiffness: 400, damping: 34 },
    [reduceMotion],
  )

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current)
        saveSuccessTimerRef.current = null
      }
    }
  }, [])

  /** Only when `open` flips on — not when `pinnedRows` updates after save (that was clearing success + timer). */
  useEffect(() => {
    if (!open) {
      setSaveBusy(false)
      setSaveSucceeded(false)
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current)
        saveSuccessTimerRef.current = null
      }
      return
    }
    setOrderedIds(pinnedRowsRef.current.map((r) => r.id))
    setSaveBusy(false)
    setSaveSucceeded(false)
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
  }, [open])

  const requestClose = useCallback(() => {
    if (saveBusy || saveSucceeded) return
    onClose()
  }, [onClose, saveBusy, saveSucceeded])

  const handleSave = useCallback(async () => {
    if (saveBusy || saveSucceeded || orderedIds.length === 0) return
    setSaveBusy(true)
    try {
      await onSave(orderedIds)
      setSaveBusy(false)
      setSaveSucceeded(true)
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = setTimeout(() => {
        saveSuccessTimerRef.current = null
        setSaveSucceeded(false)
        onClose()
      }, 2000)
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Could not save pin order',
      )
      setSaveBusy(false)
    }
  }, [onSave, onClose, orderedIds, saveBusy, saveSucceeded])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <AnimatePresence onExitComplete={onSheetExitComplete}>
        {open ? (
          <NoteReorderPresenceBackdrop key="note-reorder" reduceMotion={reduceMotion}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="modal-sheet add-note-sheet note-reorder-sheet"
              style={{ transformOrigin: 'center center' }}
              onClick={(e) => e.stopPropagation()}
              custom={{ rect: originRect, reduceMotion }}
              variants={NOTE_REORDER_FLY_VARIANTS}
              initial="fromOrigin"
              animate="expanded"
              exit="fromOrigin"
              layout={!reduceMotion}
              transition={
                reduceMotion
                  ? {
                      duration: 0.15,
                      ease: [0.4, 0, 0.2, 1],
                      layout: { duration: 0 },
                    }
                  : {
                      type: 'spring',
                      stiffness: 360,
                      damping: 30,
                      mass: 0.72,
                    }
              }
            >
              <div className="add-note-header">
                <h2 id={titleId} className="add-note-title">
                  Reorder pinned
                </h2>
                <button
                  type="button"
                  className="add-note-close"
                  aria-label="Close"
                  disabled={saveBusy || saveSucceeded}
                  onClick={requestClose}
                >
                  ×
                </button>
              </div>

              <div className="note-reorder-body">
                <p className="note-reorder-hint">
                  Drag strips vertically to change order. To-Do strips are yellow; Note strips are
                  blue. Save to apply or Cancel to discard.
                </p>
                <div className="note-reorder-strip-scroll">
                  <Reorder.Group
                    as="div"
                    axis="y"
                    className="note-reorder-strip-group"
                    values={orderedIds}
                    onReorder={setOrderedIds}
                  >
                    {orderedIds.map((id) => {
                      const row = rowById.get(id)
                      if (!row) return null
                      const isTodo = row.noteMode === 'TODO'
                      return (
                        <Reorder.Item
                          key={id}
                          value={id}
                          as="div"
                          layout
                          transition={stripTransition}
                          whileDrag={
                            reduceMotion
                              ? {}
                              : {
                                  scale: 1.04,
                                  zIndex: 4,
                                  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.22)',
                                }
                          }
                          className={
                            isTodo
                              ? 'note-reorder-strip note-reorder-strip--todo'
                              : 'note-reorder-strip note-reorder-strip--note'
                          }
                        >
                          <span className="note-reorder-strip-title">
                            {formatStripTitle(row.heading)}
                          </span>
                          <span className="note-reorder-strip-badge">
                            {isTodo ? 'To-Do' : 'Note'}
                          </span>
                        </Reorder.Item>
                      )
                    })}
                  </Reorder.Group>
                </div>
              </div>

              <div className="add-note-footer">
                <button
                  type="button"
                  className="add-note-footer-btn add-note-footer-btn--cancel"
                  disabled={saveBusy || saveSucceeded}
                  onClick={requestClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={
                    saveSucceeded
                      ? 'add-note-footer-btn add-note-footer-btn--save modal-btn modal-btn-primary add-task-btn--saved'
                      : 'add-note-footer-btn add-note-footer-btn--save'
                  }
                  disabled={saveBusy || saveSucceeded || orderedIds.length === 0}
                  onClick={() => void handleSave()}
                  aria-busy={saveBusy || undefined}
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
                  ) : saveBusy ? (
                    'Saving…'
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </motion.div>
          </NoteReorderPresenceBackdrop>
        ) : null}
      </AnimatePresence>
    </>,
    document.body,
  )
}
