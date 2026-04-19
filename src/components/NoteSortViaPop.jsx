import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MODAL_FLY_DEFAULT_MAX_H,
  MODAL_FLY_SORT_VIA_MAX_W,
  createModalFlySheetVariants,
} from '../lib/modalFlyVariants.js'
import './SortViaPop.css'

const NOTE_SORT_MODAL_FLY_VARIANTS = createModalFlySheetVariants(
  MODAL_FLY_SORT_VIA_MAX_W,
  MODAL_FLY_DEFAULT_MAX_H,
)

export function NoteSortViaPop({
  open,
  onClose,
  onApply,
  initialSort,
  includeTodoStatus,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState('date')
  const [dateOrder, setDateOrder] = useState('desc')
  const [todoStatus, setTodoStatus] = useState(null)
  const [resetDone, setResetDone] = useState(false)
  const resetTimerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setDateOrder(initialSort?.dateOrder === 'asc' ? 'asc' : 'desc')
    setTodoStatus(
      initialSort?.todoStatus === 'completed' || initialSort?.todoStatus === 'uncompleted'
        ? initialSort.todoStatus
        : null,
    )
    setActiveTab('date')
    setResetDone(false)
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }, [open, initialSort, includeTodoStatus])

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    },
    [],
  )

  const tabs = useMemo(
    () =>
      includeTodoStatus
        ? [
            { key: 'date', label: 'Date' },
            { key: 'status', label: 'Status' },
          ]
        : [{ key: 'date', label: 'Date' }],
    [includeTodoStatus],
  )

  const tabHasCustom = useMemo(
    () => ({
      date: dateOrder !== 'desc',
      status: includeTodoStatus && !!todoStatus,
    }),
    [dateOrder, includeTodoStatus, todoStatus],
  )

  return (
    <AnimatePresence onExitComplete={onSheetExitComplete}>
      {open ? (
        <motion.div
          className="modal-backdrop add-task-backdrop"
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
            aria-labelledby="note-sort-via-title"
            className="modal-sheet sort-via-sheet"
            style={{ transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={NOTE_SORT_MODAL_FLY_VARIANTS}
            initial="fromOrigin"
            animate="expanded"
            exit="fromOrigin"
            transition={
              reduceMotion
                ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
                : { type: 'spring', stiffness: 360, damping: 30, mass: 0.72 }
            }
          >
            <h2 id="note-sort-via-title" className="modal-title">
              Sort Note/To-Do
            </h2>

            <motion.div
              className="sort-via-layout"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }
              }
            >
              <div className="sort-via-left">
                {tabs.map((tab) => (
                  <motion.button
                    key={tab.key}
                    type="button"
                    className={
                      activeTab === tab.key
                        ? 'sort-via-tab sort-via-tab--active'
                        : 'sort-via-tab'
                    }
                    onClick={() => setActiveTab(tab.key)}
                    whileTap={{ scale: 0.96 }}
                  >
                    {tab.label}
                    {tabHasCustom[tab.key] ? (
                      <motion.span
                        className="sort-via-tab-dot"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        aria-label="Active"
                      />
                    ) : null}
                  </motion.button>
                ))}
              </div>

              <div className="sort-via-right">
                <AnimatePresence mode="wait">
                  {activeTab === 'date' ? (
                    <motion.div
                      key="panel-date"
                      className="sort-via-panel"
                      initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 380, damping: 42, mass: 0.72 }
                      }
                    >
                      <p className="sort-via-section-label">Order</p>
                      <div className="sort-via-check-group">
                        {[
                          { value: 'desc', label: 'Descending order' },
                          { value: 'asc', label: 'Ascending order' },
                        ].map((opt) => (
                          <label key={opt.value} className="sort-via-check-label">
                            <input
                              type="radio"
                              name="noteDateOrder"
                              className="sort-via-radio"
                              checked={dateOrder === opt.value}
                              onChange={() => setDateOrder(opt.value)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="panel-status"
                      className="sort-via-panel"
                      initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 380, damping: 42, mass: 0.72 }
                      }
                    >
                      <p className="sort-via-section-label">To-Do status</p>
                      <div className="sort-via-check-group">
                        {[
                          { value: 'completed', label: 'Completed' },
                          { value: 'uncompleted', label: 'Not Completed' },
                        ].map((opt) => (
                          <label key={opt.value} className="sort-via-check-label">
                            <input
                              type="radio"
                              name="noteTodoStatus"
                              className="sort-via-radio"
                              checked={todoStatus === opt.value}
                              onChange={() => setTodoStatus(opt.value)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                        {todoStatus ? (
                          <motion.button
                            type="button"
                            className="sort-via-date-clear"
                            onClick={() => setTodoStatus(null)}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Clear filter
                          </motion.button>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            <div className="modal-actions sort-via-actions">
              <motion.button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                Cancel
              </motion.button>
              <motion.button
                type="button"
                className={
                  resetDone
                    ? 'modal-btn modal-btn-secondary sort-via-reset-done'
                    : 'modal-btn modal-btn-secondary'
                }
                onClick={() => {
                  setDateOrder('desc')
                  setTodoStatus(null)
                  setResetDone(true)
                  if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
                  resetTimerRef.current = setTimeout(() => {
                    resetTimerRef.current = null
                    setResetDone(false)
                  }, 1000)
                }}
                disabled={resetDone}
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion || resetDone ? {} : { y: -1 }}
              >
                <AnimatePresence mode="wait">
                  {resetDone ? (
                    <motion.span
                      key="reset-ok"
                      className="sort-via-reset-icon"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2" />
                        <path
                          d="M8 12l3 3 5-6"
                          stroke="#22c55e"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="reset-text"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      Reset all
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
              <motion.button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={() => {
                  onApply?.({
                    dateOrder,
                    todoStatus: includeTodoStatus ? todoStatus : null,
                  })
                }}
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                Apply
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default NoteSortViaPop
