import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DeleteConfirmPop } from '../components/DeleteConfirmPop.jsx'
import { SortLink } from '../components/SortLink.jsx'
import { AddNote } from '../components/AddNote.jsx'
import { LINK_CATEGORY_TREE, SaveNewLinkModal } from '../components/SaveNewLinkModal.jsx'
import {
  createSavedLink,
  deleteSavedLink,
  fetchProjects,
  fetchSavedLinks,
  fetchTodosForDayRange,
  patchSavedLink,
} from '../lib/api.js'
import { endOfLocalDay, startOfLocalDay } from '../lib/dateUtils'
import { getMainTheme } from '../lib/linkCategoryThemes.js'
import { clearSession, getStoredUser } from '../lib/session'
import { AddTaskWithProjectModal } from '../components/AddTaskWithProjectModal.jsx'
import { AddProjectModal, SelectProjectModal } from './AppHomePage.jsx'
import './LoginPage.css'
import './AppHomePage.css'
import './ProjectPage.css'
import './SavedLinksPage.css'
import '../components/ConfirmPop.css'

const DESC_NOTE_MAX = 100
/** Must match backend `SAVED_LINKS_LIST_LIMIT` for saved-links list pagination. */
const SAVED_LINKS_PAGE_SIZE = 30

/** Rule 1: filter currently loaded rows only (title, description, URL) — no network. */
function filterSavedLinksClientRows(rows, rawQuery) {
  const q = String(rawQuery ?? '').trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) => {
    const title = String(row.linkTitle ?? '').toLowerCase()
    const desc = String(row.linkDescription ?? '').toLowerCase()
    const url = String(row.link ?? '').toLowerCase()
    return title.includes(q) || desc.includes(q) || url.includes(q)
  })
}

const SAVED_LINK_FLIP_DURATION_S = 0.38
const SAVED_LINK_FLIP_EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)'
const SAVED_LINK_FLIP_THRESH_PX = 2

/** Matches `.saved-link-zoom__panel` / zoom note sizing in SavedLinksPage.css for fly-from-card math. */
const ZOOM_TARGET_MAX_W = 520
const ZOOM_TARGET_MAX_H = 720

/** Matches `.saved-link-note--zoom { transform: scale(1.04) }` via Framer (inline replaces CSS transform). */
const ZOOM_NOTE_REST_SCALE = 1.04

