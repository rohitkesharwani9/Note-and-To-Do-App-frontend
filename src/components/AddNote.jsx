import {
  AnimatePresence,
  motion,
  Reorder,
  usePresence,
  useReducedMotion,
} from 'framer-motion'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createSmallNote, patchSmallNote } from '../lib/api.js'
import {
  createModalFlySheetVariants,
  MODAL_FLY_SORT_VIA_MAX_W,
} from '../lib/modalFlyVariants.js'
import '../pages/LoginPage.css'
import './AddTask.css'
import { ConfirmPop } from './ConfirmPop.jsx'
import './AddNote.css'

const ADD_NOTE_MODAL_MAX_H = 920
const ADD_NOTE_MODAL_FLY_VARIANTS = createModalFlySheetVariants(
  MODAL_FLY_SORT_VIA_MAX_W,
  ADD_NOTE_MODAL_MAX_H,
)

const HEADING_MIN = 1
const HEADING_MAX = 60
const DESC_MIN = 1
const DESC_MAX = 3000
const TODO_LINE_MIN = 1
const TODO_LINE_MAX = 200
const TODO_MAX = 50

const SVG_ICON_PATHS = {
  aa: '/svg-icons/A-letter-svg.svg',
  bold: '/svg-icons/bold-svg.svg',
  clear: '/svg-icons/text-clear-formatting-svg.svg',
  h1: '/svg-icons/h1-svg.svg',
  h2: '/svg-icons/h2-svg.svg',
  italic: '/svg-icons/italic-svg.svg',
  underline: '/svg-icons/underline-svg.svg',
}

function newTodoOrderKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

const TODO_DELETE_CLOCK_R = 10
const TODO_DELETE_CLOCK_C = 2 * Math.PI * TODO_DELETE_CLOCK_R

