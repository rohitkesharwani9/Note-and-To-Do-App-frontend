import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  createSavedLink,
  fetchProjects,
  fetchProjectsForCalendarRange,
  fetchTodosForCalendarRange,
} from '../lib/api'
import { isValidDateInput, toInputDate } from '../lib/dateInputLocal'
import { clearSession, getStoredUser } from '../lib/session'
import './LoginPage.css'
import './AppHomePage.css'
import '../components/CalendarStrip.css'
import './CalendarPage.css'
import '../components/ConfirmPop.css'
import { AddTaskWithProjectModal } from '../components/AddTaskWithProjectModal.jsx'
import { AddNote } from '../components/AddNote.jsx'
import { SaveNewLinkModal } from '../components/SaveNewLinkModal.jsx'
import { CalendarDateTaskPop } from '../components/CalendarDateTaskPop.jsx'
import { AddProjectModal } from './AppHomePage.jsx'

function startOfDayLocal(input) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function monthTitle(date) {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function weekdayLabels() {
  const base = new Date()
  const labels = []
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base)
    d.setDate(base.getDate() - base.getDay() + i)
    labels.push(
      d.toLocaleDateString(undefined, {
        weekday: 'short',
      }),
    )
  }
  return labels
}

function monthGrid(monthCursor) {
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
  const monthStart = new Date(first)
  monthStart.setDate(first.getDate() - first.getDay())
  const days = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(monthStart)
    d.setDate(monthStart.getDate() + i)
    const inMonth = d.getMonth() === monthCursor.getMonth()
    days.push({
      date: d,
      inMonth,
    })
  }
  return days
}

/** ISO bounds for the 6×7 grid (tasks/projects overlapping any visible cell). */
function calendarGridRangeIso(monthCursor) {
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())
  const gridEnd = new Date(gridStart)
  gridEnd.setDate(gridStart.getDate() + 41)
  gridEnd.setHours(23, 59, 59, 999)
  return { fromIso: gridStart.toISOString(), toIso: gridEnd.toISOString() }
}

function tasksOverlappingDay(todos, day) {
  const dayStart = startOfDayLocal(day)
  if (!dayStart) return []
  const t0 = dayStart.getTime()
  return todos.filter((todo) => {
    if (todo?.status === 'DONE') return false
    const start = todo?.startDate ? startOfDayLocal(todo.startDate) : null
    const due = todo?.dueDate ? startOfDayLocal(todo.dueDate) : null
    const from = start ?? due
    const to = due ?? start
    if (!from || !to) return false
    const ft = Math.min(from.getTime(), to.getTime())
    const tt = Math.max(from.getTime(), to.getTime())
    return t0 >= ft && t0 <= tt
  })
}

function loadClassForCount(count) {
  if (count === 0) return 'calendar-cell--load-0'
  if (count <= 3) return 'calendar-cell--load-1-3'
  if (count <= 5) return 'calendar-cell--load-4-5'
  if (count <= 7) return 'calendar-cell--load-6-7'
  return 'calendar-cell--load-8-plus'
}

function projectsOverlappingDay(projects, day) {
  const dayStart = startOfDayLocal(day)
  if (!dayStart) return []
  const t0 = dayStart.getTime()
  return projects.filter((p) => {
    const start = p?.createdAt ? startOfDayLocal(p.createdAt) : null
    const end = p?.expectedFinishDate ? startOfDayLocal(p.expectedFinishDate) : null
    const from = start ?? end
    const to = end ?? start
    if (!from || !to) return false
    const ft = Math.min(from.getTime(), to.getTime())
    const tt = Math.max(from.getTime(), to.getTime())
    return t0 >= ft && t0 <= tt
  })
}

/** Plain rect for modal fly animation; uses parent if the button has no usable box. */
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

