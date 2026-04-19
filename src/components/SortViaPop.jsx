import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TASK_CATEGORY_TREE } from '../lib/taskCategoryThemes'
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
  { key: 'category', label: 'Category' },
  { key: 'subCategory', label: 'Sub Category' },
  { key: 'comments', label: 'Comments' },
]

const PROJECT_STATUS_OPTIONS = [
  { key: 'ACTIVE_PROJECT', label: 'Active project' },
  { key: 'INACTIVE_PROJECT', label: 'Inactive project' },
  { key: 'CRITICAL_BUG_PROJECT', label: 'Critical bug project' },
  { key: 'FUTURE_PROJECT', label: 'Future project' },
  { key: 'ARCHIVED_PROJECT', label: 'Archived project' },
  { key: 'FINISHED_PROJECT', label: 'Finished project' },
  { key: 'NON_FINISHED_PROJECT', label: 'Non finished project' },
  { key: 'ON_HOLD_PROJECT', label: 'On hold project' },
  { key: 'OVERDUE_PROJECT', label: 'Overdue project' },
]

const COMMENT_SORT_OPTIONS = [
  { key: 'comment_latest_desc', label: 'Latest comment wise', sortBy: 'comment_latest', sortDir: 'desc' },
  { key: 'comment_latest_asc', label: 'Oldest comment wise', sortBy: 'comment_latest', sortDir: 'asc' },
  { key: 'comment_count_desc', label: 'Maximum comments', sortBy: 'comment_count', sortDir: 'desc' },
  { key: 'comment_count_asc', label: 'Least comments', sortBy: 'comment_count', sortDir: 'asc' },
]

const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 32 }

