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
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { AddNote } from '../components/AddNote.jsx'
import { NoteReorder } from '../components/noteReorder.jsx'
import { DeleteConfirmPop } from '../components/DeleteConfirmPop.jsx'
import { NoteSortViaPop } from '../components/NoteSortViaPop.jsx'
import { SaveNewLinkModal } from '../components/SaveNewLinkModal.jsx'
import {
  createSavedLink,
  deleteSmallNote,
  fetchSmallNotes,
  fetchSmallNotesMeta,
  patchSmallNote,
  patchSmallNotePin,
  patchSmallNotesPinOrder,
  searchSmallNotes,
} from '../lib/api.js'
import { getMainTheme } from '../lib/linkCategoryThemes.js'
import { clearSession, getStoredUser } from '../lib/session'
import './LoginPage.css'
import './AppHomePage.css'
import './SavedLinksPage.css'
import './NotePage.css'

const DESC_NOTE_MAX = 100

const NOTE_PAGE_LIST_MODE_KEY = 'notePageListMode'

/**
 * Debounced typing search runs on this many leading rows of the sorted/filtered list.
 * Same as max `GET /api/small-notes` fetch so all loaded cards are searchable while typing.
 */
const NOTE_SEARCH_DEBOUNCE_SLICE = 200
/** If DB has more than this many notes+to-dos, search icon uses the API; otherwise client-only (matches max list fetch). */
const NOTE_SEARCH_ICON_DB_THRESHOLD = 200
const NOTE_SEARCH_DEBOUNCE_MS = 350

/** @returns {'both' | 'todo' | 'note'} */
function readStoredNoteListMode() {
  if (typeof window === 'undefined') return 'both'
  try {
    const v = window.localStorage.getItem(NOTE_PAGE_LIST_MODE_KEY)
    if (v === 'todo' || v === 'note' || v === 'both') return v
  } catch {
    /* ignore */
  }
  return 'both'
}

/** Note list mode grid: prev = enter from left, exit right; next = enter from right, exit left; rm = opacity only */
const NOTE_LIST_MODE_GRID_VARIANTS = {
  initial: (c) =>
    c.rm
      ? { opacity: 0 }
      : c.dir === 'prev'
        ? { x: '-62%', opacity: 0, y: 0 }
        : { x: '62%', opacity: 0, y: 0 },
  animate: (c) => (c.rm ? { opacity: 1 } : { x: 0, opacity: 1, y: 0 }),
  exit: (c) =>
    c.rm
      ? { opacity: 0 }
      : c.dir === 'prev'
        ? { x: '128%', opacity: 0, y: 0 }
        : { x: '-128%', opacity: 0, y: 0 },
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

/** Same magnifying-glass icon as SavedLinksPage search submit. */
function NoteSearchIcon(props) {
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

function snapshotSmallNoteForEdit(row) {
  if (!row?.id) return null
  return {
    id: row.id,
    noteMode: row.noteMode,
    heading: row.heading,
    description: row.description ?? '',
    todoItems: Array.isArray(row.todoItems) ? [...row.todoItems] : [],
    backgroundType: row.backgroundType,
    backgroundIndex: row.backgroundIndex,
  }
}

function NotePinSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M16 12V4h1c0-1.1-.9-2-2-2h-6c-1.1 0-2 .9-2 2v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2zm-2 0H8V4h6v8z" />
    </svg>
  )
}

/** Align with API: legacy string items or { text, done }. */
function normalizeTodoItemsClient(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const x of raw) {
    if (typeof x === 'string') {
      const text = x.trim()
      if (text) out.push({ text, done: false })
    } else if (x && typeof x === 'object') {
      const text = String(x.text ?? '').trim()
      out.push({ text, done: Boolean(x.done) })
    }
  }
  return out
}

/**
 * Whether (clientX, clientY) hits rendered text inside `el` (soft-wrapped lines included).
 * Range#getClientRects() is unreliable for multi-line in flex; caret APIs match browser hit-testing.
 */
function pointHitsInlineText(el, clientX, clientY) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false

  if (typeof document.caretRangeFromPoint === 'function') {
    try {
      const range = document.caretRangeFromPoint(clientX, clientY)
      if (range) {
        const n = range.commonAncestorContainer
        if (el.contains(n)) return true
      }
    } catch {
      /* invalid coordinates */
    }
  }

  if (typeof document.caretPositionFromPoint === 'function') {
    try {
      const pos = document.caretPositionFromPoint(clientX, clientY)
      if (pos?.offsetNode != null && el.contains(pos.offsetNode)) return true
    } catch {
      /* ignore */
    }
  }

  const range = document.createRange()
  range.selectNodeContents(el)
  const rects = range.getClientRects()
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    if (!rect || rect.width <= 0 || rect.height <= 0) continue
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true
    }
  }
  return false
}

/** Matches `.saved-link-zoom__panel` sizing in SavedLinksPage.css for fly-from-card math. */
const ZOOM_TARGET_MAX_W = 520
const ZOOM_TARGET_MAX_H = 720

const ZOOM_NOTE_REST_SCALE = 1.04