export default function CalendarPage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const user = getStoredUser()
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [todos, setTodos] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [viewMode, setViewMode] = useState('task')
  const [datePopOpen, setDatePopOpen] = useState(false)
  const [datePopDay, setDatePopDay] = useState(null)
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false)
  const [addTaskOriginRect, setAddTaskOriginRect] = useState(null)
  const [addTaskPrefillStartDate, setAddTaskPrefillStartDate] = useState(null)
  const [addTaskSelectedDate, setAddTaskSelectedDate] = useState(() => new Date())
  const [modalProjects, setModalProjects] = useState([])
  const [modalProjectsLoading, setModalProjectsLoading] = useState(true)
  const [modalProjectsLoadError, setModalProjectsLoadError] = useState(null)
  const [modalProjectsTruncated, setModalProjectsTruncated] = useState(false)
  const [addProjectModalOpen, setAddProjectModalOpen] = useState(false)
  const [addProjectOriginRect, setAddProjectOriginRect] = useState(null)
  const [addProjectPrefillCreatedDate, setAddProjectPrefillCreatedDate] =
    useState(null)
  const [linksChooserOpen, setLinksChooserOpen] = useState(false)
  const [saveLinkOpen, setSaveLinkOpen] = useState(false)
  const [saveLinkFlyRect, setSaveLinkFlyRect] = useState(null)
  const linksChooserTitleId = useId()
  const linksChooserMsgId = useId()
  const [notesChooserOpen, setNotesChooserOpen] = useState(false)
  const notesChooserTitleId = useId()
  const notesChooserMsgId = useId()
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [addNoteOriginRect, setAddNoteOriginRect] = useState(null)
  const [addNewChooserOpen, setAddNewChooserOpen] = useState(false)
  const [addNewFlyRect, setAddNewFlyRect] = useState(null)
  const addNewChooserTitleId = useId()
  const addNewChooserMsgId = useId()
  const [toolbarMonthNav, setToolbarMonthNav] = useState(null)
  const [toolbarMonthSlideKey, setToolbarMonthSlideKey] = useState(0)
  const toolbarMonthNavRef = useRef(null)
  const toolbarMonthExitDoneRef = useRef(false)
  const [quickStripNav, setQuickStripNav] = useState(null)
  const [quickStripSlideKey, setQuickStripSlideKey] = useState(0)
  const quickStripNavRef = useRef(null)
  const quickStripExitDoneRef = useRef(false)
  /** Only swap the page to “Loading calendar…” on first load; month changes keep the grid mounted so scroll position stays stable. */
  const isInitialCalendarFetchRef = useRef(true)
  const [mobileProjectCellCompact, setMobileProjectCellCompact] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 768px)').matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onChange = () => setMobileProjectCellCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    toolbarMonthNavRef.current = toolbarMonthNav
  }, [toolbarMonthNav])

  useEffect(() => {
    quickStripNavRef.current = quickStripNav
  }, [quickStripNav])

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

  const calendarMonthSlideBusy = !!toolbarMonthNav || !!quickStripNav

  const calendarGridIsoRange = useMemo(
    () => calendarGridRangeIso(monthCursor),
    [monthCursor.getFullYear(), monthCursor.getMonth()],
  )

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (isInitialCalendarFetchRef.current) {
        setLoading(true)
      } else {
        setTodos([])
        setProjects([])
      }
      setLoadError(null)
      try {
        const { fromIso, toIso } = calendarGridIsoRange
        const [todoData, projData] = await Promise.all([
          fetchTodosForCalendarRange(fromIso, toIso),
          fetchProjectsForCalendarRange(fromIso, toIso),
        ])
        if (cancelled) return
        setTodos(Array.isArray(todoData?.todos) ? todoData.todos : [])
        setProjects(Array.isArray(projData?.projects) ? projData.projects : [])
      } catch (e) {
        if (cancelled) return
        setLoadError(
          e instanceof Error ? e.message : 'Could not load calendar data. Try again shortly',
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
          isInitialCalendarFetchRef.current = false
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [calendarGridIsoRange])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setModalProjectsLoading(true)
      setModalProjectsLoadError(null)
      try {
        const d = await fetchProjects()
        if (cancelled) return
        setModalProjects(d.projects ?? [])
        setModalProjectsTruncated(d?.truncated === true)
      } catch {
        if (cancelled) return
        setModalProjects([])
        setModalProjectsTruncated(false)
        setModalProjectsLoadError(
          'We could not load your projects. Try again in a moment',
        )
      } finally {
        if (!cancelled) setModalProjectsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const handleAddNewTaskFromDatePop = (e) => {
    if (e?.currentTarget) {
      setAddTaskOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
    }
    if (!datePopDay) return
    const ymd = toInputDate(datePopDay)
    setAddTaskPrefillStartDate(isValidDateInput(ymd) ? ymd : null)
    setAddTaskSelectedDate(new Date(datePopDay.getTime()))
    setDatePopOpen(false)
    setAddTaskModalOpen(true)
  }

  const handleAddNewProjectFromDatePop = (e) => {
    if (e?.currentTarget) {
      setAddProjectOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
    }
    if (!datePopDay) return
    const ymd = toInputDate(datePopDay)
    setAddProjectPrefillCreatedDate(isValidDateInput(ymd) ? ymd : null)
    setDatePopOpen(false)
    setAddProjectModalOpen(true)
  }

  const handleProjectCreatedFromCalendar = async () => {
    try {
      const { fromIso, toIso } = calendarGridIsoRange
      const [todoData, projData, fullProjData] = await Promise.all([
        fetchTodosForCalendarRange(fromIso, toIso),
        fetchProjectsForCalendarRange(fromIso, toIso),
        fetchProjects(),
      ])
      setTodos(Array.isArray(todoData?.todos) ? todoData.todos : [])
      setProjects(Array.isArray(projData?.projects) ? projData.projects : [])
      setModalProjects(fullProjData.projects ?? [])
      setModalProjectsTruncated(fullProjData?.truncated === true)
    } catch {
      /* keep existing data on refresh failure */
    }
  }

  const activeRanges = useMemo(() => {
    return todos
      .filter((t) => t?.status !== 'DONE')
      .map((t) => {
        const start = t?.startDate ? startOfDayLocal(t.startDate) : null
        const due = t?.dueDate ? startOfDayLocal(t.dueDate) : null
        const from = start ?? due
        const to = due ?? start
        if (!from || !to) return null
        if (from.getTime() <= to.getTime()) return { from, to }
        return { from: to, to: from }
      })
      .filter(Boolean)
  }, [todos])

  const projectRanges = useMemo(() => {
    return projects
      .map((p) => {
        const start = p?.createdAt ? startOfDayLocal(p.createdAt) : null
        const end = p?.expectedFinishDate ? startOfDayLocal(p.expectedFinishDate) : null
        const from = start ?? end
        const to = end ?? start
        if (!from || !to) return null
        if (from.getTime() <= to.getTime()) return { from, to }
        return { from: to, to: from }
      })
      .filter(Boolean)
  }, [projects])

  const weekDays = useMemo(() => weekdayLabels(), [])
  const gridDays = useMemo(() => monthGrid(monthCursor), [monthCursor])
  const now = useMemo(() => startOfDayLocal(new Date()), [])
  const currentMonthStart = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }, [])
  const monthDiffFromCurrent =
    (monthCursor.getFullYear() - currentMonthStart.getFullYear()) * 12 +
    (monthCursor.getMonth() - currentMonthStart.getMonth())

  const countMapForRanges = (ranges) => {
    const map = new Map()
    for (const cell of gridDays) {
      const day = cell.date
      const iso = day.toISOString().slice(0, 10)
      if (!cell.inMonth) {
        map.set(iso, 0)
        continue
      }
      let count = 0
      for (const range of ranges) {
        if (day.getTime() >= range.from.getTime() && day.getTime() <= range.to.getTime()) {
          count += 1
        }
      }
      map.set(iso, count)
    }
    return map
  }

  const taskCountsByIsoDay = useMemo(
    () => countMapForRanges(activeRanges),
    [gridDays, activeRanges],
  )
  const projectCountsByIsoDay = useMemo(
    () => countMapForRanges(projectRanges),
    [gridDays, projectRanges],
  )

  const handleSignOut = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

  const datePopTasks = useMemo(() => {
    if (!datePopDay) return []
    return tasksOverlappingDay(todos, datePopDay)
  }, [todos, datePopDay])

  const datePopProjects = useMemo(() => {
    if (!datePopDay) return []
    return projectsOverlappingDay(projects, datePopDay)
  }, [projects, datePopDay])

  const openDatePop = (day) => {
    const d = startOfDayLocal(day)
    if (!d) return
    setDatePopDay(d)
    setDatePopOpen(true)
  }

  const handleToolbarMonthSlideComplete = (idx) => {
    if (idx !== 41) return
    const nav = toolbarMonthNavRef.current
    if (!nav) return
    if (nav.phase === 'exit') {
      if (toolbarMonthExitDoneRef.current) return
      toolbarMonthExitDoneRef.current = true
      setMonthCursor((m) => {
        const y = m.getFullYear()
        const mo = m.getMonth()
        return nav.dir === 'next'
          ? new Date(y, mo + 1, 1)
          : new Date(y, mo - 1, 1)
      })
      setToolbarMonthSlideKey((k) => k + 1)
      setToolbarMonthNav({ dir: nav.dir, phase: 'enter' })
    } else if (nav.phase === 'enter') {
      setToolbarMonthNav(null)
      toolbarMonthExitDoneRef.current = false
    }
  }

  const handleQuickStripSlideComplete = (idx) => {
    if (idx !== 41) return
    const nav = quickStripNavRef.current
    if (!nav) return
    if (nav.phase === 'exit') {
      if (quickStripExitDoneRef.current) return
      quickStripExitDoneRef.current = true
      setMonthCursor(nav.target)
      setQuickStripSlideKey((k) => k + 1)
      setQuickStripNav({ phase: 'enter' })
    } else if (nav.phase === 'enter') {
      setQuickStripNav(null)
      quickStripExitDoneRef.current = false
    }
  }

  const handleCalendarMonthSlideComplete = (idx) => {
    if (toolbarMonthNavRef.current) {
      handleToolbarMonthSlideComplete(idx)
      return
    }
    handleQuickStripSlideComplete(idx)
  }

  const startQuickStripMonthNav = (targetMonth) => {
    const t = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
    const cur = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
    if (t.getTime() === cur.getTime()) return
    if (reduceMotion) {
      setMonthCursor(t)
      return
    }
    if (calendarMonthSlideBusy) return
    quickStripExitDoneRef.current = false
    setQuickStripNav({ phase: 'exit', target: t })
    setQuickStripSlideKey((k) => k + 1)
  }

  return (
    <div className="app-home-root calendar-page-root">
      <motion.header
        className="app-home-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <div className="app-home-header-inner">
          <div>
            <h1 className="app-home-title">Calendar</h1>
            <p className="app-home-greet">
              Hi, <strong>{user?.firstName?.trim() || 'there'}</strong>
            </p>
          </div>
          <div className="app-home-header-actions">
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={() => navigate('/app-home')}
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: -1 }}
            >
              Home
            </motion.button>
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={handleSignOut}
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: -1 }}
            >
              Sign out
            </motion.button>
          </div>
        </div>
      </motion.header>

      <section className="app-home-section calendar-page-shell">
        <div className="calendar-add-task-toolbar-row">
          <motion.button
            type="button"
            className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
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
            className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
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
            className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
            onClick={() => setNotesChooserOpen(true)}
            whileTap={{ scale: 0.97 }}
            whileHover={reduceMotion ? {} : { y: -1 }}
          >
            Notes
          </motion.button>
        </div>
        <div className="calendar-month-quick-row cal-strip-quick-dates">
          <motion.button
            type="button"
            className={monthDiffFromCurrent === -1 ? 'cal-strip-quick cal-strip-quick--active' : 'cal-strip-quick'}
            disabled={calendarMonthSlideBusy}
            onClick={() =>
              startQuickStripMonthNav(
                new Date(
                  currentMonthStart.getFullYear(),
                  currentMonthStart.getMonth() - 1,
                  1,
                ),
              )
            }
            whileTap={{ scale: 0.97 }}
            whileHover={calendarMonthSlideBusy ? {} : { y: -1 }}
          >
            Previouse month
          </motion.button>
          <motion.button
            type="button"
            className={monthDiffFromCurrent === 0 ? 'cal-strip-quick cal-strip-quick--active' : 'cal-strip-quick'}
            disabled={calendarMonthSlideBusy}
            onClick={() =>
              startQuickStripMonthNav(
                new Date(
                  currentMonthStart.getFullYear(),
                  currentMonthStart.getMonth(),
                  1,
                ),
              )
            }
            whileTap={{ scale: 0.97 }}
            whileHover={calendarMonthSlideBusy ? {} : { y: -1 }}
          >
            Current month
          </motion.button>
          <motion.button
            type="button"
            className={monthDiffFromCurrent === 1 ? 'cal-strip-quick cal-strip-quick--active' : 'cal-strip-quick'}
            disabled={calendarMonthSlideBusy}
            onClick={() =>
              startQuickStripMonthNav(
                new Date(
                  currentMonthStart.getFullYear(),
                  currentMonthStart.getMonth() + 1,
                  1,
                ),
              )
            }
            whileTap={{ scale: 0.97 }}
            whileHover={calendarMonthSlideBusy ? {} : { y: -1 }}
          >
            Next month
          </motion.button>
        </div>
        <div className="calendar-toolbar">
          <motion.button
            type="button"
            className="app-home-toolbar-btn"
            disabled={calendarMonthSlideBusy}
            onClick={() => {
              if (reduceMotion) {
                setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                return
              }
              if (calendarMonthSlideBusy) return
              toolbarMonthExitDoneRef.current = false
              setToolbarMonthNav({ dir: 'prev', phase: 'exit' })
              setToolbarMonthSlideKey((k) => k + 1)
            }}
            whileTap={{ scale: 0.97 }}
            whileHover={calendarMonthSlideBusy ? {} : { y: -1 }}
          >
            Previous
          </motion.button>
          <h2 className="calendar-month-title">{monthTitle(monthCursor)}</h2>
          <motion.button
            type="button"
            className="app-home-toolbar-btn"
            disabled={calendarMonthSlideBusy}
            onClick={() => {
              if (reduceMotion) {
                setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                return
              }
              if (calendarMonthSlideBusy) return
              toolbarMonthExitDoneRef.current = false
              setToolbarMonthNav({ dir: 'next', phase: 'exit' })
              setToolbarMonthSlideKey((k) => k + 1)
            }}
            whileTap={{ scale: 0.97 }}
            whileHover={calendarMonthSlideBusy ? {} : { y: -1 }}
          >
            Next
          </motion.button>
        </div>

        {loadError ? (
          <p role="alert" className="login-error app-home-banner">
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <div className="calendar-skeleton-shell" aria-hidden>
            <div className="calendar-skeleton-toggle" />
            <div className="calendar-skeleton-grid-shell">
              <div className="calendar-weekdays">
                {weekDays.map((w) => (
                  <span key={`skel-${w}`} className="calendar-weekday">
                    {w}
                  </span>
                ))}
              </div>
              <div className="calendar-grid">
                {Array.from({ length: 42 }).map((_, idx) => (
                  <div key={`calendar-skel-cell-${idx}`} className="calendar-cell calendar-cell-skeleton" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
          <LayoutGroup>
            <div
              className="calendar-view-toggle"
              role="group"
              aria-label="Calendar view: tasks or projects"
            >
              <motion.button
                type="button"
                className="calendar-view-toggle-seg"
                onClick={() => setViewMode('task')}
                aria-pressed={viewMode === 'task'}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                layout
              >
                {viewMode === 'task' ? (
                  <motion.div
                    layoutId="calendar-view-mode-pill"
                    className="calendar-view-toggle-pill"
                    transition={{
                      type: 'spring',
                      stiffness: 440,
                      damping: 34,
                    }}
                    aria-hidden
                  />
                ) : null}
                <span
                  className={
                    viewMode === 'task'
                      ? 'calendar-view-toggle-label calendar-view-toggle-label--active'
                      : 'calendar-view-toggle-label'
                  }
                >
                  Task wise
                </span>
              </motion.button>
              <motion.button
                type="button"
                className="calendar-view-toggle-seg"
                onClick={() => setViewMode('project')}
                aria-pressed={viewMode === 'project'}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                layout
              >
                {viewMode === 'project' ? (
                  <motion.div
                    layoutId="calendar-view-mode-pill"
                    className="calendar-view-toggle-pill"
                    transition={{
                      type: 'spring',
                      stiffness: 440,
                      damping: 34,
                    }}
                    aria-hidden
                  />
                ) : null}
                <span
                  className={
                    viewMode === 'project'
                      ? 'calendar-view-toggle-label calendar-view-toggle-label--active'
                      : 'calendar-view-toggle-label'
                  }
                >
                  Project wise
                </span>
              </motion.button>
            </div>
          </LayoutGroup>
          <div
            className={
              calendarMonthSlideBusy
                ? 'calendar-grid-shell calendar-grid-shell--toolbar-month-nav'
                : 'calendar-grid-shell'
            }
          >
            <div className="calendar-weekdays">
              {weekDays.map((w) => (
                <span key={w} className="calendar-weekday">
                  {w}
                </span>
              ))}
            </div>

            <div className="calendar-grid">
              {gridDays.map((cell, idx) => {
                const day = cell.date
                const iso = day.toISOString().slice(0, 10)
                const taskCount = taskCountsByIsoDay.get(iso) ?? 0
                const projectCount = projectCountsByIsoDay.get(iso) ?? 0
                const inMonth = cell.inMonth
                const isToday = now && day.getTime() === now.getTime()
                const taskLoad = loadClassForCount(taskCount)
                const projectLoad = loadClassForCount(projectCount)
                const col = idx % 7
                const row = Math.floor(idx / 7)
                const flipStagger = reduceMotion ? 0 : col * 0.022 + row * 0.032
                const flipAngle = viewMode === 'task' ? 0 : 180
                const tbPhase = toolbarMonthNav?.phase
                const tbDir = toolbarMonthNav?.dir
                const qsPhase = quickStripNav?.phase
                const useToolbarSlide = toolbarMonthNav != null
                const useQuickSlide = quickStripNav != null

                let navSlideInitial
                let navSlideAnimate
                let navSlideTransition

                if (useToolbarSlide) {
                  const exitDelayNext = reduceMotion ? 0 : col * 0.042
                  const exitDelayPrev = reduceMotion ? 0 : (6 - col) * 0.042
                  const enterDelayNext = reduceMotion ? 0 : (6 - col) * 0.036
                  const enterDelayPrev = reduceMotion ? 0 : col * 0.036
                  const exitDelayTb =
                    tbDir === 'prev' ? exitDelayPrev : exitDelayNext
                  const enterDelayTb =
                    tbDir === 'prev' ? enterDelayPrev : enterDelayNext
                  navSlideInitial =
                    tbPhase === 'enter'
                      ? tbDir === 'prev'
                        ? { x: '-62%', opacity: 0, y: 0 }
                        : { x: '62%', opacity: 0, y: 0 }
                      : { x: 0, opacity: 1, y: 0 }
                  navSlideAnimate =
                    tbPhase === 'exit'
                      ? tbDir === 'prev'
                        ? { x: '128%', opacity: 0, y: 0 }
                        : { x: '-128%', opacity: 0, y: 0 }
                      : { x: 0, opacity: 1, y: 0 }
                  navSlideTransition =
                    tbPhase === 'exit'
                      ? {
                          delay: exitDelayTb,
                          duration: 0.48,
                          ease: [0.4, 0, 0.2, 1],
                        }
                      : tbPhase === 'enter'
                        ? {
                            delay: enterDelayTb,
                            duration: 0.52,
                            ease: [0.16, 1, 0.3, 1],
                          }
                        : { duration: 0 }
                } else if (useQuickSlide) {
                  const exitDelayQ = reduceMotion ? 0 : row * 0.042
                  const enterDelayQ = reduceMotion ? 0 : row * 0.036
                  navSlideInitial =
                    qsPhase === 'enter'
                      ? { x: 0, y: '-62%', opacity: 0 }
                      : { x: 0, y: 0, opacity: 1 }
                  navSlideAnimate =
                    qsPhase === 'exit'
                      ? { x: 0, y: '128%', opacity: 0 }
                      : { x: 0, y: 0, opacity: 1 }
                  navSlideTransition =
                    qsPhase === 'exit'
                      ? {
                          delay: exitDelayQ,
                          duration: 0.48,
                          ease: [0.4, 0, 0.2, 1],
                        }
                      : qsPhase === 'enter'
                        ? {
                            delay: enterDelayQ,
                            duration: 0.52,
                            ease: [0.16, 1, 0.3, 1],
                          }
                        : { duration: 0 }
                } else {
                  navSlideInitial = { x: 0, y: 0, opacity: 1 }
                  navSlideAnimate = { x: 0, y: 0, opacity: 1 }
                  navSlideTransition = { duration: 0 }
                }

                const activePhase = useToolbarSlide ? tbPhase : useQuickSlide ? qsPhase : null

                const outerInitial =
                  activePhase === 'enter'
                    ? navSlideInitial
                    : reduceMotion
                      ? { opacity: 0, x: 0, y: 0 }
                      : { opacity: 0, y: 10, x: 0 }

                const outerAnimate =
                  activePhase === 'exit' || activePhase === 'enter'
                    ? navSlideAnimate
                    : reduceMotion
                      ? { opacity: 1, x: 0, y: 0 }
                      : { opacity: 1, y: 0, x: 0 }

                const outerTransition =
                  activePhase === 'exit' || activePhase === 'enter'
                    ? navSlideTransition
                    : reduceMotion
                      ? { duration: 0.15, delay: idx * 0.004 }
                      : {
                          delay: idx * 0.005,
                          type: 'spring',
                          stiffness: 380,
                          damping: 28,
                        }

                if (!inMonth) {
                  return (
                    <motion.div
                      key={`${toolbarMonthSlideKey}-${quickStripSlideKey}-${idx}`}
                      className="calendar-cell-empty calendar-cell-empty--slide-host"
                      aria-hidden
                      initial={navSlideInitial}
                      animate={navSlideAnimate}
                      transition={navSlideTransition}
                      onAnimationComplete={() => handleCalendarMonthSlideComplete(idx)}
                    />
                  )
                }

                return (
                  <motion.div
                    key={iso}
                    role="button"
                    tabIndex={0}
                    className={
                      isToday
                        ? 'calendar-cell calendar-cell--flip-root calendar-cell--today'
                        : 'calendar-cell calendar-cell--flip-root'
                    }
                    initial={outerInitial}
                    animate={outerAnimate}
                    transition={outerTransition}
                    onAnimationComplete={() => handleCalendarMonthSlideComplete(idx)}
                    onClick={() => {
                      if (calendarMonthSlideBusy) return
                      openDatePop(day)
                    }}
                    onKeyDown={(e) => {
                      if (calendarMonthSlideBusy) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openDatePop(day)
                      }
                    }}
                  >
                    <div className="calendar-cell-slide-layer">
                      <motion.div
                        className="calendar-cell-flip-inner"
                        style={{ transformStyle: 'preserve-3d' }}
                        initial={{ rotateY: flipAngle }}
                        animate={{ rotateY: flipAngle }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : {
                                delay: flipStagger,
                                duration: 0.68,
                                ease: [0.45, 0.03, 0.22, 0.99],
                              }
                        }
                      >
                        <div
                          className={`calendar-cell-face calendar-cell-face--front ${taskLoad}`}
                          aria-hidden={viewMode === 'project'}
                        >
                          <span className="calendar-day-num">{day.getDate()}</span>
                          <span className="calendar-day-count">
                            {taskCount} {taskCount <= 1 ? 'Task' : 'Tasks'}
                          </span>
                        </div>
                        <div
                          className={`calendar-cell-face calendar-cell-face--back ${projectLoad}`}
                          aria-hidden={viewMode === 'task'}
                        >
                          <span className="calendar-day-num">{day.getDate()}</span>
                          <span className="calendar-day-count">
                            {mobileProjectCellCompact ? (
                              <>P: {projectCount}</>
                            ) : (
                              <>
                                {projectCount}{' '}
                                {projectCount === 1 ? 'project' : 'projects'}
                              </>
                            )}
                          </span>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
          <AddProjectModal
            open={addProjectModalOpen}
            onClose={() => {
              setAddProjectModalOpen(false)
              setAddProjectPrefillCreatedDate(null)
            }}
            originRect={addProjectOriginRect}
            onSheetExitComplete={() => setAddProjectOriginRect(null)}
            prefillCreatedDate={addProjectPrefillCreatedDate}
            onCreated={handleProjectCreatedFromCalendar}
          />
          <AddTaskWithProjectModal
            open={addTaskModalOpen}
            onClose={() => {
              setAddTaskModalOpen(false)
              setAddTaskPrefillStartDate(null)
            }}
            originRect={addTaskOriginRect}
            onSheetExitComplete={() => setAddTaskOriginRect(null)}
            projects={modalProjects}
            projectsLoading={modalProjectsLoading}
            projectsLoadError={modalProjectsLoadError}
            projectsTruncated={modalProjectsTruncated}
            userId={user?.id ?? null}
            todos={todos}
            selectedDate={addTaskSelectedDate}
            prefillTaskStartDate={addTaskPrefillStartDate}
            onCreated={async () => {
              try {
                const { fromIso, toIso } = calendarGridIsoRange
                const [todoData, projData] = await Promise.all([
                  fetchTodosForCalendarRange(fromIso, toIso),
                  fetchProjectsForCalendarRange(fromIso, toIso),
                ])
                setTodos(Array.isArray(todoData?.todos) ? todoData.todos : [])
                setProjects(
                  Array.isArray(projData?.projects) ? projData.projects : [],
                )
              } catch {
                /* keep existing grid on refresh failure */
              }
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
                        setAddTaskOriginRect(r)
                        setAddNewFlyRect(null)
                        const d = new Date()
                        const ymd = toInputDate(d)
                        setAddTaskPrefillStartDate(isValidDateInput(ymd) ? ymd : null)
                        setAddTaskSelectedDate(new Date(d.getTime()))
                        setAddTaskModalOpen(true)
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
                        setAddProjectOriginRect(r)
                        setAddProjectPrefillCreatedDate(null)
                        setAddNewFlyRect(null)
                        setAddProjectModalOpen(true)
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
          <CalendarDateTaskPop
            open={datePopOpen}
            onClose={() => setDatePopOpen(false)}
            day={datePopDay}
            viewMode={viewMode}
            tasks={datePopTasks}
            projects={datePopProjects}
            onAddNewTask={handleAddNewTaskFromDatePop}
            onAddNewProject={handleAddNewProjectFromDatePop}
          />
          </>
        )}
      </section>
    </div>
  )
}
