import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AddTask } from '../components/AddTask.jsx'
import { EditTask } from '../components/EditTask.jsx'
import { EditProjectDetailsPop } from '../components/EditProjectDetailsPop.jsx'
import { ProgressPop } from '../components/ProgressPop.jsx'
import { ViewCommentPop } from '../components/ViewCommentPop.jsx'
import { SortViaPop } from '../components/SortViaPop.jsx'
import { SaveNewLinkModal } from '../components/SaveNewLinkModal.jsx'
import { AddNote } from '../components/AddNote.jsx'
import { AddProjectModal, SelectProjectModal } from './AppHomePage.jsx'
import {
  createSavedLink,
  createTodo,
  createTaskComment,
  deleteProject,
  deleteTodo,
  fetchProjectById,
  fetchProjects,
  patchProject,
  patchTodo,
} from '../lib/api'
import { startOfLocalDay } from '../lib/dateUtils'
import { getCategoryLabels, getTaskCategoryTheme } from '../lib/taskCategoryThemes'
import { clearSession, getStoredUser } from '../lib/session'
import './LoginPage.css'
import './AppHomePage.css'
import './ProjectPage.css'
import '../components/ConfirmPop.css'

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

function fmtProjectStatus(project) {
  const tags = Array.isArray(project?.statusTags) ? project.statusTags : []
  if (tags.length > 0) {
    const labelsByKey = {
      ACTIVE_PROJECT: 'Active project',
      INACTIVE_PROJECT: 'Inactive project',
      CRITICAL_BUG_PROJECT: 'Critical bug project',
      FUTURE_PROJECT: 'Future project',
      ARCHIVED_PROJECT: 'Archived project',
      FINISHED_PROJECT: 'Finished project',
      NON_FINISHED_PROJECT: 'Non finished project',
      ON_HOLD_PROJECT: 'On hold project',
      OVERDUE_PROJECT: 'Overdue project',
    }
    return tags.map((k) => labelsByKey[k] ?? k).join(', ')
  }
  return project?.status ?? '—'
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
        <svg viewBox="0 0 120 120" className="app-home-ring-svg" aria-hidden>
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

function normalizeProjectSort(config) {
  if (!config) return null
  return {
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
    showExpiredTasks: !!config.showExpiredTasks,
  }
}

function projectFetchSortOptions(sort) {
  return {
    sortBy: sort?.sortBy || undefined,
    sortDir: sort?.sortDir || undefined,
    categories: sort?.categories || undefined,
    subCategories: sort?.subCategories || undefined,
    dateField: sort?.dateField || undefined,
    dateFrom: sort?.dateFrom || undefined,
    dateTo: sort?.dateTo || undefined,
    showExpiredTasks: sort?.showExpiredTasks || undefined,
    expiredTodayStart: sort?.showExpiredTasks
      ? startOfLocalDay(new Date()).toISOString()
      : undefined,
  }
}

function sameProjectSort(a, b) {
  return (
    JSON.stringify(normalizeProjectSort(a)) ===
    JSON.stringify(normalizeProjectSort(b))
  )
}

function hasCustomProjectSort(config) {
  if (!config) return false
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

export default function ProjectPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const user = getStoredUser()
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [todos, setTodos] = useState([])
  const [headerLoading, setHeaderLoading] = useState(true)
  const [ringsLoading, setRingsLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)
  const [headerError, setHeaderError] = useState(null)
  const [contentError, setContentError] = useState(null)
  const [statusBusyId, setStatusBusyId] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editProjectOriginRect, setEditProjectOriginRect] = useState(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [newProjectOriginRect, setNewProjectOriginRect] = useState(null)
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [addTaskOriginRect, setAddTaskOriginRect] = useState(null)
  const [addTaskBusy, setAddTaskBusy] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editTaskOriginRect, setEditTaskOriginRect] = useState(null)
  const [progressTask, setProgressTask] = useState(null)
  const [progressOriginRect, setProgressOriginRect] = useState(null)
  const [viewCommentsTask, setViewCommentsTask] = useState(null)
  const [commentsOriginRect, setCommentsOriginRect] = useState(null)
  const [sortViaOpen, setSortViaOpen] = useState(false)
  const [sortViaOriginRect, setSortViaOriginRect] = useState(null)
  const [sortConfig, setSortConfig] = useState(null)
  const [selectProjectOpen, setSelectProjectOpen] = useState(false)
  const [selectProjectOriginRect, setSelectProjectOriginRect] = useState(null)
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
  const [spProjects, setSpProjects] = useState([])
  const [spProjectsLoading, setSpProjectsLoading] = useState(true)
  const [spProjectsLoadError, setSpProjectsLoadError] = useState(null)
  const [spProjectsTruncated, setSpProjectsTruncated] = useState(false)

  const [statusFilter, setStatusFilter] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [headerStats, setHeaderStats] = useState({ done: 0, inProgress: 0, notStarted: 0, total: 0 })
  const [ringStats, setRingStats] = useState({ done: 0, inProgress: 0, notStarted: 0, total: 0 })
  const [highlightTaskId, setHighlightTaskId] = useState(null)
  const taskRowRefs = useRef(new Map())
  const highlightTimerRef = useRef(null)

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

  const calendarDayFilter =
    typeof location.state?.calendarDayFilter === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(location.state.calendarDayFilter)
      ? location.state.calendarDayFilter
      : null
  const calendarTaskId =
    typeof location.state?.calendarTaskId === 'string'
      || typeof location.state?.calendarTaskId === 'number'
      ? String(location.state.calendarTaskId)
      : null

  const refreshProjects = useCallback(async () => {
    setSpProjectsLoading(true)
    try {
      setSpProjectsLoadError(null)
      const d = await fetchProjects()
      setSpProjects(d.projects ?? [])
      setSpProjectsTruncated(Boolean(d.truncated))
    } catch {
      setSpProjectsLoadError('Could not load projects. Try again in a moment')
    } finally {
      setSpProjectsLoading(false)
    }
  }, [])

  const refreshHeader = async (pg = page, filter = statusFilter, sort = sortConfig) => {
    if (!projectId) return
    setHeaderLoading(true)
    setHeaderError(null)
    try {
      const data = await fetchProjectById(projectId, {
        withTodos: true,
        page: pg,
        status: filter || undefined,
        ...projectFetchSortOptions(sort),
      })
      setProject(data.project ?? null)
      if (data.stats) setHeaderStats(data.stats)
    } catch (e) {
      setHeaderError(
        e instanceof Error ? e.message : 'Could not load project details',
      )
    } finally {
      setHeaderLoading(false)
    }
  }

  const refreshContent = async (pg = page, filter = statusFilter, sort = sortConfig) => {
    if (!projectId) return
    setRingsLoading(true)
    setListLoading(true)
    setContentError(null)
    try {
      const data = await fetchProjectById(projectId, {
        withTodos: true,
        page: pg,
        status: filter || undefined,
        ...projectFetchSortOptions(sort),
      })
      if (data.stats) setRingStats(data.stats)
      setTodos(data.todos ?? [])
      setPage(data.page ?? 1)
      setTotalPages(data.totalPages ?? 1)
    } catch (e) {
      setContentError(
        e instanceof Error ? e.message : 'Could not load project details',
      )
    } finally {
      setRingsLoading(false)
      setListLoading(false)
    }
  }

  const refreshAll = async (pg = page, filter = statusFilter, sort = sortConfig) => {
    await Promise.all([
      refreshHeader(pg, filter, sort),
      refreshContent(pg, filter, sort),
    ])
  }

  const resolveTaskPage = useCallback(async (taskId, sort) => {
    if (!projectId || !taskId) return 1
    const first = await fetchProjectById(projectId, {
      withTodos: true,
      page: 1,
      status: undefined,
      ...projectFetchSortOptions(sort),
    })
    const firstTodos = Array.isArray(first?.todos) ? first.todos : []
    if (firstTodos.some((t) => String(t?.id) === String(taskId))) return 1
    const lastPage = Math.max(1, Number(first?.totalPages || 1))
    for (let p = 2; p <= lastPage; p += 1) {
      const data = await fetchProjectById(projectId, {
        withTodos: true,
        page: p,
        status: undefined,
        ...projectFetchSortOptions(sort),
      })
      const todosOnPage = Array.isArray(data?.todos) ? data.todos : []
      if (todosOnPage.some((t) => String(t?.id) === String(taskId))) return p
    }
    return 1
  }, [projectId])

  useEffect(() => {
    const run = async () => {
      if (calendarDayFilter) {
      const calendarSort = {
        sortBy: 'date',
        sortDir: 'desc',
        dateField: 'start',
        dateOrder: 'desc',
        dateFrom: calendarDayFilter,
        dateTo: calendarDayFilter,
        commentSort: null,
        primarySort: 'date',
        categories: [],
        subCategories: [],
      }
      const targetPage = calendarTaskId
        ? await resolveTaskPage(calendarTaskId, calendarSort)
        : 1
      setSortConfig(calendarSort)
      setStatusFilter(null)
      setPage(targetPage)
      refreshAll(targetPage, null, calendarSort)
      return
    }
      refreshAll(1, statusFilter)
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, calendarDayFilter, calendarTaskId, resolveTaskPage])

  useEffect(() => {
    if (!calendarTaskId || listLoading) return
    const taskExists = todos.some((t) => String(t?.id) === String(calendarTaskId))
    if (!taskExists) return
    const row = taskRowRefs.current.get(String(calendarTaskId))
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      })
    }
    setHighlightTaskId(String(calendarTaskId))
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightTaskId(null)
      highlightTimerRef.current = null
    }, 2200)
  }, [calendarTaskId, listLoading, todos, reduceMotion])

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (selectProjectOpen) refreshProjects()
  }, [selectProjectOpen, refreshProjects])

  const handleSignOut = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

  const onProjectCreated = async (newProject) => {
    await refreshProjects()
    if (newProject?.id) {
      navigate(`/project/${newProject.id}`)
    }
  }

  const handleFilterChange = (filter) => {
    const next = statusFilter === filter ? null : filter
    setStatusFilter(next)
    setPage(1)
    refreshContent(1, next, sortConfig)
  }

  const goToPage = (pg) => {
    setPage(pg)
    refreshContent(pg, statusFilter, sortConfig)
  }

  const cycleTaskStatus = async (todo) => {
    const next = nextStatus(todo.status)
    setStatusBusyId(todo.id)
    try {
      await patchTodo(todo.id, { status: next })
      await refreshAll(page, statusFilter, sortConfig)
    } catch (e) {
      setContentError(
        e instanceof Error ? e.message : 'Could not update the task',
      )
    } finally {
      setStatusBusyId(null)
    }
  }

  const taskSkeletonCount = Math.max(1, Math.min(6, todos.length || 3))

  return (
    <div className="app-home-root project-page-root">
      <motion.header
        className="app-home-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <div className="app-home-header-inner">
          <div>
            <h1 className="app-home-title">{project?.name ?? 'Project'}</h1>
            
            <div className="project-page-header-btns">
              <motion.button
                type="button"
                className="app-home-toolbar-btn"
                onClick={(e) => {
                  setEditProjectOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
                  setEditOpen(true)
                }}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                disabled={!project}
              >
                Edit project details
              </motion.button>
              <motion.button
                type="button"
                className="app-home-toolbar-btn"
                onClick={(e) => {
                  setAddNewFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
                  setAddNewChooserOpen(true)
                }}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                disabled={!project}
              >
                Add new
              </motion.button>
              <motion.button
                type="button"
                className="app-home-toolbar-btn"
                onClick={(e) => {
                  setSelectProjectOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
                  setSelectProjectOpen(true)
                }}
                whileTap={{ scale: 0.97 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                Select project
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
            </div>
          </div>
          <div className="app-home-header-actions">
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={() => navigate('/app-home')}
              whileTap={{ scale: 0.98 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Home
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

      <section className="app-home-section">
        {headerLoading ? (
          <div className="proj-header-skeleton" aria-hidden>
            <span className="proj-header-skeleton-line proj-header-skeleton-line--status" />
            <span className="proj-header-skeleton-line proj-header-skeleton-line--meta" />
            <span className="proj-header-skeleton-line proj-header-skeleton-line--stats" />
          </div>
        ) : null}
        {headerError ? (
          <p role="alert" className="login-error app-home-banner">
            {headerError}
          </p>
        ) : null}
        {!headerLoading && !headerError ? (
          <>
            <p className="app-home-muted" style={{ marginBottom: 14 }}>
              Status: {fmtProjectStatus(project)} 
            </p>
            <p className="app-home-muted" style={{ marginBottom: 14 }}>
              S/N #{project?.serialNumber ?? '—'} | Created on {fmtDate(project?.createdAt)} | Expected finish{' '}
              {fmtDate(project?.expectedFinishDate)}
            </p>
            <p className="app-home-muted" style={{ marginBottom: 16 }}>
              Total tasks {headerStats.total} | Done {headerStats.done} | In progress {headerStats.inProgress}
              {' | '}Not started {headerStats.notStarted}
            </p>
          </>
        ) : null}

        {contentError ? (
          <p role="alert" className="login-error app-home-banner">
            {contentError}
          </p>
        ) : null}
        {!contentError ? (
          <div className="app-home-rings" style={{ marginBottom: 16 }}>
              <StatRing
                label="Done"
                value={ringStats.done}
                total={ringStats.total}
                stroke="#3d8a6e"
                reduceMotion={!!reduceMotion}
                loading={ringsLoading}
              />
              <StatRing
                label="In progress"
                value={ringStats.inProgress}
                total={ringStats.total}
                stroke="#3d6b9a"
                reduceMotion={!!reduceMotion}
                loading={ringsLoading}
              />
              <StatRing
                label="Not started"
                value={ringStats.notStarted}
                total={ringStats.total}
                stroke="rgb(209, 171, 25)"
                reduceMotion={!!reduceMotion}
                loading={ringsLoading}
              />
          </div>
        ) : null}

        {!contentError ? (
          <>
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
                  sortConfig
                    ? 'proj-filter-btn proj-filter-btn--active'
                    : 'proj-filter-btn'
                }
                onClick={(e) => {
                  setSortViaOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
                  setSortViaOpen(true)
                }}
                whileTap={{ scale: 0.96 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
              >
                Sort via
              </motion.button>
            </div>

            {listLoading ? (
              <ul className="app-home-task-list" aria-hidden>
                {Array.from({ length: taskSkeletonCount }).map((_, i) => (
                  <li
                    key={`task-skel-${i}`}
                    className="app-home-task proj-task-skeleton"
                  >
                    <div className="app-home-task-main">
                      <span className="proj-task-skel-line proj-task-skel-line--title" />
                      <span className="proj-task-skel-line proj-task-skel-line--desc" />
                      <span className="proj-task-skel-line proj-task-skel-line--desc proj-task-skel-line--desc-short" />
                      <span className="proj-task-skel-chip" />
                      <span className="proj-task-skel-chip proj-task-skel-chip--wide" />
                    </div>
                    <div className="proj-task-actions">
                      <span className="proj-task-skel-btn" />
                      <span className="proj-task-skel-btn" />
                      <span className="proj-task-skel-btn proj-task-skel-btn--status" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="app-home-task-list">
                {todos.length === 0 ? (
                  <li className="app-home-empty">
                    {statusFilter
                      ? `No ${statusLabel(statusFilter).toLowerCase()} tasks`
                      : 'No tasks in this project yet'}
                  </li>
                ) : (
                  todos.map((t, i) => {
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
                          ? `app-home-task app-home-task--categorized${String(t.id) === highlightTaskId ? ' proj-task-focus-highlight' : ''}`
                          : `app-home-task${String(t.id) === highlightTaskId ? ' proj-task-focus-highlight' : ''}`
                      }
                      ref={(el) => {
                        const key = String(t.id)
                        if (el) taskRowRefs.current.set(key, el)
                        else taskRowRefs.current.delete(key)
                      }}
                      style={
                        t.mainCategory && t.subCategory
                          ? {
                              background: catTheme.panelBg,
                              borderWidth: 4,
                              borderStyle: 'solid',
                              borderColor: catTheme.border,
                              '--task-border-color': catTheme.border,
                            }
                          : undefined
                      }
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.02 * i }}
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
                      </div>
                      <div className="proj-task-actions">
                        <motion.button
                          type="button"
                          className="proj-edit-btn"
                          onClick={(e) => {
                            setEditTaskOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
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
                            setCommentsOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
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
                            setProgressOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
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
              </ul>
            )}

            {totalPages > 1 ? (
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
          </>
        ) : null}
      </section>

      <EditProjectDetailsPop
        open={editOpen}
        onClose={() => setEditOpen(false)}
        originRect={editProjectOriginRect}
        onSheetExitComplete={() => setEditProjectOriginRect(null)}
        initialName={project?.name ?? ''}
        initialStatusTags={project?.statusTags ?? []}
        initialCreatedAt={project?.createdAt}
        initialExpectedFinishDate={project?.expectedFinishDate}
        onSave={async (body) => {
          if (!projectId) return
          await patchProject(projectId, body)
          await refreshAll(page, statusFilter, sortConfig)
        }}
        onDelete={async () => {
          if (!projectId) return
          await deleteProject(projectId)
          window.setTimeout(() => {
            navigate('/app-home')
          }, 2000)
        }}
      />

      <AddProjectModal
        open={projectOpen}
        onClose={() => setProjectOpen(false)}
        originRect={newProjectOriginRect}
        onSheetExitComplete={() => setNewProjectOriginRect(null)}
        onCreated={onProjectCreated}
      />

      <SortViaPop
        open={sortViaOpen}
        onClose={() => setSortViaOpen(false)}
        originRect={sortViaOriginRect}
        onSheetExitComplete={() => setSortViaOriginRect(null)}
        initialSort={sortConfig}
        onApply={(config) => {
          const nextSort = hasCustomProjectSort(config) ? config : null
          if (sameProjectSort(nextSort, sortConfig)) {
            setSortViaOpen(false)
            return
          }
          setSortConfig(nextSort)
          setSortViaOpen(false)
          setPage(1)
          refreshContent(1, statusFilter, nextSort)
        }}
      />

      <ViewCommentPop
        open={!!viewCommentsTask}
        onClose={() => setViewCommentsTask(null)}
        originRect={commentsOriginRect}
        onSheetExitComplete={() => setCommentsOriginRect(null)}
        task={viewCommentsTask}
      />

      <ProgressPop
        open={!!progressTask}
        onClose={() => setProgressTask(null)}
        originRect={progressOriginRect}
        onSheetExitComplete={() => setProgressOriginRect(null)}
        task={progressTask}
        onSubmit={async ({ status, comment, commentDate }) => {
          if (!progressTask) return
          await createTaskComment(progressTask.id, {
            comment,
            commentDate,
            status,
          })
          await refreshAll(page, statusFilter, sortConfig)
        }}
      />

      <EditTask
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        originRect={editTaskOriginRect}
        onSheetExitComplete={() => setEditTaskOriginRect(null)}
        task={editingTask}
        projectDateBounds={
          project
            ? {
                createdAt: project.createdAt,
                expectedFinishDate: project.expectedFinishDate,
              }
            : undefined
        }
        onSubmit={async (patch) => {
          if (!editingTask) return
          await patchTodo(editingTask.id, patch)
          await refreshAll(page, statusFilter, sortConfig)
        }}
        onDelete={async () => {
          if (!editingTask) return
          await deleteTodo(editingTask.id)
          await refreshAll(page, statusFilter, sortConfig)
        }}
      />

      <AddTask
        open={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        originRect={addTaskOriginRect}
        onSheetExitComplete={() => setAddTaskOriginRect(null)}
        busy={addTaskBusy}
        projectDateBounds={
          project
            ? {
                createdAt: project.createdAt,
                expectedFinishDate: project.expectedFinishDate,
              }
            : undefined
        }
        onSubmit={async ({
          title,
          description,
          mainCategory,
          subCategory,
          startDate,
          dueDate,
        }) => {
          if (!projectId) return
          setAddTaskBusy(true)
          try {
            await createTodo({
              title,
              description: description || undefined,
              projectId,
              mainCategory,
              subCategory,
              startDate: startDate || undefined,
              dueDate: dueDate || undefined,
            })
            await refreshAll(1, statusFilter, sortConfig)
          } finally {
            setAddTaskBusy(false)
          }
        }}
      />

      <SelectProjectModal
        open={selectProjectOpen}
        onClose={() => setSelectProjectOpen(false)}
        originRect={selectProjectOriginRect}
        onSheetExitComplete={() => setSelectProjectOriginRect(null)}
        viewFilter={{ kind: 'project', id: projectId }}
        onApplyViewFilter={() => {}}
        onOpenProject={(p) => {
          setSelectProjectOpen(false)
          navigate(`/project/${p.id}`)
        }}
        userId={user?.id ?? null}
        todos={[]}
        selectedDate={new Date()}
        projects={spProjects}
        projectsLoading={spProjectsLoading}
        projectsLoadError={spProjectsLoadError}
        projectsTruncated={spProjectsTruncated}
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
                    setAddTaskOpen(true)
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
                    setNewProjectOriginRect(r)
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
    </div>
  )
}

