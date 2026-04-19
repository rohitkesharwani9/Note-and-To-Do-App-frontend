import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  TASK_CATEGORY_TREE,
  getTaskCategoryTheme,
  sortSubsByIntensity,
} from '../lib/taskCategoryThemes'
import {
  isValidDateInput,
  startOfDay,
  toInputDate,
} from '../lib/dateInputLocal'
import { createModalFlySheetVariants } from '../lib/modalFlyVariants.js'
import { CalendarMonthPicker } from './CalendarStrip'
import { ConfirmPop } from './ConfirmPop'
import '../pages/LoginPage.css'
import './AddTask.css'

const TITLE_MIN = 4
const TITLE_MAX = 30
const DESCRIPTION_MAX = 500

/** Single spring for description + category accordion so layout and fades stay in sync */
const ADD_TASK_FLOW_SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 42,
  mass: 0.72,
}

const ADD_TASK_MODAL_FLY_VARIANTS = createModalFlySheetVariants()

const MOBILE_MQ = '(max-width: 768px)'

function useMatchMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const m = window.matchMedia(query)
    const apply = () => setMatches(m.matches)
    apply()
    m.addEventListener('change', apply)
    return () => m.removeEventListener('change', apply)
  }, [query])
  return matches
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

/** Mobile category rows: chevron rotates when options are open below */
function MobileRowChevron({ expanded, muted, reduceMotion }) {
  return (
    <motion.span
      className={muted ? 'add-task-m-chevron-wrap add-task-m-chevron-wrap--muted' : 'add-task-m-chevron-wrap'}
      aria-hidden
      initial={false}
      animate={{ rotate: expanded ? 180 : 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 420, damping: 32 }
      }
    >
      <svg
        className="add-task-m-chevron-svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 9l6 6 6-6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.span>
  )
}

/** Mobile date rows: calendar hint icon */
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

function friendlyTaskError(e) {
  if (!(e instanceof Error)) {
    return 'Could not add this task. Try again in a moment.'
  }
  const raw = e.message.trim()
  const lower = raw.toLowerCase()
  if (
    lower.includes("can't reach") ||
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('unexpected response')
  ) {
    return "We can't reach the server right now. Check your connection and try again."
  }
  if (
    lower.includes('column ') ||
    lower.includes('relation ') ||
    lower.includes('syntax') ||
    lower.includes('postgres') ||
    lower.includes('econn') ||
    lower.includes('internal server') ||
    lower.includes('status code 5')
  ) {
    return 'Could not add this task. Try again in a moment.'
  }
  if (
    lower.includes('title') ||
    lower.includes('description') ||
    lower.includes('category') ||
    lower.includes('date') ||
    lower.includes('project') ||
    lower.includes('required') ||
    lower.includes('invalid') ||
    lower.includes('longer than') ||
    lower.includes('must be')
  ) {
    return raw
  }
  return 'Could not add this task. Try again in a moment.'
}

/**
 * Add task: title + description, category rows + dates (same UX on mobile and desktop).
 * Optional `projectDateBounds` for start/deadline vs project created / expected finish (project page).
 */