const ZOOM_PANEL_VARIANTS = {
  fromOrigin: (custom) => {
    const rect = custom?.rect
    if (custom?.reduceMotion || custom?.mobileLite || !rect || typeof window === 'undefined') {
      return { x: 0, y: 0, scale: 1, opacity: 1 }
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = cx - vw / 2
    const dy = cy - vh / 2
    const destW = Math.min(ZOOM_TARGET_MAX_W, vw - 32)
    const destH = Math.min(vh * 0.88, ZOOM_TARGET_MAX_H)
    const s0 = Math.min(rect.width / destW, rect.height / destH, 1)
    const s = Math.max(0.2, s0)
    return { x: dx, y: dy, scale: s, opacity: 0.97 }
  },
  expanded: (custom) => ({
    x: 0,
    y: 0,
    scale: custom?.mobileLite ? 1 : ZOOM_NOTE_REST_SCALE,
    opacity: 1,
  }),
}

/** First character uppercase, all others lowercase (whole string). */
function formatNoteTitle(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** First character uppercase, rest lowercase; then trim to 100 chars with ellipsis. Empty → em dash. */
function formatNoteDescription(raw) {
  const s = raw == null ? '' : String(raw).trim()
  if (!s) return '—'
  const normalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  if (normalized.length <= DESC_NOTE_MAX) return normalized
  return `${normalized.slice(0, DESC_NOTE_MAX)}...`
}

/** Full description for zoomed view (same casing as grid, no truncation). */
function formatNoteDescriptionFull(raw) {
  const s = raw == null ? '' : String(raw).trim()
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

async function copyLinkToClipboard(url) {
  const u = String(url ?? '')
  if (!u || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(u)
    return true
  } catch {
    return false
  }
}

function SavedLinkCopyIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function SavedLinkOpenIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function SavedLinkSuccessIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** Magnifying glass — search submit (shown when library has more than one page of links). */
function SavedLinksSearchIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.3-4.3" />
    </svg>
  )
}

function SavedLinkEditIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function resolveCategoryLabels(row) {
  if (row.linkMainKey && row.linkSubKey) {
    const main = LINK_CATEGORY_TREE.find((m) => m.key === row.linkMainKey)
    const sub = main?.subs?.find((s) => s.key === row.linkSubKey)
    return {
      mainLabel: main?.label ?? '—',
      subLabel: sub?.label ?? '—',
      themeKey: row.linkMainKey,
    }
  }
  const raw = String(row.linkCategory ?? '')
  const parts = raw.split(/\s—\s/)
  const mainLabel = parts[0]?.trim() || '—'
  const subLabel = parts[1]?.trim() || '—'
  const mainEntry = LINK_CATEGORY_TREE.find((m) => m.label === mainLabel)
  return {
    mainLabel,
    subLabel,
    themeKey: mainEntry?.key ?? null,
  }
}

/** Theme tokens for modern card chrome (accent bar + borders in CSS). */
function stickyNoteStyle(themeKey) {
  const th = getMainTheme(themeKey)
  return {
    '--saved-link-accent': th.solid,
    backgroundColor: th.light,
    color: th.dark,
  }
}

/** e.g. "15 Apr 2026" for sticky note line. */
function formatSavedDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const day = d.getDate()
    const mon = d.toLocaleString('en-GB', { month: 'short' })
    const year = d.getFullYear()
    return `${day} ${mon} ${year}`
  } catch {
    return '—'
  }
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

