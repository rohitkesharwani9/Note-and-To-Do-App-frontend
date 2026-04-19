import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { CalendarMonthPicker } from './CalendarStrip'
import { SharedErrorBanner } from './SharedErrorBanner'
import { createTodo, fetchProjectsByStatusTag, searchProjectsDatabase } from '../lib/api'
import { startOfLocalDay } from '../lib/dateUtils'
import {
  filterProjectsForModalList,
  getViewModesForSelect,
  selectValueToViewFilter,
  viewKindToStatusTag,
  viewFilterToSelectValue,
} from '../lib/projectViewFilter.js'
import { PROJECT_SEARCH_MAX, PROJECT_SEARCH_MIN } from '../lib/inputLimits'
import { loadRecentProjectIds } from '../lib/recentProjects.js'
import {
  isValidDateInput,
  startOfDay,
  toInputDate,
} from '../lib/dateInputLocal'
import { createModalFlySheetVariants } from '../lib/modalFlyVariants.js'
import {
  TASK_CATEGORY_TREE,
  getTaskCategoryTheme,
  sortSubsByIntensity,
} from '../lib/taskCategoryThemes'
import '../pages/LoginPage.css'
import '../pages/AppHomePage.css'
import './AddTask.css'
import './ConfirmPop.css'

const DESCRIPTION_MAX = 500
/** Matches `.app-home-add-task-flow-sheet` in AppHomePage.css */
const ADD_TASK_WITH_PROJECT_FLY_VARIANTS = createModalFlySheetVariants(680, 760)
const ADD_TASK_DESC_FLOW_SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 42,
  mass: 0.72,
}

/** Same chevron as Add task popup category / sub category rows */
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