export function AddTask({
  open,
  onClose,
  onSubmit,
  busy = false,
  projectDateBounds = null,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  /** Used for sheet margin tradeoff + mobile sheet layout only */
  const isMobile = useMatchMedia(MOBILE_MQ)
  const submitLockRef = useRef(false)
  const saveSuccessTimerRef = useRef(null)
  const footerErrRef = useRef(null)
  const descriptionBlurTimerRef = useRef(null)
  const descriptionInputRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)
  /** After successful save: show on Add button, then close after delay */
  const [saveSucceeded, setSaveSucceeded] = useState(false)
  const [mainKey, setMainKey] = useState(null)
  const [subKey, setSubKey] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDateStr, setStartDateStr] = useState('')
  const [deadlineStr, setDeadlineStr] = useState('')
  /** Expanded chip block: main | sub | null */
  const [mobilePanel, setMobilePanel] = useState(null)
  const [openCalendarFor, setOpenCalendarFor] = useState(null)
  const [warningConfirmOpen, setWarningConfirmOpen] = useState(false)
  const [warningConfirmMode, setWarningConfirmMode] = useState(false)
  const [warningConfirmMessage, setWarningConfirmMessage] = useState('')
  const [err, setErr] = useState(null)
  /** Expand description on focus; shrink when blurred if still empty */
  const [descriptionFocused, setDescriptionFocused] = useState(false)

  useEffect(() => {
    if (!open) return
    setMainKey(null)
    setSubKey(null)
    setTitle('')
    setDescription('')
    setStartDateStr('')
    setDeadlineStr('')
    setErr(null)
    setSubmitting(false)
    setSaveSucceeded(false)
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    submitLockRef.current = false
    setMobilePanel(null)
    setOpenCalendarFor(null)
    setWarningConfirmOpen(false)
    setWarningConfirmMode(false)
    setWarningConfirmMessage('')
    setDescriptionFocused(false)
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
      descriptionBlurTimerRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (open) return
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setSaveSucceeded(false)
  }, [open])

  const theme = useMemo(
    () => getTaskCategoryTheme(mainKey, subKey),
    [mainKey, subKey],
  )

  const mainDef = useMemo(
    () => TASK_CATEGORY_TREE.find((m) => m.key === mainKey),
    [mainKey],
  )

  const subsOrdered = useMemo(
    () => (mainDef ? sortSubsByIntensity(mainDef.subs) : []),
    [mainDef],
  )

  const subDef = useMemo(
    () => subsOrdered.find((s) => s.key === subKey),
    [subsOrdered, subKey],
  )

  const handleMain = (key) => {
    descriptionInputRef.current?.blur()
    setErr(null)
    setMainKey(key)
    setSubKey(null)
    setMobilePanel(null)
    setDescriptionFocused(false)
  }

  const handleSub = (key) => {
    descriptionInputRef.current?.blur()
    setErr(null)
    setSubKey(key)
    setMobilePanel(null)
    setDescriptionFocused(false)
  }

  /** Tap same row again to collapse; only main or sub options visible at a time */
  const toggleMobilePanel = (panel) => {
    descriptionInputRef.current?.blur()
    setErr(null)
    if (panel === 'sub' && !mainKey) return
    setDescriptionFocused(false)
    setMobilePanel((prev) => (prev === panel ? null : panel))
  }

  /** Case 2–3: task title focuses → shrink description (same tick as leaving description). */
  const handleTitleFocus = () => {
    descriptionInputRef.current?.blur()
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
      descriptionBlurTimerRef.current = null
    }
    setDescriptionFocused(false)
  }

  /** Case 2: focus description → expand it and collapse category/sub rows. */
  const handleDescriptionFocus = () => {
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
      descriptionBlurTimerRef.current = null
    }
    setDescriptionFocused(true)
    if (mobilePanel === 'main' || mobilePanel === 'sub') {
      setErr(null)
      setMobilePanel(null)
    }
  }

  /** Row buttons: avoid textarea blur winning the race before click (esp. with layout animations). */
  const handleTaskOptionRowMouseDown = (e) => {
    e.preventDefault()
  }

  /**
   * If focus moves into task options, don’t shrink here — layout would run before click.
   * Handlers (toggle / openDate / chips) call setDescriptionFocused(false).
   */
  const handleDescriptionBlur = (e) => {
    const next = e.relatedTarget
    if (next instanceof Element && next.closest?.('.add-task-cat-acc')) {
      return
    }
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
    }
    descriptionBlurTimerRef.current = setTimeout(() => {
      descriptionBlurTimerRef.current = null
      setDescriptionFocused(false)
    }, 100)
  }

  /** Same UX as Edit project details: overlay calendar; collapse category/sub expand */
  const openDateCalendar = (which) => {
    descriptionInputRef.current?.blur()
    setErr(null)
    setMobilePanel(null)
    setDescriptionFocused(false)
    setOpenCalendarFor(which)
  }

  const parseDateOrToday = (value) => {
    const d = value ? new Date(value) : null
    return d && !Number.isNaN(d.getTime()) ? d : new Date()
  }

  /** Start after deadline — same rule as created vs expected finish in Edit project */
  const dateOrderLiveError = useMemo(() => {
    if (!startDateStr || !deadlineStr) return ''
    if (!isValidDateInput(startDateStr) || !isValidDateInput(deadlineStr)) return ''
    const startDay = startOfDay(startDateStr)
    const deadlineDay = startOfDay(deadlineStr)
    if (startDay && deadlineDay && startDay > deadlineDay) {
      return 'Start date cannot be after the deadline.'
    }
    return ''
  }, [startDateStr, deadlineStr])

  const projectDateRangeLiveError = useMemo(() => {
    const createdSrc = projectDateBounds?.createdAt
    const finishSrc = projectDateBounds?.expectedFinishDate
    if (createdSrc == null || finishSrc == null) return ''
    const pkCreated = String(createdSrc).slice(0, 10)
    const pkFinish = String(finishSrc).slice(0, 10)
    if (pkCreated.length !== 10 || pkFinish.length !== 10) return ''
    if (!startDateStr || !isValidDateInput(startDateStr)) return ''
    if (!deadlineStr || !isValidDateInput(deadlineStr)) return ''
    const sk = startDateStr.slice(0, 10)
    const dk = deadlineStr.slice(0, 10)
    if (sk < pkCreated || sk > pkFinish) {
      return `Start date must be within the project period (${formatDateDisplay(pkCreated)} – ${formatDateDisplay(pkFinish)}).`
    }
    if (dk < pkCreated || dk > pkFinish) {
      return `Deadline must be within the project period (${formatDateDisplay(pkCreated)} – ${formatDateDisplay(pkFinish)}).`
    }
    return ''
  }, [
    projectDateBounds?.createdAt,
    projectDateBounds?.expectedFinishDate,
    startDateStr,
    deadlineStr,
  ])

  const footerLiveError = dateOrderLiveError || projectDateRangeLiveError

  useEffect(() => {
    if (!err && !footerLiveError) return
    footerErrRef.current?.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    })
  }, [err, footerLiveError, reduceMotion])

  const performAddTask = async () => {
    const t = title.trim()
    const d = description.trim()
    submitLockRef.current = true
    setSubmitting(true)
    try {
      await onSubmit?.({
        title: t,
        description: d.length ? d : '',
        mainCategory: mainKey,
        subCategory: subKey,
        startDate: startDateStr,
        dueDate: deadlineStr,
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
      setErr(friendlyTaskError(e))
      setSubmitting(false)
    } finally {
      submitLockRef.current = false
    }
  }

  const openAddConfirmation = () => {
    const today = startOfDay(new Date())
    const startDay =
      startDateStr && isValidDateInput(startDateStr) ? startOfDay(startDateStr) : null
    const deadlineDay =
      deadlineStr && isValidDateInput(deadlineStr) ? startOfDay(deadlineStr) : null
    const sameStartAndDeadline = !!(
      startDay &&
      deadlineDay &&
      startDay.getTime() === deadlineDay.getTime()
    )
    const hasFutureStart = !!(startDay && startDay > today)
    const hasPastDeadline = !!(deadlineDay && deadlineDay < today)
    setWarningConfirmMode(false)
    setWarningConfirmMessage('')
    if (!sameStartAndDeadline && (hasFutureStart || hasPastDeadline)) {
      setWarningConfirmMode(true)
      if (hasFutureStart && hasPastDeadline) {
        setWarningConfirmMessage(
          'You selected a future start date and a past deadline. Is this good?',
        )
      } else if (hasFutureStart) {
        setWarningConfirmMessage('You selected a future start date. Is this good?')
      } else {
        setWarningConfirmMessage('You selected a past deadline. Is this good?')
      }
    } else {
      setWarningConfirmMessage('Do you want to add this task?')
    }
    setWarningConfirmOpen(true)
  }

  const handleAdd = () => {
    if (busy || submitting || submitLockRef.current) return
    setErr(null)
    if (!mainKey || !subKey) {
      setErr('Choose a main category and a sub category')
      return
    }
    if (title.length < TITLE_MIN) {
      setErr(`Task title must be at least ${TITLE_MIN} characters`)
      return
    }
    if (title.length > TITLE_MAX) {
      setErr(`Title can't be longer than ${TITLE_MAX} characters`)
      return
    }
    if (!title.trim()) {
      setErr("Task title can't be only spaces")
      return
    }
    const t = title.trim()
    const d = description.trim()
    if (d.length > DESCRIPTION_MAX) {
      setErr(`Description can't be longer than ${DESCRIPTION_MAX} characters`)
      return
    }
    if (!startDateStr?.trim()) {
      setErr('Start date is required')
      return
    }
    if (!isValidDateInput(startDateStr)) {
      setErr('Start date is not valid')
      return
    }
    if (!deadlineStr?.trim()) {
      setErr('Deadline is required')
      return
    }
    if (!isValidDateInput(deadlineStr)) {
      setErr('Deadline is not valid')
      return
    }
    if (footerLiveError) return
    openAddConfirmation()
  }

  const actionLocked = busy || submitting || saveSucceeded
  const cancelDisabled = busy || submitting

  /** Case 1: shrink until focused. Case 2: expanded only while description has focus (panels don’t override). */
  const descriptionFieldCompact = !descriptionFocused

  /** One transition object for layout + opacity — avoids staggered “two springs” feel */
  const addTaskFlowTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            layout: ADD_TASK_FLOW_SPRING,
            opacity: ADD_TASK_FLOW_SPRING,
          },
    [reduceMotion],
  )

  /** Footer error strip: height + opacity together so the sheet doesn’t jump when messages clear */
  const footerErrTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0.12 }
        : {
            height: ADD_TASK_FLOW_SPRING,
            opacity: ADD_TASK_FLOW_SPRING,
          },
    [reduceMotion],
  )

  /** Thick themed frame: full category+sub color, or while picking main / sub */
  const sheetThickFrame = useMemo(
    () =>
      (mainKey && subKey) ||
      mobilePanel === 'main' ||
      (mobilePanel === 'sub' && !!mainKey),
    [mainKey, subKey, mobilePanel],
  )

  const sheetFrameBorderColor = useMemo(() => {
    if (mobilePanel === 'main' && !mainKey) {
      return 'rgba(61, 107, 154, 0.92)'
    }
    if (mainKey && theme.border) {
      return theme.border
    }
    return null
  }, [mobilePanel, mainKey, theme.border])

  const sheetStyle = useMemo(() => {
    const s = {}
    if (theme.panelBg && mainKey) {
      s.background = theme.panelBg
    }

    const thick = sheetThickFrame && sheetFrameBorderColor

    if (thick) {
      s.borderWidth = 4
      s.borderStyle = 'solid'
      s.borderColor = sheetFrameBorderColor
      s.boxShadow = `
        8px 10px 24px rgba(90, 100, 115, 0.22),
        -6px -6px 14px var(--highlight),
        inset 0 1px 0 rgba(255, 255, 255, 0.68)
      `
      if (isMobile) {
        s.marginLeft =
          'max(8px, calc(max(12px, env(safe-area-inset-left, 0px)) - 4px))'
        s.marginRight =
          'max(8px, calc(max(12px, env(safe-area-inset-right, 0px)) - 4px))'
      }
    } else if (theme.border && mainKey) {
      s.borderColor = theme.border
      s.boxShadow = `
        16px 16px 32px rgba(90, 100, 115, 0.22),
        -10px -10px 24px var(--highlight),
        inset 0 1px 0 rgba(255, 255, 255, 0.7),
        0 0 0 1px ${theme.border}55
      `
    }

    s.transformOrigin = 'center center'
    return s
  }, [sheetThickFrame, sheetFrameBorderColor, theme, mainKey, isMobile])

  const renderMainGrid = () => (
    <div className="add-task-main-grid" role="group" aria-label="Main category">
      {TASK_CATEGORY_TREE.map((m) => {
        const on = mainKey === m.key
        return (
          <motion.button
            key={m.key}
            type="button"
            className={
              on
                ? 'add-task-chip add-task-chip--main add-task-chip--on'
                : 'add-task-chip add-task-chip--main'
            }
            aria-pressed={on}
            onClick={() => handleMain(m.key)}
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            {m.label}
          </motion.button>
        )
      })}
    </div>
  )

  const renderSubRow = () =>
    mainDef ? (
      <div
        className="add-task-sub-row"
        role="group"
        aria-label={`Sub category for ${mainDef.label}`}
      >
        {subsOrdered.map((s) => {
          const on = subKey === s.key
          const b = s.theme?.border ?? '#64748b'
          const inten = s.theme?.intensity ?? 'medium'
          const lightFg = inten === 'light' || inten === 'lightest'
          const subStyle = on
            ? {
                borderColor: b,
                background: `linear-gradient(180deg, ${b} 0%, ${b} 100%)`,
                color: lightFg ? '#0f172a' : '#f8fafc',
                boxShadow: `4px 4px 12px ${b}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
              }
            : {
                borderColor: b,
                borderWidth: 2,
                borderStyle: 'solid',
              }
          return (
            <motion.button
              key={s.key}
              type="button"
              className="add-task-chip add-task-chip--sub"
              style={subStyle}
              aria-pressed={on}
              onClick={() => handleSub(s.key)}
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              {s.label}
            </motion.button>
          )
        })}
      </div>
    ) : null

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
            aria-labelledby="add-task-title"
            className="modal-sheet add-task-sheet"
            style={sheetStyle}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={ADD_TASK_MODAL_FLY_VARIANTS}
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
              id="add-task-title"
              layout
              className="modal-title"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={addTaskFlowTransition}
            >
              Add task
            </motion.h2>

            <LayoutGroup id="add-task-form-flow">
            <div className="add-task-section add-task-section--fields">
              <motion.label
                layout
                initial={reduceMotion ? false : { opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 420, damping: 34 }
                }
                className="login-field-label"
                htmlFor="add-task-input-title"
              >
                Task title
              </motion.label>
              <motion.textarea
                id="add-task-input-title"
                layout
                className="login-input add-task-textarea add-task-textarea--title"
                rows={1}
                minLength={TITLE_MIN}
                maxLength={TITLE_MAX}
                value={title}
                placeholder="Short name for this task"
                aria-describedby="add-task-title-hint"
                autoComplete="off"
                onFocus={handleTitleFocus}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setErr(null)
                }}
                transition={addTaskFlowTransition}
              />
              <motion.p
                layout
                transition={addTaskFlowTransition}
                id="add-task-title-hint"
                className="add-task-char-hint"
              >
                {TITLE_MIN}–{TITLE_MAX} characters (spaces count) · {title.length}/{TITLE_MAX}
              </motion.p>

              <motion.label
                layout
                initial={reduceMotion ? false : { opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={addTaskFlowTransition}
                className="login-field-label add-task-label-spaced"
                htmlFor="add-task-input-description"
              >
                Description
              </motion.label>
              <motion.textarea
                ref={descriptionInputRef}
                id="add-task-input-description"
                layout
                className={
                  descriptionFieldCompact
                    ? 'login-input add-task-textarea add-task-textarea--title'
                    : 'login-input add-task-textarea add-task-textarea--body'
                }
                rows={descriptionFieldCompact ? 1 : 5}
                maxLength={DESCRIPTION_MAX}
                value={description}
                placeholder="Add context, steps, or links (optional)"
                aria-describedby="add-task-description-hint"
                onFocus={handleDescriptionFocus}
                onBlur={handleDescriptionBlur}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setErr(null)
                }}
                transition={addTaskFlowTransition}
              />
              <motion.p
                layout
                transition={addTaskFlowTransition}
                id="add-task-description-hint"
                className="add-task-char-hint"
              >
                Up to {DESCRIPTION_MAX} characters · {description.length}/{DESCRIPTION_MAX}
              </motion.p>
            </div>

            {/* Category + sub rows (options under each parent); dates open native picker */}
              <div className="add-task-cat-acc" role="group" aria-label="Task options">
                <motion.div
                  layout
                  transition={addTaskFlowTransition}
                  className={
                    mobilePanel === 'main'
                      ? 'add-task-m-block add-task-m-block--main add-task-m-block--expanded'
                      : 'add-task-m-block add-task-m-block--main'
                  }
                >
                  <button
                    type="button"
                    className={
                      mobilePanel === 'main'
                        ? 'add-task-m-row add-task-m-row--open'
                        : 'add-task-m-row'
                    }
                    aria-expanded={mobilePanel === 'main'}
                    onMouseDown={handleTaskOptionRowMouseDown}
                    onClick={() => toggleMobilePanel('main')}
                  >
                    <span className="add-task-m-row-label">Category</span>
                    <span className="add-task-m-row-trail">
                      <span className="add-task-m-row-value">
                        {mainDef?.label ?? 'Select'}
                      </span>
                      <MobileRowChevron
                        expanded={mobilePanel === 'main'}
                        muted={false}
                        reduceMotion={!!reduceMotion}
                      />
                    </span>
                  </button>
                  <AnimatePresence initial={false} mode="popLayout">
                    {mobilePanel === 'main' ? (
                      <motion.div
                        key="add-task-slot-main"
                        className="add-task-m-slot"
                        aria-labelledby="add-task-m-slot-main-h"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={addTaskFlowTransition}
                      >
                        <p id="add-task-m-slot-main-h" className="add-task-m-slot-line">
                          Options for <strong>Category</strong>
                          <span className="add-task-m-slot-pick"> — PICK ONE</span>
                        </p>
                        {renderMainGrid()}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>

                <motion.div
                  layout
                  transition={addTaskFlowTransition}
                  className={
                    mobilePanel === 'sub'
                      ? 'add-task-m-block add-task-m-block--sub add-task-m-block--expanded'
                      : 'add-task-m-block add-task-m-block--sub'
                  }
                >
                  <button
                    type="button"
                    className={
                      mobilePanel === 'sub'
                        ? 'add-task-m-row add-task-m-row--open'
                        : 'add-task-m-row'
                    }
                    aria-expanded={mobilePanel === 'sub'}
                    disabled={!mainKey}
                    onMouseDown={handleTaskOptionRowMouseDown}
                    onClick={() => toggleMobilePanel('sub')}
                  >
                    <span className="add-task-m-row-label">Sub category</span>
                    <span className="add-task-m-row-trail">
                      <span className="add-task-m-row-value">
                        {subDef?.label ?? 'Select'}
                      </span>
                      <MobileRowChevron
                        expanded={!!mainKey && mobilePanel === 'sub'}
                        muted={!mainKey}
                        reduceMotion={!!reduceMotion}
                      />
                    </span>
                  </button>
                  <AnimatePresence initial={false} mode="popLayout">
                    {mobilePanel === 'sub' && mainDef ? (
                      <motion.div
                        key="add-task-slot-sub"
                        className="add-task-m-slot"
                        aria-labelledby="add-task-m-slot-sub-h"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={addTaskFlowTransition}
                      >
                        <p id="add-task-m-slot-sub-h" className="add-task-m-slot-line">
                          Options for <strong>Sub category</strong>
                          <span className="add-task-m-slot-pick"> — PICK ONE</span>
                        </p>
                        {renderSubRow()}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>

                <motion.div
                  className="add-task-m-pair"
                  layout
                  transition={addTaskFlowTransition}
                >
                  <button
                    type="button"
                    className="add-task-m-row"
                    onMouseDown={handleTaskOptionRowMouseDown}
                    onClick={() => openDateCalendar('start')}
                  >
                    <span className="add-task-m-row-label">Start date</span>
                    <span className="add-task-m-row-trail">
                      <span className="add-task-m-row-value">
                        {formatDateDisplay(startDateStr)}
                      </span>
                      <MobileDateIcon reduceMotion={!!reduceMotion} />
                    </span>
                  </button>
                </motion.div>

                <motion.div
                  className="add-task-m-pair"
                  layout
                  transition={addTaskFlowTransition}
                >
                  <button
                    type="button"
                    className="add-task-m-row"
                    onMouseDown={handleTaskOptionRowMouseDown}
                    onClick={() => openDateCalendar('deadline')}
                  >
                    <span className="add-task-m-row-label">Deadline</span>
                    <span className="add-task-m-row-trail">
                      <span className="add-task-m-row-value">
                        {formatDateDisplay(deadlineStr)}
                      </span>
                      <MobileDateIcon reduceMotion={!!reduceMotion} />
                    </span>
                  </button>
                </motion.div>
              </div>

            <AnimatePresence initial={false} mode="popLayout">
              {err || footerLiveError ? (
                <motion.div
                  key="add-task-footer-err"
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
                    {err ? (
                      <p className="add-task-error add-task-footer-err-item" role="alert">
                        {err}
                      </p>
                    ) : null}
                    {footerLiveError ? (
                      <p
                        className="add-task-error add-task-footer-err-item add-task-footer-err-item--date"
                        role="alert"
                      >
                        <span className="add-task-date-live-error-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" fill="#e05151" />
                            <path
                              d="M12 7.7V13.1"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            <circle cx="12" cy="16.2" r="1.1" fill="#fff" />
                          </svg>
                        </span>
                        {footerLiveError}
                      </p>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <motion.div
              layout
              transition={addTaskFlowTransition}
              className="modal-actions add-task-modal-actions"
            >
              <motion.button
                type="button"
                layout
                transition={addTaskFlowTransition}
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
                transition={addTaskFlowTransition}
                className={
                  saveSucceeded
                    ? 'modal-btn modal-btn-primary add-task-btn--saved'
                    : 'modal-btn modal-btn-primary'
                }
                onClick={handleAdd}
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
                  'Adding…'
                ) : (
                  'Add task'
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
                  selectedDate={parseDateOrToday(
                    openCalendarFor === 'start' ? startDateStr : deadlineStr,
                  )}
                  showTrigger={false}
                  overlayTitle={
                    openCalendarFor === 'start' ? 'Start date' : 'Deadline'
                  }
                  onRequestClose={() => setOpenCalendarFor(null)}
                  onSelectDate={(d) => {
                    const v = toInputDate(d)
                    if (openCalendarFor === 'start') {
                      setStartDateStr(v)
                    } else {
                      setDeadlineStr(v)
                    }
                    setErr(null)
                    setOpenCalendarFor(null)
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {createPortal(
            <ConfirmPop
              open={warningConfirmOpen}
              title="Add task"
              message={warningConfirmMessage || 'Do you want to add this task?'}
              warning={warningConfirmMode}
              noLabel="No"
              yesLabel="Yes, add"
              skipDocumentScrollLock
              onNo={() => {
                setWarningConfirmOpen(false)
                setWarningConfirmMode(false)
              }}
              onYes={async () => {
                setWarningConfirmOpen(false)
                setWarningConfirmMode(false)
                await performAddTask()
              }}
            />,
            document.body,
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default AddTask
