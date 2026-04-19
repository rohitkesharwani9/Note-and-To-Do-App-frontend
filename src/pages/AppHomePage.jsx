import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CalendarDayStrip,
  CalendarMonthPicker,
  CalendarQuickDates,
} from '../components/CalendarStrip'
import { EditTask } from '../components/EditTask.jsx'
import { ProgressPop } from '../components/ProgressPop.jsx'
import { ViewCommentPop } from '../components/ViewCommentPop.jsx'
import { AddTaskWithProjectModal } from '../components/AddTaskWithProjectModal.jsx'
import { AddNote } from '../components/AddNote.jsx'
import { SaveNewLinkModal } from '../components/SaveNewLinkModal.jsx'
import { SortViaPop } from '../components/SortViaPop.jsx'
import { PROJECT_STATUS_OPTIONS } from '../components/EditProjectDetailsPop.jsx'
import { ProfileSuccessAlert } from '../components/ProfileSuccessBanner.jsx'
import { SharedErrorBanner } from '../components/SharedErrorBanner'
import { ConfirmPop } from '../components/ConfirmPop.jsx'
import {
  createProject,
  createSavedLink,
  createTaskComment,
  deleteTodo,
  fetchProjects,
  fetchProjectsByStatusTag,
  fetchTodosForDayRange,
  patchTodo,
  searchProjectsDatabase,
} from '../lib/api'
import {
  endOfLocalDay,
  formatTasksHeading,
  startOfLocalDay,
} from '../lib/dateUtils'
import {
  applyProjectViewFilter,
  filterProjectsForModalList,
  getViewModesForSelect,
  selectValueToViewFilter,
  viewKindToStatusTag,
  viewFilterSummaryLabel,
  viewFilterToSelectValue,
} from '../lib/projectViewFilter.js'
import {
  PROJECT_NAME_MAX,
  PROJECT_NAME_MIN,
  PROJECT_SEARCH_MAX,
  PROJECT_SEARCH_MIN,
} from '../lib/inputLimits'
import { loadRecentProjectIds, recordRecentProjectId } from '../lib/recentProjects.js'
import { createModalFlySheetVariants } from '../lib/modalFlyVariants.js'
import {
  isValidDateInput,
  startOfDay,
  toInputDate,
} from '../lib/dateInputLocal'
import { getCategoryLabels, getTaskCategoryTheme } from '../lib/taskCategoryThemes'
import { clearSession, getStoredUser } from '../lib/session'
import './LoginPage.css'
import './AppHomePage.css'
import './ProjectPage.css'

function nextStatus(current) {
  if (current === 'NOT_STARTED') return 'IN_PROGRESS'
  if (current === 'IN_PROGRESS') return 'DONE'
  return 'NOT_STARTED'
}

function statusLabel(s) {
  if (s === 'DONE') return 'Done'
  if (s === 'IN_PROGRESS') return 'In progress'
  return 'Not started'
}

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

/** Plain rect for modal fly animation; uses parent if the trigger has no usable box. */
function boundingRectFromButtonOrParent(el) {
  if (!el) return null
  let r = el.getBoundingClientRect()
  if (r.width > 1 && r.height > 1) {
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }
  const p = el.parentElement
  if (p) {
    r = p.getBoundingClientRect()
  }
  return { left: r.left, top: r.top, width: Math.max(r.width, 1), height: Math.max(r.height, 1) }
}

function hasCustomHomeSort(config) {
  if (!config) return false
  if (config.projectStatuses?.length) return true
  if (config.categories?.length) return true
  if (config.subCategories?.length) return true
  if (config.dateFrom || config.dateTo) return true
  if (config.dateField === 'deadline') return true
  if (config.dateOrder === 'asc') return true
  if (config.commentSort) return true
  if (config.primarySort === 'comments') return true
  if (config.sortBy && config.sortBy !== 'date') return true
  if (config.sortDir && config.sortDir !== 'desc') return true
  if (config.showExpiredTasks) return true
  return false
}

function normalizeHomeSort(config) {
  if (!config) return null
  const norm = {
    sortBy: config.sortBy ?? 'date',
    sortDir: config.sortDir ?? 'desc',
    dateField: config.dateField ?? 'start',
    dateOrder: config.dateOrder ?? 'desc',
    dateFrom: config.dateFrom ?? '',
    dateTo: config.dateTo ?? '',
    commentSort: config.commentSort ?? null,
    primarySort: config.primarySort ?? 'date',
    categories: [...(config.categories ?? [])].sort(),
    subCategories: [...(config.subCategories ?? [])].sort(),
    projectStatuses: [...(config.projectStatuses ?? [])].sort(),
    showExpiredTasks: !!config.showExpiredTasks,
  }
  return norm
}

function sameHomeSort(a, b) {
  return JSON.stringify(normalizeHomeSort(a)) === JSON.stringify(normalizeHomeSort(b))
}