const ZOOM_PANEL_VARIANTS = {
  fromOrigin: (custom) => {
    const rect = custom?.rect
    if (custom?.reduceMotion || !rect || typeof window === 'undefined') {
      return { x: 0, y: 0, scale: 0.99, opacity: 1 }
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
  expanded: { x: 0, y: 0, scale: ZOOM_NOTE_REST_SCALE, opacity: 1 },
}

/** Same solid palette as Add note editor */
const SOLID_COLORS = [
  '#fff7ed',
  '#fef3c7',
  '#ecfccb',
  '#e0f2fe',
  '#fae8ff',
  '#ffe4e6',
  '#ccfbf1',
  '#e0e7ff',
  '#fce7f3',
  '#f5f5f4',
]

function natureSvgDataUri(index) {
  const svgs = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bae6fd"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="50" cy="14" r="9" fill="#fde68a"/><path d="M0 44 Q16 36 32 44 T64 44 L64 64 L0 64 Z" fill="#86efac"/><path d="M8 48 L12 38 L16 48 Z" fill="#22c55e"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ecfdf5"/><ellipse cx="20" cy="48" rx="28" ry="10" fill="#6ee7b7"/><ellipse cx="44" cy="46" rx="22" ry="8" fill="#34d399"/><circle cx="48" cy="18" r="7" fill="#fcd34d"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fef9c3"/><path d="M10 38 Q20 28 32 38 Q44 28 54 38 L54 64 L10 64 Z" fill="#a3e635"/><circle cx="16" cy="22" r="6" fill="#fff"/><circle cx="28" cy="18" r="8" fill="#fff"/><circle cx="42" cy="24" r="7" fill="#fff"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#cffafe"/><path d="M0 52 L64 52 L64 64 L0 64 Z" fill="#38bdf8"/><path d="M8 52 L20 30 L32 52 Z" fill="#0ea5e9"/><path d="M28 52 L40 28 L52 52 Z" fill="#0284c7"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fce7f3"/><path d="M0 40 Q32 20 64 40 L64 64 L0 64 Z" fill="#f9a8d4"/><circle cx="32" cy="24" r="10" fill="#fbcfe8"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ede9fe"/><path d="M0 48 L64 48 L64 64 L0 64 Z" fill="#c4b5fd"/><rect x="8" y="28" width="10" height="20" rx="2" fill="#8b5cf6"/><rect x="24" y="22" width="10" height="26" rx="2" fill="#a78bfa"/><rect x="40" y="32" width="10" height="16" rx="2" fill="#7c3aed"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ffedd5"/><circle cx="20" cy="20" r="8" fill="#fdba74"/><circle cx="44" cy="16" r="10" fill="#fb923c"/><path d="M0 50 Q32 42 64 50 L64 64 L0 64 Z" fill="#fcd34d"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#d1fae5"/><ellipse cx="32" cy="50" rx="30" ry="8" fill="#6ee7b7"/><path d="M32 50 L32 22" stroke="#059669" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="18" r="12" fill="#34d399"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e0e7ff"/><path d="M0 36 L64 36 L64 64 L0 64 Z" fill="#a5b4fc"/><circle cx="14" cy="30" r="4" fill="#c7d2fe"/><circle cx="32" cy="26" r="5" fill="#c7d2fe"/><circle cx="50" cy="32" r="4" fill="#c7d2fe"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fef3c7"/><path d="M12 44 L52 44 L48 28 L40 36 L32 24 L24 34 L16 26 Z" fill="#fbbf24"/><rect x="26" y="44" width="12" height="12" rx="2" fill="#92400e"/></svg>',
  ]
  const s = svgs[index] ?? svgs[0]
  return `url("data:image/svg+xml,${encodeURIComponent(s)}")`
}

function stickyNoteStyle(themeKey) {
  const th = getMainTheme(themeKey)
  return {
    '--saved-link-accent': th.solid,
    backgroundColor: th.light,
    color: th.dark,
  }
}

/** To-Do cards use the same themed “link” backgrounds as SavedLinksPage. */
const TODO_CARD_THEME_KEY = 'productivity_workflow'

function smallNoteCardStyle(note) {
  if (note.noteMode === 'TODO') {
    return stickyNoteStyle(TODO_CARD_THEME_KEY)
  }
  const bgType = String(note.backgroundType ?? 'none').toLowerCase()
  const idx = Math.min(Math.max(Number(note.backgroundIndex) || 0, 0), SOLID_COLORS.length - 1)
  if (bgType === 'solid') {
    const th = getMainTheme(null)
    return {
      '--saved-link-accent': th.solid,
      backgroundColor: SOLID_COLORS[idx],
      color: '#0f172a',
    }
  }
  if (bgType === 'image') {
    return {
      '--saved-link-accent': '#0891b2',
      backgroundColor: '#ecfeff',
      backgroundImage: natureSvgDataUri(idx),
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      color: '#0f172a',
    }
  }
  return stickyNoteStyle(null)
}

function formatNoteTitle(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function formatNoteDescription(raw) {
  const s = raw == null ? '' : String(raw).trim()
  if (!s) return '—'
  const normalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  if (normalized.length <= DESC_NOTE_MAX) return normalized
  return `${normalized.slice(0, DESC_NOTE_MAX)}...`
}

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

function htmlToPlainPreview(html) {
  if (typeof document === 'undefined') {
    return String(html ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const d = document.createElement('div')
  d.innerHTML = html ?? ''
  return (d.innerText || d.textContent || '').trim()
}

function noteRowMatchesSearch(row, qLower) {
  if (!qLower) return true
  const h = String(row.heading ?? '').toLowerCase()
  if (h.includes(qLower)) return true
  const descPlain = htmlToPlainPreview(row.description ?? '').toLowerCase()
  if (descPlain.includes(qLower)) return true
  for (const it of normalizeTodoItemsClient(row.todoItems)) {
    if (String(it.text ?? '').toLowerCase().includes(qLower)) return true
  }
  return false
}

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

export default function NotePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const user = getStoredUser()
  const zoomTitleId = useId()
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [addNoteOriginRect, setAddNoteOriginRect] = useState(null)
  const [noteToEdit, setNoteToEdit] = useState(null)
  const [smallNotes, setSmallNotes] = useState([])
  const [notesBusy, setNotesBusy] = useState(true)
  const [expandedNoteId, setExpandedNoteId] = useState(null)
  const [zoomFlyRect, setZoomFlyRect] = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteSucceeded, setDeleteSucceeded] = useState(false)
  const deleteSuccessTimeoutRef = useRef(null)
  const zoomPanelRef = useRef(null)
  const zoomShellRef = useRef(null)
  const zoomTitleRef = useRef(null)
  const zoomBodyRef = useRef(null)
  const zoomFooterRef = useRef(null)
  const todoSavePendingRef = useRef(new Set())
  const [todoSavePending, setTodoSavePending] = useState(() => new Set())
  const [linksChooserOpen, setLinksChooserOpen] = useState(false)
  const [saveLinkOpen, setSaveLinkOpen] = useState(false)
  const [saveLinkFlyRect, setSaveLinkFlyRect] = useState(null)
  const linksChooserTitleId = useId()
  const linksChooserMsgId = useId()
  const [listMode, setListMode] = useState(readStoredNoteListMode)
  const [sortViaOpen, setSortViaOpen] = useState(false)
  const [noteSortFlyRect, setNoteSortFlyRect] = useState(null)
  const [noteSortConfig, setNoteSortConfig] = useState(null)
  const [noteReorderOpen, setNoteReorderOpen] = useState(false)
  const [noteReorderFlyRect, setNoteReorderFlyRect] = useState(null)
  /** Bumps on each reorder open so NoteReorder remounts; fixes fly-from using previous button rect. */
  const [noteReorderSessionKey, setNoteReorderSessionKey] = useState(0)
  /** Zoom-only pin feedback: loading spinner then success check in the pin button. */
  const [pinAction, setPinAction] = useState(null)
  const pinInFlightRef = useRef(false)
  const [noteSearchInput, setNoteSearchInput] = useState('')
  const [noteSearchDebounced, setNoteSearchDebounced] = useState('')
  const [smallNotesDbTotal, setSmallNotesDbTotal] = useState(null)
  /** Non-null: show API search results; `[]` means no matches from server. */
  const [noteSearchServerRows, setNoteSearchServerRows] = useState(null)
  /** After search icon when DB total ≤ threshold: search entire fetched list (sort + toggle already applied). */
  const [noteSearchWideClient, setNoteSearchWideClient] = useState(false)
  const [noteSearchBusy, setNoteSearchBusy] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTE_PAGE_LIST_MODE_KEY, listMode)
    } catch {
      /* ignore */
    }
  }, [listMode])

  const displayedSmallNotes = useMemo(() => {
    let list = smallNotes
    if (listMode === 'todo') list = list.filter((n) => n.noteMode === 'TODO')
    else if (listMode === 'note') list = list.filter((n) => n.noteMode === 'NOTE')

    const pinned = list
      .filter((n) => n.pinPosition != null)
      .sort((a, b) => (a.pinPosition ?? 0) - (b.pinPosition ?? 0))

    let unpinned = list.filter((n) => n.pinPosition == null)

    if (listMode !== 'note' && noteSortConfig?.todoStatus) {
      unpinned = unpinned.filter((n) => {
        if (n.noteMode !== 'TODO') return listMode === 'both'
        const items = normalizeTodoItemsClient(n.todoItems)
        if (noteSortConfig.todoStatus === 'completed') {
          return items.length > 0 && items.every((t) => t.done)
        }
        return items.some((t) => !t.done)
      })
    }

    const dir = noteSortConfig?.dateOrder === 'asc' ? 1 : -1
    const unpinnedSorted = [...unpinned].sort((a, b) => {
      const at = new Date(a.createdAt ?? 0).getTime()
      const bt = new Date(b.createdAt ?? 0).getTime()
      const aSafe = Number.isFinite(at) ? at : 0
      const bSafe = Number.isFinite(bt) ? bt : 0
      return (aSafe - bSafe) * dir
    })

    return [...pinned, ...unpinnedSorted]
  }, [smallNotes, listMode, noteSortConfig])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setNoteSearchDebounced(noteSearchInput)
    }, NOTE_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [noteSearchInput])

  useEffect(() => {
    setNoteSearchServerRows(null)
    setNoteSearchWideClient(false)
  }, [noteSearchInput, listMode, noteSortConfig])

  const gridSmallNotes = useMemo(() => {
    if (noteSearchServerRows != null) return noteSearchServerRows
    const qDeb = noteSearchDebounced.trim().toLowerCase()
    const qNow = noteSearchInput.trim().toLowerCase()
    if (noteSearchWideClient && qNow) {
      return displayedSmallNotes.filter((r) => noteRowMatchesSearch(r, qNow))
    }
    if (qDeb) {
      return displayedSmallNotes
        .slice(0, NOTE_SEARCH_DEBOUNCE_SLICE)
        .filter((r) => noteRowMatchesSearch(r, qDeb))
    }
    return displayedSmallNotes
  }, [
    displayedSmallNotes,
    noteSearchDebounced,
    noteSearchInput,
    noteSearchServerRows,
    noteSearchWideClient,
  ])

  const noteSearchActive =
    Boolean(noteSearchDebounced.trim()) ||
    noteSearchServerRows != null ||
    noteSearchWideClient

  const pinnedForReorderDialog = useMemo(() => {
    let list = smallNotes
    if (listMode === 'todo') list = list.filter((n) => n.noteMode === 'TODO')
    else if (listMode === 'note') list = list.filter((n) => n.noteMode === 'NOTE')
    return list
      .filter((n) => n.pinPosition != null)
      .sort((a, b) => (a.pinPosition ?? 0) - (b.pinPosition ?? 0))
  }, [smallNotes, listMode])

  const handleSavePinReorder = useCallback(async (orderedIds) => {
    const data = await patchSmallNotesPinOrder({ orderedIds, listMode })
    if (Array.isArray(data?.smallNotes)) setSmallNotes(data.smallNotes)
  }, [listMode])

  const pinnedCountGlobal = useMemo(
    () => smallNotes.filter((n) => n.pinPosition != null).length,
    [smallNotes],
  )

  const handleTogglePin = useCallback(async (row, pinned) => {
    if (!row?.id) return
    if (pinInFlightRef.current) return
    pinInFlightRef.current = true
    setPinAction({ noteId: row.id, phase: 'loading' })
    try {
      const data = await patchSmallNotePin(row.id, { pinned })
      const next = data?.smallNote
      if (next?.id) {
        setSmallNotes((prev) => prev.map((n) => (n.id === next.id ? { ...n, ...next } : n)))
      }
      setPinAction({ noteId: row.id, phase: 'success' })
      window.setTimeout(() => {
        setPinAction((cur) => (cur?.noteId === row.id ? null : cur))
        pinInFlightRef.current = false
      }, 900)
    } catch (err) {
      setPinAction(null)
      pinInFlightRef.current = false
      window.alert(err instanceof Error ? err.message : 'Could not update pin')
    }
  }, [])

  const listModeEnterDir = useMemo(() => {
    if (listMode === 'todo') return 'prev'
    if (listMode === 'note') return 'next'
    return 'prev'
  }, [listMode])

  const sortViaActive =
    noteSortConfig?.dateOrder === 'asc' || !!noteSortConfig?.todoStatus

  const syncTodoSavePending = useCallback((mutate) => {
    mutate(todoSavePendingRef.current)
    setTodoSavePending(new Set(todoSavePendingRef.current))
  }, [])

  const toggleTodoChecked = useCallback(async (row, itemIndex) => {
    const items = normalizeTodoItemsClient(row.todoItems)
    if (itemIndex < 0 || itemIndex >= items.length) return
    const key = `${row.id}:${itemIndex}`
    if (todoSavePendingRef.current.has(key)) return
    const previousItems = items.map((it) => ({ ...it }))
    const next = items.map((it, i) =>
      i === itemIndex ? { ...it, done: !it.done } : it,
    )
    syncTodoSavePending((s) => {
      s.add(key)
    })
    setSmallNotes((prev) =>
      prev.map((n) => (n.id === row.id ? { ...n, todoItems: next } : n)),
    )
    try {
      await patchSmallNote(row.id, {
        noteMode: 'TODO',
        heading: row.heading,
        todoItems: next,
      })
    } catch (err) {
      setSmallNotes((prev) =>
        prev.map((n) =>
          n.id === row.id ? { ...n, todoItems: previousItems } : n,
        ),
      )
      window.alert(err instanceof Error ? err.message : 'Could not update to-do')
    } finally {
      syncTodoSavePending((s) => {
        s.delete(key)
      })
    }
  }, [syncTodoSavePending])

  const handleTextClick = useCallback(
    (e, row, index) => {
      const el = e.currentTarget
      if (pointHitsInlineText(el, e.clientX, e.clientY)) {
        e.preventDefault()
        void toggleTodoChecked(row, index)
      }
    },
    [toggleTodoChecked],
  )

  const loadNotes = useCallback(async () => {
    setNotesBusy(true)
    setNoteSearchServerRows(null)
    setNoteSearchWideClient(false)
    try {
      const data = await fetchSmallNotes()
      setSmallNotes(Array.isArray(data.smallNotes) ? data.smallNotes : [])
      try {
        const meta = await fetchSmallNotesMeta()
        setSmallNotesDbTotal(
          meta && typeof meta.total === 'number' && Number.isFinite(meta.total)
            ? meta.total
            : null,
        )
      } catch {
        setSmallNotesDbTotal(null)
      }
    } catch {
      setSmallNotes([])
      setSmallNotesDbTotal(null)
    } finally {
      setNotesBusy(false)
    }
  }, [])

  const handleNoteSearchSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const q = noteSearchInput.trim()
      if (!q) return
      const total = smallNotesDbTotal
      const useDb =
        total != null && total > NOTE_SEARCH_ICON_DB_THRESHOLD
      if (useDb) {
        setNoteSearchBusy(true)
        setNoteSearchServerRows(null)
        setNoteSearchWideClient(false)
        try {
          const data = await searchSmallNotes({
            q,
            listMode,
            ...(noteSortConfig?.dateOrder === 'asc' ? { dateOrder: 'asc' } : {}),
            ...(noteSortConfig?.todoStatus === 'completed' ||
            noteSortConfig?.todoStatus === 'uncompleted'
              ? { todoStatus: noteSortConfig.todoStatus }
              : {}),
          })
          setNoteSearchServerRows(
            Array.isArray(data.smallNotes) ? data.smallNotes : [],
          )
        } catch {
          setNoteSearchServerRows([])
        } finally {
          setNoteSearchBusy(false)
        }
      } else {
        setNoteSearchServerRows(null)
        setNoteSearchWideClient(true)
      }
    },
    [listMode, noteSearchInput, noteSortConfig, smallNotesDbTotal],
  )

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (expandedNoteId == null) return
    const inList = smallNotes.some((n) => n.id === expandedNoteId)
    const inSearch = (noteSearchServerRows ?? []).some((n) => n.id === expandedNoteId)
    if (!inList && !inSearch) setExpandedNoteId(null)
  }, [smallNotes, expandedNoteId, noteSearchServerRows])

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
    if (!location.state?.openAddNote) return
    setNoteToEdit(null)
    setAddNoteOriginRect(null)
    setAddNoteOpen(true)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    return () => {
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

  const expandedRow =
    expandedNoteId != null
      ? smallNotes.find((n) => n.id === expandedNoteId) ??
        (noteSearchServerRows ?? []).find((n) => n.id === expandedNoteId) ??
        null
      : null

  const zoomTodoRows =
    expandedRow && expandedRow.noteMode === 'TODO'
      ? normalizeTodoItemsClient(expandedRow.todoItems)
      : []
  const zoomTodoAllDone =
    zoomTodoRows.length > 0 && zoomTodoRows.every((t) => t.done)

  const remeasureZoomScroll = useCallback(() => {
    const panel = zoomPanelRef.current
    const body = zoomBodyRef.current
    const titleEl = zoomTitleRef.current
    const footerEl = zoomFooterRef.current
    const inner = zoomShellRef.current
    if (!panel || !body || !inner) return

    const panelMaxH = Math.min(window.innerHeight * 0.9, ZOOM_TARGET_MAX_H)
    panel.style.maxHeight = `${panelMaxH}px`

    body.style.maxHeight = 'none'
    body.style.overflow = 'hidden'
    const natural = body.scrollHeight

    const titleH = titleEl?.offsetHeight ?? 0
    const footerH = footerEl?.offsetHeight ?? 0
    const innerCS = getComputedStyle(inner)
    const padY =
      (parseFloat(innerCS.paddingTop) || 0) + (parseFloat(innerCS.paddingBottom) || 0) || 44
    const gap = parseFloat(innerCS.gap) || 10
    const chrome = titleH + footerH + padY + gap * 2
    const maxBody = Math.max(100, Math.floor(panelMaxH - chrome))
    const target = Math.min(natural, maxBody)
    body.style.maxHeight = `${target}px`
    body.style.overflowY = 'auto'
  }, [])

  useLayoutEffect(() => {
    if (!expandedRow) return
    const run = () => remeasureZoomScroll()
    run()
    const t0 = requestAnimationFrame(() => {
      requestAnimationFrame(run)
    })
    const body = zoomBodyRef.current
    let ro
    if (typeof ResizeObserver !== 'undefined' && body) {
      ro = new ResizeObserver(() => run())
      ro.observe(body)
    }
    const onResize = () => run()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(t0)
      ro?.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [expandedRow, expandedNoteId, remeasureZoomScroll])

  const handleConfirmDeleteSmallNote = async () => {
    if (!expandedRow || deleting || deleteSucceeded) return
    setDeleteConfirmOpen(false)
    setDeleting(true)
    try {
      await deleteSmallNote(expandedRow.id)
      setDeleting(false)
      setDeleteSucceeded(true)
      if (deleteSuccessTimeoutRef.current) clearTimeout(deleteSuccessTimeoutRef.current)
      deleteSuccessTimeoutRef.current = setTimeout(() => {
        deleteSuccessTimeoutRef.current = null
        setDeleteSucceeded(false)
        setExpandedNoteId(null)
        void loadNotes()
      }, 2000)
    } catch (err) {
      setDeleting(false)
      window.alert(err instanceof Error ? err.message : 'Could not delete.')
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
          <div>
            <h1 className="app-home-title">Notes</h1>
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
        <div className="note-page-toolbar-stack">
          <div className="note-page-toolbar-actions">
            <motion.button
              type="button"
              className="login-primary app-home-toolbar-btn app-home-toolbar-btn--primary"
              onClick={(e) => {
                setNoteToEdit(null)
                setAddNoteOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
                setAddNoteOpen(true)
              }}
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Add note
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
              className={
                sortViaActive
                  ? 'app-home-toolbar-btn app-home-toolbar-btn--toggle-on'
                  : 'app-home-toolbar-btn'
              }
              onClick={(e) => {
                setNoteSortFlyRect(boundingRectFromButtonOrParent(e.currentTarget))
                setSortViaOpen(true)
              }}
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Sort via
            </motion.button>
          </div>
          <LayoutGroup>
            <div
              className="calendar-view-toggle note-page-list-mode-toggle"
              role="group"
              aria-label="Show to-dos, notes, or both"
            >
              <motion.button
                type="button"
                className="calendar-view-toggle-seg"
                onClick={() => setListMode('todo')}
                aria-pressed={listMode === 'todo'}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                layout
              >
                {listMode === 'todo' ? (
                  <motion.div
                    layoutId="note-page-list-mode-pill"
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
                    listMode === 'todo'
                      ? 'calendar-view-toggle-label calendar-view-toggle-label--active'
                      : 'calendar-view-toggle-label'
                  }
                >
                  To-Do
                </span>
              </motion.button>
              <motion.button
                type="button"
                className="calendar-view-toggle-seg"
                onClick={() => setListMode('both')}
                aria-pressed={listMode === 'both'}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                layout
              >
                {listMode === 'both' ? (
                  <motion.div
                    layoutId="note-page-list-mode-pill"
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
                    listMode === 'both'
                      ? 'calendar-view-toggle-label calendar-view-toggle-label--active'
                      : 'calendar-view-toggle-label'
                  }
                >
                  {'Note & To-Do'}
                </span>
              </motion.button>
              <motion.button
                type="button"
                className="calendar-view-toggle-seg"
                onClick={() => setListMode('note')}
                aria-pressed={listMode === 'note'}
                whileTap={{ scale: 0.98 }}
                whileHover={reduceMotion ? {} : { y: -1 }}
                layout
              >
                {listMode === 'note' ? (
                  <motion.div
                    layoutId="note-page-list-mode-pill"
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
                    listMode === 'note'
                      ? 'calendar-view-toggle-label calendar-view-toggle-label--active'
                      : 'calendar-view-toggle-label'
                  }
                >
                  Note
                </span>
              </motion.button>
            </div>
          </LayoutGroup>
          <form
            className="saved-links-search note-page-search"
            onSubmit={handleNoteSearchSubmit}
            role="search"
            aria-label="Search notes and to-dos"
          >
            <input
              type="search"
              className="saved-links-search__input"
              placeholder="Search heading, description, or to-do text"
              value={noteSearchInput}
              onChange={(e) => setNoteSearchInput(e.target.value)}
              aria-label="Search notes and to-dos"
              autoComplete="off"
              maxLength={200}
            />
            <motion.button
              type="submit"
              className="saved-links-search__submit saved-links-search__submit--icon app-home-toolbar-btn app-home-toolbar-btn--primary"
              disabled={notesBusy || noteSearchBusy}
              aria-label="Search"
              title="Search"
              whileTap={{ scale: 0.97 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              <NoteSearchIcon className="saved-links-search__icon" />
            </motion.button>
          </form>
        </div>
      </section>

      <div className="saved-links-board">
        {notesBusy ? (
          <div
            className="saved-links-grid saved-links-grid--skeleton"
            aria-busy="true"
            aria-label="Loading notes"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="saved-link-skeleton">
                <div className="saved-link-skeleton__line saved-link-skeleton__line--title" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--desc" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--desc-short" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--meta" />
                <div className="saved-link-skeleton__line saved-link-skeleton__line--date" />
              </div>
            ))}
          </div>
        ) : smallNotes.length === 0 ? (
          <p className="saved-links-empty modal-text">No notes yet.</p>
        ) : displayedSmallNotes.length === 0 ? (
          <p className="saved-links-empty modal-text">Nothing matches this filter.</p>
        ) : gridSmallNotes.length === 0 && noteSearchActive ? (
          <p className="saved-links-empty modal-text">No match found.</p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={listMode}
              className="saved-links-grid"
              role="list"
              custom={{ dir: listModeEnterDir, rm: reduceMotion }}
              variants={NOTE_LIST_MODE_GRID_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={
                reduceMotion
                  ? { duration: 0.15 }
                  : {
                      duration: 0.5,
                      ease: [0.4, 0, 0.2, 1],
                    }
              }
            >
              {gridSmallNotes.map((row) => {
                const isTodo = row.noteMode === 'TODO'
                const todoRows = isTodo ? normalizeTodoItemsClient(row.todoItems) : []
                const metaLine = isTodo ? 'To-Do' : 'Note'
                const todoAllDone =
                  isTodo && todoRows.length > 0 && todoRows.every((t) => t.done)
                const rowPinned = row.pinPosition != null
                return (
                  <article
                    key={row.id}
                    className={`saved-link-note${rowPinned ? ' note-page-tile--pinned' : ''}`}
                    style={smallNoteCardStyle(row)}
                    role="listitem"
                    onClick={(e) => {
                      setZoomFlyRect(e.currentTarget.getBoundingClientRect())
                      setExpandedNoteId(row.id)
                    }}
                  >
                    {rowPinned ? (
                      <>
                        <button
                          type="button"
                          className="note-page-pin-reorder-open"
                          aria-label="Reorder pinned items"
                          onClick={(e) => {
                            e.stopPropagation()
                            setNoteReorderSessionKey((k) => k + 1)
                            setNoteReorderFlyRect(
                              boundingRectFromButtonOrParent(e.currentTarget),
                            )
                            setNoteReorderOpen(true)
                          }}
                        >
                          <span className="note-page-pin-reorder-open__icon" aria-hidden>
                            ⇅
                          </span>
                        </button>
                        <span
                          className="note-page-pin-badge note-page-pin-badge--pinned"
                          aria-label="Pinned"
                          role="img"
                        >
                          <NotePinSvg />
                        </span>
                      </>
                    ) : null}
                    <div className="saved-link-note__body">
                      <h3 className="saved-link-note__title">{formatNoteTitle(row.heading)}</h3>
                      {isTodo ? (
                        <div className="note-page-tile-todo-block note-page-tile-todo-block--readonly">
                          {todoRows.length === 0 ? (
                            <p className="saved-link-note__desc">—</p>
                          ) : (
                            todoRows.map((item, i) => (
                              <div
                                key={`${row.id}-todo-${i}-${item.text.slice(0, 16)}`}
                                className="note-page-todo-check-row note-page-todo-check-row--readonly"
                              >
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  disabled
                                  readOnly
                                  tabIndex={-1}
                                  aria-hidden
                                />
                                <span
                                  className={
                                    item.done
                                      ? 'note-page-todo-line-text note-page-todo-line-text--done'
                                      : 'note-page-todo-line-text'
                                  }
                                >
                                  {item.text}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <p className="saved-link-note__desc">
                          {formatNoteDescription(htmlToPlainPreview(row.description))}
                        </p>
                      )}
                      <p
                        className={`saved-link-note__meta note-page-tile-type note-page-tile-type--${
                          isTodo ? 'todo' : 'note'
                        }${isTodo ? ' note-page-tile-type--row' : ''}`}
                      >
                        {isTodo ? (
                          <>
                            <span className="note-page-tile-type-leader" aria-hidden />
                            <span className="note-page-tile-type-text">Type — {metaLine}</span>
                            <span className="note-page-tile-type-badge-wrap" aria-hidden="true">
                              {todoAllDone ? (
                                <svg
                                  className="note-page-tile-type-icon note-page-tile-type-icon--done"
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path
                                    fill="currentColor"
                                    d="M9 16.17L4.83 12l-1.42 1.41L9 19l12-12-1.41-1.41z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="note-page-tile-type-icon note-page-tile-type-icon--open"
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path
                                    fill="currentColor"
                                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                  />
                                </svg>
                              )}
                            </span>
                          </>
                        ) : (
                          <>Type — {metaLine}</>
                        )}
                      </p>
                      <p className="saved-link-note__date">Added on — {formatSavedDate(row.createdAt)}</p>
                    </div>
                  </article>
                )
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence
        onExitComplete={() => {
          setZoomFlyRect(null)
        }}
      >
        {expandedRow && (
          <motion.div
            key={expandedRow.id}
            className="saved-link-zoom note-page-zoom"
            role="dialog"
            aria-modal="true"
            aria-labelledby={zoomTitleId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0.12 : 0.38,
              ease: [0.22, 0.61, 0.36, 1],
            }}
          >
            <div className="saved-link-zoom__backdrop" aria-hidden />
            <motion.div
              ref={zoomPanelRef}
              className="saved-link-zoom__panel saved-link-note saved-link-note--zoom"
              style={{
                ...smallNoteCardStyle(expandedRow),
                transformOrigin: 'center center',
              }}
              custom={{ rect: zoomFlyRect, reduceMotion }}
              variants={ZOOM_PANEL_VARIANTS}
              initial="fromOrigin"
              animate="expanded"
              exit="fromOrigin"
              transition={
                reduceMotion
                  ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
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
              <div ref={zoomShellRef} className="saved-link-zoom__inner">
                <h2
                  id={zoomTitleId}
                  ref={zoomTitleRef}
                  className="saved-link-zoom__title"
                >
                  {formatNoteTitle(expandedRow.heading)}
                </h2>
                <div
                  ref={zoomBodyRef}
                  className="saved-link-zoom__desc note-page-zoom-scroll"
                >
                  {expandedRow.noteMode === 'NOTE' ? (
                    <div
                      className="note-page-zoom-html"
                      dangerouslySetInnerHTML={{ __html: expandedRow.description || '' }}
                    />
                  ) : (
                    <div
                      className="note-page-todo-zoom-wrap"
                      onClick={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      {zoomTodoRows.map((item, i) => {
                        const saveKey = `${expandedRow.id}:${i}`
                        const rowSaving = todoSavePending.has(saveKey)
                        return (
                          <div
                            key={`${i}-${item.text.slice(0, 24)}`}
                            className={
                              rowSaving
                                ? 'note-page-todo-check-row note-page-todo-check-row--zoom note-page-todo-check-row--saving'
                                : 'note-page-todo-check-row note-page-todo-check-row--zoom'
                            }
                          >
                            <span className="note-page-todo-check-slot">
                              {rowSaving ? (
                                <span
                                  className="note-page-todo-save-spinner"
                                  aria-label="Saving"
                                  role="status"
                                >
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    aria-hidden
                                  >
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r="9"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeDasharray="14 32"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  onChange={() => void toggleTodoChecked(expandedRow, i)}
                                />
                              )}
                            </span>
                            <span
                              className={
                                item.done
                                  ? 'note-page-todo-line-text note-page-todo-line-text--done'
                                  : 'note-page-todo-line-text'
                              }
                            >
                              <span
                                className="note-page-todo-line-text-inner"
                                onMouseDown={(e) => handleTextClick(e, expandedRow, i)}
                              >
                                {item.text}
                              </span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div
                  ref={zoomFooterRef}
                  className="saved-link-zoom__footer note-page-zoom-footer"
                >
                  <div className="note-page-zoom-footer__text">
                    <p className="saved-link-note__meta saved-link-note__date">
                      Type — {expandedRow.noteMode === 'TODO' ? 'To-Do' : 'Note'}
                      <br />
                      Added on — {formatSavedDate(expandedRow.createdAt)}
                    </p>
                  </div>
                  <div className="note-page-zoom-footer__actions">
                    {expandedRow.noteMode === 'TODO' && (
                      <span
                        className="note-page-zoom-footer__todo-status"
                        aria-hidden="true"
                      >
                        {zoomTodoAllDone ? (
                          <svg
                            className="note-page-tile-type-icon note-page-tile-type-icon--done"
                            width="26"
                            height="26"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path
                              fill="currentColor"
                              d="M9 16.17L4.83 12l-1.42 1.41L9 19l12-12-1.41-1.41z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="note-page-tile-type-icon note-page-tile-type-icon--open"
                            width="26"
                            height="26"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path
                              fill="currentColor"
                              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                            />
                          </svg>
                        )}
                      </span>
                    )}
                    {(() => {
                      const zPinned = expandedRow.pinPosition != null
                      const zPinCap = pinnedCountGlobal >= 5
                      const zPinDisabled = !zPinned && zPinCap
                      const pinPhase =
                        pinAction?.noteId === expandedRow.id ? pinAction.phase : null
                      const pinLabel =
                        pinPhase === 'loading'
                          ? zPinned
                            ? 'Unpinning…'
                            : 'Pinning…'
                          : pinPhase === 'success'
                            ? 'Saved'
                            : zPinned
                              ? 'Unpin'
                              : 'Pin'
                      return (
                        <motion.button
                          type="button"
                          className={[
                            'saved-link-zoom__icon-btn',
                            'note-page-pin-btn-zoom',
                            zPinned
                              ? 'note-page-pin-btn-zoom--pinned'
                              : 'note-page-pin-btn-zoom--muted',
                          ].join(' ')}
                          aria-label={pinLabel}
                          aria-pressed={zPinned}
                          aria-busy={pinPhase === 'loading'}
                          disabled={zPinDisabled}
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleTogglePin(expandedRow, !zPinned)
                          }}
                          whileTap={zPinDisabled ? {} : { scale: 0.92 }}
                          whileHover={
                            reduceMotion || zPinDisabled ? {} : { y: -1 }
                          }
                        >
                          {pinPhase === 'loading' ? (
                            <span
                              className="note-page-todo-save-spinner note-page-pin-zoom-spinner"
                              aria-hidden
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="9"
                                  stroke="currentColor"
                                  strokeWidth="2.25"
                                  strokeLinecap="round"
                                  strokeDasharray="44"
                                  strokeDashoffset="10"
                                />
                              </svg>
                            </span>
                          ) : pinPhase === 'success' ? (
                            <span className="note-page-pin-zoom-success" aria-hidden>
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19l12-12-1.41-1.41L9 16.17z" />
                              </svg>
                            </span>
                          ) : (
                            <NotePinSvg />
                          )}
                        </motion.button>
                      )
                    })()}
                    <motion.button
                      type="button"
                      className="saved-link-zoom__icon-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        const snap = snapshotSmallNoteForEdit(expandedRow)
                        if (!snap) return
                        setNoteToEdit(snap)
                        setAddNoteOriginRect(boundingRectFromButtonOrParent(e.currentTarget))
                        setAddNoteOpen(true)
                        setExpandedNoteId(null)
                      }}
                      whileTap={{ scale: 0.92 }}
                      whileHover={reduceMotion ? {} : { y: -1 }}
                      aria-label="Edit note"
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
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!deleting && !deleteSucceeded) setDeleteConfirmOpen(true)
                    }}
                    whileTap={deleteSucceeded ? {} : { scale: 0.92 }}
                    whileHover={reduceMotion || deleteSucceeded ? {} : { y: -1 }}
                    disabled={deleting || deleteSucceeded}
                    aria-label={deleteSucceeded ? 'Deleted' : 'Delete note'}
                  >
                    {deleteSucceeded ? (
                      <SavedLinkSuccessIcon />
                    ) : deleting ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          strokeWidth="2"
                          opacity="0.4"
                        />
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
                        <path
                          d="M10 11v6M14 11v6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {createPortal(
        <div className="saved-links-delete-confirm-mount">
          <DeleteConfirmPop
            open={deleteConfirmOpen}
            skipDocumentScrollLock
            title="Delete"
            message="Are you sure you want to delete this? This cannot be undone."
            onCancel={() => setDeleteConfirmOpen(false)}
            onConfirm={handleConfirmDeleteSmallNote}
          />
        </div>,
        document.body,
      )}

      <NoteReorder
        key={noteReorderSessionKey}
        open={noteReorderOpen && pinnedForReorderDialog.length > 0}
        originRect={noteReorderFlyRect}
        onClose={() => {
          setNoteReorderOpen(false)
        }}
        onSheetExitComplete={() => setNoteReorderFlyRect(null)}
        pinnedRows={pinnedForReorderDialog}
        onSave={handleSavePinReorder}
      />
      <AddNote
        open={addNoteOpen}
        originRect={addNoteOriginRect}
        editNote={noteToEdit}
        onClose={() => {
          setAddNoteOpen(false)
          setNoteToEdit(null)
        }}
        onSheetExitComplete={() => setAddNoteOriginRect(null)}
        onSaved={() => {
          void loadNotes()
        }}
      />
      <SaveNewLinkModal
        open={saveLinkOpen}
        originRect={saveLinkFlyRect}
        onSheetExitComplete={() => setSaveLinkFlyRect(null)}
        onClose={() => setSaveLinkOpen(false)}
        onSaved={async (payload) => {
          await createSavedLink(payload)
        }}
      />
      <NoteSortViaPop
        open={sortViaOpen}
        originRect={noteSortFlyRect}
        onSheetExitComplete={() => setNoteSortFlyRect(null)}
        onClose={() => setSortViaOpen(false)}
        includeTodoStatus={listMode !== 'note'}
        initialSort={noteSortConfig}
        onApply={(config) => {
          setNoteSortConfig(config)
          setSortViaOpen(false)
        }}
      />
    </div>
  )
}