export default function SavedLinksPage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [mobileLiteMotion, setMobileLiteMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(max-width: 1024px), (pointer: coarse)').matches
  })
  const user = getStoredUser()
  const [saveLinkOpen, setSaveLinkOpen] = useState(false)
  const [modalInitialLink, setModalInitialLink] = useState(null)
  const [saveLinkFlyRect, setSaveLinkFlyRect] = useState(null)
  const [selectedDate] = useState(() => startOfLocalDay(new Date()))
  const [todos, setTodos] = useState([])
  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsLoadError, setProjectsLoadError] = useState(null)
  const [projectsTruncated, setProjectsTruncated] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [selectProjectOpen, setSelectProjectOpen] = useState(false)
  const [addTaskFlowOpen, setAddTaskFlowOpen] = useState(false)
  const [appHomeModalFlyRect, setAppHomeModalFlyRect] = useState(null)
  const [viewFilter, setViewFilter] = useState({ kind: 'all' })
  const [addNewChooserOpen, setAddNewChooserOpen] = useState(false)
  const [addNewFlyRect, setAddNewFlyRect] = useState(null)
  const addNewChooserTitleId = useId()
  const addNewChooserMsgId = useId()
  const [notesChooserOpen, setNotesChooserOpen] = useState(false)
  const notesChooserTitleId = useId()
  const notesChooserMsgId = useId()
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [addNoteOriginRect, setAddNoteOriginRect] = useState(null)
  const [links, setLinks] = useState([])
  const [linksPage, setLinksPage] = useState(1)
  const [linksTotal, setLinksTotal] = useState(0)
  const [linksBusy, setLinksBusy] = useState(true)
  const [linksSearchInput, setLinksSearchInput] = useState('')
  const [linksSearchApplied, setLinksSearchApplied] = useState('')
  const linksSearchAppliedRef = useRef('')
  /** Total links in DB from last non-search list fetch; search button only submits when above page size. */
  const [fullLibraryTotal, setFullLibraryTotal] = useState(0)
  const savedLinksFetchAbortRef = useRef(null)
  const [expandedNoteId, setExpandedNoteId] = useState(null)
  const [zoomFlyRect, setZoomFlyRect] = useState(null)
  const [gridCopyFlashId, setGridCopyFlashId] = useState(null)
  const [zoomCopyOk, setZoomCopyOk] = useState(false)
  const [zoomOpenOk, setZoomOpenOk] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteSucceeded, setDeleteSucceeded] = useState(false)
  const deleteSuccessTimeoutRef = useRef(null)
  const gridCopyTimeoutRef = useRef(null)
  const zoomCopyTimeoutRef = useRef(null)
  const zoomOpenTimeoutRef = useRef(null)
  const [sortSavedLinksOpen, setSortSavedLinksOpen] = useState(false)
  const [sortSavedLinksOriginRect, setSortSavedLinksOriginRect] = useState(null)
  const [savedLinksSortConfig, setSavedLinksSortConfig] = useState(null)
  const savedLinkItemRefs = useRef(new Map())
  const savedLinkLayoutSnapshotRef = useRef(new Map())
  const savedLinkFlipRunIdRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(max-width: 1024px), (pointer: coarse)')
    const onChange = (e) => setMobileLiteMotion(e.matches)
    setMobileLiteMotion(media.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [])

  useEffect(() => {
    linksSearchAppliedRef.current = linksSearchApplied
  }, [linksSearchApplied])

  const savedLinksSortConfigRef = useRef(null)
  useEffect(() => {
    savedLinksSortConfigRef.current = savedLinksSortConfig
  }, [savedLinksSortConfig])

  const loadPage = useCallback(async (page, searchApplied) => {
    savedLinksFetchAbortRef.current?.abort()
    const ac = new AbortController()
    savedLinksFetchAbortRef.current = ac
    setLinksBusy(true)
    try {
      const q = typeof searchApplied === 'string' ? searchApplied.trim() : ''
      const sc = savedLinksSortConfigRef.current
      const fetchOpts = {
        signal: ac.signal,
        ...(q ? { q } : {}),
      }
      if (sc) {
        if (sc.sortDir === 'asc' || sc.sortDir === 'desc') {
          fetchOpts.sortDir = sc.sortDir
        }
        if (sc.dateFrom) fetchOpts.dateFrom = sc.dateFrom
        if (sc.dateTo) fetchOpts.dateTo = sc.dateTo
        if (Array.isArray(sc.categories) && sc.categories.length > 0) {
          fetchOpts.mainKeys = sc.categories
        }
        if (Array.isArray(sc.subCategories) && sc.subCategories.length > 0) {
          fetchOpts.subKeys = sc.subCategories
        }
      }
      const data = await fetchSavedLinks(page, fetchOpts)
      setLinks(Array.isArray(data.links) ? data.links : [])
      setLinksTotal(typeof data.total === 'number' ? data.total : 0)
      if (!q && !sc) {
        setFullLibraryTotal(typeof data.total === 'number' ? data.total : 0)
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      setLinks([])
      setLinksTotal(0)
    } finally {
      if (!ac.signal.aborted) setLinksBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(linksPage, linksSearchApplied)
  }, [linksPage, linksSearchApplied, savedLinksSortConfig, loadPage])

  useEffect(() => {
    if (linksBusy) return
    if (linksTotal <= 0) {
      if (linksPage > 1) setLinksPage(1)
      return
    }
    const maxPage = Math.max(1, Math.ceil(linksTotal / SAVED_LINKS_PAGE_SIZE))
    if (linksPage > maxPage) {
      setLinksPage(maxPage)
    }
  }, [linksBusy, linksTotal, linksPage])

  const handleSavedLinksSearchSubmit = (e) => {
    e.preventDefault()
    if (fullLibraryTotal > SAVED_LINKS_PAGE_SIZE) {
      const q = linksSearchInput.trim()
      setLinksSearchApplied(q)
      setLinksPage(1)
    }
  }

  useEffect(() => {
    return () => {
      savedLinksFetchAbortRef.current?.abort()
    }
  }, [])

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

  const loadDayTodos = useCallback(async () => {
    try {
      const from = startOfLocalDay(selectedDate)
      const to = endOfLocalDay(selectedDate)
      const data = await fetchTodosForDayRange(from, to, { page: 1 })
      setTodos(data.todos ?? [])
    } catch {
      setTodos([])
    }
  }, [selectedDate])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    loadDayTodos()
  }, [loadDayTodos])

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

  const displayLinks = useMemo(
    () => filterSavedLinksClientRows(links, linksSearchInput),
    [links, linksSearchInput],
  )

  useLayoutEffect(() => {
    const keepIds = new Set(displayLinks.map((r) => r.id))
    for (const id of savedLinkLayoutSnapshotRef.current.keys()) {
      if (!keepIds.has(id)) savedLinkLayoutSnapshotRef.current.delete(id)
    }

    if (reduceMotion) {
      displayLinks.forEach((row) => {
        const el = savedLinkItemRefs.current.get(row.id)
        if (el)
          savedLinkLayoutSnapshotRef.current.set(row.id, el.getBoundingClientRect())
      })
      return
    }

    const runId = ++savedLinkFlipRunIdRef.current
    const d = SAVED_LINK_FLIP_DURATION_S
    const ease = SAVED_LINK_FLIP_EASE
    const T = SAVED_LINK_FLIP_THRESH_PX

    const finish = (el, id) => {
      if (runId !== savedLinkFlipRunIdRef.current) return
      el.style.transform = ''
      el.style.transition = ''
      el.style.pointerEvents = ''
      savedLinkLayoutSnapshotRef.current.set(id, el.getBoundingClientRect())
    }

    displayLinks.forEach((row) => {
      const el = savedLinkItemRefs.current.get(row.id)
      if (!el || runId !== savedLinkFlipRunIdRef.current) return

      const last = el.getBoundingClientRect()
      const first = savedLinkLayoutSnapshotRef.current.get(row.id)

      if (!first) {
        savedLinkLayoutSnapshotRef.current.set(row.id, last)
        return
      }

      const dx = first.left - last.left
      const dy = first.top - last.top

      if (Math.abs(dx) < T && Math.abs(dy) < T) {
        savedLinkLayoutSnapshotRef.current.set(row.id, last)
        return
      }

      el.style.pointerEvents = 'none'
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`

      const runPhase = () => {
        if (runId !== savedLinkFlipRunIdRef.current) return

        const oneAxis = (fromX, fromY, toX, toY, onDone) => {
          el.style.transition = 'none'
          el.style.transform = `translate(${fromX}px, ${fromY}px)`
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (runId !== savedLinkFlipRunIdRef.current) return
              el.style.transition = `transform ${d}s ${ease}`
              el.style.transform = `translate(${toX}px, ${toY}px)`
              const done = (e) => {
                if (e && e.propertyName && e.propertyName !== 'transform') return
                el.removeEventListener('transitionend', done)
                onDone()
              }
              el.addEventListener('transitionend', done, { once: true })
            })
          })
        }

        if (Math.abs(dy) < T) {
          oneAxis(dx, 0, 0, 0, () => finish(el, row.id))
          return
        }
        if (Math.abs(dx) < T) {
          oneAxis(0, dy, 0, 0, () => finish(el, row.id))
          return
        }

        oneAxis(dx, dy, 0, dy, () => {
          if (runId !== savedLinkFlipRunIdRef.current) return
          oneAxis(0, dy, 0, 0, () => finish(el, row.id))
        })
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(runPhase)
      })
    })
  }, [displayLinks, reduceMotion])

  useEffect(() => {
    if (expandedNoteId == null) return
    if (!links.some((l) => l.id == expandedNoteId)) {
      setExpandedNoteId(null)
      return
    }
    if (!displayLinks.some((l) => l.id == expandedNoteId)) setExpandedNoteId(null)
  }, [links, displayLinks, expandedNoteId])

  useEffect(() => {
    if (expandedNoteId == null) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (deleteConfirmOpen) setDeleteConfirmOpen(false)
      else setExpandedNoteId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedNoteId, deleteConfirmOpen])

  useEffect(() => {
    if (expandedNoteId == null) {
      setZoomCopyOk(false)
      setZoomOpenOk(false)
      setDeleteConfirmOpen(false)
      setDeleting(false)
      setDeleteSucceeded(false)
      if (deleteSuccessTimeoutRef.current) {
        clearTimeout(deleteSuccessTimeoutRef.current)
        deleteSuccessTimeoutRef.current = null
      }
    }
  }, [expandedNoteId])

  useEffect(() => {
    return () => {
      if (gridCopyTimeoutRef.current) clearTimeout(gridCopyTimeoutRef.current)
      if (zoomCopyTimeoutRef.current) clearTimeout(zoomCopyTimeoutRef.current)
      if (zoomOpenTimeoutRef.current) clearTimeout(zoomOpenTimeoutRef.current)
      if (deleteSuccessTimeoutRef.current) clearTimeout(deleteSuccessTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (expandedNoteId == null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [expandedNoteId])

  const handleSignOut = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

  const onProjectCreated = async (project) => {
    await refreshProjects()
    if (project?.id) {
      navigate(`/project/${project.id}`)
    }
  }

  const expandedNote =
    expandedNoteId != null ? links.find((r) => r.id == expandedNoteId) ?? null : null

  const expandedZoom =
    expandedNote != null
      ? {
          row: expandedNote,
          url: String(expandedNote.link ?? ''),
          ...resolveCategoryLabels(expandedNote),
        }
      : null

  const savedLinksTotalPages = Math.max(1, Math.ceil(linksTotal / SAVED_LINKS_PAGE_SIZE))

  const savedLinkNoteTransition = reduceMotion
    ? { duration: 0 }
    : {
        opacity: { duration: 0.22, ease: 'easeOut' },
      }

  const handleConfirmDeleteSavedLink = async () => {
    if (!expandedZoom || deleting || deleteSucceeded) return
    setDeleteConfirmOpen(false)
    setDeleting(true)
    try {
      await deleteSavedLink(expandedZoom.row.id)
      setDeleting(false)
      setDeleteSucceeded(true)
      if (deleteSuccessTimeoutRef.current) clearTimeout(deleteSuccessTimeoutRef.current)
      deleteSuccessTimeoutRef.current = setTimeout(() => {
        deleteSuccessTimeoutRef.current = null
        setDeleteSucceeded(false)
        setExpandedNoteId(null)
        void loadPage(linksPage, linksSearchAppliedRef.current)
      }, 2000)
    } catch (err) {
      setDeleting(false)
      setDeleteConfirmOpen(false)
      window.alert(err instanceof Error ? err.message : 'Could not delete link.')
    }
  }

  return (
    <div className="app-home-root">
      <motion.header
        className="app-home-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <div className="app-home-header-inner">
          <div className="app-home-header-text">
            <p className="app-home-greeting">
              Hi, <strong>{user?.firstName?.trim() || 'there'}</strong>
            </p>
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

      <section className="app-home-section" style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            marginBottom: 14,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div className="saved-links-toolbar-grid">
            <motion.button
              type="button"
              className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
              onClick={(e) => {
                setSaveLinkFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
                setModalInitialLink(null)
                setSaveLinkOpen(true)
              }}
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Save new link
            </motion.button>
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
              onClick={() => setNotesChooserOpen(true)}
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Notes
            </motion.button>
          </div>
          <h1 className="app-home-title" style={{ margin: 0 }}>
            Saved links
          </h1>
          <form
            className="saved-links-search"
            onSubmit={handleSavedLinksSearchSubmit}
            role="search"
            aria-label="Search saved links"
          >
            <input
              type="search"
              className="saved-links-search__input"
              placeholder="Search by title, description, or URL"
              value={linksSearchInput}
              onChange={(e) => setLinksSearchInput(e.target.value)}
              aria-label="Search saved links"
              autoComplete="off"
              maxLength={200}
            />
            <motion.button
              type="submit"
              className="saved-links-search__submit saved-links-search__submit--icon app-home-toolbar-btn app-home-toolbar-btn--primary"
              disabled={linksBusy}
              aria-label="Search"
              title="Search"
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              <SavedLinksSearchIcon className="saved-links-search__icon" />
            </motion.button>
            <motion.button
              type="button"
              className={
                savedLinksSortConfig
                  ? 'proj-filter-btn proj-filter-btn--active'
                  : 'proj-filter-btn'
              }
              aria-label="Sort link via"
              title="Sort link via"
              onClick={(e) => {
                setSortSavedLinksOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
                setSortSavedLinksOpen(true)
              }}
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Sort link via
            </motion.button>
          </form>
        </div>
      </section>

      <div className="saved-links-board">
        {linksBusy ? (
          <div
            className="saved-links-grid saved-links-grid--skeleton"
            aria-busy="true"
            aria-label="Loading saved links"
          >
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="saved-link-skeleton">
                <div className="saved-link-skeleton__line saved-link-skeleton__line--title" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--desc" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--desc-short" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--url" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--meta" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--meta" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--date" />
              </div>
            ))}
          </div>
        ) : links.length === 0 ? (
          <p className="saved-links-empty modal-text">
            {linksSearchApplied.trim()
              ? 'No matching saved links.'
              : 'No saved links yet.'}
          </p>
        ) : displayLinks.length === 0 ? (
          <p className="saved-links-empty modal-text">No matching saved links.</p>
        ) : (
          <div className="saved-links-grid" role="list">
            <AnimatePresence mode="popLayout" initial={false}>
              {displayLinks.map((row) => {
                const { mainLabel, subLabel, themeKey } = resolveCategoryLabels(row)
                return (
                  <motion.article
                    key={row.id}
                    ref={(node) => {
                      if (node) savedLinkItemRefs.current.set(row.id, node)
                      else savedLinkItemRefs.current.delete(row.id)
                    }}
                    className="saved-link-note"
                    style={stickyNoteStyle(themeKey)}
                    role="listitem"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
                    transition={savedLinkNoteTransition}
                    onClick={(e) => {
                      setZoomFlyRect(e.currentTarget.getBoundingClientRect())
                      setExpandedNoteId(row.id)
                    }}
                  >
                    <div className="saved-link-note__body">
                      <h3 className="saved-link-note__title">{formatNoteTitle(row.linkTitle)}</h3>
                      <p className="saved-link-note__desc">
                        {formatNoteDescription(row.linkDescription)}
                      </p>
                      <div className="saved-link-note__url-wrap">
                        <a
                          className="saved-link-note__url"
                          href={row.link}
                          onClick={async (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const ok = await copyLinkToClipboard(row.link)
                            if (!ok) return
                            if (gridCopyTimeoutRef.current) clearTimeout(gridCopyTimeoutRef.current)
                            setGridCopyFlashId(row.id)
                            gridCopyTimeoutRef.current = setTimeout(() => {
                              setGridCopyFlashId(null)
                              gridCopyTimeoutRef.current = null
                            }, 2200)
                          }}
                        >
                          {row.link}
                        </a>
                        {gridCopyFlashId != null && gridCopyFlashId == row.id && (
                          <span
                            className="saved-link-note__copy-ok"
                            role="status"
                            aria-live="polite"
                          >
                            <SavedLinkSuccessIcon className="saved-link-note__copy-ok-icon" />
                          </span>
                        )}
                      </div>
                      <p className="saved-link-note__meta">Catagory - {mainLabel}</p>
                      <p className="saved-link-note__meta">Sub Catagory - {subLabel}</p>
                      <p className="saved-link-note__date">
                        Add on - {formatSavedDate(row.createdAt)}
                      </p>
                    </div>
                  </motion.article>
                )
              })}
            </AnimatePresence>
          </div>
        )}
        {linksTotal > SAVED_LINKS_PAGE_SIZE ? (
          <div
            className="saved-links-pagination"
            role="navigation"
            aria-label="Saved links pages"
          >
            <motion.button
              type="button"
              className="saved-links-pagination__btn"
              disabled={linksPage <= 1 || linksBusy}
              onClick={() => setLinksPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
              whileTap={{ scale: 0.96 }}
            >
              <svg
                className="saved-links-pagination__icon"
                viewBox="0 0 24 24"
                width={22}
                height={22}
                aria-hidden
              >
                <path
                  fill="currentColor"
                  d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                />
              </svg>
            </motion.button>
            <motion.button
              type="button"
              className="saved-links-pagination__btn"
              disabled={linksPage >= savedLinksTotalPages || linksBusy}
              onClick={() =>
                setLinksPage((p) => Math.min(savedLinksTotalPages, p + 1))
              }
              aria-label="Next page"
              whileTap={{ scale: 0.96 }}
            >
              <svg
                className="saved-links-pagination__icon"
                viewBox="0 0 24 24"
                width={22}
                height={22}
                aria-hidden
              >
                <path
                  fill="currentColor"
                  d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z"
                />
              </svg>
            </motion.button>
          </div>
        ) : null}
      </div>

      <AnimatePresence
        onExitComplete={() => {
          setZoomFlyRect(null)
        }}
      >
        {expandedZoom && (
          <motion.div
            key={expandedNoteId ?? 'zoom'}
            className="saved-link-zoom"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-link-zoom-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reduceMotion || mobileLiteMotion ? 0.08 : 0.38,
              ease: [0.22, 0.61, 0.36, 1],
            }}
          >
            <div className="saved-link-zoom__backdrop" aria-hidden />
            <motion.div
              className="saved-link-zoom__panel saved-link-note saved-link-note--zoom"
              style={{
                ...stickyNoteStyle(expandedZoom.themeKey),
                transformOrigin: 'center center',
              }}
              custom={{ rect: zoomFlyRect, reduceMotion, mobileLite: mobileLiteMotion }}
              variants={ZOOM_PANEL_VARIANTS}
              initial="fromOrigin"
              animate="expanded"
              exit="fromOrigin"
              transition={
                reduceMotion || mobileLiteMotion
                  ? { duration: 0.09, ease: [0.4, 0, 0.2, 1] }
                  : {
                      type: 'spring',
                      stiffness: 360,
                      damping: 30,
                      mass: 0.72,
                    }
              }
            >
            <button
              type="button"
              className="saved-link-zoom__close"
              onClick={() => setExpandedNoteId(null)}
              aria-label="Close"
            >
              <span aria-hidden>×</span>
            </button>
            <div className="saved-link-zoom__inner">
              <h2 id="saved-link-zoom-title" className="saved-link-zoom__title">
                {formatNoteTitle(expandedZoom.row.linkTitle)}
              </h2>
              <p className="saved-link-zoom__desc">
                {formatNoteDescriptionFull(expandedZoom.row.linkDescription)}
              </p>
              <div className="saved-link-zoom__url-block">
                <p className="saved-link-zoom__url-text">{expandedZoom.url}</p>
              </div>
              <div className="saved-link-zoom__icon-row">
                <motion.button
                  type="button"
                  className="saved-link-zoom__icon-btn"
                  onClick={(e) => {
                    setSaveLinkFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
                    setModalInitialLink(expandedZoom.row)
                    setSaveLinkOpen(true)
                    setExpandedNoteId(null)
                  }}
                  whileTap={{ scale: 0.92 }}
                  whileHover={reduceMotion ? {} : { y: -1 }}
                  aria-label="Edit saved link"
                >
                  <SavedLinkEditIcon />
                </motion.button>
                <motion.button
                  type="button"
                  className={
                    deleteSucceeded
                      ? 'saved-link-zoom__icon-btn saved-link-zoom__icon-btn--ok'
                      : 'saved-link-zoom__icon-btn'
                  }
                  onClick={() => {
                    if (!deleting && !deleteSucceeded) setDeleteConfirmOpen(true)
                  }}
                  whileTap={deleteSucceeded ? {} : { scale: 0.92 }}
                  whileHover={reduceMotion || deleteSucceeded ? {} : { y: -1 }}
                  disabled={deleting || deleteSucceeded}
                  aria-label={deleteSucceeded ? 'Deleted' : 'Delete saved link'}
                >
                  {deleteSucceeded ? (
                    <SavedLinkSuccessIcon />
                  ) : deleting ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </motion.button>
                <button
                  type="button"
                  className={
                    zoomCopyOk
                      ? 'saved-link-zoom__icon-btn saved-link-zoom__icon-btn--ok'
                      : 'saved-link-zoom__icon-btn'
                  }
                  onClick={async () => {
                    const ok = await copyLinkToClipboard(expandedZoom.url)
                    if (!ok) return
                    if (zoomCopyTimeoutRef.current) clearTimeout(zoomCopyTimeoutRef.current)
                    setZoomCopyOk(true)
                    zoomCopyTimeoutRef.current = setTimeout(() => {
                      setZoomCopyOk(false)
                      zoomCopyTimeoutRef.current = null
                    }, 2000)
                  }}
                  aria-label="Copy link"
                >
                  {zoomCopyOk ? <SavedLinkSuccessIcon /> : <SavedLinkCopyIcon />}
                </button>
                <a
                  className={
                    zoomOpenOk
                      ? 'saved-link-zoom__icon-btn saved-link-zoom__icon-btn--ok'
                      : 'saved-link-zoom__icon-btn'
                  }
                  href={expandedZoom.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open link in new tab"
                  onClick={() => {
                    if (zoomOpenTimeoutRef.current) clearTimeout(zoomOpenTimeoutRef.current)
                    setZoomOpenOk(true)
                    zoomOpenTimeoutRef.current = setTimeout(() => {
                      setZoomOpenOk(false)
                      zoomOpenTimeoutRef.current = null
                    }, 2000)
                  }}
                >
                  {zoomOpenOk ? <SavedLinkSuccessIcon /> : <SavedLinkOpenIcon />}
                </a>
              </div>
              <div className="saved-link-zoom__footer">
                <p className="saved-link-note__meta saved-link-note__date">
                  Catagory - {expandedZoom.mainLabel}
                  <br />
                  Sub Catagory - {expandedZoom.subLabel}
                  <br />
                  Add on - {formatSavedDate(expandedZoom.row.createdAt)}
                </p>
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(
        <div className="saved-links-delete-confirm-mount">
          <DeleteConfirmPop
            open={deleteConfirmOpen}
            skipDocumentScrollLock
            title="Delete saved link"
            message="Are you sure you want to delete this saved link? This cannot be undone."
            onCancel={() => setDeleteConfirmOpen(false)}
            onConfirm={handleConfirmDeleteSavedLink}
          />
        </div>,
        document.body,
      )}

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
          await loadDayTodos()
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

      <SortLink
        open={sortSavedLinksOpen}
        onClose={() => setSortSavedLinksOpen(false)}
        originRect={sortSavedLinksOriginRect}
        onSheetExitComplete={() => setSortSavedLinksOriginRect(null)}
        initialSort={savedLinksSortConfig}
        onApply={(config) => {
          setSavedLinksSortConfig(config)
          setSortSavedLinksOpen(false)
          setLinksPage(1)
        }}
      />

      <SaveNewLinkModal
        initialSavedLink={modalInitialLink}
        originRect={saveLinkFlyRect}
        onSheetExitComplete={() => setSaveLinkFlyRect(null)}
        open={saveLinkOpen}
        onClose={() => {
          setSaveLinkOpen(false)
          setModalInitialLink(null)
        }}
        onSaved={async (payload) => {
          if (payload.id != null) {
            const { id, ...body } = payload
            await patchSavedLink(id, body)
          } else {
            await createSavedLink(payload)
          }
          if (linksPage === 1) {
            await loadPage(1, linksSearchAppliedRef.current)
          } else {
            setLinksPage(1)
          }
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
