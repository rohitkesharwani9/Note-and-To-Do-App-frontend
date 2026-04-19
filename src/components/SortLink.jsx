import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LINK_CATEGORY_TREE } from './SaveNewLinkModal.jsx'
import { toInputDate } from '../lib/dateInputLocal'
import {
  MODAL_FLY_DEFAULT_MAX_H,
  MODAL_FLY_SORT_VIA_MAX_W,
  createModalFlySheetVariants,
} from '../lib/modalFlyVariants.js'
import { CalendarMonthPicker } from './CalendarStrip'
import './SortViaPop.css'

const TABS = [
  { key: 'date', label: 'Date' },
  { key: 'category', label: 'Link category' },
  { key: 'subCategory', label: 'Link sub category' },
]

const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 32 }

const SORT_SAVED_LINKS_MODAL_FLY_VARIANTS = createModalFlySheetVariants(
  MODAL_FLY_SORT_VIA_MAX_W,
  MODAL_FLY_DEFAULT_MAX_H,
)

function formatDateDisplay(yyyyMmDd) {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return 'Select'
  const [y, mo, d] = yyyyMmDd.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  if (Number.isNaN(dt.getTime())) return 'Select'
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function parseDateOrToday(value) {
  const d = value ? new Date(value) : null
  return d && !Number.isNaN(d.getTime()) ? d : new Date()
}

export function SortLink({
  open,
  onClose,
  onApply,
  initialSort,
  expandForError = false,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState('date')
  const [dateOrder, setDateOrder] = useState('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [calendarFor, setCalendarFor] = useState(null)
  const [selectedCategories, setSelectedCategories] = useState([])
  const [selectedSubCategories, setSelectedSubCategories] = useState([])
  const [dateRangeError, setDateRangeError] = useState('')
  const [resetDone, setResetDone] = useState(false)
  const resetTimerRef = useRef(null)
  const sheetRef = useRef(null)
  const [fixedSheetHeight, setFixedSheetHeight] = useState(null)
  const rightPanelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (initialSort) {
      setDateOrder(initialSort.dateOrder ?? 'desc')
      setDateFrom(initialSort.dateFrom ?? '')
      setDateTo(initialSort.dateTo ?? '')
      setSelectedCategories(initialSort.categories ?? [])
      setSelectedSubCategories(initialSort.subCategories ?? [])
      setActiveTab('date')
    } else {
      setDateOrder('desc')
      setDateFrom('')
      setDateTo('')
      setSelectedCategories([])
      setSelectedSubCategories([])
      setActiveTab('date')
    }
    setDateRangeError('')
    setCalendarFor(null)
    setResetDone(false)
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setFixedSheetHeight(null)
  }, [open, initialSort])

  const sheetExpand = expandForError || !!dateRangeError

  useLayoutEffect(() => {
    if (!open || sheetExpand || fixedSheetHeight != null) return
    const id = requestAnimationFrame(() => {
      const h = sheetRef.current?.offsetHeight
      if (h && h > 0) setFixedSheetHeight(h)
    })
    return () => cancelAnimationFrame(id)
  }, [open, sheetExpand, fixedSheetHeight, activeTab])

  const toggleCategory = (key) => {
    setSelectedCategories((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= 6) return prev
      return [...prev, key]
    })
  }

  const toggleSubCategory = (key) => {
    setSelectedSubCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const visibleSubCategories = useMemo(() => {
    if (
      selectedCategories.length === 0 ||
      selectedCategories.length === LINK_CATEGORY_TREE.length
    ) {
      return LINK_CATEGORY_TREE
    }
    return LINK_CATEGORY_TREE.filter((cat) => selectedCategories.includes(cat.key))
  }, [selectedCategories])

  const handleApply = () => {
    setDateRangeError('')
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateRangeError('From date must be on or before To date.')
      return
    }
    const hasFilter =
      dateOrder !== 'desc' ||
      !!(dateFrom && dateFrom.trim()) ||
      !!(dateTo && dateTo.trim()) ||
      selectedCategories.length > 0 ||
      selectedSubCategories.length > 0
    if (!hasFilter) {
      onApply?.(null)
      return
    }
    onApply?.({
      sortBy: 'createdAt',
      sortDir: dateOrder,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      subCategories: selectedSubCategories.length > 0 ? selectedSubCategories : undefined,
      dateOrder,
    })
  }

  const handleReset = () => {
    setDateOrder('desc')
    setDateFrom('')
    setDateTo('')
    setSelectedCategories([])
    setSelectedSubCategories([])
    setDateRangeError('')
    setResetDone(true)
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null
      setResetDone(false)
    }, 1000)
  }

  const flowTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 380, damping: 42, mass: 0.72 }

  const tabHasCustom = useMemo(
    () => ({
      date: dateOrder !== 'desc' || !!dateFrom || !!dateTo,
      category: selectedCategories.length > 0,
      subCategory: selectedSubCategories.length > 0,
    }),
    [dateOrder, dateFrom, dateTo, selectedCategories, selectedSubCategories],
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
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sort-saved-links-title"
            className={
              sheetExpand
                ? 'modal-sheet sort-via-sheet sort-link-sheet sort-via-sheet--expand'
                : 'modal-sheet sort-via-sheet sort-link-sheet'
            }
            style={{
              ...(!sheetExpand && fixedSheetHeight ? { height: fixedSheetHeight } : {}),
              transformOrigin: 'center center',
            }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={SORT_SAVED_LINKS_MODAL_FLY_VARIANTS}
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
              id="sort-saved-links-title"
              className="modal-title"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={flowTransition}
            >
              Sort link via
            </motion.h2>

            <motion.div
              className="sort-via-layout"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.06 }}
            >
              <div className="sort-via-left">
                {TABS.map((tab, idx) => (
                  <motion.button
                    key={tab.key}
                    type="button"
                    className={
                      activeTab === tab.key
                        ? 'sort-via-tab sort-via-tab--active'
                        : 'sort-via-tab'
                    }
                    onClick={() => {
                      setActiveTab(tab.key)
                      rightPanelRef.current?.scrollTo({ top: 0 })
                    }}
                    initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { ...SHEET_SPRING, delay: 0.03 * idx }
                    }
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

              <div className="sort-via-right" ref={rightPanelRef}>
                <AnimatePresence mode="wait">
                  {activeTab === 'date' ? (
                    <motion.div
                      key="panel-date"
                      className="sort-via-panel"
                      initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                      transition={flowTransition}
                    >
                      <motion.p
                        className="sort-via-section-label"
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.04 }}
                      >
                        Order
                      </motion.p>
                      <div className="sort-via-check-group">
                        {[
                          { value: 'desc', label: 'Descending order' },
                          { value: 'asc', label: 'Ascending order' },
                        ].map((opt, idx) => (
                          <motion.label
                            key={opt.value}
                            className="sort-via-check-label"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : { ...SHEET_SPRING, delay: 0.06 + 0.03 * idx }
                            }
                          >
                            <input
                              type="radio"
                              name="savedLinkDateOrder"
                              className="sort-via-radio"
                              checked={dateOrder === opt.value}
                              onChange={() => setDateOrder(opt.value)}
                            />
                            <span>{opt.label}</span>
                          </motion.label>
                        ))}
                      </div>

                      <motion.p
                        className="sort-via-section-label"
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.1 }}
                      >
                        Select date range
                      </motion.p>
                      {dateRangeError ? (
                        <motion.p
                          className="sort-via-date-error"
                          role="alert"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          {dateRangeError}
                        </motion.p>
                      ) : null}
                      <div className="sort-via-date-range">
                        <motion.button
                          type="button"
                          className="sort-via-date-btn"
                          onClick={() => setCalendarFor('from')}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.18 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <span className="sort-via-date-label">From</span>
                          <span className="sort-via-date-value">{formatDateDisplay(dateFrom)}</span>
                        </motion.button>
                        <motion.button
                          type="button"
                          className="sort-via-date-btn"
                          onClick={() => setCalendarFor('to')}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.2 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <span className="sort-via-date-label">To</span>
                          <span className="sort-via-date-value">{formatDateDisplay(dateTo)}</span>
                        </motion.button>
                        {dateFrom || dateTo ? (
                          <motion.button
                            type="button"
                            className="sort-via-date-clear"
                            onClick={() => {
                              setDateFrom('')
                              setDateTo('')
                              setDateRangeError('')
                            }}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Clear range
                          </motion.button>
                        ) : null}
                      </div>
                    </motion.div>
                  ) : activeTab === 'category' ? (
                    <motion.div
                      key="panel-category"
                      className="sort-via-panel"
                      initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                      transition={flowTransition}
                    >
                      <motion.p
                        className="sort-via-section-label"
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.04 }}
                      >
                        Select categories (0–6)
                      </motion.p>
                      <div className="sort-via-check-group">
                        {LINK_CATEGORY_TREE.map((cat, idx) => (
                          <motion.label
                            key={cat.key}
                            className="sort-via-check-label"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : { ...SHEET_SPRING, delay: 0.06 + 0.025 * idx }
                            }
                          >
                            <input
                              type="checkbox"
                              className="sort-via-checkbox"
                              checked={selectedCategories.includes(cat.key)}
                              onChange={() => toggleCategory(cat.key)}
                              disabled={
                                !selectedCategories.includes(cat.key) &&
                                selectedCategories.length >= 6
                              }
                            />
                            <span>{cat.label}</span>
                          </motion.label>
                        ))}
                      </div>
                    </motion.div>
                  ) : activeTab === 'subCategory' ? (
                    <motion.div
                      key="panel-sub-category"
                      className="sort-via-panel"
                      initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                      transition={flowTransition}
                    >
                      <motion.p
                        className="sort-via-section-label"
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.04 }}
                      >
                        Select sub-categories
                      </motion.p>
                      {visibleSubCategories.map((cat, catIdx) => (
                        <motion.div
                          key={cat.key}
                          className="sort-via-sub-group"
                          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : { ...SHEET_SPRING, delay: 0.06 + 0.04 * catIdx }
                          }
                        >
                          <motion.p
                            className="sort-via-sub-group-title"
                            initial={reduceMotion ? false : { opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : { ...SHEET_SPRING, delay: 0.08 + 0.04 * catIdx }
                            }
                          >
                            {cat.label}
                          </motion.p>
                          <div className="sort-via-check-group">
                            {cat.subs.map((sub, subIdx) => (
                              <motion.label
                                key={sub.key}
                                className="sort-via-check-label"
                                initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={
                                  reduceMotion
                                    ? { duration: 0 }
                                    : {
                                        ...SHEET_SPRING,
                                        delay: 0.1 + 0.04 * catIdx + 0.025 * subIdx,
                                      }
                                }
                              >
                                <input
                                  type="checkbox"
                                  className="sort-via-checkbox"
                                  checked={selectedSubCategories.includes(sub.key)}
                                  onChange={() => toggleSubCategory(sub.key)}
                                />
                                <span>{sub.label}</span>
                              </motion.label>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>

            <motion.div
              className="modal-actions sort-via-actions"
              layout
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.1 }
              }
            >
              <motion.button
                type="button"
                layout
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.12 }
                }
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                Cancel
              </motion.button>
              <motion.button
                type="button"
                layout
                className={
                  resetDone
                    ? 'modal-btn modal-btn-secondary sort-via-reset-done'
                    : 'modal-btn modal-btn-secondary'
                }
                onClick={handleReset}
                disabled={resetDone}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.15 }
                }
                whileTap={resetDone ? {} : { scale: 0.97 }}
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
                layout
                className="modal-btn modal-btn-primary"
                onClick={handleApply}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.18 }
                }
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                Apply
              </motion.button>
            </motion.div>
          </motion.div>

          <AnimatePresence>
            {calendarFor ? (
              <motion.div
                className="add-task-cal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.18 }}
              >
                <CalendarMonthPicker
                  selectedDate={parseDateOrToday(calendarFor === 'from' ? dateFrom : dateTo)}
                  showTrigger={false}
                  overlayTitle={calendarFor === 'from' ? 'From date' : 'To date'}
                  onRequestClose={() => setCalendarFor(null)}
                  onSelectDate={(d) => {
                    const val = toInputDate(d)
                    if (calendarFor === 'from') setDateFrom(val)
                    else setDateTo(val)
                    setDateRangeError('')
                    setCalendarFor(null)
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default SortLink