function StatRing({ label, value, total, stroke, reduceMotion, loading }) {
  const r = 44
  const c = 2 * Math.PI * r
  const pct = total > 0 ? value / total : 0
  const dashOffset = c * (1 - pct)
  const spinnerLen = c * 0.2
  const spinnerGap = c - spinnerLen
  return (
    <motion.div
      className="app-home-ring-wrap"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      aria-label={loading ? 'Loading progress' : `${label}: ${value}`}
    >
      <div className="app-home-ring-svg-wrap">
        <svg
          viewBox="0 0 120 120"
          className="app-home-ring-svg"
          aria-hidden
        >
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            className="app-home-ring-track"
            strokeWidth="10"
          />
          {loading ? (
            <g
              className={
                reduceMotion
                  ? 'app-home-ring-spinner-g app-home-ring-spinner-g--reduced'
                  : 'app-home-ring-spinner-g'
              }
            >
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={stroke}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${spinnerLen} ${spinnerGap}`}
                transform="rotate(-90 60 60)"
              />
            </g>
          ) : (
            <motion.circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{
                duration: reduceMotion ? 0 : 0.55,
                ease: [0.22, 1, 0.36, 1],
              }}
              transform="rotate(-90 60 60)"
            />
          )}
        </svg>
        <div className="app-home-ring-center">
          {loading ? (
            <>
              <span className="app-home-ring-num app-home-ring-num--loading" aria-hidden>
                …
              </span>
              <span className="app-home-ring-lbl">Loading…</span>
            </>
          ) : (
            <>
              <span className="app-home-ring-num">{value}</span>
              <span className="app-home-ring-lbl">{label}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

const ADD_PROJECT_MODAL_FLY_VARIANTS = createModalFlySheetVariants(520, 920)
const SELECT_PROJECT_MODAL_FLY_VARIANTS = createModalFlySheetVariants(420, 760)

export function AddProjectModal({
  open,
  onClose,
  onCreated,
  /** When set (yyyy-mm-dd), Created date is prefilled when the sheet opens */
  prefillCreatedDate = null,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const inputId = useId()
  const [name, setName] = useState('')
  const [tags, setTags] = useState([])
  const [createdAt, setCreatedAt] = useState('')
  const [expectedFinishDate, setExpectedFinishDate] = useState('')
  const [openCalendarFor, setOpenCalendarFor] = useState(null)
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmWarningMode, setConfirmWarningMode] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const successTimerRef = useRef(null)

  const tagSet = useMemo(() => new Set(tags), [tags])

  const errTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0.12 }
        : { height: { type: 'spring', stiffness: 380, damping: 42, mass: 0.72 }, opacity: { type: 'spring', stiffness: 380, damping: 42, mass: 0.72 } },
    [reduceMotion],
  )

  useEffect(() => {
    if (open) {
      setName('')
      setTags([])
      const prefillYmd =
        typeof prefillCreatedDate === 'string' &&
        isValidDateInput(prefillCreatedDate.trim().slice(0, 10))
          ? prefillCreatedDate.trim().slice(0, 10)
          : ''
      setCreatedAt(prefillYmd || toInputDate(new Date()))
      setExpectedFinishDate('')
      setOpenCalendarFor(null)
      setErr(null)
      setSaving(false)
      setSaveSuccess(false)
      setConfirmOpen(false)
      setConfirmWarningMode(false)
      setConfirmMessage('')
      if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null }
    }
  }, [open, prefillCreatedDate])

  useEffect(() => () => { if (successTimerRef.current) clearTimeout(successTimerRef.current) }, [])

  const toggleTag = (key) => {
    setErr(null)
    setTags((prev) => {
      const set = new Set(prev)
      if (set.has(key)) set.delete(key)
      else { if (set.size >= 6) return prev; set.add(key) }
      return Array.from(set)
    })
  }

  const statusLiveError = useMemo(() => {
    if (tags.length === 0) return 'Select at least 1 status (maximum 6).'
    if (tags.length > 6) return 'Choose up to 6 status options.'
    return ''
  }, [tags])

  const dateLiveError = useMemo(() => {
    if (!createdAt || !expectedFinishDate) return ''
    if (!isValidDateInput(createdAt) || !isValidDateInput(expectedFinishDate)) return ''
    const c = startOfDay(createdAt)
    const f = startOfDay(expectedFinishDate)
    if (c && f && c > f) return 'Created date cannot be after expected finish date.'
    return ''
  }, [createdAt, expectedFinishDate])

  const selectedStatusLabels = useMemo(() => {
    if (!tags.length) return ['None']
    const labelsByKey = new Map(PROJECT_STATUS_OPTIONS.map((o) => [o.key, o.label]))
    return tags.map((key) => labelsByKey.get(key) || key)
  }, [tags])

  const parseDateOrToday = (val) => {
    const d = val ? new Date(val) : null
    return d && !Number.isNaN(d.getTime()) ? d : new Date()
  }

  const openConfirmIfValid = () => {
    setErr(null)
    const t = name.trim()
    if (t.length < PROJECT_NAME_MIN || t.length > PROJECT_NAME_MAX) {
      setErr(`Project name must be ${PROJECT_NAME_MIN}–${PROJECT_NAME_MAX} characters`)
      return
    }
    if (tags.length < 1 || tags.length > 6) return
    if (createdAt && !isValidDateInput(createdAt)) { setErr('Created date is not valid'); return }
    if (!expectedFinishDate) { setErr('Expected finish date is required'); return }
    if (!isValidDateInput(expectedFinishDate)) { setErr('Expected finish date is not valid'); return }
    if (dateLiveError) return
    const today = startOfDay(new Date())
    const createdDay =
      createdAt && isValidDateInput(createdAt) ? startOfDay(createdAt) : null
    const finishDay =
      expectedFinishDate && isValidDateInput(expectedFinishDate)
        ? startOfDay(expectedFinishDate)
        : null
    const sameCreatedAndFinish = !!(
      createdDay &&
      finishDay &&
      createdDay.getTime() === finishDay.getTime()
    )
    const hasFutureCreated = !!(createdDay && createdDay > today)
    const hasPastFinish = !!(finishDay && finishDay < today)
    if (!sameCreatedAndFinish && (hasFutureCreated || hasPastFinish)) {
      setConfirmWarningMode(true)
      if (hasFutureCreated && hasPastFinish) {
        setConfirmMessage(
          'You selected future date for created date and past date for expected finish date. Is this good?',
        )
      } else if (hasFutureCreated) {
        setConfirmMessage('You selected future date for creation date. Is this good?')
      } else {
        setConfirmMessage('You selected past date for expected finish date. Is this good?')
      }
    } else {
      setConfirmWarningMode(false)
      setConfirmMessage('Do you want to save these project details?')
    }
    setErr(null)
    setConfirmOpen(true)
  }

  const submit = async () => {
    setErr(null)
    const t = name.trim()
    if (t.length < PROJECT_NAME_MIN || t.length > PROJECT_NAME_MAX) {
      setErr(`Project name must be ${PROJECT_NAME_MIN}–${PROJECT_NAME_MAX} characters`)
      return
    }
    if (tags.length < 1 || tags.length > 6) return
    if (createdAt && !isValidDateInput(createdAt)) { setErr('Created date is not valid'); return }
    if (!expectedFinishDate) { setErr('Expected finish date is required'); return }
    if (!isValidDateInput(expectedFinishDate)) { setErr('Expected finish date is not valid'); return }
    if (dateLiveError) return
    setSaving(true)
    try {
      const data = await createProject(t, {
        statusTags: tags,
        createdAt: createdAt || undefined,
        expectedFinishDate: expectedFinishDate || undefined,
      })
      setSaving(false)
      setSaveSuccess(true)
      const proj = data?.project ?? null
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null
        setSaveSuccess(false)
        onCreated?.(proj)
        onClose()
      }, 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the project')
      setSaving(false)
    }
  }

  const openCreatedPicker = openCalendarFor === 'created'
  const openFinishPicker = openCalendarFor === 'finish'
  const calendarTitle = openCalendarFor === 'created' ? 'Created date' : 'Expected finish date'

  const sheetFlyTransition = reduceMotion
    ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
    : { type: 'spring', stiffness: 360, damping: 30, mass: 0.72 }

  return (
    <>
    <AnimatePresence onExitComplete={onSheetExitComplete}>
      {open ? (
        <motion.div
          key="add-project-modal-backdrop"
          className="modal-backdrop"
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
            aria-labelledby="add-project-title"
            className="modal-sheet modal-sheet--edit-project modal-sheet--add-project"
            style={{ transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={ADD_PROJECT_MODAL_FLY_VARIANTS}
            initial="fromOrigin"
            animate="expanded"
            exit="fromOrigin"
            transition={sheetFlyTransition}
          >
            <h2 id="add-project-title" className="modal-title">
              New project
            </h2>

            <label className="login-field-label" htmlFor={inputId} style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span>Name</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                ({PROJECT_NAME_MIN}–{PROJECT_NAME_MAX} characters)
              </span>
            </label>
            <motion.input
              id={inputId}
              className="login-input"
              name="projectName"
              type="text"
              minLength={PROJECT_NAME_MIN}
              maxLength={PROJECT_NAME_MAX}
              value={name}
              disabled={saveSuccess}
              onChange={(e) => { setName(e.target.value); if (err) setErr(null) }}
              aria-invalid={!!err}
              whileFocus={reduceMotion || saveSuccess ? {} : { scale: 1.01 }}
              autoComplete="off"
            />

            <div className="edit-proj-block edit-proj-block--date">
              <div className="edit-proj-label">
                Status (select min 1 &amp; max 6 status)
              </div>
              <div className="edit-proj-chip-grid" role="group" aria-label="Project status options">
                {PROJECT_STATUS_OPTIONS.map((opt) => {
                  const on = tagSet.has(opt.key)
                  return (
                    <motion.button
                      key={opt.key}
                      type="button"
                      className={on ? 'edit-proj-chip edit-proj-chip--on' : 'edit-proj-chip'}
                      aria-pressed={on}
                      onClick={() => toggleTag(opt.key)}
                      disabled={saveSuccess}
                      whileTap={{ scale: 0.97 }}
                      whileHover={reduceMotion ? {} : { y: -1 }}
                    >
                      {opt.label}
                    </motion.button>
                  )
                })}
              </div>
            </div>

            <div className="edit-proj-block">
              <label className="login-field-label" htmlFor="new-proj-created-date">
                Created date
              </label>
              <input
                id="new-proj-created-date"
                className="login-input"
                type="date"
                value={createdAt}
                onClick={(e) => { e.preventDefault(); setOpenCalendarFor((v) => (v === 'created' ? null : 'created')) }}
                onChange={(e) => { setCreatedAt(e.target.value); setErr(null) }}
              />
            </div>

            <div className="edit-proj-block edit-proj-block--date">
              <label className="login-field-label" htmlFor="new-proj-finish-date">
                Expected finish date
              </label>
              <input
                id="new-proj-finish-date"
                className="login-input"
                type="date"
                value={expectedFinishDate}
                onClick={(e) => { e.preventDefault(); setOpenCalendarFor((v) => (v === 'finish' ? null : 'finish')) }}
                onChange={(e) => { setExpectedFinishDate(e.target.value); setErr(null) }}
              />
              <AnimatePresence initial={false} mode="sync">
                {statusLiveError ? (
                  <motion.div key="new-proj-err-status" className="edit-proj-anim-err-host" style={{ overflow: 'hidden' }}
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={errTransition}
                  >
                    <p className="edit-proj-field-error" role="alert">
                      <span className="edit-proj-field-error-icon" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="#e05151"/><path d="M12 7.7V13.1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16.2" r="1.1" fill="#fff"/></svg>
                      </span>
                      {statusLiveError}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <AnimatePresence initial={false} mode="sync">
                {dateLiveError ? (
                  <motion.div key="new-proj-err-date" className="edit-proj-anim-err-host" style={{ overflow: 'hidden' }}
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={errTransition}
                  >
                    <p className="edit-proj-field-error" role="alert">
                      <span className="edit-proj-field-error-icon" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="#e05151"/><path d="M12 7.7V13.1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16.2" r="1.1" fill="#fff"/></svg>
                      </span>
                      {dateLiveError}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <AnimatePresence initial={false} mode="sync">
                {err && !saveSuccess ? (
                  <motion.div key="new-proj-err-generic" className="edit-proj-anim-err-host" style={{ overflow: 'hidden' }}
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={errTransition}
                  >
                    <p className="edit-proj-field-error" role="alert">
                      <span className="edit-proj-field-error-icon" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="#e05151"/><path d="M12 7.7V13.1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16.2" r="1.1" fill="#fff"/></svg>
                      </span>
                      {err}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {openCalendarFor ? (
                <motion.div
                  className="edit-proj-cal-wrap edit-proj-cal-wrap--centered"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0.12 : 0.18 }}
                >
                  <CalendarMonthPicker
                    selectedDate={parseDateOrToday(openCalendarFor === 'created' ? createdAt : expectedFinishDate)}
                    showTrigger={false}
                    overlayTitle={calendarTitle}
                    onRequestClose={() => setOpenCalendarFor(null)}
                    onSelectDate={(d) => {
                      if (openCalendarFor === 'created') setCreatedAt(toInputDate(d))
                      else setExpectedFinishDate(toInputDate(d))
                      setErr(null)
                      setOpenCalendarFor(null)
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="modal-actions" style={{ marginTop: 14 }}>
              <motion.button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmWarningMode(false)
                  setConfirmMessage('')
                  if (successTimerRef.current) {
                    clearTimeout(successTimerRef.current)
                    successTimerRef.current = null
                  }
                  onClose()
                }}
                whileTap={{ scale: 0.97 }}
                disabled={saving}
              >
                Cancel
              </motion.button>
              <motion.button
                type="button"
                className={saveSuccess ? 'modal-btn edit-proj-save-btn edit-proj-save-btn--success' : 'modal-btn modal-btn-primary'}
                onClick={openConfirmIfValid}
                disabled={saving || saveSuccess}
                whileTap={{ scale: 0.97 }}
              >
                {saveSuccess ? (
                  <span className="edit-proj-save-success-inner">
                    <svg className="edit-proj-save-success-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="edit-proj-save-success-text">Created successfully</span>
                  </span>
                ) : saving ? 'Creating…' : 'Create'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
    {createPortal(
      <ConfirmPop
        open={open && confirmOpen}
        title="Selected Status"
        message={confirmMessage || 'Do you want to save these project details?'}
        warning={confirmWarningMode}
        statusTags={selectedStatusLabels}
        noLabel="No"
        yesLabel={saving ? 'Creating…' : 'Yes, Create'}
        skipDocumentScrollLock
        onNo={() => {
          setConfirmOpen(false)
          setConfirmWarningMode(false)
          setConfirmMessage('')
        }}
        onYes={async () => {
          setConfirmOpen(false)
          setConfirmWarningMode(false)
          setConfirmMessage('')
          await submit()
        }}
      />,
      document.body,
    )}
    </>
  )
}

function statsFromTodoList(list) {
  let done = 0
  let inProgress = 0
  let notStarted = 0
  for (const t of list) {
    if (t.status === 'DONE') done += 1
    else if (t.status === 'IN_PROGRESS') inProgress += 1
    else notStarted += 1
  }
  return {
    done,
    inProgress,
    notStarted,
    total: list.length,
  }
}

const PROJECT_LIST_PAGE_SIZE = 5

export function SelectProjectModal({
  open,
  onClose,
  viewFilter,
  onApplyViewFilter,
  onOpenProject,
  userId,
  todos,
  selectedDate,
  projects,
  projectsLoading,
  projectsLoadError,
  projectsTruncated,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const viewSelectRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  /** Set after user clicks Get — full DB search results; cleared when search text changes */
  const [serverHits, setServerHits] = useState(null)
  const [serverHitsTruncated, setServerHitsTruncated] = useState(false)
  /** @type {'search' | 'status' | null} */
  const [serverHitsMode, setServerHitsMode] = useState(null)
  const [dbSearchLoading, setDbSearchLoading] = useState(false)
  const [dbSearchError, setDbSearchError] = useState(null)
  const [projectPage, setProjectPage] = useState(0)
  /** Local to modal only — narrows which projects appear in the list; does not change Home. */
  const [modalListFilter, setModalListFilter] = useState({ kind: 'all' })

  const [firstMode, ...otherModes] = useMemo(
    () => getViewModesForSelect(),
    [],
  )

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) =>
        String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
          sensitivity: 'base',
        }),
      ),
    [projects],
  )

  const listByModalFilter = useMemo(() => {
    const recentIds = loadRecentProjectIds(userId)
    return filterProjectsForModalList(sortedProjects, modalListFilter, {
      recentIds,
      dayStart: startOfLocalDay(selectedDate),
      todos,
    })
  }, [sortedProjects, modalListFilter, selectedDate, userId, todos])

  const searchTrim = searchQuery.trim()
  const searchTooShort =
    searchTrim.length > 0 && searchTrim.length < PROJECT_SEARCH_MIN

  const listAfterServerFilter = useMemo(() => {
    if (serverHits === null) return null
    const recentIds = loadRecentProjectIds(userId)
    return filterProjectsForModalList(serverHits, modalListFilter, {
      recentIds,
      dayStart: startOfLocalDay(selectedDate),
      todos,
    })
  }, [serverHits, modalListFilter, selectedDate, userId, todos])

  const filteredProjects = useMemo(() => {
    if (serverHits !== null) {
      return listAfterServerFilter ?? []
    }
    const raw = searchQuery.trim()
    const qq = raw.toLowerCase()
    if (!qq) return listByModalFilter
    if (raw.length < PROJECT_SEARCH_MIN) {
      return []
    }
    return listByModalFilter.filter((p) => {
      const serial = String(p.serialNumber ?? '')
      if (serial.includes(qq.replace(/^#/, ''))) return true
      return String(p.name ?? '')
        .toLowerCase()
        .includes(qq)
    })
  }, [
    serverHits,
    listAfterServerFilter,
    listByModalFilter,
    searchQuery,
  ])

  const showGetHint =
    serverHits === null &&
    searchTrim.length >= PROJECT_SEARCH_MIN &&
    !searchTooShort &&
    filteredProjects.length === 0 &&
    listByModalFilter.length > 0

  const showNoDbResults =
    serverHits !== null &&
    serverHits.length === 0 &&
    !dbSearchLoading &&
    !dbSearchError

  const totalProjectPages = Math.max(
    1,
    Math.ceil(filteredProjects.length / PROJECT_LIST_PAGE_SIZE) || 1,
  )

  const pagedProjects = useMemo(() => {
    const start = projectPage * PROJECT_LIST_PAGE_SIZE
    return filteredProjects.slice(start, start + PROJECT_LIST_PAGE_SIZE)
  }, [filteredProjects, projectPage])

  useEffect(() => {
    if (!open) return
    setSearchQuery('')
    setProjectPage(0)
    setModalListFilter({ kind: 'all' })
    setServerHits(null)
    setServerHitsTruncated(false)
    setServerHitsMode(null)
    setDbSearchError(null)
  }, [open])

  useEffect(() => {
    setServerHits(null)
  }, [searchQuery])

  useEffect(() => {
    const maxP = Math.max(
      0,
      Math.ceil(filteredProjects.length / PROJECT_LIST_PAGE_SIZE) - 1,
    )
    setProjectPage((p) => Math.min(p, maxP))
  }, [filteredProjects.length])

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => {
      viewSelectRef.current?.focus()
    })
    return () => cancelAnimationFrame(t)
  }, [open])

  const apply = (next) => {
    if (next?.kind === 'project' && next.id) {
      recordRecentProjectId(next.id, userId)
    }
    onApplyViewFilter(next)
  }

  const handleViewSelectChange = (e) => {
    setModalListFilter(
      selectValueToViewFilter(e.target.value, null, null),
    )
  }

  const pickProjectRow = (p) => {
    apply({
      kind: 'project',
      id: p.id,
      name: p.name,
      serialNumber: p.serialNumber,
    })
    onOpenProject?.(p)
    onClose?.()
  }

  const selectValue = viewFilterToSelectValue(modalListFilter)
  const selectedProjectId =
    viewFilter?.kind === 'project' ? viewFilter.id : null

  const canPrev = projectPage > 0
  const canNext = projectPage < totalProjectPages - 1

  const canUseGet = projectsTruncated === true && projects.length >= 200
  const shouldStatusFetch =
    canUseGet &&
    serverHits === null &&
    searchTrim.length === 0 &&
    modalListFilter?.kind &&
    modalListFilter.kind !== 'all' &&
    Boolean(viewKindToStatusTag(modalListFilter.kind))

  const handleDatabaseSearch = async () => {
    if (!canUseGet) return
    const q = searchQuery.trim()
    if (shouldStatusFetch) {
      const tag = viewKindToStatusTag(modalListFilter.kind)
      if (!tag) return
      setDbSearchLoading(true)
      setDbSearchError(null)
      try {
        const data = await fetchProjectsByStatusTag(tag)
        setServerHits(data.projects ?? [])
        setServerHitsTruncated(data?.truncated === true)
        setServerHitsMode('status')
      } catch (e) {
        setServerHits(null)
        setServerHitsTruncated(false)
        setServerHitsMode(null)
        setDbSearchError(
          e instanceof Error
            ? e.message
            : 'Could not load projects from the database',
        )
      } finally {
        setDbSearchLoading(false)
      }
      return
    }

    if (q.length < PROJECT_SEARCH_MIN) return
    setDbSearchLoading(true)
    setDbSearchError(null)
    try {
      const data = await searchProjectsDatabase(q)
      setServerHits(data.projects ?? [])
      setServerHitsTruncated(false)
      setServerHitsMode('search')
    } catch (e) {
      setServerHits(null)
      setServerHitsTruncated(false)
      setServerHitsMode(null)
      setDbSearchError(
        e instanceof Error ? e.message : 'Could not search the database',
      )
    } finally {
      setDbSearchLoading(false)
    }
  }

  const canShowProjectList =
    !projectsLoading &&
    !projectsLoadError &&
    (projects.length > 0 || serverHits !== null)
  const showSearchHint = searchTooShort && serverHits === null
  const showSearchResultMessage = filteredProjects.length === 0 && searchTrim && !showSearchHint
  const helperMessage = showSearchHint
    ? `Enter at least ${PROJECT_SEARCH_MIN} characters to search (up to ${PROJECT_SEARCH_MAX})`
    : serverHitsMode === 'status' && serverHitsTruncated && !searchTrim
      ? 'We only show the latest 200 projects for this view. If you do not find your project, enter the project name and click Get again.'
    : serverHitsMode === 'status' &&
        !dbSearchLoading &&
        !dbSearchError &&
        serverHits !== null &&
        serverHits.length === 0
      ? 'No projects found.'
    : showSearchResultMessage
      ? showGetHint
        ? 'No matches in the loaded projects. Click Get to search the full database.'
        : showNoDbResults
          ? 'No projects found in the database for this search.'
          : serverHits !== null &&
              serverHits.length > 0 &&
              (listAfterServerFilter?.length ?? 0) === 0
            ? 'No projects match this view filter. Try another view or clear the filter.'
            : 'No projects match your search.'
      : ''

  const selectSheetFlyTransition = reduceMotion
    ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
    : { type: 'spring', stiffness: 360, damping: 30, mass: 0.72 }

  return (
    <AnimatePresence onExitComplete={onSheetExitComplete}>
      {open ? (
        <motion.div
          key="select-project-modal-backdrop"
          className="modal-backdrop"
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
            aria-labelledby="select-project-title"
            className="modal-sheet modal-sheet--project-pick"
            style={{ transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={SELECT_PROJECT_MODAL_FLY_VARIANTS}
            initial="fromOrigin"
            animate="expanded"
            exit="fromOrigin"
            transition={selectSheetFlyTransition}
          >
            <h2 id="select-project-title" className="modal-title">
              Select project
            </h2>
            {projectsTruncated ? (
              <motion.p
                className="app-home-muted app-home-project-truncated-hint"
                initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30, delay: 0.02 }}
              >
                Only the {200} most recently updated projects are loaded here to keep things fast.
              </motion.p>
            ) : null}
            {projectsLoading ? (
              <motion.p
                className="app-home-muted"
                style={{ marginTop: 8 }}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30, delay: 0.03 }}
              >
                Loading…
              </motion.p>
            ) : null}
            {projectsLoadError ? (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30, delay: 0.04 }}
              >
                <SharedErrorBanner className="app-home-modal-error app-home-modal-error--after-title">
                  {projectsLoadError}
                </SharedErrorBanner>
              </motion.div>
            ) : null}
            <AnimatePresence>
              {!projectsLoading && !projectsLoadError ? (
                <motion.div
                  className="app-home-project-search-wrap"
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30, delay: 0.05 }}
                >
                  <label
                    className="login-field-label"
                    htmlFor="project-view-select"
                  >
                    View & filter
                  </label>
                  <motion.select
                    ref={viewSelectRef}
                    id="project-view-select"
                    className="login-input app-home-project-view-select"
                    value={selectValue}
                    onChange={handleViewSelectChange}
                    aria-label="View and filter options"
                    whileFocus={reduceMotion ? {} : { scale: 1.01 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 28 }}
                  >
                    {firstMode ? (
                      <option key={firstMode.kind} value={`mode:${firstMode.kind}`}>
                        {firstMode.label}
                      </option>
                    ) : null}
                    {otherModes.map(({ kind, label }) => (
                      <option key={kind} value={`mode:${kind}`}>
                        {label}
                      </option>
                    ))}
                  </motion.select>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <AnimatePresence>
              {!projectsLoading && !projectsLoadError ? (
                <motion.div
                  className="app-home-project-search-wrap"
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30, delay: 0.07 }}
                >
                <label
                  className="login-field-label"
                  htmlFor="project-search-input"
                >
                  Search projects
                </label>
                <div className="app-home-project-search-row">
                  <input
                    id="project-search-input"
                    type="search"
                    className="login-input app-home-project-search-input"
                    placeholder="Filter by name or #…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    minLength={PROJECT_SEARCH_MIN}
                    maxLength={PROJECT_SEARCH_MAX}
                    autoComplete="off"
                  />
                  <motion.button
                    type="button"
                    className="modal-btn modal-btn-primary app-home-project-get-btn"
                    onClick={handleDatabaseSearch}
                    disabled={
                      !canUseGet ||
                      dbSearchLoading ||
                      (!shouldStatusFetch &&
                        (searchTrim.length < PROJECT_SEARCH_MIN ||
                          searchTrim.length > PROJECT_SEARCH_MAX))
                    }
                    whileTap={{ scale: 0.97 }}
                    aria-label="Search all projects in the database"
                  >
                    {dbSearchLoading ? '…' : 'Get'}
                  </motion.button>
                </div>
                {dbSearchError ? (
                  <SharedErrorBanner className="app-home-modal-error app-home-modal-error--after-title">
                    {dbSearchError}
                  </SharedErrorBanner>
                ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {canShowProjectList ? (
              <motion.div
                className="app-home-project-page-block"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30, delay: 0.08 }}
              >
                {helperMessage ? (
                  <motion.p
                    className="app-home-muted app-home-search-hint"
                    role="status"
                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
                  >
                    {helperMessage}
                  </motion.p>
                ) : (
                  <>
                    <ul
                      className="app-home-project-pick-list app-home-project-pick-list--paged"
                      role="listbox"
                      aria-label="Projects"
                    >
                      {pagedProjects.map((p, idx) => (
                        <motion.li
                          key={p.id}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30, delay: 0.02 * idx }}
                        >
                          <motion.button
                            type="button"
                            className={
                              selectedProjectId === p.id
                                ? 'app-home-project-pick app-home-project-pick--active'
                                : 'app-home-project-pick'
                            }
                            role="option"
                            aria-selected={selectedProjectId === p.id}
                            onClick={() => pickProjectRow(p)}
                            whileTap={{ scale: 0.98 }}
                            whileHover={reduceMotion ? {} : { y: -1 }}
                          >
                            <span className="app-home-project-pick-name">
                              {p.name}
                            </span>
                          </motion.button>
                        </motion.li>
                      ))}
                    </ul>
                    <div className="app-home-project-page-nav" role="navigation">
                      <motion.button
                        type="button"
                        className="app-home-project-page-btn"
                        aria-label="Previous projects"
                        disabled={!canPrev}
                        onClick={() =>
                          setProjectPage((p) => Math.max(0, p - 1))
                        }
                        whileTap={canPrev && !reduceMotion ? { scale: 0.94 } : {}}
                        whileHover={
                          canPrev && !reduceMotion ? { scale: 1.04 } : {}
                        }
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M15 6l-6 6 6 6"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </motion.button>
                      <span className="app-home-project-page-meta">
                        {filteredProjects.length === 0
                          ? '0'
                          : `${projectPage + 1} / ${totalProjectPages}`}
                      </span>
                      <motion.button
                        type="button"
                        className="app-home-project-page-btn"
                        aria-label="Next projects"
                        disabled={!canNext}
                        onClick={() =>
                          setProjectPage((p) =>
                            Math.min(totalProjectPages - 1, p + 1),
                          )
                        }
                        whileTap={canNext && !reduceMotion ? { scale: 0.94 } : {}}
                        whileHover={
                          canNext && !reduceMotion ? { scale: 1.04 } : {}
                        }
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M9 6l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </motion.button>
                    </div>
                  </>
                )}
              </motion.div>
            ) : null}
            {!projectsLoading && !projectsLoadError && projects.length === 0 ? (
              <motion.p
                className="app-home-muted"
                style={{ marginTop: 10 }}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
              >
                No projects yet. Use &quot;Add new project&quot; to create one
              </motion.p>
            ) : null}
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <motion.button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
              >
                Close
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default function AppHomePage() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const user = getStoredUser()

  const [todos, setTodos] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)
  /** Prefetched for Select project modal — max 200 rows from API */
  const [projects, setProjects] = useState([])
  const [projectsTruncated, setProjectsTruncated] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsLoadError, setProjectsLoadError] = useState(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [selectProjectOpen, setSelectProjectOpen] = useState(false)
  const [addTaskFlowOpen, setAddTaskFlowOpen] = useState(false)
  /** Task list + rings: view modes (all, recent, …) or a single project. */
  const [viewFilter, setViewFilter] = useState({ kind: 'all' })
  const [statusBusyId, setStatusBusyId] = useState(null)
  const [editingTask, setEditingTask] = useState(null)
  const [progressTask, setProgressTask] = useState(null)
  const [viewCommentsTask, setViewCommentsTask] = useState(null)
  const [sortViaOpen, setSortViaOpen] = useState(false)
  const [appHomeModalFlyRect, setAppHomeModalFlyRect] = useState(null)
  const [sortConfig, setSortConfig] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()))
  const loadReqIdRef = useRef(0)
  const [rangePickConfirmOpen, setRangePickConfirmOpen] = useState(false)
  const [pendingPickedDate, setPendingPickedDate] = useState(null)
  const [linksChooserOpen, setLinksChooserOpen] = useState(false)
  const [saveLinkOpen, setSaveLinkOpen] = useState(false)
  const [saveLinkFlyRect, setSaveLinkFlyRect] = useState(null)
  const linksChooserTitleId = useId()
  const linksChooserMsgId = useId()
  const [notesChooserOpen, setNotesChooserOpen] = useState(false)
  const notesChooserTitleId = useId()
  const notesChooserMsgId = useId()
  const [addNewChooserOpen, setAddNewChooserOpen] = useState(false)
  const [addNewFlyRect, setAddNewFlyRect] = useState(null)
  const addNewChooserTitleId = useId()
  const addNewChooserMsgId = useId()
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [addNoteOriginRect, setAddNoteOriginRect] = useState(null)

  useEffect(() => {
    if (!linksChooserOpen) return
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
  }, [linksChooserOpen])

  useEffect(() => {
    if (!notesChooserOpen) return
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
  }, [notesChooserOpen])

  useEffect(() => {
    if (!addNewChooserOpen) return
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
  }, [addNewChooserOpen])

  const rangeModeActive = !!(sortConfig?.dateFrom || sortConfig?.dateTo)

  const requestPickDay = useCallback(
    (d) => {
      if (rangeModeActive) {
        setPendingPickedDate(d)
        setRangePickConfirmOpen(true)
        return
      }
      setSelectedDate(d)
    },
    [rangeModeActive],
  )

  const load = useCallback(async (pg = page, filter = statusFilter, sort = sortConfig) => {
    const reqId = (loadReqIdRef.current += 1)
    setLoadError(null)
    setLoading(true)
    try {
      let from = startOfLocalDay(selectedDate)
      let to = endOfLocalDay(selectedDate)
      if (sort?.dateFrom || sort?.dateTo) {
        const dFrom =
          sort?.dateFrom && isValidDateInput(sort.dateFrom)
            ? startOfDay(sort.dateFrom)
            : null
        const dTo =
          sort?.dateTo && isValidDateInput(sort.dateTo) ? startOfDay(sort.dateTo) : null
        if (dFrom && dTo) {
          from = dFrom
          to = endOfLocalDay(dTo)
        } else if (dFrom) {
          from = dFrom
          to = endOfLocalDay(dFrom)
        } else if (dTo) {
          from = dTo
          to = endOfLocalDay(dTo)
        }
        if (from && to && from.getTime() > to.getTime()) {
          const tmp = from
          from = to
          to = tmp
        }
      }
      const data = await fetchTodosForDayRange(from, to, {
        page: pg,
        status: filter || undefined,
        sortBy: sort?.sortBy || undefined,
        sortDir: sort?.sortDir || undefined,
        categories: sort?.categories || undefined,
        subCategories: sort?.subCategories || undefined,
        projectStatuses: sort?.projectStatuses || undefined,
        dateField: sort?.dateField || undefined,
        dateFrom: sort?.dateFrom || undefined,
        dateTo: sort?.dateTo || undefined,
        showExpiredTasks: sort?.showExpiredTasks || undefined,
        expiredTodayStart: sort?.showExpiredTasks
          ? startOfLocalDay(new Date()).toISOString()
          : undefined,
      })
      if (loadReqIdRef.current !== reqId) return
      setTodos(data.todos ?? [])
      setPage(data.page ?? 1)
      setTotalPages(data.totalPages ?? 1)
    } catch (e) {
      if (loadReqIdRef.current !== reqId) return
      setLoadError(
        e instanceof Error ? e.message : 'Could not load tasks for this day',
      )
    } finally {
      if (loadReqIdRef.current === reqId) setLoading(false)
    }
  }, [selectedDate, page, statusFilter, sortConfig])

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      setProjectsLoadError(null)
      const d = await fetchProjects()
      setProjects(d.projects ?? [])
      setProjectsTruncated(d?.truncated === true)
    } catch {
      setProjects([])
      setProjectsTruncated(false)
      setProjectsLoadError(
        'We could not load your projects. Try again in a moment',
      )
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    const id = window.setTimeout(() => {
      load(1, statusFilter, sortConfig)
    }, 50)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  const onProjectCreated = async (project) => {
    await refreshProjects()
    if (project?.id) {
      navigate(`/project/${project.id}`)
    }
  }

  const handleSignOut = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

  const displayTodos = useMemo(() => {
    const recentIds = loadRecentProjectIds(user?.id ?? null)
    return applyProjectViewFilter(todos, viewFilter, {
      recentIds,
      dayStart: startOfLocalDay(selectedDate),
    })
  }, [todos, viewFilter, selectedDate, user?.id])

  const displayStats = useMemo(
    () => statsFromTodoList(displayTodos),
    [displayTodos],
  )

  const handleFilterChange = (filter) => {
    const next = statusFilter === filter ? null : filter
    setStatusFilter(next)
    setPage(1)
    load(1, next, sortConfig)
  }

  const goToPage = (pg) => {
    setPage(pg)
    load(pg, statusFilter, sortConfig)
  }

  const cycleTaskStatus = async (id, current) => {
    const next = nextStatus(current)
    setStatusBusyId(id)
    try {
      await patchTodo(id, { status: next })
      await load(page, statusFilter, sortConfig)
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'Could not update the task',
      )
    } finally {
      setStatusBusyId(null)
    }
  }

  const total = displayStats.total
  const done = displayStats.done
  const inProgress = displayStats.inProgress
  const notStarted = displayStats.notStarted
  const homeTaskSkeletonCount = Math.max(1, Math.min(6, displayTodos.length || todos.length || 3))
  const filterSummary = viewFilterSummaryLabel(viewFilter)
  const sortViaActive = hasCustomHomeSort(sortConfig)

  return (
    <div className="app-home-root">
      <motion.header
        className="app-home-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <div className="app-home-header-inner">
          <div>
            <h1 className="app-home-title">Home</h1>
            <p className="app-home-greet">
              Hi, <strong>{user?.firstName?.trim() || 'there'}</strong>
            </p>
          </div>
          <div className="app-home-header-actions">
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={() => navigate('/profile')}
              whileTap={{ scale: 0.98 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Edit Profile
            </motion.button>
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={handleSignOut}
              whileTap={{ scale: 0.98 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Sign out
            </motion.button>
          </div>
        </div>
      </motion.header>

      <motion.div
        className="app-home-toolbar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
      >
        <motion.div
          className="app-home-toolbar-actions-row"
          initial={reduceMotion ? false : { opacity: 0.9, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30, delay: 0.04 }}
        >
          <div className="app-home-toolbar-quick-wrap">
            <CalendarQuickDates
              selectedDate={selectedDate}
              onSelectDate={requestPickDay}
              suppressSelection={rangeModeActive}
            />
          </div>
          <motion.button
            type="button"
            className="app-home-toolbar-btn"
            onClick={(e) => {
              setAddNewFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
              setAddNewChooserOpen(true)
            }}
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Add new
          </motion.button>
          <motion.button
            type="button"
            className="app-home-toolbar-btn"
            onClick={(e) => {
              setAppHomeModalFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
              setSelectProjectOpen(true)
            }}
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Select project
          </motion.button>
          <motion.button
            type="button"
            className={
              viewFilter.kind === 'critical_bug'
                ? 'app-home-toolbar-btn app-home-toolbar-btn--toggle-on'
                : 'app-home-toolbar-btn'
            }
            aria-pressed={viewFilter.kind === 'critical_bug'}
            onClick={() =>
              setViewFilter((f) =>
                f.kind === 'critical_bug'
                  ? { kind: 'all' }
                  : { kind: 'critical_bug' },
              )
            }
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Show critical work
          </motion.button>
          <motion.button
            type="button"
            className="app-home-toolbar-btn"
            onClick={() => navigate('/calendar')}
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Calendar
          </motion.button>
          <motion.button
            type="button"
            className="app-home-toolbar-btn"
            onClick={(e) => {
              setSaveLinkFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
              setLinksChooserOpen(true)
            }}
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Links
          </motion.button>
          <motion.button
            type="button"
            className="app-home-toolbar-btn"
            onClick={() => setNotesChooserOpen(true)}
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Notes
          </motion.button>
        </motion.div>
        <motion.div
          className="app-home-toolbar-dates-row"
          initial={reduceMotion ? false : { opacity: 0.92, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30, delay: 0.06 }}
        >
          <div className="app-home-toolbar-scroll-wrap">
            <CalendarDayStrip
              selectedDate={selectedDate}
              onSelectDate={requestPickDay}
              suppressSelection={rangeModeActive}
            />
          </div>
          <div className="app-home-toolbar-month-slot">
            <CalendarMonthPicker
              selectedDate={selectedDate}
              onSelectDate={requestPickDay}
              dropdownAlign="end"
              suppressSelection={rangeModeActive}
            />
          </div>
        </motion.div>
      </motion.div>

      <section
        className="app-home-section"
        aria-labelledby="day-progress"
        aria-busy={loading}
      >
        <h2
          id="day-progress"
          className="app-home-section-title app-home-section-title--center"
        >
          Progress · {formatTasksHeading(selectedDate)}
          {filterSummary ? (
            <span className="app-home-filter-tag">
              {' · '}
              {filterSummary}
            </span>
          ) : null}
        </h2>
        <div className="app-home-rings">
          <StatRing
            label="Done"
            value={done}
            total={total}
            stroke="#3d8a6e"
            reduceMotion={!!reduceMotion}
            loading={loading}
          />
          <StatRing
            label="In progress"
            value={inProgress}
            total={total}
            stroke="#3d6b9a"
            reduceMotion={!!reduceMotion}
            loading={loading}
          />
          <StatRing
            label="Not started"
            value={notStarted}
            total={total}
            stroke="#d1ab19"
            reduceMotion={!!reduceMotion}
            loading={loading}
          />
        </div>
      </section>

      <section className="app-home-section" aria-labelledby="day-tasks">
        <h2 id="day-tasks" className="app-home-section-title">
          Tasks for {formatTasksHeading(selectedDate)}
          {filterSummary ? (
            <span className="app-home-filter-tag">
              {' · '}
              {filterSummary}
            </span>
          ) : null}
        </h2>

        <div className="proj-filter-bar">
          {[
            { key: 'NOT_STARTED', label: 'Not started' },
            { key: 'DONE', label: 'Done' },
            { key: 'IN_PROGRESS', label: 'Progress' },
          ].map((f) => (
            <motion.button
              key={f.key}
              type="button"
              className={
                statusFilter === f.key
                  ? 'proj-filter-btn proj-filter-btn--active'
                  : 'proj-filter-btn'
              }
              onClick={() => handleFilterChange(f.key)}
              whileTap={{ scale: 0.96 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              {f.label}
            </motion.button>
          ))}
          <motion.button
            type="button"
            className={
              sortViaActive
                ? 'proj-filter-btn proj-filter-btn--active'
                : 'proj-filter-btn'
            }
            onClick={(e) => {
              setAppHomeModalFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
              setSortViaOpen(true)
            }}
            whileTap={{ scale: 0.96 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Sort via
          </motion.button>
        </div>

        {loadError ? (
          <motion.p role="alert" className="login-error app-home-banner">
            {loadError}
          </motion.p>
        ) : null}
        {loading ? (
          <ul className="app-home-task-list" aria-hidden>
            {Array.from({ length: homeTaskSkeletonCount }).map((_, i) => (
              <li
                key={`home-task-skel-${i}`}
                className="app-home-task app-home-task-skeleton"
              >
                <div className="app-home-task-main">
                  <span className="app-home-task-skel-line app-home-task-skel-line--title" />
                  <span className="app-home-task-skel-line app-home-task-skel-line--desc" />
                  <span className="app-home-task-skel-line app-home-task-skel-line--desc app-home-task-skel-line--desc-short" />
                  <span className="app-home-task-skel-chip" />
                  <span className="app-home-task-skel-chip app-home-task-skel-chip--wide" />
                  <span className="app-home-task-skel-chip app-home-task-skel-chip--project" />
                </div>
                <div className="proj-task-actions">
                  <span className="app-home-task-skel-btn" />
                  <span className="app-home-task-skel-btn" />
                  <span className="app-home-task-skel-btn app-home-task-skel-btn--status" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="app-home-task-list">
            <AnimatePresence mode="popLayout">
              {displayTodos.length === 0 ? (
                <motion.li
                  key="empty"
                  className="app-home-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {todos.length > 0 && filterSummary
                    ? `No tasks match “${filterSummary}” for this day. Try another view or date`
                    : 'No tasks due on this day. Add tasks with this due date or pick another day on the calendar'}
                </motion.li>
              ) : (
                displayTodos.map((t, i) => {
                  const catTheme = getTaskCategoryTheme(t.mainCategory, t.subCategory)
                  const { main: catMain, sub: catSub } = getCategoryLabels(
                    t.mainCategory,
                    t.subCategory,
                  )
                  return (
                  <motion.li
                    key={t.id}
                    className={
                      t.mainCategory && t.subCategory
                        ? 'app-home-task app-home-task--categorized'
                        : 'app-home-task'
                    }
                    style={
                      t.mainCategory && t.subCategory
                        ? {
                            background: catTheme.panelBg,
                            borderWidth: 4,
                            borderStyle: 'solid',
                            borderColor: catTheme.border,
                          }
                        : undefined
                    }
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.03 * i }}
                  >
                    <div className="app-home-task-main">
                      <span className="app-home-task-title">{t.title}</span>
                      {t.description ? (
                        <p className="app-home-task-desc">{t.description}</p>
                      ) : null}
                      {catMain && catSub ? (
                        <span className="app-home-task-cat-chip">
                          {catMain} – {catSub}
                        </span>
                      ) : null}
                      <span className="app-home-task-cat-chip">
                        Start {fmtDate(t.startDate)} · Deadline {fmtDate(t.dueDate)}
                      </span>
                      {t.project?.name ? (
                        <motion.button
                          type="button"
                          className="proj-edit-btn app-home-task-project-link"
                          onClick={() => {
                            if (t.project?.id) navigate(`/project/${t.project.id}`)
                          }}
                          whileTap={{ scale: 0.96 }}
                          whileHover={reduceMotion ? {} : { y: -1 }}
                        >
                          {t.project.name}
                        </motion.button>
                      ) : null}
                    </div>
                    <div className="proj-task-actions">
                      <motion.button
                        type="button"
                        className="proj-edit-btn"
                        onClick={(e) => {
                          setAppHomeModalFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
                          setEditingTask(t)
                        }}
                        whileTap={{ scale: 0.96 }}
                        whileHover={reduceMotion ? {} : { y: -1 }}
                      >
                        Edit
                      </motion.button>
                      <motion.button
                        type="button"
                        className="proj-edit-btn"
                        onClick={(e) => {
                          setAppHomeModalFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
                          setViewCommentsTask(t)
                        }}
                        whileTap={{ scale: 0.96 }}
                        whileHover={reduceMotion ? {} : { y: -1 }}
                      >
                        Comments
                      </motion.button>
                      <motion.button
                        type="button"
                        className="app-home-status-chip"
                        onClick={(e) => {
                          setAppHomeModalFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
                          setProgressTask(t)
                        }}
                        disabled={statusBusyId === t.id}
                        whileTap={{ scale: 0.96 }}
                      >
                        {statusBusyId === t.id ? '…' : statusLabel(t.status)}
                      </motion.button>
                    </div>
                  </motion.li>
                  )
                })
              )}
            </AnimatePresence>
          </ul>
        )}

        {!loading && totalPages > 1 ? (
          <div className="proj-pagination">
            <motion.button
              type="button"
              className="proj-pagination-btn"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              whileTap={{ scale: 0.96 }}
            >
              Previous
            </motion.button>
            <span className="proj-pagination-info">
              Page {page} of {totalPages}
            </span>
            <motion.button
              type="button"
              className="proj-pagination-btn"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
              whileTap={{ scale: 0.96 }}
            >
              Next
            </motion.button>
          </div>
        ) : null}
      </section>

      <AddProjectModal
        open={projectOpen}
        originRect={appHomeModalFlyRect}
        onSheetExitComplete={() => setAppHomeModalFlyRect(null)}
        onClose={() => setProjectOpen(false)}
        onCreated={onProjectCreated}
      />
      <AddTaskWithProjectModal
        open={addTaskFlowOpen}
        originRect={appHomeModalFlyRect}
        onSheetExitComplete={() => setAppHomeModalFlyRect(null)}
        onClose={() => setAddTaskFlowOpen(false)}
        projects={projects}
        projectsLoading={projectsLoading}
        projectsLoadError={projectsLoadError}
        projectsTruncated={projectsTruncated}
        userId={user?.id ?? null}
        todos={todos}
        selectedDate={selectedDate}
        onCreated={async () => {
          await load(1, statusFilter, sortConfig)
        }}
      />
      <SelectProjectModal
        open={selectProjectOpen}
        originRect={appHomeModalFlyRect}
        onSheetExitComplete={() => setAppHomeModalFlyRect(null)}
        onClose={() => setSelectProjectOpen(false)}
        viewFilter={viewFilter}
        onApplyViewFilter={setViewFilter}
        onOpenProject={(p) => navigate(`/project/${p.id}`)}
        userId={user?.id ?? null}
        todos={todos}
        selectedDate={selectedDate}
        projects={projects}
        projectsLoading={projectsLoading}
        projectsLoadError={projectsLoadError}
        projectsTruncated={projectsTruncated}
      />

      <SortViaPop
        open={sortViaOpen}
        originRect={appHomeModalFlyRect}
        onSheetExitComplete={() => setAppHomeModalFlyRect(null)}
        onClose={() => setSortViaOpen(false)}
        includeProjectStatus
        initialSort={sortConfig}
        onApply={(config) => {
          const nextSort = hasCustomHomeSort(config) ? config : null
          if (sameHomeSort(nextSort, sortConfig)) {
            setSortViaOpen(false)
            return
          }
          setSortConfig(nextSort)
          setSortViaOpen(false)
          setPage(1)
          load(1, statusFilter, nextSort)
        }}
      />

      <ConfirmPop
        open={rangePickConfirmOpen}
        skipDocumentScrollLock
        title="Clear date range?"
        message="This will clear your selected date range. Are you sure?"
        noLabel="Cancel"
        yesLabel="Clear & continue"
        onNo={() => {
          setRangePickConfirmOpen(false)
          setPendingPickedDate(null)
        }}
        onYes={() => {
          setRangePickConfirmOpen(false)
          const nextDate = pendingPickedDate
          setPendingPickedDate(null)
          setSortConfig((prev) => {
            if (!prev) return prev
            return { ...prev, dateFrom: undefined, dateTo: undefined }
          })
          if (nextDate) setSelectedDate(nextDate)
        }}
      />

      <AnimatePresence>
        {linksChooserOpen ? (
          <motion.div
            key="links-chooser"
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
              aria-labelledby={linksChooserTitleId}
              aria-describedby={linksChooserMsgId}
              className="ios-yn-confirm-sheet"
              style={{ position: 'relative' }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
              transition={
                reduceMotion
                  ? { duration: 0.15 }
                  : { type: 'spring', stiffness: 520, damping: 38 }
              }
              onClick={(e) => e.stopPropagation()}
            >
              <motion.button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setLinksChooserOpen(false)
                  setSaveLinkFlyRect(null)
                }}
                whileTap={{ scale: 0.9 }}
                whileHover={
                  reduceMotion ? {} : { backgroundColor: 'rgba(60, 60, 67, 0.12)' }
                }
                transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 1,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(60, 60, 67, 0.08)',
                  color: '#dc2626',
                  padding: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.button>
              <div
                className="ios-yn-confirm-body"
                style={{ paddingRight: 40 }}
              >
                <h2 id={linksChooserTitleId} className="ios-yn-confirm-title">
                  Links
                </h2>
                <p id={linksChooserMsgId} className="ios-yn-confirm-message">
                  Save a new link or open your saved links
                </p>
              </div>
              <div className="ios-yn-confirm-hrule" aria-hidden />
              <div className="ios-yn-confirm-actions">
                <button
                  type="button"
                  className="ios-yn-confirm-btn"
                  onClick={() => {
                    setLinksChooserOpen(false)
                    setSaveLinkFlyRect(null)
                    navigate('/saved-links')
                  }}
                >
                  See saved Links
                </button>
                <div className="ios-yn-confirm-vrule" aria-hidden />
                <button
                  type="button"
                  className="ios-yn-confirm-btn"
                  onClick={() => {
                    setLinksChooserOpen(false)
                    setSaveLinkOpen(true)
                  }}
                >
                  Add Link
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {notesChooserOpen ? (
          <motion.div
            key="notes-chooser"
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
              aria-labelledby={notesChooserTitleId}
              aria-describedby={notesChooserMsgId}
              className="ios-yn-confirm-sheet"
              style={{ position: 'relative' }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
              transition={
                reduceMotion
                  ? { duration: 0.15 }
                  : { type: 'spring', stiffness: 520, damping: 38 }
              }
              onClick={(e) => e.stopPropagation()}
            >
              <motion.button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setNotesChooserOpen(false)
                }}
                whileTap={{ scale: 0.9 }}
                whileHover={
                  reduceMotion ? {} : { backgroundColor: 'rgba(60, 60, 67, 0.12)' }
                }
                transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 1,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(60, 60, 67, 0.08)',
                  color: '#dc2626',
                  padding: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.button>
              <div
                className="ios-yn-confirm-body"
                style={{ paddingRight: 40 }}
              >
                <h2 id={notesChooserTitleId} className="ios-yn-confirm-title">
                  Note/To-Do
                </h2>
                <p id={notesChooserMsgId} className="ios-yn-confirm-message">
                  Save a new Note/To-Do or open your saved Notes/To-Do
                </p>
              </div>
              <div className="ios-yn-confirm-hrule" aria-hidden />
              <div className="ios-yn-confirm-actions">
                <button
                  type="button"
                  className="ios-yn-confirm-btn"
                  onClick={() => {
                    setNotesChooserOpen(false)
                    navigate('/note')
                  }}
                >
                  See Saved
                </button>
                <div className="ios-yn-confirm-vrule" aria-hidden />
                <button
                  type="button"
                  className="ios-yn-confirm-btn"
                  onClick={() => {
                    setNotesChooserOpen(false)
                    setAddNoteOriginRect(null)
                    setAddNoteOpen(true)
                  }}
                >
                  Add Notes/To-Do
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {addNewChooserOpen ? (
          <motion.div
            key="add-new-chooser"
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
              aria-labelledby={addNewChooserTitleId}
              aria-describedby={addNewChooserMsgId}
              className="ios-yn-confirm-sheet"
              style={{ position: 'relative' }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
              transition={
                reduceMotion
                  ? { duration: 0.15 }
                  : { type: 'spring', stiffness: 520, damping: 38 }
              }
              onClick={(e) => e.stopPropagation()}
            >
              <motion.button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setAddNewChooserOpen(false)
                  setAddNewFlyRect(null)
                }}
                whileTap={{ scale: 0.9 }}
                whileHover={
                  reduceMotion ? {} : { backgroundColor: 'rgba(60, 60, 67, 0.12)' }
                }
                transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 1,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(60, 60, 67, 0.08)',
                  color: '#dc2626',
                  padding: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.button>
              <div
                className="ios-yn-confirm-body"
                style={{ paddingRight: 40 }}
              >
                <h2 id={addNewChooserTitleId} className="ios-yn-confirm-title">
                  Add new
                </h2>
                <p id={addNewChooserMsgId} className="ios-yn-confirm-message">
                  Create a new task or a new project
                </p>
              </div>
              <div className="ios-yn-confirm-hrule" aria-hidden />
              <div className="ios-yn-confirm-actions">
                <button
                  type="button"
                  className="ios-yn-confirm-btn"
                  onClick={() => {
                    const r = addNewFlyRect
                    setAddNewChooserOpen(false)
                    setAppHomeModalFlyRect(r)
                    setAddNewFlyRect(null)
                    setAddTaskFlowOpen(true)
                  }}
                >
                  Add new task
                </button>
                <div className="ios-yn-confirm-vrule" aria-hidden />
                <button
                  type="button"
                  className="ios-yn-confirm-btn"
                  onClick={() => {
                    const r = addNewFlyRect
                    setAddNewChooserOpen(false)
                    setAppHomeModalFlyRect(r)
                    setAddNewFlyRect(null)
                    setProjectOpen(true)
                  }}
                >
                  Add new project
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SaveNewLinkModal
        open={saveLinkOpen}
        originRect={saveLinkFlyRect}
        onSheetExitComplete={() => setSaveLinkFlyRect(null)}
        onClose={() => setSaveLinkOpen(false)}
        onSaved={async (payload) => {
          await createSavedLink(payload)
        }}
      />

      <AddNote
        open={addNoteOpen}
        originRect={addNoteOriginRect}
        onClose={() => setAddNoteOpen(false)}
        onSheetExitComplete={() => setAddNoteOriginRect(null)}
        onSaved={() => {}}
      />

      <ViewCommentPop
        open={!!viewCommentsTask}
        originRect={appHomeModalFlyRect}
        onSheetExitComplete={() => setAppHomeModalFlyRect(null)}
        onClose={() => setViewCommentsTask(null)}
        task={viewCommentsTask}
      />

      <ProgressPop
        open={!!progressTask}
        originRect={appHomeModalFlyRect}
        onSheetExitComplete={() => setAppHomeModalFlyRect(null)}
        onClose={() => setProgressTask(null)}
        task={progressTask}
        onSubmit={async ({ status, comment, commentDate }) => {
          if (!progressTask) return
          await createTaskComment(progressTask.id, {
            comment,
            commentDate,
            status,
          })
          await load(page, statusFilter, sortConfig)
        }}
      />

      <EditTask
        open={!!editingTask}
        originRect={appHomeModalFlyRect}
        onSheetExitComplete={() => setAppHomeModalFlyRect(null)}
        onClose={() => setEditingTask(null)}
        task={editingTask}
        projectDateBounds={
          editingTask?.project
            ? {
                createdAt: editingTask.project.createdAt,
                expectedFinishDate: editingTask.project.expectedFinishDate,
              }
            : undefined
        }
        onSubmit={async (patch) => {
          if (!editingTask) return
          await patchTodo(editingTask.id, patch)
          await load(page, statusFilter, sortConfig)
        }}
        onDelete={async () => {
          if (!editingTask) return
          await deleteTodo(editingTask.id)
          await load(page, statusFilter, sortConfig)
        }}
      />
    </div>
  )
}