const SORT_VIA_MODAL_FLY_VARIANTS = createModalFlySheetVariants(
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

export function SortViaPop({
  open,
  onClose,
  onApply,
  initialSort,
  includeProjectStatus = false,
  /** App Home only: overdue open tasks filter */
  showExpiredTasksOption = true,
  expandForError = false,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState(
    includeProjectStatus ? 'status' : 'date',
  )
  const [selectedProjectStatuses, setSelectedProjectStatuses] = useState([])

  const [dateOrder, setDateOrder] = useState('desc')
  const [dateField, setDateField] = useState('start')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [calendarFor, setCalendarFor] = useState(null)

  const [selectedCategories, setSelectedCategories] = useState([])
  const [selectedSubCategories, setSelectedSubCategories] = useState([])

  const [commentSort, setCommentSort] = useState(null)

  const [showExpiredTasks, setShowExpiredTasks] = useState(false)

  const [primarySort, setPrimarySort] = useState('date')
  const [resetDone, setResetDone] = useState(false)
  const resetTimerRef = useRef(null)
  const sheetRef = useRef(null)
  const [fixedSheetHeight, setFixedSheetHeight] = useState(null)

  useEffect(() => {
    if (!open) return
    if (initialSort) {
      setDateOrder(initialSort.dateOrder ?? 'desc')
      setDateField(initialSort.dateField ?? 'start')
      setDateFrom(initialSort.dateFrom ?? '')
      setDateTo(initialSort.dateTo ?? '')
      setSelectedCategories(initialSort.categories ?? [])
      setSelectedSubCategories(initialSort.subCategories ?? [])
      setCommentSort(initialSort.commentSort ?? null)
      setShowExpiredTasks(!!initialSort.showExpiredTasks)
      setSelectedProjectStatuses(initialSort.projectStatuses ?? [])
      setPrimarySort(initialSort.primarySort ?? 'date')
      setActiveTab(includeProjectStatus ? 'status' : 'date')
    } else {
      setDateOrder('desc')
      setDateField('start')
      setDateFrom('')
      setDateTo('')
      setSelectedCategories([])
      setSelectedSubCategories([])
      setCommentSort(null)
      setShowExpiredTasks(false)
      setSelectedProjectStatuses([])
      setPrimarySort('date')
      setActiveTab(includeProjectStatus ? 'status' : 'date')
    }
    setCalendarFor(null)
    setResetDone(false)
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setFixedSheetHeight(null)
  }, [open, initialSort, includeProjectStatus])

  useLayoutEffect(() => {
    if (!open || expandForError || fixedSheetHeight != null) return
    const id = requestAnimationFrame(() => {
      const h = sheetRef.current?.offsetHeight
      if (h && h > 0) setFixedSheetHeight(h)
    })
    return () => cancelAnimationFrame(id)
  }, [open, expandForError, fixedSheetHeight, activeTab])

  const tabs = useMemo(
    () =>
      includeProjectStatus
        ? [{ key: 'status', label: 'Status' }, ...TABS]
        : TABS,
    [includeProjectStatus],
  )

  const toggleProjectStatus = (key) => {
    setSelectedProjectStatuses((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= 6) return prev
      return [...prev, key]
    })
  }

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
      selectedCategories.length === TASK_CATEGORY_TREE.length
    ) {
      return TASK_CATEGORY_TREE
    }
    return TASK_CATEGORY_TREE.filter((cat) => selectedCategories.includes(cat.key))
  }, [selectedCategories])

  const handleApply = () => {
    let sortBy, sortDir
    if (primarySort === 'comments' && commentSort) {
      const opt = COMMENT_SORT_OPTIONS.find((o) => o.key === commentSort)
      sortBy = opt?.sortBy ?? 'comment_latest'
      sortDir = opt?.sortDir ?? 'desc'
    } else {
      sortBy = dateField === 'deadline' ? 'deadline' : 'date'
      sortDir = dateOrder
    }

    onApply?.({
      sortBy,
      sortDir,
      dateField: dateField === 'deadline' ? 'deadline' : 'start',
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      subCategories: selectedSubCategories.length > 0 ? selectedSubCategories : undefined,
      projectStatuses:
        selectedProjectStatuses.length > 0
          ? selectedProjectStatuses
          : undefined,
      dateOrder,
      commentSort,
      primarySort,
      ...(showExpiredTasksOption
        ? { showExpiredTasks: showExpiredTasks || undefined }
        : {}),
    })
  }

  const handleReset = () => {
    setDateOrder('desc')
    setDateField('start')
    setDateFrom('')
    setDateTo('')
    setSelectedCategories([])
    setSelectedSubCategories([])
    setCommentSort(null)
    setShowExpiredTasks(false)
    setSelectedProjectStatuses([])
    setPrimarySort('date')
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

  const tabHasCustom = useMemo(() => ({
    status: selectedProjectStatuses.length > 0,
    date:
      dateOrder !== 'desc' ||
      dateField !== 'start' ||
      !!dateFrom ||
      !!dateTo ||
      (showExpiredTasksOption && showExpiredTasks),
    category: selectedCategories.length > 0,
    subCategory: selectedSubCategories.length > 0,
    comments: !!commentSort,
  }), [
    dateOrder,
    dateField,
    dateFrom,
    dateTo,
    showExpiredTasks,
    selectedCategories,
    selectedSubCategories,
    commentSort,
    selectedProjectStatuses,
    showExpiredTasksOption,
  ])

  const rightPanelRef = useRef(null)

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
            aria-labelledby="sort-via-title"
            className={
              expandForError
                ? 'modal-sheet sort-via-sheet sort-via-sheet--expand'
                : 'modal-sheet sort-via-sheet'
            }
            style={{
              ...(!expandForError && fixedSheetHeight ? { height: fixedSheetHeight } : {}),
              transformOrigin: 'center center',
            }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={SORT_VIA_MODAL_FLY_VARIANTS}
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
              id="sort-via-title"
              className="modal-title"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={flowTransition}
            >
              Sort &amp; Filter
            </motion.h2>

            {primarySort === 'comments' && commentSort ? (
              <motion.p
                className="sort-via-primary-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={flowTransition}
              >
                Primary: Comments · Secondary: Date
              </motion.p>
            ) : primarySort === 'date' ? (
              commentSort ? (
                <motion.p
                  className="sort-via-primary-hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={flowTransition}
                >
                  Primary: Date · Secondary: Comments
                </motion.p>
              ) : null
            ) : null}

            <motion.div
              className="sort-via-layout"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.06 }}
            >
              <div className="sort-via-left">
                {tabs.map((tab, idx) => (
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
                  {activeTab === 'status' ? (
                    <motion.div
                      key="panel-status"
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
                        Select project status (0–6)
                      </motion.p>
                      <div className="sort-via-check-group">
                        {PROJECT_STATUS_OPTIONS.map((opt, idx) => (
                          <motion.label
                            key={opt.key}
                            className="sort-via-check-label"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.06 + 0.025 * idx }}
                          >
                            <input
                              type="checkbox"
                              className="sort-via-checkbox"
                              checked={selectedProjectStatuses.includes(opt.key)}
                              onChange={() => toggleProjectStatus(opt.key)}
                              disabled={
                                !selectedProjectStatuses.includes(opt.key) &&
                                selectedProjectStatuses.length >= 6
                              }
                            />
                            <span>{opt.label}</span>
                          </motion.label>
                        ))}
                      </div>
                    </motion.div>
                  ) : activeTab === 'date' ? (
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
                            transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.06 + 0.03 * idx }}
                          >
                            <input
                              type="radio"
                              name="dateOrder"
                              className="sort-via-radio"
                              checked={dateOrder === opt.value}
                              onChange={() => {
                                setDateOrder(opt.value)
                                setPrimarySort('date')
                              }}
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
                        Sort by
                      </motion.p>
                      <div className="sort-via-check-group">
                        {[
                          { value: 'start', label: 'Start Date wise' },
                          { value: 'deadline', label: 'Deadline wise' },
                        ].map((opt, idx) => (
                          <motion.label
                            key={opt.value}
                            className="sort-via-check-label"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.12 + 0.03 * idx }}
                          >
                            <input
                              type="radio"
                              name="dateField"
                              className="sort-via-radio"
                              checked={dateField === opt.value}
                              onChange={() => {
                                setDateField(opt.value)
                                setPrimarySort('date')
                              }}
                            />
                            <span>{opt.label}</span>
                          </motion.label>
                        ))}
                      </div>

                      <motion.p
                        className="sort-via-section-label"
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.16 }}
                      >
                        Select date range
                      </motion.p>
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
                        {(dateFrom || dateTo) ? (
                          <motion.button
                            type="button"
                            className="sort-via-date-clear"
                            onClick={() => { setDateFrom(''); setDateTo('') }}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Clear range
                          </motion.button>
                        ) : null}
                      </div>

                      {showExpiredTasksOption ? (
                        <>
                          <motion.p
                            className="sort-via-section-label"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.22 }}
                          >
                            Show expired
                          </motion.p>
                          <div className="sort-via-check-group">
                            <motion.label
                              className="sort-via-check-label"
                              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.24 }}
                            >
                              <input
                                type="checkbox"
                                className="sort-via-checkbox"
                                checked={showExpiredTasks}
                                onChange={() => setShowExpiredTasks((v) => !v)}
                              />
                              <span>Show expired task</span>
                            </motion.label>
                          </div>
                        </>
                      ) : null}
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
                        {TASK_CATEGORY_TREE.map((cat, idx) => (
                          <motion.label
                            key={cat.key}
                            className="sort-via-check-label"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.06 + 0.025 * idx }}
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
                          transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.06 + 0.04 * catIdx }}
                        >
                          <motion.p
                            className="sort-via-sub-group-title"
                            initial={reduceMotion ? false : { opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.08 + 0.04 * catIdx }}
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
                                transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.1 + 0.04 * catIdx + 0.025 * subIdx }}
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
                  ) : activeTab === 'comments' ? (
                    <motion.div
                      key="panel-comments"
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
                        Sort by comments
                      </motion.p>
                      <div className="sort-via-check-group">
                        {COMMENT_SORT_OPTIONS.map((opt, idx) => (
                          <motion.label
                            key={opt.key}
                            className="sort-via-check-label"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, delay: 0.06 + 0.03 * idx }}
                          >
                            <input
                              type="radio"
                              name="commentSort"
                              className="sort-via-radio"
                              checked={commentSort === opt.key}
                              onChange={() => {
                                setCommentSort(opt.key)
                                setPrimarySort('comments')
                              }}
                            />
                            <span>{opt.label}</span>
                          </motion.label>
                        ))}
                        {commentSort ? (
                          <motion.button
                            type="button"
                            className="sort-via-date-clear"
                            onClick={() => {
                              setCommentSort(null)
                              setPrimarySort('date')
                            }}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Clear comment sort
                          </motion.button>
                        ) : null}
                      </div>
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
              transition={reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.1 }}
            >
              <motion.button
                type="button"
                layout
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.12 }}
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
                transition={reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.15 }}
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
                        <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
                transition={reduceMotion ? { duration: 0 } : { layout: SHEET_SPRING, ...SHEET_SPRING, delay: 0.18 }}
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

export default SortViaPop
