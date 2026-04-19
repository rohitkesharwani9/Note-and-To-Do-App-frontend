import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'framer-motion'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getMainTheme } from '../lib/linkCategoryThemes.js'
import { toInputDate } from '../lib/dateInputLocal'
import { ConfirmPop } from './ConfirmPop.jsx'
import '../pages/LoginPage.css'
import './AddTask.css'
import './SaveNewLinkModal.css'

const LINK_TITLE_MIN = 3
const LINK_TITLE_MAX = 30
const LINK_URL_MIN = 4
const LINK_URL_MAX = 2048
const DESCRIPTION_MAX = 500
const LINK_CONFIRM_PREVIEW_MAX = 25

const ADD_LINK_FLOW_SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 42,
  mass: 0.72,
}

/** Matches `.save-new-link-modal-sheet` max width in SaveNewLinkModal.css (fly-from-button math). */
const SAVE_LINK_MODAL_MAX_W = 680
const SAVE_LINK_MODAL_MAX_H = 920

const SAVE_LINK_SHEET_VARIANTS = {
  fromOrigin: (custom) => {
    const rect = custom?.rect
    if (custom?.reduceMotion || !rect || typeof window === 'undefined') {
      return { x: 0, y: 0, scale: 0.97, opacity: 1 }
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = cx - vw / 2
    const dy = cy - vh / 2
    const destW = Math.min(SAVE_LINK_MODAL_MAX_W, vw - 24)
    const destH = Math.min(vh * 0.92, SAVE_LINK_MODAL_MAX_H)
    const s0 = Math.min(rect.width / destW, rect.height / destH, 1)
    const s = Math.max(0.12, s0)
    return { x: dx, y: dy, scale: s, opacity: 0.97 }
  },
  expanded: { x: 0, y: 0, scale: 1, opacity: 1 },
}

/** Saved-link main + sub options (labels match product copy). */
export const LINK_CATEGORY_TREE = [
  {
    key: 'development_tech',
    label: 'Development & Tech',
    subs: [
      { key: 'frontend', label: 'Frontend' },
      { key: 'backend', label: 'Backend' },
      { key: 'full_stack', label: 'Full Stack' },
      { key: 'api_services', label: 'API / Services' },
      { key: 'database', label: 'Database' },
      { key: 'devops', label: 'DevOps' },
      { key: 'system_design', label: 'System Design' },
    ],
  },
  {
    key: 'ai_llm',
    label: 'AI & LLM',
    subs: [
      { key: 'llm', label: 'LLM' },
      { key: 'ai_tools', label: 'AI Tools' },
      { key: 'machine_learning', label: 'Machine Learning' },
      { key: 'prompt_engineering', label: 'Prompt Engineering' },
      { key: 'agents', label: 'Agents' },
      { key: 'automation', label: 'Automation' },
      { key: 'no_code_low_code', label: 'No-Code / Low-Code' },
    ],
  },
  {
    key: 'tools_resources',
    label: 'Tools & Resources',
    subs: [
      { key: 'tools', label: 'Tools' },
      { key: 'libraries', label: 'Libraries' },
      { key: 'extensions', label: 'Extensions' },
      { key: 'cli_tools', label: 'CLI Tools' },
      { key: 'chrome_extensions', label: 'Chrome Extensions' },
      { key: 'utilities', label: 'Utilities' },
    ],
  },
  {
    key: 'learning_knowledge',
    label: 'Learning & Knowledge',
    subs: [
      { key: 'learning', label: 'Learning' },
      { key: 'tutorials', label: 'Tutorials' },
      { key: 'courses', label: 'Courses' },
      { key: 'documentation', label: 'Documentation' },
      { key: 'cheatsheets', label: 'Cheatsheets' },
      { key: 'blogs_articles', label: 'Blogs / Articles' },
    ],
  },
  {
    key: 'design_ui_ux',
    label: 'Design & UI/UX',
    subs: [
      { key: 'design', label: 'Design' },
      { key: 'ui_ux', label: 'UI & UX' },
      { key: 'inspiration', label: 'Inspiration' },
      { key: 'components', label: 'Components' },
      { key: 'icons', label: 'Icons' },
      { key: 'fonts', label: 'Fonts' },
      { key: 'color_palettes', label: 'Color Palettes' },
    ],
  },
  {
    key: 'code_repositories',
    label: 'Code & Repositories',
    subs: [
      { key: 'github_repo', label: 'Github Repo' },
      { key: 'boilerplates', label: 'Boilerplates' },
      { key: 'templates', label: 'Templates' },
      { key: 'starter_kits', label: 'Starter Kits' },
    ],
  },
  {
    key: 'productivity_workflow',
    label: 'Productivity & Workflow',
    subs: [
      { key: 'productivity', label: 'Productivity' },
      { key: 'workflow', label: 'Workflow' },
      { key: 'templates_pw', label: 'Templates' },
      { key: 'automation_pw', label: 'Automation' },
    ],
  },
  {
    key: 'business_growth',
    label: 'Business & Growth',
    subs: [
      { key: 'startups', label: 'Startups' },
      { key: 'case_studies', label: 'Case Studies' },
      { key: 'monetization', label: 'Monetization' },
      { key: 'marketing', label: 'Marketing' },
    ],
  },
  {
    key: 'quality_security',
    label: 'Quality & Security',
    subs: [
      { key: 'security', label: 'Security' },
      { key: 'performance', label: 'Performance' },
      { key: 'testing', label: 'Testing' },
      { key: 'debugging', label: 'Debugging' },
    ],
  },
]

function MobileRowChevron({ expanded, muted, reduceMotion }) {
  return (
    <motion.span
      className={
        muted ? 'add-task-m-chevron-wrap add-task-m-chevron-wrap--muted' : 'add-task-m-chevron-wrap'
      }
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

function isValidHttpUrl(value) {
  const t = value.trim()
  if (!t || /\s/.test(t)) return false
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Normalized URL string starting with http:// or https:// for preview (instruction: first 25 chars). */
function formatLinkPreviewForConfirm(raw) {
  const t = raw.trim()
  const withProto = t.includes('://') ? t : `https://${t}`
  if (withProto.length <= LINK_CONFIRM_PREVIEW_MAX) return withProto
  return `${withProto.slice(0, LINK_CONFIRM_PREVIEW_MAX)}...`
}

/** Preserve saved date when editing; otherwise today (local). */
function linkDateForSavedPayload(initialSavedLink) {
  if (!initialSavedLink?.id) return toInputDate(new Date())
  const raw = initialSavedLink.linkDate
  if (raw == null || String(raw).trim() === '') return toInputDate(new Date())
  const d = toInputDate(raw)
  return d || toInputDate(new Date())
}

/** When DB has legacy rows without keys, infer from stored `linkCategory` ("Main — Sub"). */
function inferCategoryKeysFromStoredRow(row) {
  let mainKey = row.linkMainKey ?? null
  let subKey = row.linkSubKey ?? null
  if (mainKey && subKey) return { mainKey, subKey }
  const raw = String(row.linkCategory ?? '')
  const parts = raw.split(/\s—\s/)
  const mainLabel = parts[0]?.trim() || ''
  const subLabel = parts[1]?.trim() || ''
  const mainEntry = LINK_CATEGORY_TREE.find((m) => m.label === mainLabel)
  const subEntry = mainEntry?.subs?.find((s) => s.label === subLabel)
  return {
    mainKey: mainKey || mainEntry?.key || null,
    subKey: subKey || subEntry?.key || null,
  }
}

export function SaveNewLinkModal({
  open,
  onClose,
  onSaved,
  initialSavedLink = null,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const titleId = useId()

  const addTaskFlowTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            layout: ADD_LINK_FLOW_SPRING,
            opacity: ADD_LINK_FLOW_SPRING,
          },
    [reduceMotion],
  )

  const [linkTitle, setLinkTitle] = useState('')
  const [description, setDescription] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [mainKey, setMainKey] = useState(null)
  const [subKey, setSubKey] = useState(null)
  const [mobilePanel, setMobilePanel] = useState(null)
  const [descriptionFocused, setDescriptionFocused] = useState(false)
  const [err, setErr] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmPreviewText, setConfirmPreviewText] = useState('')
  const [saveSucceeded, setSaveSucceeded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const descriptionInputRef = useRef(null)
  const descriptionBlurTimerRef = useRef(null)
  const saveSuccessTimerRef = useRef(null)
  const submitLockRef = useRef(false)

  const descriptionFieldCompact = !descriptionFocused

  useEffect(() => {
    if (!open) return
    const row = initialSavedLink
    if (row?.id) {
      setLinkTitle(String(row.linkTitle ?? ''))
      setDescription(String(row.linkDescription ?? ''))
      setLinkUrl(String(row.link ?? '').trim())
      const { mainKey: mk, subKey: sk } = inferCategoryKeysFromStoredRow(row)
      setMainKey(mk)
      setSubKey(sk)
    } else {
      setLinkTitle('')
      setDescription('')
      setLinkUrl('')
      setMainKey(null)
      setSubKey(null)
    }
    setMobilePanel(null)
    setDescriptionFocused(false)
    setErr(null)
    setConfirmOpen(false)
    setConfirmPreviewText('')
    setSaveSucceeded(false)
    setSubmitting(false)
    if (descriptionBlurTimerRef.current) {
      clearTimeout(descriptionBlurTimerRef.current)
      descriptionBlurTimerRef.current = null
    }
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
  }, [open, initialSavedLink])

  useEffect(
    () => () => {
      if (descriptionBlurTimerRef.current) {
        clearTimeout(descriptionBlurTimerRef.current)
        descriptionBlurTimerRef.current = null
      }
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current)
        saveSuccessTimerRef.current = null
      }
    },
    [],
  )

  const mainDef = useMemo(
    () => LINK_CATEGORY_TREE.find((m) => m.key === mainKey),
    [mainKey],
  )

  const subsOrdered = useMemo(() => mainDef?.subs ?? [], [mainDef])

  const subDef = useMemo(
    () => subsOrdered.find((s) => s.key === subKey),
    [subsOrdered, subKey],
  )

  const sheetFrameStyle = useMemo(() => {
    const neutral = 'rgba(255, 255, 255, 0.42)'
    if (!mainKey) {
      return {
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: neutral,
        boxSizing: 'border-box',
      }
    }
    const th = getMainTheme(mainKey)
    return {
      borderWidth: 4,
      borderStyle: 'solid',
      borderColor: th.solid,
      boxSizing: 'border-box',
    }
  }, [mainKey])

  const handleLinkTitleFocus = () => {
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

  const handleDescriptionBlur = (e) => {
    const next = e.relatedTarget
    if (next instanceof Element && next.closest?.('.save-new-link-cat-acc')) {
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

  const handleTaskOptionRowMouseDown = (e) => {
    e.preventDefault()
  }

  const toggleMobilePanel = (panel) => {
    descriptionInputRef.current?.blur()
    setErr(null)
    if (panel === 'sub' && !mainKey) return
    setDescriptionFocused(false)
    setMobilePanel((prev) => (prev === panel ? null : panel))
  }

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

  const handleLinkUrlChange = (e) => {
    const v = e.target.value.replace(/\s/g, '')
    setLinkUrl(v)
    setErr(null)
  }

  const validateAndBuildPayload = () => {
    const t = linkTitle.trim()
    const desc = description.trim()
    const u = linkUrl.trim()

    if (t.length < LINK_TITLE_MIN || t.length > LINK_TITLE_MAX) {
      setErr(`Link title must be ${LINK_TITLE_MIN}–${LINK_TITLE_MAX} characters.`)
      return null
    }
    if (desc.length > DESCRIPTION_MAX) {
      setErr(`Description must be at most ${DESCRIPTION_MAX} characters.`)
      return null
    }
    if (u.length < LINK_URL_MIN || u.length > LINK_URL_MAX) {
      setErr(`Link must be ${LINK_URL_MIN}–${LINK_URL_MAX} characters with no spaces.`)
      return null
    }
    if (/\s/.test(linkUrl)) {
      setErr('Link cannot contain spaces.')
      return null
    }
    if (!isValidHttpUrl(u)) {
      setErr('Enter a valid URL (e.g. https://example.com).')
      return null
    }
    if (!mainKey || !subKey || !mainDef || !subDef) {
      setErr('Select link category and sub category.')
      return null
    }

    const fullUrl = u.includes('://') ? u : `https://${u}`
    const linkDate = linkDateForSavedPayload(initialSavedLink)
    const base = {
      linkTitle: t,
      linkDescription: desc.length ? desc : '',
      link: fullUrl,
      linkCategory: mainDef.label,
      linkSubCategory: subDef.label,
      linkMainKey: mainKey,
      linkSubKey: subKey,
      linkDate,
    }
    if (initialSavedLink?.id) {
      return { ...base, id: initialSavedLink.id }
    }
    return base
  }

  const actionLocked = submitting || saveSucceeded
  const cancelDisabled = submitting
  const isEditingLink = Boolean(initialSavedLink?.id)

  const handleSaveClick = () => {
    if (saveSucceeded || submitting || submitLockRef.current) return
    setErr(null)
    const payload = validateAndBuildPayload()
    if (!payload) return
    setConfirmPreviewText(formatLinkPreviewForConfirm(linkUrl.trim()))
    setConfirmOpen(true)
  }

  const performSave = async () => {
    const payload = validateAndBuildPayload()
    if (!payload) return
    submitLockRef.current = true
    setSubmitting(true)
    try {
      await Promise.resolve(onSaved?.(payload))
      setSubmitting(false)
      setSaveSucceeded(true)
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = setTimeout(() => {
        saveSuccessTimerRef.current = null
        setSaveSucceeded(false)
        onClose?.()
      }, 2000)
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Something went wrong while saving. Please try again.',
      )
      setSubmitting(false)
    } finally {
      submitLockRef.current = false
    }
  }

  const handleCloseModal = () => {
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setSaveSucceeded(false)
    setSubmitting(false)
    setConfirmOpen(false)
    setConfirmPreviewText('')
    onClose?.()
  }

  const renderMainGrid = () => (
    <div
      className="add-task-main-grid save-new-link-main-grid-wrap"
      role="group"
      aria-label="Link category"
    >
      {LINK_CATEGORY_TREE.map((m) => {
          const on = mainKey === m.key
          const th = getMainTheme(m.key)
          const mainStyle = on
            ? {
                borderColor: th.solid,
                background: `linear-gradient(180deg, ${th.solid}ee 0%, ${th.dark} 100%)`,
                color: '#f8fafc',
                boxShadow: `4px 4px 14px ${th.solid}44`,
              }
            : {
                borderColor: th.solid,
                borderWidth: 2,
                borderStyle: 'solid',
                background: `linear-gradient(180deg, ${th.light} 0%, #ffffffcc 100%)`,
                color: th.dark,
              }
          return (
            <motion.button
              key={m.key}
              type="button"
              className="add-task-chip add-task-chip--main"
              style={mainStyle}
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
        className="add-task-sub-row save-new-link-sub-row-wrap"
        role="group"
        aria-label={`Sub category for ${mainDef.label}`}
      >
        {subsOrdered.map((s) => {
            const on = subKey === s.key
            const th = getMainTheme(mainDef.key)
            const subStyle = on
              ? {
                  borderColor: th.dark,
                  background: `linear-gradient(180deg, ${th.dark} 0%, ${th.solid} 100%)`,
                  color: '#f8fafc',
                  boxShadow: `3px 3px 10px ${th.solid}55`,
                }
              : {
                  borderColor: th.solid,
                  borderWidth: 2,
                  borderStyle: 'solid',
                  background: th.light,
                  color: th.dark,
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

  const backdropSpring = reduceMotion
    ? { duration: 0.15 }
    : { duration: 0.38, ease: [0.22, 0.61, 0.36, 1] }

  const sheetFlyTransition = reduceMotion
    ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
    : { type: 'spring', stiffness: 360, damping: 30, mass: 0.72 }

  return (
    <>
      <AnimatePresence onExitComplete={onSheetExitComplete}>
        {open ? (
          <motion.div
            key="save-new-link-backdrop"
            className="modal-backdrop add-task-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropSpring}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="modal-sheet add-task-sheet save-new-link-modal-sheet"
              style={{ ...sheetFrameStyle, transformOrigin: 'center center' }}
              onClick={(e) => e.stopPropagation()}
              custom={{ rect: originRect, reduceMotion }}
              variants={SAVE_LINK_SHEET_VARIANTS}
              initial="fromOrigin"
              animate="expanded"
              exit="fromOrigin"
              transition={sheetFlyTransition}
            >
              <motion.h2
                id={titleId}
                className="modal-title"
                layout
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={addTaskFlowTransition}
              >
                {isEditingLink ? 'Edit link' : 'Save new link'}
              </motion.h2>

              <LayoutGroup id="save-new-link-form-flow">
                <motion.div
                  className="add-task-section add-task-section--fields"
                  layout
                  transition={addTaskFlowTransition}
                >
                  <motion.label
                    className="login-field-label"
                    htmlFor="save-link-title"
                    layout
                    transition={addTaskFlowTransition}
                  >
                    Link Title
                  </motion.label>
                  <motion.input
                    id="save-link-title"
                    type="text"
                    className="login-input"
                    minLength={LINK_TITLE_MIN}
                    maxLength={LINK_TITLE_MAX}
                    value={linkTitle}
                    placeholder="Name for this link"
                    autoComplete="off"
                    disabled={saveSucceeded}
                    onFocus={handleLinkTitleFocus}
                    onChange={(e) => {
                      setLinkTitle(e.target.value)
                      setErr(null)
                    }}
                    layout
                    transition={addTaskFlowTransition}
                    whileFocus={reduceMotion || saveSucceeded ? {} : { scale: 1.01 }}
                  />
                  <motion.p
                    className="add-task-char-hint"
                    layout
                    transition={addTaskFlowTransition}
                  >
                    {LINK_TITLE_MIN}–{LINK_TITLE_MAX} characters (spaces count) · {linkTitle.length}/
                    {LINK_TITLE_MAX}
                  </motion.p>

                  <motion.label
                    className="login-field-label add-task-label-spaced"
                    htmlFor="save-link-description"
                    layout
                    transition={addTaskFlowTransition}
                  >
                    Link Description
                  </motion.label>
                  <motion.textarea
                    ref={descriptionInputRef}
                    id="save-link-description"
                    layout
                    className={
                      descriptionFieldCompact
                        ? 'login-input add-task-textarea add-task-textarea--title'
                        : 'login-input add-task-textarea add-task-textarea--body'
                    }
                    rows={descriptionFieldCompact ? 1 : 5}
                    maxLength={DESCRIPTION_MAX}
                    value={description}
                    placeholder="Optional notes"
                    disabled={saveSucceeded}
                    onFocus={handleDescriptionFocus}
                    onBlur={handleDescriptionBlur}
                    onChange={(e) => {
                      setDescription(e.target.value)
                      setErr(null)
                    }}
                    transition={addTaskFlowTransition}
                    whileFocus={reduceMotion || saveSucceeded ? {} : { scale: 1.01 }}
                  />
                  <motion.p
                    className="add-task-char-hint"
                    layout
                    transition={addTaskFlowTransition}
                  >
                    Up to {DESCRIPTION_MAX} characters · {description.length}/{DESCRIPTION_MAX}
                  </motion.p>

                  <motion.label
                    className="login-field-label add-task-label-spaced"
                    htmlFor="save-link-url"
                    layout
                    transition={addTaskFlowTransition}
                  >
                    Link
                  </motion.label>
                  <motion.input
                    id="save-link-url"
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    className="login-input"
                    minLength={LINK_URL_MIN}
                    maxLength={LINK_URL_MAX}
                    value={linkUrl}
                    placeholder="https://example.com"
                    disabled={saveSucceeded}
                    onFocus={handleLinkTitleFocus}
                    onChange={handleLinkUrlChange}
                    layout
                    transition={addTaskFlowTransition}
                    whileFocus={reduceMotion || saveSucceeded ? {} : { scale: 1.01 }}
                  />
                  <motion.p
                    className="add-task-char-hint"
                    layout
                    transition={addTaskFlowTransition}
                  >
                    {LINK_URL_MIN}–{LINK_URL_MAX} characters, no spaces · URL
                  </motion.p>
                </motion.div>

                <div
                  className="add-task-cat-acc save-new-link-cat-acc"
                  role="group"
                  aria-label="Link categories"
                >
                  <motion.div
                    layout
                    transition={addTaskFlowTransition}
                    className={
                      mobilePanel === 'main'
                        ? 'add-task-m-block add-task-m-block--main add-task-m-block--expanded'
                        : 'add-task-m-block add-task-m-block--main'
                    }
                  >
                    <motion.button
                      type="button"
                      className={
                        mobilePanel === 'main'
                          ? 'add-task-m-row add-task-m-row--open'
                          : 'add-task-m-row'
                      }
                      aria-expanded={mobilePanel === 'main'}
                      disabled={saveSucceeded}
                      onMouseDown={handleTaskOptionRowMouseDown}
                      onClick={() => toggleMobilePanel('main')}
                      whileTap={saveSucceeded ? {} : { scale: 0.99 }}
                    >
                      <span className="add-task-m-row-label">Link category</span>
                      <span className="add-task-m-row-trail">
                        <span className="add-task-m-row-value">{mainDef?.label ?? 'Select'}</span>
                        <MobileRowChevron
                          expanded={mobilePanel === 'main'}
                          muted={false}
                          reduceMotion={!!reduceMotion}
                        />
                      </span>
                    </motion.button>
                    <AnimatePresence initial={false} mode="popLayout">
                      {mobilePanel === 'main' ? (
                        <motion.div
                          key="save-link-slot-main"
                          className="add-task-m-slot"
                          initial={reduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={addTaskFlowTransition}
                        >
                          <p className="add-task-m-slot-line">
                            Options for <strong>Link category</strong>
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
                    <motion.button
                      type="button"
                      className={
                        mobilePanel === 'sub'
                          ? 'add-task-m-row add-task-m-row--open'
                          : 'add-task-m-row'
                      }
                      aria-expanded={mobilePanel === 'sub'}
                      disabled={!mainKey || saveSucceeded}
                      onMouseDown={handleTaskOptionRowMouseDown}
                      onClick={() => toggleMobilePanel('sub')}
                      whileTap={saveSucceeded ? {} : { scale: 0.99 }}
                    >
                      <span className="add-task-m-row-label">Link sub category</span>
                      <span className="add-task-m-row-trail">
                        <span className="add-task-m-row-value">{subDef?.label ?? 'Select'}</span>
                        <MobileRowChevron
                          expanded={!!mainKey && mobilePanel === 'sub'}
                          muted={!mainKey}
                          reduceMotion={!!reduceMotion}
                        />
                      </span>
                    </motion.button>
                    <AnimatePresence initial={false} mode="popLayout">
                      {mobilePanel === 'sub' && mainDef ? (
                        <motion.div
                          key="save-link-slot-sub"
                          className="add-task-m-slot"
                          initial={reduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={addTaskFlowTransition}
                        >
                          <p className="add-task-m-slot-line">
                            Options for <strong>Link sub category</strong>
                            <span className="add-task-m-slot-pick"> — PICK ONE</span>
                          </p>
                          {renderSubRow()}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                </div>

                <AnimatePresence initial={false}>
                  {err ? (
                    <motion.p
                      key="save-link-err"
                      className="add-task-error"
                      style={{ marginTop: 12 }}
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={addTaskFlowTransition}
                    >
                      {err}
                    </motion.p>
                  ) : null}
                </AnimatePresence>

                <motion.div
                  className="modal-actions add-task-modal-actions"
                  style={{ marginTop: 14 }}
                  layout
                  transition={addTaskFlowTransition}
                >
                  <motion.button
                    type="button"
                    className="modal-btn modal-btn-secondary"
                    onClick={handleCloseModal}
                    whileTap={{ scale: 0.97 }}
                    whileHover={reduceMotion ? {} : { y: -1 }}
                    disabled={cancelDisabled}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="button"
                    className={
                      saveSucceeded
                        ? 'modal-btn modal-btn-primary add-task-btn--saved'
                        : 'modal-btn modal-btn-primary'
                    }
                    onClick={handleSaveClick}
                    whileTap={{ scale: 0.97 }}
                    whileHover={reduceMotion || saveSucceeded || submitting ? {} : { y: -1 }}
                    disabled={actionLocked}
                    aria-busy={submitting || undefined}
                    layout
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
                      'Saving…'
                    ) : isEditingLink ? (
                      'Update link'
                    ) : (
                      'Save link'
                    )}
                  </motion.button>
                </motion.div>
              </LayoutGroup>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {createPortal(
        <ConfirmPop
          open={open && confirmOpen}
          title={isEditingLink ? 'Update this link?' : 'Save this link?'}
          message={
            confirmPreviewText
              ? `Link preview: ${confirmPreviewText}`
              : isEditingLink
                ? 'Apply changes to this saved link?'
                : 'Save this link to your list?'
          }
          noLabel="Go back"
          yesLabel={isEditingLink ? 'Update' : 'Save'}
          skipDocumentScrollLock
          onNo={() => {
            setConfirmOpen(false)
            setConfirmPreviewText('')
          }}
          onYes={async () => {
            setConfirmOpen(false)
            setConfirmPreviewText('')
            await performSave()
          }}
        />,
        document.body,
      )}
    </>
  )
}
