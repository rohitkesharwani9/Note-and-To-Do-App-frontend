import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarMonthPicker } from './CalendarStrip'
import { ConfirmPop } from './ConfirmPop'
import { SharedErrorBanner } from './SharedErrorBanner'
import { DeleteConfirmPop } from './DeleteConfirmPop'
import {
  isValidDateInput,
  startOfDay,
  toInputDate,
} from '../lib/dateInputLocal'
import { createModalFlySheetVariants } from '../lib/modalFlyVariants.js'
import { PROJECT_NAME_MAX, PROJECT_NAME_MIN } from '../lib/inputLimits'
import '../pages/LoginPage.css'
import './EditProjectDetailsPop.css'

const EDIT_PROJ_MODAL_FLY_VARIANTS = createModalFlySheetVariants()

/** Same spring as Add task footer errors — smooth height + opacity */
const EDIT_PROJ_ERR_SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 42,
  mass: 0.72,
}

export const PROJECT_STATUS_OPTIONS = [
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

/**
 * Reusable project-details editor popup.
 * - Multi-select status tags
 * - Editable created date + expected finish date
 * - Does not close on outside tap
 */
export function EditProjectDetailsPop({
  open,
  onClose,
  initialName = '',
  initialStatusTags = [],
  initialCreatedAt,
  initialExpectedFinishDate,
  onSave,
  onDelete,
  originRect = null,
  onSheetExitComplete,
}) {
  const reduceMotion = useReducedMotion()
  const editProjErrHostTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0.12 }
        : {
            height: EDIT_PROJ_ERR_SPRING,
            opacity: EDIT_PROJ_ERR_SPRING,
          },
    [reduceMotion],
  )
  const [name, setName] = useState('')
  const [tags, setTags] = useState([])
  const [createdAt, setCreatedAt] = useState('')
  const [expectedFinishDate, setExpectedFinishDate] = useState('')
  const [openCalendarFor, setOpenCalendarFor] = useState(null)
  const [warningConfirmOpen, setWarningConfirmOpen] = useState(false)
  const [warningConfirmMode, setWarningConfirmMode] = useState(false)
  const [warningConfirmTitle, setWarningConfirmTitle] = useState('')
  const [warningConfirmMessage, setWarningConfirmMessage] = useState('')
  const [warningStatusTags, setWarningStatusTags] = useState([])
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const successCloseTimeoutRef = useRef(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteSucceeded, setDeleteSucceeded] = useState(false)
  const deleteSuccessTimeoutRef = useRef(null)
  /** Only hydrate from parent props when the sheet opens — not when props refresh after save (that was clearing success + killing the 2s close timer). */
  const modalWasOpenRef = useRef(false)

  const tagSet = useMemo(() => new Set(tags), [tags])

  useEffect(() => {
    if (!open) {
      modalWasOpenRef.current = false
      return
    }
    if (modalWasOpenRef.current) {
      return
    }
    modalWasOpenRef.current = true

    setErr(null)
    setSaving(false)
    setSaveSuccess(false)
    if (successCloseTimeoutRef.current) {
      clearTimeout(successCloseTimeoutRef.current)
      successCloseTimeoutRef.current = null
    }
    setTags(Array.isArray(initialStatusTags) ? initialStatusTags : [])
    setCreatedAt(toInputDate(initialCreatedAt))
    setExpectedFinishDate(toInputDate(initialExpectedFinishDate))
    setOpenCalendarFor(null)
    setWarningConfirmOpen(false)
    setWarningConfirmMode(false)
    setWarningConfirmTitle('')
    setWarningConfirmMessage('')
    setWarningStatusTags([])
    setName(String(initialName ?? ''))
    setDeleteConfirmOpen(false)
    setDeleting(false)
    setDeleteSucceeded(false)
    if (deleteSuccessTimeoutRef.current) {
      clearTimeout(deleteSuccessTimeoutRef.current)
      deleteSuccessTimeoutRef.current = null
    }
  }, [open, initialName, initialStatusTags, initialCreatedAt, initialExpectedFinishDate])

  useEffect(() => {
    return () => {
      if (successCloseTimeoutRef.current) {
        clearTimeout(successCloseTimeoutRef.current)
        successCloseTimeoutRef.current = null
      }
      if (deleteSuccessTimeoutRef.current) {
        clearTimeout(deleteSuccessTimeoutRef.current)
        deleteSuccessTimeoutRef.current = null
      }
    }
  }, [])

  const toggleTag = (key) => {
    setErr(null)
    setTags((prev) => {
      const set = new Set(prev)
      if (set.has(key)) set.delete(key)
      else {
        if (set.size >= 6) return prev
        set.add(key)
      }
      return Array.from(set)
    })
  }

  const statusLiveError = useMemo(() => {
    if (tags.length === 0) return 'Select at least 1 status (maximum 6).'
    if (tags.length > 6) return 'Choose up to 6 status options.'
    return ''
  }, [tags])

  const validate = () => {
    const trimmedName = String(name ?? '').trim()
    if (
      trimmedName.length < PROJECT_NAME_MIN ||
      trimmedName.length > PROJECT_NAME_MAX
    ) {
      setErr(
        `Project name must be ${PROJECT_NAME_MIN}–${PROJECT_NAME_MAX} characters`,
      )
      return false
    }
    if (tags.length < 1 || tags.length > 6) return false
    if (!isValidDateInput(createdAt)) {
      setErr('Created date is not valid')
      return false
    }
    if (expectedFinishDate && !isValidDateInput(expectedFinishDate)) {
      setErr('Expected finish date is not valid')
      return false
    }
    return true
  }

  const submitSave = async () => {
    setErr(null)
    setSaving(true)
    try {
      await onSave?.({
        name: String(name ?? '').trim(),
        statusTags: tags,
        createdAt,
        expectedFinishDate: expectedFinishDate || null,
      })
      setSaving(false)
      setSaveSuccess(true)
      successCloseTimeoutRef.current = setTimeout(() => {
        successCloseTimeoutRef.current = null
        setSaveSuccess(false)
        onClose?.()
      }, 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save project details')
      setSaving(false)
    }
  }

  const handleCloseModal = () => {
    if (successCloseTimeoutRef.current) {
      clearTimeout(successCloseTimeoutRef.current)
      successCloseTimeoutRef.current = null
    }
    setSaveSuccess(false)
    onClose?.()
  }

  const submitDelete = async () => {
    if (deleting || deleteSucceeded) return
    setDeleteConfirmOpen(false)
    setErr(null)
    setDeleting(true)
    try {
      await onDelete?.()
      setDeleting(false)
      setDeleteSucceeded(true)
      if (deleteSuccessTimeoutRef.current) clearTimeout(deleteSuccessTimeoutRef.current)
      deleteSuccessTimeoutRef.current = setTimeout(() => {
        deleteSuccessTimeoutRef.current = null
        setDeleteSucceeded(false)
        handleCloseModal()
      }, 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete this project')
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  const selectedStatusLabels = useMemo(() => {
    if (!tags.length) return ['None']
    const labelsByKey = new Map(PROJECT_STATUS_OPTIONS.map((o) => [o.key, o.label]))
    return tags.map((key) => labelsByKey.get(key) || key)
  }, [tags])

  const expectedFinishDateLiveError = useMemo(() => {
    if (!createdAt || !expectedFinishDate) return ''
    if (!isValidDateInput(createdAt) || !isValidDateInput(expectedFinishDate)) return ''
    const createdDay = startOfDay(createdAt)
    const finishDay = startOfDay(expectedFinishDate)
    if (createdDay && finishDay && createdDay > finishDay) {
      return 'Created date cannot be less than expected finish date.'
    }
    return ''
  }, [createdAt, expectedFinishDate])

  const openSaveConfirmation = () => {
    const today = startOfDay(new Date())
    const createdDay = createdAt && isValidDateInput(createdAt) ? startOfDay(createdAt) : null
    const finishDay =
      expectedFinishDate && isValidDateInput(expectedFinishDate)
        ? startOfDay(expectedFinishDate)
        : null
    const sameCreatedAndFinish =
      !!(createdDay && finishDay && createdDay.getTime() === finishDay.getTime())
    const hasFutureCreated = !!(createdDay && createdDay > today)
    const hasPastFinish = !!(finishDay && finishDay < today)
    setWarningConfirmTitle('Selected Status')
    setWarningStatusTags(selectedStatusLabels)
    if (!sameCreatedAndFinish && (hasFutureCreated || hasPastFinish)) {
      setWarningConfirmMode(true)
      if (hasFutureCreated && hasPastFinish) {
        setWarningConfirmMessage(
          'You selected future date for created date and past date for expected finish date. Is this good?',
        )
      } else if (hasFutureCreated) {
        setWarningConfirmMessage('You selected future date for creation date. Is this good?')
      } else {
        setWarningConfirmMessage('You selected past date for expected finish date. Is this good?')
      }
    } else {
      setWarningConfirmMode(false)
      setWarningConfirmMessage('Do you want to save these project details?')
    }
    setWarningConfirmOpen(true)
  }

  const submit = async () => {
    setErr(null)
    if (!validate()) return
    if (expectedFinishDateLiveError) return
    openSaveConfirmation()
  }

  const parseDateOrToday = (value) => {
    const d = value ? new Date(value) : null
    return d && !Number.isNaN(d.getTime()) ? d : new Date()
  }

  const openCreatedPicker = openCalendarFor === 'created'
  const openFinishPicker = openCalendarFor === 'finish'
  const calendarTitle =
    openCalendarFor === 'created' ? 'Created date' : 'Expected finish date'

  return (
    <AnimatePresence onExitComplete={onSheetExitComplete}>
      {open ? (
        <motion.div
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
            aria-labelledby="edit-project-details-title"
            className="modal-sheet modal-sheet--edit-project modal-sheet--edit-project-details"
            style={{ transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
            custom={{ rect: originRect, reduceMotion }}
            variants={EDIT_PROJ_MODAL_FLY_VARIANTS}
            initial="fromOrigin"
            animate="expanded"
            exit="fromOrigin"
            transition={
              reduceMotion
                ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
                : { type: 'spring', stiffness: 360, damping: 30, mass: 0.72 }
            }
          >
            <h2 id="edit-project-details-title" className="modal-title">
              Edit project details
            </h2>

            <AnimatePresence initial={false} mode="popLayout">
              {err ? (
                <motion.div
                  key="edit-proj-banner-err"
                  className="edit-proj-anim-err-host"
                  style={{ overflow: 'hidden' }}
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={editProjErrHostTransition}
                >
                  <SharedErrorBanner className="app-home-modal-error app-home-modal-error--after-title">
                    {err}
                  </SharedErrorBanner>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="edit-proj-block">
              <label className="login-field-label" htmlFor="edit-proj-name">
                Name ({PROJECT_NAME_MIN}–{PROJECT_NAME_MAX} characters)
              </label>
              <input
                id="edit-proj-name"
                className="login-input"
                type="text"
                minLength={PROJECT_NAME_MIN}
                maxLength={PROJECT_NAME_MAX}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setErr(null)
                }}
                autoComplete="off"
              />
            </div>

            <div className="edit-proj-block edit-proj-block--date">
              <div className="edit-proj-label">
                Status (select min 1 & max 6 status)
              </div>
              <div className="edit-proj-chip-grid" role="group" aria-label="Project status options">
                {PROJECT_STATUS_OPTIONS.map((opt) => {
                  const on = tagSet.has(opt.key)
                  return (
                    <motion.button
                      key={opt.key}
                      type="button"
                      className={
                        on
                          ? 'edit-proj-chip edit-proj-chip--on'
                          : 'edit-proj-chip'
                      }
                      aria-pressed={on}
                      onClick={() => toggleTag(opt.key)}
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
              <label className="login-field-label" htmlFor="proj-created-date">
                Created date
              </label>
              <input
                id="proj-created-date"
                className="login-input"
                type="date"
                value={createdAt}
                onClick={(e) => {
                  e.preventDefault()
                  setOpenCalendarFor((v) => (v === 'created' ? null : 'created'))
                }}
                onChange={(e) => {
                  setCreatedAt(e.target.value)
                  setErr(null)
                }}
              />
              {openCreatedPicker ? (
                <span className="visually-hidden">Created date calendar is open</span>
              ) : null}
            </div>

            <div className="edit-proj-block edit-proj-block--date">
              <label className="login-field-label" htmlFor="proj-finish-date">
                Expected finish date
              </label>
              <input
                id="proj-finish-date"
                className="login-input"
                type="date"
                value={expectedFinishDate}
                onClick={(e) => {
                  e.preventDefault()
                  setOpenCalendarFor((v) => (v === 'finish' ? null : 'finish'))
                }}
                onChange={(e) => {
                  setExpectedFinishDate(e.target.value)
                  setErr(null)
                }}
              />
              <AnimatePresence initial={false} mode="sync">
                {statusLiveError ? (
                  <motion.div
                    key="edit-proj-err-status"
                    className="edit-proj-anim-err-host"
                    style={{ overflow: 'hidden' }}
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={editProjErrHostTransition}
                  >
                    <p className="edit-proj-field-error" role="alert">
                      <span className="edit-proj-field-error-icon" aria-hidden="true">
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
                      {statusLiveError}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <AnimatePresence initial={false} mode="sync">
                {expectedFinishDateLiveError ? (
                  <motion.div
                    key="edit-proj-err-date-order"
                    className="edit-proj-anim-err-host"
                    style={{ overflow: 'hidden' }}
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={editProjErrHostTransition}
                  >
                    <p className="edit-proj-field-error" role="alert">
                      <span className="edit-proj-field-error-icon" aria-hidden="true">
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
                      {expectedFinishDateLiveError}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {openFinishPicker ? (
                <span className="visually-hidden">Expected finish date calendar is open</span>
              ) : null}
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
                    selectedDate={parseDateOrToday(
                      openCalendarFor === 'created' ? createdAt : expectedFinishDate,
                    )}
                    showTrigger={false}
                    overlayTitle={calendarTitle}
                    onRequestClose={() => setOpenCalendarFor(null)}
                    onSelectDate={(d) => {
                      if (openCalendarFor === 'created') {
                        setCreatedAt(toInputDate(d))
                      } else {
                        setExpectedFinishDate(toInputDate(d))
                      }
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
                className={
                  deleteSucceeded
                    ? 'edit-task-delete-btn edit-task-delete-btn--done'
                    : 'edit-task-delete-btn'
                }
                onClick={() => {
                  if (!deleting && !deleteSucceeded) setDeleteConfirmOpen(true)
                }}
                whileTap={deleteSucceeded ? {} : { scale: 0.92 }}
                whileHover={reduceMotion || deleteSucceeded ? {} : { y: -1 }}
                disabled={saving || saveSuccess || deleting || deleteSucceeded}
                aria-label={deleteSucceeded ? 'Deleted' : 'Delete project'}
              >
                {deleteSucceeded ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="#dc2626" strokeWidth="2" />
                    <path
                      d="M8 12l3 3 5-6"
                      stroke="#dc2626"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : deleting ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="#dc2626" strokeWidth="2" opacity="0.4" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z"
                      stroke="#dc2626"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M10 11v6M14 11v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </motion.button>
              <motion.button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={handleCloseModal}
                whileTap={{ scale: 0.97 }}
                disabled={saving}
              >
                Cancel
              </motion.button>
              <motion.button
                type="button"
                className={
                  saveSuccess
                    ? 'modal-btn edit-proj-save-btn edit-proj-save-btn--success'
                    : 'modal-btn modal-btn-primary'
                }
                onClick={submit}
                whileTap={{ scale: 0.97 }}
                disabled={saving || saveSuccess}
              >
                {saveSuccess ? (
                  <span className="edit-proj-save-success-inner">
                    <svg
                      className="edit-proj-save-success-icon"
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
                    <span className="edit-proj-save-success-text">Saved successfully</span>
                  </span>
                ) : saving ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </motion.button>
            </div>
          </motion.div>
          {createPortal(
            <>
              <ConfirmPop
                open={warningConfirmOpen}
                title={warningConfirmTitle || 'Date warning'}
                message={warningConfirmMessage || 'Please review selected dates.'}
                warning={warningConfirmMode}
                statusTags={warningStatusTags}
                noLabel="No"
                yesLabel="Yes, Save"
                skipDocumentScrollLock
                onNo={() => {
                  setWarningConfirmOpen(false)
                  setWarningConfirmMode(false)
                  setWarningStatusTags([])
                }}
                onYes={async () => {
                  setWarningConfirmOpen(false)
                  setWarningConfirmMode(false)
                  setWarningStatusTags([])
                  await submitSave()
                }}
              />
              <DeleteConfirmPop
                open={deleteConfirmOpen}
                skipDocumentScrollLock
                title="Delete project"
                message="Are you sure you want to delete this project? All tasks and comments in this project will be deleted."
                onCancel={() => {
                  if (deleting) return
                  setDeleteConfirmOpen(false)
                }}
                onConfirm={submitDelete}
              />
            </>,
            document.body,
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default EditProjectDetailsPop