export function AddTaskWithProjectModal({
  open,
  onClose,
  projects = [],
  projectsLoading = false,
  projectsLoadError = null,
  projectsTruncated = false,
  userId = null,
  todos = [],
  selectedDate = new Date(),
  /** When set (yyyy-mm-dd), Task details start date is prefilled when the modal opens */
  prefillTaskStartDate = null,
  onCreated,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const firstPanelSpring = reduceMotion
    ? { duration: 0.2 }
    : { type: 'spring', stiffness: 380, damping: 34 }
  const firstPanelTap = reduceMotion ? {} : { scale: 0.97 }
  const firstPanelListPresence = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: 'easeOut' }
  const descriptionFieldTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            layout: ADD_TASK_DESC_FLOW_SPRING,
            opacity: ADD_TASK_DESC_FLOW_SPRING,
          },
    [reduceMotion],
  )
  const addTaskConfirmTitleId = useId()
  const addTaskConfirmMessageId = useId()
  const [firstMode, ...otherModes] = useMemo(
    () => getViewModesForSelect(),
    [],
  )
  const [search, setSearch] = useState('')
  const [modalListFilter, setModalListFilter] = useState({ kind: 'all' })
  const [serverHits, setServerHits] = useState(null)
  const [dbSearchLoading, setDbSearchLoading] = useState(false)
  const [dbSearchError, setDbSearchError] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectLocked, setProjectLocked] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState('project')
  const [projectPage, setProjectPage] = useState(0)
  const [projectListPaging, setProjectListPaging] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mainCategory, setMainCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  /** After successful create: show on Add task button, then close after delay */
  const [saveSucceeded, setSaveSucceeded] = useState(false)
  const [err, setErr] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [openCalendarFor, setOpenCalendarFor] = useState(null)
  const descriptionBlurTimerRef = useRef(null)
  const saveSuccessTimerRef = useRef(null)
  const descriptionInputRef = useRef(null)
  const [descriptionFocused, setDescriptionFocused] = useState(false)
  /** Expanded category row in Task details: main | sub | null — same as Add task popup */
  const [mobilePanel, setMobilePanel] = useState(null)
  const descriptionFieldCompact = !descriptionFocused

  useEffect(() => {
    if (!open) return
    setSearch('')
    setModalListFilter({ kind: 'all' })
    setServerHits(null)
    setDbSearchLoading(false)
    setDbSearchError(null)
    setSelectedProject(null)
    setProjectLocked(false)
    setExpandedPanel('project')
    setProjectPage(0)
    setTitle('')
    setDescription('')
    setMainCategory('')
    setSubCategory('')
    const prefillYmd =
      typeof prefillTaskStartDate === 'string' &&
      isValidDateInput(prefillTaskStartDate.trim().slice(0, 10))
        ? prefillTaskStartDate.trim().slice(0, 10)
        : ''
    setStartDate(prefillYmd)
    setDueDate('')
    setBusy(false)
    setSaveSucceeded(false)
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setErr(null)
    setConfirmOpen(false)
    setOpenCalendarFor(null)
    setDescriptionFocused(false)
    setMobilePanel(null)
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
      descriptionBlurTimerRef.current = null
    }
  }, [open, prefillTaskStartDate])

  useEffect(() => {
    if (open) return undefined
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setSaveSucceeded(false)
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
      descriptionBlurTimerRef.current = null
    }
    return undefined
  }, [open])

  const parseDateOrTodayAddTask = (val) => {
    const d = val ? new Date(val) : null
    return d && !Number.isNaN(d.getTime()) ? d : new Date()
  }

  const handleCloseModal = () => {
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setSaveSucceeded(false)
    setConfirmOpen(false)
    setOpenCalendarFor(null)
    onClose?.()
  }

  const handleTaskTitleFocus = () => {
    descriptionInputRef.current?.blur()
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
      descriptionBlurTimerRef.current = null
    }
    setDescriptionFocused(false)
  }

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

  const handleTaskOptionRowMouseDown = (e) => {
    e.preventDefault()
  }

  const toggleMobilePanel = (panel) => {
    if (!projectLocked || busy) return
    descriptionInputRef.current?.blur()
    setErr(null)
    if (panel === 'sub' && !mainCategory) return
    setDescriptionFocused(false)
    setMobilePanel((prev) => (prev === panel ? null : panel))
  }

  const handleCategoryChipPick = (key) => {
    if (!projectLocked || busy) return
    descriptionInputRef.current?.blur()
    setErr(null)
    setMainCategory(key)
    setSubCategory('')
    setMobilePanel(null)
    setDescriptionFocused(false)
  }

  const handleSubCategoryChipPick = (key) => {
    if (!projectLocked || busy) return
    descriptionInputRef.current?.blur()
    setErr(null)
    setSubCategory(key)
    setMobilePanel(null)
    setDescriptionFocused(false)
  }

  const handleDescriptionBlur = (e) => {
    const next = e.relatedTarget
    if (next instanceof Element && next.closest?.('.add-task-cat-acc')) {
      return
    }
    if (next instanceof Element && next.closest?.('.app-home-add-task-flow-after-desc')) {
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

  const filteredProjects = useMemo(() => {
    const source = serverHits ?? listByModalFilter
    const q = search.trim().toLowerCase()
    if (!q) return source
    if (q.length < PROJECT_SEARCH_MIN) return []
    return source.filter((p) => String(p?.name ?? '').toLowerCase().includes(q))
  }, [serverHits, listByModalFilter, search])
  const searchTrim = search.trim()
  const searchTooShort = searchTrim.length > 0 && searchTrim.length < PROJECT_SEARCH_MIN

  const handleViewSelectChange = (e) => {
    setModalListFilter(selectValueToViewFilter(e.target.value, null, null))
    setServerHits(null)
    setProjectPage(0)
  }

  const pageSize = 3
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize))
  const safePage = Math.min(projectPage, totalPages - 1)
  const pagedProjects = filteredProjects.slice(safePage * pageSize, safePage * pageSize + pageSize)

  useEffect(() => {
    if (projectPage !== safePage) setProjectPage(safePage)
  }, [projectPage, safePage])

  useEffect(() => {
    if (!projectListPaging) return undefined
    const t = window.setTimeout(() => setProjectListPaging(false), 300)
    return () => window.clearTimeout(t)
  }, [safePage, projectListPaging])

  const canUseGet = projectsTruncated === true && projects.length >= 200
  const shouldStatusFetch =
    canUseGet &&
    search.trim().length === 0 &&
    modalListFilter?.kind &&
    modalListFilter.kind !== 'all' &&
    Boolean(viewKindToStatusTag(modalListFilter.kind))

  const handleDatabaseSearch = async () => {
    if (!canUseGet) return
    const q = search.trim()
    if (!shouldStatusFetch && q.length < PROJECT_SEARCH_MIN) return
    setDbSearchLoading(true)
    setDbSearchError(null)
    try {
      if (shouldStatusFetch) {
        const tag = viewKindToStatusTag(modalListFilter.kind)
        if (!tag) return
        const data = await fetchProjectsByStatusTag(tag)
        setServerHits(data.projects ?? [])
      } else {
        const data = await searchProjectsDatabase(q)
        setServerHits(data.projects ?? [])
      }
      setProjectPage(0)
    } catch (e) {
      setDbSearchError(
        e instanceof Error ? e.message : 'Could not search the database',
      )
    } finally {
      setDbSearchLoading(false)
    }
  }
  const showGetHint =
    serverHits === null &&
    searchTrim.length >= PROJECT_SEARCH_MIN &&
    filteredProjects.length === 0 &&
    canUseGet
  const statusModeSelected = Boolean(viewKindToStatusTag(modalListFilter?.kind))

  const helperMessage = searchTooShort
    ? `Enter at least ${PROJECT_SEARCH_MIN} characters to search (up to ${PROJECT_SEARCH_MAX})`
    : statusModeSelected &&
        searchTrim.length === 0 &&
        canUseGet &&
        serverHits === null
      ? 'Click Get button and fetch the result according to selected project status.'
      : statusModeSelected &&
          searchTrim.length === 0 &&
          filteredProjects.length === 0 &&
          (serverHits !== null || !canUseGet)
        ? 'No project found.'
      : canUseGet && serverHits === null && searchTrim.length === 0
      ? 'Project list may be larger than 200. Press Get to fetch results from database.'
      : showGetHint
        ? 'Click Get button and fetch the result from database.'
        : searchTrim.length >= PROJECT_SEARCH_MIN && filteredProjects.length === 0
          ? 'No projects match your search.'
          : ''

  const selectedMainDef = useMemo(
    () => TASK_CATEGORY_TREE.find((m) => m.key === mainCategory) ?? null,
    [mainCategory],
  )
  const subsOrdered = useMemo(
    () => sortSubsByIntensity(selectedMainDef?.subs ?? []),
    [selectedMainDef],
  )

  const subDef = useMemo(
    () => subsOrdered.find((s) => s.key === subCategory) ?? null,
    [subsOrdered, subCategory],
  )

  const projectDateBoundsError = useMemo(() => {
    if (!selectedProject?.createdAt || !selectedProject?.expectedFinishDate) return ''
    if (!startDate || !dueDate) return ''
    if (!isValidDateInput(startDate) || !isValidDateInput(dueDate)) return ''
    const pkCreated = String(selectedProject.createdAt).slice(0, 10)
    const pkFinish = String(selectedProject.expectedFinishDate).slice(0, 10)
    if (startDate < pkCreated || startDate > pkFinish) {
      return `Start date must be within project period (${fmtDate(pkCreated)} - ${fmtDate(pkFinish)}).`
    }
    if (dueDate < pkCreated || dueDate > pkFinish) {
      return `Deadline must be within project period (${fmtDate(pkCreated)} - ${fmtDate(pkFinish)}).`
    }
    return ''
  }, [selectedProject, startDate, dueDate])

  const dateOrderError = useMemo(() => {
    if (!startDate || !dueDate) return ''
    if (!isValidDateInput(startDate) || !isValidDateInput(dueDate)) return ''
    const s = startOfDay(startDate)
    const d = startOfDay(dueDate)
    if (s && d && s > d) return 'Start date cannot be after deadline.'
    return ''
  }, [startDate, dueDate])

  const addTaskModalNeutralBorder = 'rgba(255, 255, 255, 0.42)'
  const addTaskSheetFrameStyle = useMemo(() => {
    if (!mainCategory) {
      return {
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: addTaskModalNeutralBorder,
        boxSizing: 'border-box',
      }
    }
    if (!subCategory) {
      const t = getTaskCategoryTheme(mainCategory, '')
      return {
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: t.border,
        boxSizing: 'border-box',
      }
    }
    const t = getTaskCategoryTheme(mainCategory, subCategory)
    return {
      borderWidth: 4,
      borderStyle: 'solid',
      borderColor: t.border,
      boxSizing: 'border-box',
    }
  }, [mainCategory, subCategory])

  const addTask = async () => {
    const t = title.trim()
    const desc = description.trim()
    if (!selectedProject?.id) { setErr('Select a project first.'); return }
    if (t.length < 4 || t.length > 30) { setErr('Title must be 4-30 characters.'); return }
    if (!mainCategory || !subCategory) { setErr('Select main and sub category.'); return }
    if (!startDate || !dueDate) { setErr('Select start date and deadline.'); return }
    if (dateOrderError || projectDateBoundsError) { setErr(dateOrderError || projectDateBoundsError); return }
    setBusy(true)
    setErr(null)
    try {
      await createTodo({
        title: t,
        description: desc || undefined,
        projectId: selectedProject.id,
        mainCategory,
        subCategory,
        startDate,
        dueDate,
      })
      setConfirmOpen(false)
      setSaveSucceeded(true)
      onCreated?.()
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = setTimeout(() => {
        saveSuccessTimerRef.current = null
        setSaveSucceeded(false)
        onClose?.()
      }, 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add task.')
    } finally {
      setBusy(false)
    }
  }

  const openConfirmIfValid = () => {
    const t = title.trim()
    if (!selectedProject?.id) {
      setErr('Select a project first.')
      return
    }
    if (t.length < 4 || t.length > 30) {
      setErr('Title must be 4-30 characters.')
      return
    }
    if (!mainCategory || !subCategory) {
      setErr('Select main and sub category.')
      return
    }
    if (!startDate || !dueDate) {
      setErr('Select start date and deadline.')
      return
    }
    if (dateOrderError || projectDateBoundsError) {
      setErr(dateOrderError || projectDateBoundsError)
      return
    }
    setErr(null)
    setConfirmOpen(true)
  }

  const firstExpanded = expandedPanel === 'project'
  const secondExpanded = expandedPanel === 'task' && projectLocked

  const sheetFlyTransition = reduceMotion
    ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
    : { type: 'spring', stiffness: 360, damping: 30, mass: 0.72 }

  return (
    <AnimatePresence onExitComplete={onSheetExitComplete}>
      {open ? (
        <motion.div
          key="add-task-with-project-backdrop"
          className="modal-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            // Opacity 0 still captures clicks; disable hit-testing as soon as exit runs
            pointerEvents: 'none',
          }}
          transition={{
            duration: reduceMotion ? 0.15 : 0.38,
            ease: [0.22, 0.61, 0.36, 1],
          }}
        >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-with-project-title"
        className="modal-sheet app-home-add-task-flow-sheet"
        style={{ ...addTaskSheetFrameStyle, transformOrigin: 'center center' }}
        onClick={(e) => e.stopPropagation()}
        custom={{ rect: originRect, reduceMotion }}
        variants={ADD_TASK_WITH_PROJECT_FLY_VARIANTS}
        initial="fromOrigin"
        animate="expanded"
        exit={() => ({
          ...ADD_TASK_WITH_PROJECT_FLY_VARIANTS.fromOrigin({ rect: originRect, reduceMotion }),
          pointerEvents: 'none',
        })}
        transition={sheetFlyTransition}
      >
        <h2 id="add-task-with-project-title" className="modal-title">Add new task</h2>

            <motion.div
              layout
              transition={firstPanelSpring}
              className={
                firstExpanded
                  ? 'app-home-add-task-flow-box'
                  : 'app-home-add-task-flow-box app-home-add-task-flow-box--compact'
              }
            >
              {firstExpanded ? (
                <motion.div layout transition={firstPanelSpring}>
                  <motion.label
                    layout
                    className="login-field-label"
                    transition={firstPanelSpring}
                  >
                    Select project
                  </motion.label>
                  <motion.div layout transition={firstPanelSpring}>
                    <select
                      className="login-input app-home-project-view-select"
                      value={viewFilterToSelectValue(modalListFilter)}
                      onChange={handleViewSelectChange}
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
                    </select>
                  </motion.div>
                  <motion.label
                    layout
                    className="login-field-label"
                    style={{ marginTop: 8 }}
                    transition={firstPanelSpring}
                  >
                    Search projects
                  </motion.label>
                  <motion.div
                    layout
                    className="app-home-project-search-row"
                    transition={firstPanelSpring}
                  >
                    <motion.input
                      layout
                      type="search"
                      className="login-input"
                      placeholder="Search project..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      transition={firstPanelSpring}
                    />
                    <motion.button
                      layout
                      type="button"
                      className="modal-btn modal-btn-primary app-home-project-get-btn"
                      onClick={handleDatabaseSearch}
                      disabled={
                        !canUseGet ||
                        dbSearchLoading ||
                        (!shouldStatusFetch && search.trim().length < PROJECT_SEARCH_MIN)
                      }
                      whileTap={firstPanelTap}
                      transition={firstPanelSpring}
                    >
                      {dbSearchLoading ? '...' : 'Get'}
                    </motion.button>
                  </motion.div>
                  <AnimatePresence initial={false} mode="sync">
                    {projectsLoadError ? (
                      <motion.div
                        key="proj-err-load"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={firstPanelListPresence}
                      >
                        <SharedErrorBanner className="app-home-modal-error app-home-modal-error--after-title">{projectsLoadError}</SharedErrorBanner>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence initial={false} mode="sync">
                    {dbSearchError ? (
                      <motion.div
                        key="db-err"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={firstPanelListPresence}
                      >
                        <SharedErrorBanner className="app-home-modal-error app-home-modal-error--after-title">{dbSearchError}</SharedErrorBanner>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence initial={false} mode="sync">
                    {!projectsLoading && !projectsLoadError && helperMessage ? (
                      <motion.p
                        key="helper-msg"
                        className="app-home-muted app-home-search-hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={firstPanelListPresence}
                      >
                        {helperMessage}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                  {!projectsLoadError ? (
                    <>
                      <motion.ul
                        className="app-home-project-pick-list app-home-project-pick-list--paged app-home-project-pick-list--three"
                        layout
                        transition={firstPanelSpring}
                      >
                        {projectsLoading || projectListPaging
                          ? [0, 1, 2].map((i) => (
                              <li key={`proj-skel-${i}`}>
                                <div
                                  className="app-home-project-pick app-home-project-pick--skeleton"
                                  aria-hidden
                                >
                                  <span className="app-home-project-pick-name">
                                    <span
                                      className={`app-home-project-pick-skel-line app-home-project-pick-skel-line--${['a', 'b', 'c'][i]}`}
                                    />
                                  </span>
                                </div>
                              </li>
                            ))
                          : pagedProjects.map((p, idx) => (
                              <motion.li
                                key={p.id}
                                layout
                                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  ...firstPanelListPresence,
                                  delay: reduceMotion ? 0 : idx * 0.04,
                                }}
                              >
                                <motion.button
                                  type="button"
                                  className={selectedProject?.id === p.id ? 'app-home-project-pick app-home-project-pick--active' : 'app-home-project-pick'}
                                  onClick={() => {
                                    setSelectedProject(p)
                                    setProjectLocked(true)
                                    setExpandedPanel('task')
                                  }}
                                  whileTap={firstPanelTap}
                                  layout
                                  transition={firstPanelSpring}
                                >
                                  <span className="app-home-project-pick-name">{p.name}</span>
                                </motion.button>
                              </motion.li>
                            ))}
                      </motion.ul>
                      {!projectsLoading && (filteredProjects.length > 3 || selectedProject) ? (
                        <motion.div
                          layout
                          className="app-home-project-page-nav app-home-project-page-nav--split"
                          transition={firstPanelSpring}
                        >
                          <div className="app-home-project-page-nav-left">
                            {filteredProjects.length > 3 ? (
                              <>
                                <motion.button
                                  type="button"
                                  className="app-home-project-page-btn"
                                  disabled={safePage <= 0}
                                  onClick={() => {
                                    setProjectListPaging(true)
                                    setProjectPage((p) => Math.max(0, p - 1))
                                  }}
                                  whileTap={firstPanelTap}
                                  layout
                                  transition={firstPanelSpring}
                                >
                                  {'<'}
                                </motion.button>
                                <motion.span
                                  key={`${safePage}-${totalPages}`}
                                  className="app-home-project-page-meta"
                                  layout
                                  initial={reduceMotion ? false : { opacity: 0.6 }}
                                  animate={{ opacity: 1 }}
                                  transition={firstPanelListPresence}
                                >
                                  {`${safePage + 1} / ${totalPages}`}
                                </motion.span>
                                <motion.button
                                  type="button"
                                  className="app-home-project-page-btn"
                                  disabled={safePage >= totalPages - 1}
                                  onClick={() => {
                                    setProjectListPaging(true)
                                    setProjectPage((p) => Math.min(totalPages - 1, p + 1))
                                  }}
                                  whileTap={firstPanelTap}
                                  layout
                                  transition={firstPanelSpring}
                                >
                                  {'>'}
                                </motion.button>
                              </>
                            ) : null}
                          </div>
                          <div className="app-home-project-page-nav-right">
                            <AnimatePresence initial={false} mode="sync">
                              {selectedProject ? (
                                <motion.button
                                  key="select-proj"
                                  type="button"
                                  className="modal-btn modal-btn-primary"
                                  onClick={() => {
                                    setProjectLocked(true)
                                    setExpandedPanel('task')
                                  }}
                                  initial={{ opacity: 0, scale: 0.96 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.96 }}
                                  transition={firstPanelListPresence}
                                  whileTap={firstPanelTap}
                                  layout
                                >
                                  Select project
                                </motion.button>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      ) : null}
                    </>
                  ) : null}
                  <motion.div className="modal-actions" style={{ marginTop: 10 }} layout transition={firstPanelSpring}>
                    <motion.button
                      type="button"
                      className="modal-btn modal-btn-secondary"
                      onClick={handleCloseModal}
                      disabled={busy}
                      whileTap={busy ? {} : firstPanelTap}
                      layout
                      transition={firstPanelSpring}
                    >
                      Close
                    </motion.button>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.button
                  layout
                  transition={firstPanelSpring}
                  type="button"
                  className="app-home-add-task-flow-collapsed"
                  onClick={() => setExpandedPanel('project')}
                >
                  Project: <strong>{selectedProject?.name || 'Select project'}</strong>
                </motion.button>
              )}
            </motion.div>

            <motion.div
              layout
              transition={firstPanelSpring}
              className={
                secondExpanded
                  ? 'app-home-add-task-flow-box'
                  : 'app-home-add-task-flow-box app-home-add-task-flow-box--compact'
              }
            >
              {secondExpanded ? (
                <motion.div layout transition={firstPanelSpring}>
                  <LayoutGroup id="app-home-add-task-desc-flow">
                    <label className="login-field-label">Task details</label>
                    <input
                      className="login-input"
                      placeholder="Task title"
                      value={title}
                      maxLength={30}
                      onChange={(e) => {
                        setTitle(e.target.value)
                        if (err === 'Title must be 4-30 characters.') setErr(null)
                      }}
                      onFocus={handleTaskTitleFocus}
                      disabled={!projectLocked || busy}
                    />
                    <motion.label
                      layout
                      transition={descriptionFieldTransition}
                      className="login-field-label add-task-label-spaced"
                      htmlFor="add-task-with-project-desc"
                    >
                      Description
                    </motion.label>
                    <motion.textarea
                      ref={descriptionInputRef}
                      id="add-task-with-project-desc"
                      layout
                      className={
                        descriptionFieldCompact
                          ? 'login-input add-task-textarea add-task-textarea--title'
                          : 'login-input add-task-textarea add-task-textarea--body'
                      }
                      rows={descriptionFieldCompact ? 1 : 5}
                      placeholder="Add context, steps, or links (optional)"
                      value={description}
                      maxLength={DESCRIPTION_MAX}
                      onChange={(e) => setDescription(e.target.value)}
                      onFocus={handleDescriptionFocus}
                      onBlur={handleDescriptionBlur}
                      disabled={!projectLocked || busy}
                      transition={descriptionFieldTransition}
                      aria-describedby="add-task-with-project-desc-hint"
                    />
                    <motion.p
                      layout
                      transition={descriptionFieldTransition}
                      id="add-task-with-project-desc-hint"
                      className="add-task-char-hint"
                    >
                      Up to {DESCRIPTION_MAX} characters · {description.length}/{DESCRIPTION_MAX}
                    </motion.p>
                  </LayoutGroup>
                  <div className="app-home-add-task-flow-after-desc">
                    <LayoutGroup id="app-home-add-task-fields-flow">
                      <div
                        className="add-task-cat-acc"
                        role="group"
                        aria-label="Task options"
                        style={{ marginTop: 10 }}
                      >
                        <motion.div
                          layout
                          transition={descriptionFieldTransition}
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
                            disabled={!projectLocked || busy}
                            onMouseDown={handleTaskOptionRowMouseDown}
                            onClick={() => toggleMobilePanel('main')}
                          >
                            <span className="add-task-m-row-label">Category</span>
                            <span className="add-task-m-row-trail">
                              <span className="add-task-m-row-value">
                                {selectedMainDef?.label ?? 'Select'}
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
                                key="add-task-with-project-slot-main"
                                className="add-task-m-slot"
                                aria-labelledby="add-task-with-project-m-slot-main-h"
                                initial={reduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={descriptionFieldTransition}
                              >
                                <p
                                  id="add-task-with-project-m-slot-main-h"
                                  className="add-task-m-slot-line"
                                >
                                  Options for <strong>Category</strong>
                                  <span className="add-task-m-slot-pick"> — PICK ONE</span>
                                </p>
                                <div className="add-task-main-grid" role="group" aria-label="Main category">
                                  {TASK_CATEGORY_TREE.map((m) => {
                                    const on = mainCategory === m.key
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
                                        disabled={!projectLocked || busy}
                                        onClick={() => handleCategoryChipPick(m.key)}
                                        whileTap={
                                          reduceMotion || !projectLocked || busy ? {} : { scale: 0.97 }
                                        }
                                        whileHover={
                                          reduceMotion || !projectLocked || busy ? {} : { y: -1 }
                                        }
                                      >
                                        {m.label}
                                      </motion.button>
                                    )
                                  })}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </motion.div>

                        <motion.div
                          layout
                          transition={descriptionFieldTransition}
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
                            disabled={!mainCategory || !projectLocked || busy}
                            onMouseDown={handleTaskOptionRowMouseDown}
                            onClick={() => toggleMobilePanel('sub')}
                          >
                            <span className="add-task-m-row-label">Sub category</span>
                            <span className="add-task-m-row-trail">
                              <span className="add-task-m-row-value">
                                {subDef?.label ?? 'Select'}
                              </span>
                              <MobileRowChevron
                                expanded={!!mainCategory && mobilePanel === 'sub'}
                                muted={!mainCategory}
                                reduceMotion={!!reduceMotion}
                              />
                            </span>
                          </button>
                          <AnimatePresence initial={false} mode="popLayout">
                            {mobilePanel === 'sub' && selectedMainDef ? (
                              <motion.div
                                key="add-task-with-project-slot-sub"
                                className="add-task-m-slot"
                                aria-labelledby="add-task-with-project-m-slot-sub-h"
                                initial={reduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={descriptionFieldTransition}
                              >
                                <p
                                  id="add-task-with-project-m-slot-sub-h"
                                  className="add-task-m-slot-line"
                                >
                                  Options for <strong>Sub category</strong>
                                  <span className="add-task-m-slot-pick"> — PICK ONE</span>
                                </p>
                                <div
                                  className="add-task-sub-row"
                                  role="group"
                                  aria-label={`Sub category for ${selectedMainDef.label}`}
                                >
                                  {subsOrdered.map((s) => {
                                    const on = subCategory === s.key
                                    const b = s.theme?.border ?? '#64748b'
                                    const inten = s.theme?.intensity ?? 'medium'
                                    const lightFg = inten === 'light' || inten === 'lightest'
                                    const subStyle = on
                                      ? {
                                          borderColor: b,
                                          background: `linear-gradient(180deg, ${b} 0%, ${b} 100%)`,
                                          color: lightFg ? '#0f172a' : '#f8fafc',
                                          boxShadow:
                                            `4px 4px 12px ${b}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
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
                                        disabled={!projectLocked || busy}
                                        onClick={() => handleSubCategoryChipPick(s.key)}
                                        whileTap={
                                          reduceMotion || !projectLocked || busy ? {} : { scale: 0.97 }
                                        }
                                        whileHover={
                                          reduceMotion || !projectLocked || busy ? {} : { y: -1 }
                                        }
                                      >
                                        {s.label}
                                      </motion.button>
                                    )
                                  })}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </motion.div>
                      </div>
                      <motion.div
                        className="app-home-add-task-dates"
                        layout
                        transition={descriptionFieldTransition}
                      >
                        <div className="app-home-add-task-date-block">
                          <motion.label
                            layout
                            transition={firstPanelSpring}
                            className="login-field-label"
                            htmlFor="add-task-flow-start-date"
                          >
                            Start date
                          </motion.label>
                          <motion.input
                            id="add-task-flow-start-date"
                            layout
                            transition={firstPanelSpring}
                            type="date"
                            className="login-input"
                            value={startDate}
                            disabled={!projectLocked || busy}
                            onFocus={handleTaskTitleFocus}
                            onClick={(e) => {
                              if (!projectLocked || busy) return
                              e.preventDefault()
                              descriptionInputRef.current?.blur()
                              setDescriptionFocused(false)
                              setMobilePanel(null)
                              setErr(null)
                              setOpenCalendarFor((v) => (v === 'start' ? null : 'start'))
                            }}
                            onChange={(e) => {
                              setStartDate(e.target.value)
                              setErr(null)
                            }}
                          />
                        </div>
                        <div className="app-home-add-task-date-block">
                          <motion.label
                            layout
                            transition={firstPanelSpring}
                            className="login-field-label"
                            htmlFor="add-task-flow-due-date"
                          >
                            Deadline
                          </motion.label>
                          <motion.input
                            id="add-task-flow-due-date"
                            layout
                            transition={firstPanelSpring}
                            type="date"
                            className="login-input"
                            value={dueDate}
                            disabled={!projectLocked || busy}
                            onFocus={handleTaskTitleFocus}
                            onClick={(e) => {
                              if (!projectLocked || busy) return
                              e.preventDefault()
                              descriptionInputRef.current?.blur()
                              setDescriptionFocused(false)
                              setMobilePanel(null)
                              setErr(null)
                              setOpenCalendarFor((v) => (v === 'deadline' ? null : 'deadline'))
                            }}
                            onChange={(e) => {
                              setDueDate(e.target.value)
                              setErr(null)
                            }}
                          />
                        </div>
                      </motion.div>
                    </LayoutGroup>
                    {(dateOrderError || projectDateBoundsError || err) ? (
                      <SharedErrorBanner className="app-home-modal-error app-home-modal-error--after-title">
                        {err || dateOrderError || projectDateBoundsError}
                      </SharedErrorBanner>
                    ) : null}
                    <motion.div
                      className="modal-actions"
                      style={{ marginTop: 10 }}
                      layout
                      transition={firstPanelSpring}
                    >
                      <motion.button
                        type="button"
                        className={
                          saveSucceeded
                            ? 'modal-btn modal-btn-primary add-task-btn--saved'
                            : 'modal-btn modal-btn-primary'
                        }
                        disabled={!projectLocked || busy || saveSucceeded}
                        onClick={openConfirmIfValid}
                        layout
                        transition={firstPanelSpring}
                        whileTap={
                          !projectLocked || busy || saveSucceeded ? {} : firstPanelTap
                        }
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
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="2"
                              />
                              <path
                                d="M8 12l3 3 5-6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="add-task-save-success-text">
                              Saved successfully
                            </span>
                          </span>
                        ) : busy ? (
                          'Adding...'
                        ) : (
                          'Add task'
                        )}
                      </motion.button>
                      <motion.button
                        type="button"
                        className="modal-btn modal-btn-secondary"
                        onClick={handleCloseModal}
                        disabled={busy}
                        layout
                        transition={firstPanelSpring}
                        whileTap={busy ? {} : firstPanelTap}
                      >
                        Close
                      </motion.button>
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  layout
                  transition={firstPanelSpring}
                  type="button"
                  className="app-home-add-task-flow-collapsed"
                  onClick={() => {
                    if (!projectLocked) return
                    setExpandedPanel('task')
                  }}
                  disabled={!projectLocked}
                >
                  Task details
                </motion.button>
              )}
            </motion.div>
            {openCalendarFor ? (
              <div className="app-home-add-task-cal-overlay">
                <CalendarMonthPicker
                  selectedDate={parseDateOrTodayAddTask(
                    openCalendarFor === 'start' ? startDate : dueDate,
                  )}
                  showTrigger={false}
                  overlayTitle={
                    openCalendarFor === 'start' ? 'Start date' : 'Deadline'
                  }
                  onRequestClose={() => setOpenCalendarFor(null)}
                  onSelectDate={(d) => {
                    const v = toInputDate(d)
                    if (openCalendarFor === 'start') setStartDate(v)
                    else setDueDate(v)
                    setErr(null)
                    setOpenCalendarFor(null)
                  }}
                />
              </div>
            ) : null}
      </motion.div>
      {confirmOpen ? (
        <div className="ios-yn-confirm-backdrop" role="presentation" aria-hidden="true">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={addTaskConfirmTitleId}
            aria-describedby={addTaskConfirmMessageId}
            className="ios-yn-confirm-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ios-yn-confirm-body">
              <h2 id={addTaskConfirmTitleId} className="ios-yn-confirm-title">
                Add this task?
              </h2>
              <p id={addTaskConfirmMessageId} className="ios-yn-confirm-message">
                Please confirm to create this task.
              </p>
            </div>
            <div className="ios-yn-confirm-hrule" aria-hidden />
            <div className="ios-yn-confirm-actions">
              <button
                type="button"
                className="ios-yn-confirm-btn"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <div className="ios-yn-confirm-vrule" aria-hidden />
              <button
                type="button"
                className="ios-yn-confirm-btn"
                disabled={busy}
                onClick={async () => {
                  setConfirmOpen(false)
                  await addTask()
                }}
              >
                {busy ? 'Adding...' : 'Add task'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