/** 4s hollow watch: red ring fills + needle rotates; remount with `animKey` to restart. */
function TodoDeleteConfirmClock({ animKey, reduceMotion }) {
  return (
    <svg
      key={animKey}
      className="add-note-todo-delete-clock"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden
    >
      <circle
        cx="14"
        cy="14"
        r={TODO_DELETE_CLOCK_R}
        fill="none"
        stroke="rgba(220, 38, 38, 0.35)"
        strokeWidth="2"
      />
      <circle
        className={
          reduceMotion
            ? 'add-note-todo-delete-clock-ring add-note-todo-delete-clock-ring--reduced'
            : 'add-note-todo-delete-clock-ring'
        }
        cx="14"
        cy="14"
        r={TODO_DELETE_CLOCK_R}
        fill="none"
        stroke="#dc2626"
        strokeWidth="2"
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
        strokeDasharray={TODO_DELETE_CLOCK_C}
        strokeDashoffset={TODO_DELETE_CLOCK_C}
      />
      <g
        className={
          reduceMotion
            ? 'add-note-todo-delete-clock-needle add-note-todo-delete-clock-needle--reduced'
            : 'add-note-todo-delete-clock-needle'
        }
        style={{ transformOrigin: '14px 14px' }}
      >
        <line
          x1="14"
          y1="14"
          x2="14"
          y2="5"
          stroke="#b91c1c"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

/** 10 light solid fills */
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

/** Cartoonish nature-style SVG tiles (10) — encoded for CSS background */
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

function plainDescLen(el) {
  if (!el) return 0
  return (el.innerText || el.textContent || '').length
}

function plainHtmlTextLen(html) {
  if (typeof document === 'undefined') return 0
  const d = document.createElement('div')
  d.innerHTML = html || ''
  return (d.innerText || d.textContent || '').length
}

/** Hard cap like maxLength on inputs — uses visible text length (spaces count). */
function trimDescToMaxChars(el, max) {
  if (!el) return
  const t = el.innerText ?? ''
  if (t.length <= max) return
  el.textContent = t.slice(0, max)
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Inline SVG from `/svg-icons` with colors mapped to `currentColor` for toolbar theming */
function inlineSvgFromRaw(raw) {
  let s = String(raw)
    .replace(/<\?xml[^?]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
  s = s.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
    const a = attrs
      .replace(/\s+width="[^"]*"/gi, '')
      .replace(/\s+height="[^"]*"/gi, '')
    return `<svg width="22" height="22" class="add-note-tool-svg" aria-hidden="true" focusable="false"${a}>`
  })
  s = s.replace(/#000000/gi, 'currentColor')
  s = s.replace(/#212121/gi, 'currentColor')
  return s
}

function AddNoteFmtSvg({ raw }) {
  const html = useMemo(() => inlineSvgFromRaw(raw), [raw])
  return <span className="add-note-fmt-svg-host" dangerouslySetInnerHTML={{ __html: html }} />
}

function normalizeFormatBlock() {
  try {
    let v = String(document.queryCommandValue('formatBlock') || '').toLowerCase()
    v = v.replace(/[<>]/g, '').trim()
    return v
  } catch {
    return ''
  }
}

function selectionInDesc(descEl) {
  const sel = window.getSelection()
  if (!sel?.rangeCount || !descEl) return false
  const node = sel.anchorNode
  const el = node?.nodeType === 1 ? node : node?.parentElement
  return !!(el && descEl.contains(el))
}

function readFormatFlags(descEl) {
  if (!descEl) {
    return {
      bold: false,
      italic: false,
      underline: false,
      h1: false,
      h2: false,
      aa: true,
    }
  }
  const empty = plainDescLen(descEl) === 0
  if (!selectionInDesc(descEl)) {
    return {
      bold: false,
      italic: false,
      underline: false,
      h1: false,
      h2: false,
      aa: empty,
    }
  }
  const fb = normalizeFormatBlock()
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    h1: fb === 'h1',
    h2: fb === 'h2',
    aa: fb !== 'h1' && fb !== 'h2',
  }
}

/** Backdrop + sheet root: disables pointer capture while AnimatePresence exit runs (opacity 0 still hit-tests). */
function AddNotePresenceBackdrop({ sheetFullHeight, reduceMotion, children }) {
  const [isPresent] = usePresence()
  return (
    <motion.div
      className={`modal-backdrop add-task-backdrop add-note-fly-layer${
        sheetFullHeight ? ' add-note-fly-layer--full-bleed' : ''
      }`}
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: reduceMotion ? 0.15 : 0.38,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Modal to add a NOTE (rich description + background) or a TODO list note.
 */
export function AddNote({
  open,
  onClose,
  onSaved,
  originRect = null,
  onSheetExitComplete,
  /** When set, modal opens in edit mode with this small-note row (id + fields). */
  editNote = null,
}) {
  const reduceMotion = useReducedMotion()
  const titleId = useId()
  const descRef = useRef(null)
  const saveSuccessTimerRef = useRef(null)
  const todoEditingIndexRef = useRef(null)
  const todoItemsRef = useRef([])
  const pendingDeleteTimerRef = useRef(null)
  const [mode, setMode] = useState('note')
  const [noteHeading, setNoteHeading] = useState('')
  /** Persists rich description when switching to To-Do (contentEditable unmounts). */
  const [noteDescHtml, setNoteDescHtml] = useState('')
  const [descLen, setDescLen] = useState(0)
  const [todoHeading, setTodoHeading] = useState('')
  const [todoDraft, setTodoDraft] = useState('')
  const [todoItems, setTodoItems] = useState([])
  const [todoReorderEnabled, setTodoReorderEnabled] = useState(false)
  /** When set, that row is in edit mode: text lives in `todoDraft`, Add → Update */
  const [todoEditingIndex, setTodoEditingIndex] = useState(null)
  /** Stable _orderKey of row in delete countdown (second tap confirms) */
  const [pendingDeleteOrderKey, setPendingDeleteOrderKey] = useState(null)
  const [deleteClockKey, setDeleteClockKey] = useState(0)
  const [bgKind, setBgKind] = useState('none')
  const [bgIndex, setBgIndex] = useState(0)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveSucceeded, setSaveSucceeded] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [saveConfirmKind, setSaveConfirmKind] = useState('note')
  /** Bumps when selection or formatting changes so toolbar active states refresh */
  const [fmtTick, setFmtTick] = useState(0)
  /** Once the description hits its max height and scrolls, expand sheet to full viewport height */
  const [sheetFullHeight, setSheetFullHeight] = useState(false)
  const [fmtSvgs, setFmtSvgs] = useState({
    aa: '',
    bold: '',
    clear: '',
    h1: '',
    h2: '',
    italic: '',
    underline: '',
  })

  const syncDesc = useCallback(() => {
    const el = descRef.current
    if (el) {
      setDescLen(plainDescLen(el))
      setNoteDescHtml(el.innerHTML ?? '')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setSaveErr(null)
    setSaveBusy(false)
    setSaveSucceeded(false)
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setCancelConfirmOpen(false)
    setSaveConfirmOpen(false)
    setSheetFullHeight(false)

    if (editNote?.id) {
      const sn = editNote
      if (sn.noteMode === 'NOTE') {
        setMode('note')
        setNoteHeading(String(sn.heading ?? ''))
        setTodoHeading('')
        setTodoDraft('')
        setTodoItems([])
        setTodoEditingIndex(null)
        const bt = String(sn.backgroundType ?? 'none').toLowerCase()
        if (bt === 'solid' || bt === 'image') {
          setBgKind(bt)
          setBgIndex(Math.min(Math.max(Number(sn.backgroundIndex) || 0, 0), 9))
        } else {
          setBgKind('none')
          setBgIndex(0)
        }
        const desc = String(sn.description ?? '')
        setNoteDescHtml(desc)
        setSaveConfirmKind('note')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (descRef.current) {
              descRef.current.innerHTML = desc
              syncDesc()
              setFmtTick((t) => t + 1)
            }
          })
        })
      } else {
        setMode('todo')
        setNoteHeading('')
        setNoteDescHtml('')
        setTodoHeading(String(sn.heading ?? ''))
        setTodoDraft('')
        setTodoItems(
          Array.isArray(sn.todoItems)
            ? sn.todoItems.map((x) => {
                const row =
                  typeof x === 'string'
                    ? { text: String(x), done: false }
                    : { text: String(x?.text ?? ''), done: Boolean(x?.done) }
                return { ...row, _orderKey: newTodoOrderKey() }
              })
            : [],
        )
        setTodoReorderEnabled(false)
        setTodoEditingIndex(null)
        setBgKind('none')
        setBgIndex(0)
        setSaveConfirmKind('todo')
        requestAnimationFrame(() => {
          if (descRef.current) {
            descRef.current.innerHTML = ''
            syncDesc()
          }
          setFmtTick((t) => t + 1)
        })
      }
      return
    }

    setMode('note')
    setNoteHeading('')
    setTodoHeading('')
    setTodoDraft('')
    setTodoItems([])
    setTodoReorderEnabled(false)
    setTodoEditingIndex(null)
    setBgKind('none')
    setBgIndex(0)
    setSaveConfirmKind('note')
    setNoteDescHtml('')
    requestAnimationFrame(() => {
      if (descRef.current) descRef.current.innerHTML = ''
      syncDesc()
      setFmtTick((t) => t + 1)
    })
  }, [open, syncDesc, editNote])

  useEffect(() => {
    if (open) return
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setSaveSucceeded(false)
    if (pendingDeleteTimerRef.current) {
      clearTimeout(pendingDeleteTimerRef.current)
      pendingDeleteTimerRef.current = null
    }
    setPendingDeleteOrderKey(null)
  }, [open])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const entries = await Promise.all(
        Object.entries(SVG_ICON_PATHS).map(async ([k, p]) => {
          try {
            const res = await fetch(p)
            if (!res.ok) return [k, '']
            const raw = await res.text()
            return [k, raw]
          } catch {
            return [k, '']
          }
        }),
      )
      if (cancelled) return
      setFmtSvgs((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    todoEditingIndexRef.current = todoEditingIndex
  }, [todoEditingIndex])

  useEffect(() => {
    todoItemsRef.current = todoItems
  }, [todoItems])

  useEffect(() => {
    if (todoEditingIndex === null) return
    setTodoReorderEnabled(false)
    if (pendingDeleteTimerRef.current) {
      clearTimeout(pendingDeleteTimerRef.current)
      pendingDeleteTimerRef.current = null
    }
    setPendingDeleteOrderKey(null)
  }, [todoEditingIndex])

  useEffect(() => {
    if (mode === 'todo') return
    if (pendingDeleteTimerRef.current) {
      clearTimeout(pendingDeleteTimerRef.current)
      pendingDeleteTimerRef.current = null
    }
    setPendingDeleteOrderKey(null)
  }, [mode])

  useEffect(
    () => () => {
      if (pendingDeleteTimerRef.current) {
        clearTimeout(pendingDeleteTimerRef.current)
        pendingDeleteTimerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    if (mode === 'todo') setSheetFullHeight(false)
  }, [mode])

  const maybeExpandDescViewport = useCallback(() => {
    const el = descRef.current
    if (!el || mode !== 'note') return
    if (el.scrollHeight > el.clientHeight + 1) {
      setSheetFullHeight(true)
    }
  }, [mode])

  useEffect(() => {
    if (!open || mode !== 'note') return
    const bump = () => setFmtTick((t) => t + 1)
    document.addEventListener('selectionchange', bump)
    return () => document.removeEventListener('selectionchange', bump)
  }, [open, mode])

  const focusDesc = () => {
    descRef.current?.focus()
  }

  const bumpFmt = useCallback(() => setFmtTick((t) => t + 1), [])

  const applyFormat = useCallback(
    (fn) => {
      focusDesc()
      fn()
      syncDesc()
      bumpFmt()
    },
    [syncDesc, bumpFmt],
  )

  const handleToggleH1 = () => {
    focusDesc()
    const fb = normalizeFormatBlock()
    if (fb === 'h1') {
      document.execCommand('formatBlock', false, 'p')
    } else {
      document.execCommand('formatBlock', false, 'h1')
    }
    syncDesc()
    bumpFmt()
  }

  const handleToggleH2 = () => {
    focusDesc()
    const fb = normalizeFormatBlock()
    if (fb === 'h2') {
      document.execCommand('formatBlock', false, 'p')
    } else {
      document.execCommand('formatBlock', false, 'h2')
    }
    syncDesc()
    bumpFmt()
  }

  const handleToggleBold = () => applyFormat(() => document.execCommand('bold'))
  const handleToggleItalic = () => applyFormat(() => document.execCommand('italic'))
  const handleToggleUnderline = () => applyFormat(() => document.execCommand('underline'))

  const handleAa = () =>
    applyFormat(() => {
      document.execCommand('removeFormat')
      document.execCommand('formatBlock', false, 'p')
    })

  const handleClearFormatting = () => {
    focusDesc()
    document.execCommand('removeFormat')
    if (document.queryCommandState('bold')) document.execCommand('bold', false)
    if (document.queryCommandState('italic')) document.execCommand('italic', false)
    if (document.queryCommandState('underline')) document.execCommand('underline', false)
    syncDesc()
    bumpFmt()
  }

  const isDirtyNote = () => {
    if (noteHeading.trim()) return true
    const descLenCheck =
      mode === 'note' ? plainDescLen(descRef.current) : plainHtmlTextLen(noteDescHtml)
    if (descLenCheck > 0) return true
    if (bgKind !== 'none') return true
    return false
  }

  const isDirtyTodo = () =>
    !!(todoHeading.trim() || todoDraft.trim() || todoItems.length)

  const isDirty = () => isDirtyNote() || isDirtyTodo()

  const closeWithoutSave = () => {
    onClose?.()
  }

  const requestClose = () => {
    if (!isDirty()) {
      closeWithoutSave()
      return
    }
    setCancelConfirmOpen(true)
  }

  const handleCancelConfirmYes = () => {
    setCancelConfirmOpen(false)
    closeWithoutSave()
  }

  const validateNote = () => {
    const h = noteHeading.trim()
    if (h.length < HEADING_MIN || h.length > HEADING_MAX) {
      setSaveErr(`Heading: ${HEADING_MIN}–${HEADING_MAX} characters`)
      return false
    }
    const len = plainDescLen(descRef.current)
    if (len < DESC_MIN || len > DESC_MAX) {
      setSaveErr(`Description: ${DESC_MIN}–${DESC_MAX} characters`)
      return false
    }
    setSaveErr(null)
    return true
  }

  const validateTodo = () => {
    const h = todoHeading.trim()
    if (h.length < HEADING_MIN || h.length > HEADING_MAX) {
      setSaveErr(`Heading: ${HEADING_MIN}–${HEADING_MAX} characters`)
      return false
    }
    if (todoItems.length < 1) {
      setSaveErr('Add at least one to-do')
      return false
    }
    setSaveErr(null)
    return true
  }

  const performSave = async () => {
    setSaveErr(null)
    if (saveConfirmKind === 'note') {
      if (!validateNote()) return
      setSaveBusy(true)
      try {
        const payload = {
          noteMode: 'NOTE',
          heading: noteHeading.trim(),
          description: descRef.current?.innerHTML ?? '',
          backgroundType: bgKind === 'none' ? 'none' : bgKind,
          backgroundIndex: bgKind === 'none' ? undefined : bgIndex,
        }
        const data = editNote?.id
          ? await patchSmallNote(editNote.id, payload)
          : await createSmallNote(payload)
        onSaved?.(data?.smallNote)
        setSaveBusy(false)
        setSaveSucceeded(true)
        if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
        saveSuccessTimerRef.current = setTimeout(() => {
          saveSuccessTimerRef.current = null
          setSaveSucceeded(false)
          closeWithoutSave()
        }, 2000)
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : 'Could not save')
        setSaveBusy(false)
      }
      return
    }
    if (!validateTodo()) return
    setSaveBusy(true)
    try {
      const todoPayload = {
        noteMode: 'TODO',
        heading: todoHeading.trim(),
        todoItems: todoItems.map((it) =>
          typeof it === 'string'
            ? { text: it, done: false }
            : { text: String(it.text ?? ''), done: Boolean(it.done) },
        ),
      }
      const data = editNote?.id
        ? await patchSmallNote(editNote.id, todoPayload)
        : await createSmallNote(todoPayload)
      onSaved?.(data?.smallNote)
      setSaveBusy(false)
      setSaveSucceeded(true)
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = setTimeout(() => {
        saveSuccessTimerRef.current = null
        setSaveSucceeded(false)
        closeWithoutSave()
      }, 2000)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not save')
      setSaveBusy(false)
    }
  }

  const clickSave = () => {
    if (mode === 'note') {
      if (!validateNote()) return
      if (!isDirtyNote()) {
        setSaveErr('Nothing to save')
        return
      }
      setSaveConfirmKind('note')
    } else {
      if (!validateTodo()) return
      if (!isDirtyTodo()) {
        setSaveErr('Nothing to save')
        return
      }
      setSaveConfirmKind('todo')
    }
    setSaveConfirmOpen(true)
  }

  const goNote = () => {
    if (mode === 'note') return
    setTodoEditingIndex(null)
    setTodoDraft('')
    setMode('note')
    requestAnimationFrame(() => {
      const el = descRef.current
      if (el) {
        el.innerHTML = noteDescHtml
        syncDesc()
        setFmtTick((t) => t + 1)
      }
    })
  }

  const goTodo = () => {
    if (mode === 'todo') return
    setTodoReorderEnabled(false)
    setMode('todo')
  }

  const handleSaveConfirmYes = () => {
    setSaveConfirmOpen(false)
    void performSave()
  }

  const updateTodoLine = useCallback(() => {
    if (todoEditingIndex == null) return
    const t = todoDraft.trim()
    if (t.length < TODO_LINE_MIN || t.length > TODO_LINE_MAX) {
      setSaveErr(`Each line: ${TODO_LINE_MIN}–${TODO_LINE_MAX} characters`)
      return
    }
    const idx = todoEditingIndex
    setSaveErr(null)
    setTodoItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        const base =
          typeof it === 'string'
            ? { text: String(it), done: false, _orderKey: newTodoOrderKey() }
            : {
                text: String(it?.text ?? ''),
                done: Boolean(it?.done),
                _orderKey: it?._orderKey ?? newTodoOrderKey(),
              }
        return { ...base, text: t }
      }),
    )
    setTodoEditingIndex(null)
    setTodoDraft('')
  }, [todoDraft, todoEditingIndex])

  const addTodoLine = () => {
    if (todoEditingIndex !== null) {
      updateTodoLine()
      return
    }
    const t = todoDraft.trim()
    if (t.length < TODO_LINE_MIN || t.length > TODO_LINE_MAX) {
      setSaveErr(`Each line: ${TODO_LINE_MIN}–${TODO_LINE_MAX} characters`)
      return
    }
    if (todoItems.length >= TODO_MAX) {
      setSaveErr(`At most ${TODO_MAX} to-dos`)
      return
    }
    setSaveErr(null)
    setTodoItems((prev) => [
      ...prev,
      { text: t, done: false, _orderKey: newTodoOrderKey() },
    ])
    setTodoDraft('')
  }

  const toggleTodoDoneAt = (idx) => {
    if (todoEditingIndex !== null) return
    setTodoItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        if (typeof it === 'string') {
          return { text: it, done: true, _orderKey: newTodoOrderKey() }
        }
        return {
          text: it.text,
          done: !it.done,
          _orderKey: it._orderKey ?? newTodoOrderKey(),
        }
      }),
    )
  }

  const handleTodoReorder = useCallback((newOrder) => {
    setTodoEditingIndex((idx) => {
      if (idx == null) return null
      const prev = todoItemsRef.current
      const target = prev[idx]
      const ni = newOrder.findIndex((x) => x === target)
      return ni === -1 ? null : ni
    })
    setTodoItems(newOrder)
  }, [])

  const removeTodoAt = (idx) => {
    if (todoEditingIndexRef.current === idx) setTodoDraft('')
    setTodoItems((prev) => prev.filter((_, i) => i !== idx))
    setTodoEditingIndex((e) => {
      if (e == null) return null
      if (e === idx) return null
      if (e > idx) return e - 1
      return e
    })
  }

  const clearPendingDeleteTimer = () => {
    if (pendingDeleteTimerRef.current) {
      clearTimeout(pendingDeleteTimerRef.current)
      pendingDeleteTimerRef.current = null
    }
  }

  const todoStripOrderKey = (item, idx) =>
    item && typeof item === 'object' && item._orderKey
      ? item._orderKey
      : `fallback-${idx}`

  const startDeleteCountdown = (idx) => {
    clearPendingDeleteTimer()
    const row = todoItemsRef.current[idx]
    const key = todoStripOrderKey(row, idx)
    setDeleteClockKey((k) => k + 1)
    setPendingDeleteOrderKey(key)
    pendingDeleteTimerRef.current = setTimeout(() => {
      pendingDeleteTimerRef.current = null
      setPendingDeleteOrderKey((cur) => (cur === key ? null : cur))
    }, 4000)
  }

  const handleTodoDeleteClick = (idx) => {
    const row = todoItems[idx]
    const key = todoStripOrderKey(row, idx)
    if (pendingDeleteOrderKey !== null && pendingDeleteOrderKey === key) {
      clearPendingDeleteTimer()
      setPendingDeleteOrderKey(null)
      removeTodoAt(idx)
      return
    }
    startDeleteCountdown(idx)
  }

  const startEditTodoAt = (idx) => {
    if (todoItems.length < 2 || todoEditingIndex !== null) return
    const item = todoItems[idx]
    const text =
      typeof item === 'string' ? String(item) : String(item?.text ?? '')
    setTodoEditingIndex(idx)
    setTodoDraft(text)
    setSaveErr(null)
  }

  const cancelTodoEdit = () => {
    setTodoEditingIndex(null)
    setTodoDraft('')
    setSaveErr(null)
  }

  const todoReorderTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : { type: 'spring', stiffness: 380, damping: 32, mass: 0.85 },
    [reduceMotion],
  )

  const fmt = useMemo(() => readFormatFlags(descRef.current), [fmtTick])

  const sheetLayoutTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : { type: 'spring', stiffness: 400, damping: 36, mass: 0.78 },
    [reduceMotion],
  )

  const descBackgroundStyle =
    mode === 'note' && bgKind === 'solid'
      ? { backgroundColor: SOLID_COLORS[bgIndex] ?? SOLID_COLORS[0] }
      : mode === 'note' && bgKind === 'image'
        ? {
            backgroundImage: natureSvgDataUri(bgIndex),
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : {}

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <AnimatePresence onExitComplete={onSheetExitComplete}>
        {open ? (
          <AddNotePresenceBackdrop
            key="add-note"
            sheetFullHeight={sheetFullHeight}
            reduceMotion={reduceMotion}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={`modal-sheet add-note-sheet${
                sheetFullHeight ? ' add-note-sheet--full-height' : ''
              }`}
              style={{ transformOrigin: 'center center' }}
              onClick={(e) => e.stopPropagation()}
              custom={{ rect: originRect, reduceMotion }}
              variants={ADD_NOTE_MODAL_FLY_VARIANTS}
              initial="fromOrigin"
              animate="expanded"
              exit="fromOrigin"
              layout={!reduceMotion}
              transition={
                reduceMotion
                  ? {
                      duration: 0.15,
                      ease: [0.4, 0, 0.2, 1],
                      layout: { duration: 0 },
                    }
                  : {
                      layout: sheetLayoutTransition,
                      type: 'spring',
                      stiffness: 360,
                      damping: 30,
                      mass: 0.72,
                    }
              }
            >
              <div className="add-note-header">
                <h2 id={titleId} className="add-note-title">
                  {editNote?.id ? 'Edit note' : 'Add note'}
                </h2>
                <button
                  type="button"
                  className="add-note-close"
                  aria-label="Close"
                  onClick={requestClose}
                >
                  ×
                </button>
              </div>

              <div className="add-note-body">
                <div
                  className={`add-note-toggle-row${
                    editNote?.id ? ' add-note-toggle-row--frozen' : ''
                  }`}
                >
                  <button
                    type="button"
                    className={`add-note-toggle-btn ${mode === 'note' ? 'add-note-toggle-btn--on' : ''}`}
                    onClick={goNote}
                    disabled={Boolean(editNote?.id)}
                    title={
                      editNote?.id
                        ? 'Cannot switch type while editing'
                        : undefined
                    }
                  >
                    Note
                  </button>
                  <button
                    type="button"
                    className={`add-note-toggle-btn ${mode === 'todo' ? 'add-note-toggle-btn--on' : ''}`}
                    onClick={goTodo}
                    disabled={Boolean(editNote?.id)}
                    title={
                      editNote?.id
                        ? 'Cannot switch type while editing'
                        : undefined
                    }
                  >
                    To-Do
                  </button>
                </div>

                {mode === 'note' ? (
                  <>
                    <label className="add-note-field-label" htmlFor="add-note-heading">
                      Heading
                    </label>
                    <input
                      id="add-note-heading"
                      className="add-note-input"
                      maxLength={HEADING_MAX}
                      value={noteHeading}
                      onChange={(e) => setNoteHeading(e.target.value)}
                      placeholder="Note title"
                      autoComplete="off"
                    />
                    <p className="add-note-char-hint">
                      {noteHeading.length}/{HEADING_MAX}
                    </p>

                    <label className="add-note-field-label" style={{ marginTop: 12 }}>
                      Description
                    </label>
                    <div className="add-note-desc-wrap" style={descBackgroundStyle}>
                      <div
                        ref={descRef}
                        className="add-note-desc-editable"
                        contentEditable
                        role="textbox"
                        aria-multiline="true"
                        data-placeholder="Write your note…"
                        suppressContentEditableWarning
                        onInput={() => {
                          trimDescToMaxChars(descRef.current, DESC_MAX)
                          syncDesc()
                          bumpFmt()
                          requestAnimationFrame(() => maybeExpandDescViewport())
                        }}
                        onMouseUp={bumpFmt}
                        onKeyUp={bumpFmt}
                      />
                    </div>
                    <p className="add-note-char-hint">
                      {descLen}/{DESC_MAX}
                    </p>

                    <div className="add-note-toolbar">
                      <div className="add-note-toolbar-label">Formatting</div>
                      <div className="add-note-format-row">
                        <div className="add-note-format-group">
                          <button
                            type="button"
                            className={`add-note-icon-btn ${fmt.h1 ? 'add-note-icon-btn--active' : ''}`}
                            title="Heading 1"
                            aria-pressed={fmt.h1}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleToggleH1}
                          >
                            <AddNoteFmtSvg raw={fmtSvgs.h1} />
                          </button>
                          <button
                            type="button"
                            className={`add-note-icon-btn ${fmt.h2 ? 'add-note-icon-btn--active' : ''}`}
                            title="Heading 2"
                            aria-pressed={fmt.h2}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleToggleH2}
                          >
                            <AddNoteFmtSvg raw={fmtSvgs.h2} />
                          </button>
                          <button
                            type="button"
                            className={`add-note-icon-btn ${fmt.aa ? 'add-note-icon-btn--active' : ''}`}
                            title="Normal text"
                            aria-pressed={fmt.aa}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleAa}
                          >
                            <AddNoteFmtSvg raw={fmtSvgs.aa} />
                          </button>
                        </div>
                        <span className="add-note-format-sep" aria-hidden />
                        <div className="add-note-format-group">
                          <button
                            type="button"
                            className={`add-note-icon-btn ${fmt.bold ? 'add-note-icon-btn--active' : ''}`}
                            title="Bold"
                            aria-pressed={fmt.bold}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleToggleBold}
                          >
                            <AddNoteFmtSvg raw={fmtSvgs.bold} />
                          </button>
                          <button
                            type="button"
                            className={`add-note-icon-btn ${fmt.italic ? 'add-note-icon-btn--active' : ''}`}
                            title="Italic"
                            aria-pressed={fmt.italic}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleToggleItalic}
                          >
                            <AddNoteFmtSvg raw={fmtSvgs.italic} />
                          </button>
                          <button
                            type="button"
                            className={`add-note-icon-btn ${fmt.underline ? 'add-note-icon-btn--active' : ''}`}
                            title="Underline"
                            aria-pressed={fmt.underline}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleToggleUnderline}
                          >
                            <AddNoteFmtSvg raw={fmtSvgs.underline} />
                          </button>
                          <button
                            type="button"
                            className="add-note-icon-btn"
                            title="Clear formatting"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleClearFormatting}
                          >
                            <AddNoteFmtSvg raw={fmtSvgs.clear} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="add-note-bg-section">
                      <div className="add-note-toolbar-label">Background</div>
                      <div className="add-note-bg-row">
                        <button
                          type="button"
                          className={`add-note-bg-circle add-note-bg-circle--normal ${
                            bgKind === 'none' ? 'add-note-bg-circle--on' : ''
                          }`}
                          title="Normal — no solid color"
                          aria-label="Normal — no solid color"
                          onClick={() => {
                            setBgKind('none')
                            setBgIndex(0)
                          }}
                        />
                        {SOLID_COLORS.map((c, i) => (
                          <button
                            key={c}
                            type="button"
                            className={`add-note-bg-circle ${
                              bgKind === 'solid' && bgIndex === i ? 'add-note-bg-circle--on' : ''
                            }`}
                            style={{ backgroundColor: c }}
                            title={`Solid ${i + 1}`}
                            onClick={() => {
                              setBgKind('solid')
                              setBgIndex(i)
                            }}
                          />
                        ))}
                      </div>
                      <div className="add-note-bg-row add-note-bg-row--second">
                        <button
                          type="button"
                          className={`add-note-bg-circle add-note-bg-circle--normal ${
                            bgKind === 'none' ? 'add-note-bg-circle--on' : ''
                          }`}
                          title="Normal — no image background"
                          aria-label="Normal — no image background"
                          onClick={() => {
                            setBgKind('none')
                            setBgIndex(0)
                          }}
                        />
                        {SOLID_COLORS.map((_, i) => (
                          <button
                            key={`nature-${i}`}
                            type="button"
                            className={`add-note-bg-circle ${
                              bgKind === 'image' && bgIndex === i ? 'add-note-bg-circle--on' : ''
                            }`}
                            style={{
                              backgroundImage: natureSvgDataUri(i),
                              backgroundSize: 'cover',
                            }}
                            title={`Nature ${i + 1}`}
                            onClick={() => {
                              setBgKind('image')
                              setBgIndex(i)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="add-note-field-label" htmlFor="add-note-todo-heading">
                      To-Do heading
                    </label>
                    <input
                      id="add-note-todo-heading"
                      className="add-note-input"
                      maxLength={HEADING_MAX}
                      value={todoHeading}
                      onChange={(e) => setTodoHeading(e.target.value)}
                      placeholder="List title"
                      autoComplete="off"
                    />
                    <p className="add-note-char-hint">
                      {todoHeading.length}/{HEADING_MAX}
                    </p>

                    <label className="add-note-field-label" style={{ marginTop: 12 }} htmlFor="add-note-todo-line">
                      Add to-do
                    </label>
                    <div className="add-note-todo-add-row">
                      <input
                        id="add-note-todo-line"
                        className="add-note-input"
                        maxLength={TODO_LINE_MAX}
                        value={todoDraft}
                        onChange={(e) => setTodoDraft(e.target.value)}
                        placeholder={
                          todoEditingIndex !== null
                            ? 'Edit to-do text'
                            : 'Type and press Add'
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addTodoLine()
                          }
                        }}
                      />
                      <motion.button
                        type="button"
                        className="add-note-add-strip-btn"
                        onClick={addTodoLine}
                        disabled={
                          todoEditingIndex === null && todoItems.length >= TODO_MAX
                        }
                        layout
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 420, damping: 32 }
                        }
                      >
                        {todoEditingIndex !== null ? 'Update' : 'Add'}
                      </motion.button>
                    </div>
                    <p className="add-note-char-hint">
                      {todoDraft.length}/{TODO_LINE_MAX} · {todoItems.length}/{TODO_MAX} items
                    </p>

                    <Reorder.Group
                      axis="y"
                      as="div"
                      values={todoItems}
                      onReorder={handleTodoReorder}
                      className="add-note-todo-strips"
                    >
                      {todoItems.map((item, idx) => {
                        const text =
                          typeof item === 'string' ? item : String(item?.text ?? '')
                        const done = typeof item === 'string' ? false : Boolean(item?.done)
                        const isEditing = todoEditingIndex === idx
                        const isInactive =
                          todoEditingIndex !== null && todoEditingIndex !== idx
                        const showEditBtn =
                          todoItems.length >= 2 && todoEditingIndex === null
                        const canDragTodo =
                          todoItems.length > 1 &&
                          todoEditingIndex === null &&
                          todoReorderEnabled
                        const orderKey = item._orderKey ?? `todo-fallback-${idx}`
                        return (
                          <Reorder.Item
                            key={orderKey}
                            as="div"
                            value={item}
                            drag={canDragTodo}
                            dragTransition={
                              reduceMotion
                                ? { bounceStiffness: 0, bounceDamping: 0 }
                                : { bounceStiffness: 420, bounceDamping: 28 }
                            }
                            layout
                            className={`add-note-todo-strip${
                              isEditing ? ' add-note-todo-strip--editing' : ''
                            }${isInactive ? ' add-note-todo-strip--inactive' : ''}${
                              canDragTodo ? ' add-note-todo-strip--draggable' : ''
                            }`}
                            initial={false}
                            animate={{
                              opacity: isInactive ? 0.38 : 1,
                              scale: isEditing ? 1.02 : 1,
                            }}
                            transition={todoReorderTransition}
                          >
                            <input
                              type="checkbox"
                              className="add-note-todo-strip-check"
                              checked={done}
                              disabled={todoEditingIndex !== null}
                              onChange={() => toggleTodoDoneAt(idx)}
                              onPointerDown={(e) => e.stopPropagation()}
                              aria-label={done ? 'Mark as not done' : 'Mark as done'}
                            />
                            <span
                              className={
                                done
                                  ? 'add-note-todo-strip-text add-note-todo-strip-text--done'
                                  : 'add-note-todo-strip-text'
                              }
                            >
                              {isEditing ? (
                                <span className="add-note-todo-strip-editing-hint">
                                  Editing in field above…
                                </span>
                              ) : (
                                text
                              )}
                            </span>
                            <span className="add-note-todo-strip-actions">
                              {todoItems.length > 1 && todoEditingIndex === null ? (
                                <button
                                  type="button"
                                  className={`add-note-todo-strip-reorder-toggle${
                                    todoReorderEnabled
                                      ? ' add-note-todo-strip-reorder-toggle--active'
                                      : ''
                                  }`}
                                  aria-label={
                                    todoReorderEnabled
                                      ? 'Disable reordering'
                                      : 'Enable reordering'
                                  }
                                  title={
                                    todoReorderEnabled
                                      ? 'Disable reordering'
                                      : 'Enable reordering'
                                  }
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => setTodoReorderEnabled((v) => !v)}
                                >
                                  <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M8 6h8" />
                                    <path d="M8 12h8" />
                                    <path d="M8 18h8" />
                                  </svg>
                                </button>
                              ) : null}
                              {showEditBtn ? (
                                <button
                                  type="button"
                                  className="add-note-todo-strip-edit"
                                  aria-label="Edit to-do"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => startEditTodoAt(idx)}
                                >
                                  <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                              ) : null}
                              {isEditing ? (
                                <button
                                  type="button"
                                  className="add-note-todo-strip-cancel-edit"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={cancelTodoEdit}
                                >
                                  Cancel edit
                                </button>
                              ) : pendingDeleteOrderKey === todoStripOrderKey(item, idx) ? (
                                <button
                                  type="button"
                                  className="add-note-todo-strip-remove add-note-todo-strip-remove--countdown"
                                  aria-label="Tap again to delete, or wait to keep"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => handleTodoDeleteClick(idx)}
                                >
                                  <TodoDeleteConfirmClock
                                    animKey={deleteClockKey}
                                    reduceMotion={reduceMotion}
                                  />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="add-note-todo-strip-remove"
                                  aria-label="Remove"
                                  disabled={todoEditingIndex !== null && !isEditing}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => handleTodoDeleteClick(idx)}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          </Reorder.Item>
                        )
                      })}
                    </Reorder.Group>
                  </>
                )}
              </div>

              {saveErr ? <div className="add-note-err">{saveErr}</div> : null}

              <div className="add-note-footer">
                <button
                  type="button"
                  className="add-note-footer-btn add-note-footer-btn--cancel"
                  disabled={saveBusy || saveSucceeded}
                  onClick={requestClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={
                    saveSucceeded
                      ? 'add-note-footer-btn add-note-footer-btn--save modal-btn modal-btn-primary add-task-btn--saved'
                      : 'add-note-footer-btn add-note-footer-btn--save'
                  }
                  disabled={saveBusy || saveSucceeded}
                  onClick={clickSave}
                  aria-busy={saveBusy || undefined}
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
                  ) : saveBusy ? (
                    'Saving…'
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </motion.div>
          </AddNotePresenceBackdrop>
        ) : null}
      </AnimatePresence>

      <ConfirmPop
        open={cancelConfirmOpen}
        onNo={() => setCancelConfirmOpen(false)}
        onYes={handleCancelConfirmYes}
        title="Discard changes?"
        message="You have unsaved content. Close without saving?"
        noLabel="Keep editing"
        yesLabel="Discard"
        skipDocumentScrollLock
      />
      <ConfirmPop
        open={saveConfirmOpen}
        onNo={() => setSaveConfirmOpen(false)}
        onYes={handleSaveConfirmYes}
        title={saveConfirmKind === 'note' ? 'Save note?' : 'Save To-Do?'}
        message={
          saveConfirmKind === 'note'
            ? 'Save this to your notes?'
            : 'Save this to your To-Do?'
        }
        noLabel="Not now"
        yesLabel="Save"
        skipDocumentScrollLock
      />
    </>,
    document.body,
  )
}
