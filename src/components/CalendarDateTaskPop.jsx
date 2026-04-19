import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { getCategoryLabels } from '../lib/taskCategoryThemes'
import '../pages/LoginPage.css'
import './CalendarDateTaskPop.css'

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

function toInputDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function CalendarDateTaskPop({
  open,
  onClose,
  day,
  viewMode = 'task',
  tasks = [],
  projects = [],
  onAddNewTask,
  onAddNewProject,
}) {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const [expandedId, setExpandedId] = useState(null)
  const isTaskView = viewMode === 'task'
  const list = isTaskView ? tasks : projects

  useEffect(() => {
    if (!open) setExpandedId(null)
  }, [open])

  useEffect(() => {
    setExpandedId(null)
  }, [day])

  useEffect(() => {
    setExpandedId(null)
  }, [viewMode])

  useEffect(() => {
    if (!open) return
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
  }, [open])

  const dayLabel =
    day && !Number.isNaN(day.getTime())
      ? day.toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : ''

  const handleTaskClick = (id) => {
    setExpandedId((cur) => (cur === id ? null : id))
  }

  const handleOpenProjectFromTask = (event, projectId, taskId) => {
    event.stopPropagation()
    if (!projectId) return
    const pickedDay = toInputDate(day)
    onClose?.()
    navigate(`/project/${projectId}`, {
      state: pickedDay
        ? { calendarDayFilter: pickedDay, calendarTaskId: taskId ?? null }
        : undefined,
    })
  }

  const handleOpenProjectFromProject = (event, projectId) => {
    event.stopPropagation()
    if (!projectId) return
    onClose?.()
    navigate(`/project/${projectId}`)
  }

  const sheetSpring = reduceMotion
    ? { duration: 0.18 }
    : { type: 'spring', stiffness: 380, damping: 32, mass: 0.85 }
  const layoutSpring = reduceMotion
    ? { duration: 0.2 }
    : { type: 'spring', stiffness: 420, damping: 34 }

  return (
    <AnimatePresence mode="sync">
      {open && day ? (
        <motion.div
          key="cal-date-task-backdrop"
          className="modal-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.22 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-date-task-pop-heading"
            className="modal-sheet cal-date-task-pop-sheet"
            layout
            onClick={(e) => e.stopPropagation()}
            initial={
              reduceMotion
                ? { opacity: 0, scale: 0.98 }
                : { opacity: 0, scale: 0.88, y: 24 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, scale: 0.98 }
                : { opacity: 0, scale: 0.9, y: 18 }
            }
            transition={sheetSpring}
          >
            <motion.h2
              id="cal-date-task-pop-heading"
              className="cal-date-task-pop-title modal-title"
              layout="position"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...layoutSpring, delay: reduceMotion ? 0 : 0.04 }}
            >
              {isTaskView
                ? `All task on ${dayLabel}`
                : `All project on ${dayLabel}`}
            </motion.h2>

            {!list?.length ? (
              <motion.p
                className="cal-date-task-pop-empty"
                layout="position"
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...layoutSpring, delay: reduceMotion ? 0 : 0.08 }}
              >
                {isTaskView
                  ? 'No active tasks on this day.'
                  : 'No projects on this day.'}
              </motion.p>
            ) : (
              <motion.ul
                className="cal-date-task-pop-list"
                role="list"
                layout
                transition={layoutSpring}
              >
                {isTaskView
                  ? tasks.map((t, idx) => {
                      const expanded = expandedId === t.id
                      const { main: catMain, sub: catSub } = getCategoryLabels(
                        t.mainCategory,
                        t.subCategory,
                      )
                      const desc = t.description ?? ''

                      return (
                        <motion.li
                          key={t.id}
                          layout
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        >
                          <motion.button
                            type="button"
                            layout
                            className={
                              expanded
                                ? 'cal-date-task-item cal-date-task-item--expanded'
                                : 'cal-date-task-item cal-date-task-item--collapsed'
                            }
                            onClick={() => handleTaskClick(t.id)}
                            whileTap={{ scale: 0.99 }}
                            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: reduceMotion ? 0 : 0.03 * idx }}
                          >
                            <p className="cal-date-task-item-head">{t.title ?? ''}</p>
                            {desc && !expanded ? (
                              <p className="cal-date-task-item-desc-one">{desc}</p>
                            ) : null}
                            {expanded ? (
                              <>
                                {desc ? (
                                  <div className="cal-date-task-item-desc-full-wrap">
                                    <p className="cal-date-task-item-desc-full">{desc}</p>
                                  </div>
                                ) : null}
                                <div className="cal-date-task-item-meta">
                                  {catMain && catSub ? (
                                    <div className="cal-date-task-item-meta-row">
                                      {catMain} – {catSub}
                                    </div>
                                  ) : null}
                                  <div className="cal-date-task-item-meta-row">
                                    Start {fmtDate(t.startDate)} · Deadline{' '}
                                    {fmtDate(t.dueDate)}
                                  </div>
                                  {t.project?.name ? (
                                    <div className="cal-date-task-item-meta-row">
                                      <button
                                        type="button"
                                        className="cal-date-task-item-project-link"
                                        onClick={(e) =>
                                          handleOpenProjectFromTask(e, t.project?.id, t.id)
                                        }
                                      >
                                        {t.project.name}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </>
                            ) : null}
                          </motion.button>
                        </motion.li>
                      )
                    })
                  : projects.map((p, idx) => {
                      const expanded = expandedId === p.id
                      const desc = p.remark ?? ''

                      return (
                        <motion.li
                          key={p.id}
                          layout
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        >
                          <motion.button
                            type="button"
                            layout
                            className={
                              expanded
                                ? 'cal-date-task-item cal-date-task-item--expanded'
                                : 'cal-date-task-item cal-date-task-item--collapsed'
                            }
                            onClick={() => handleTaskClick(p.id)}
                            whileTap={{ scale: 0.99 }}
                            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: reduceMotion ? 0 : 0.03 * idx }}
                          >
                            <p className="cal-date-task-item-head">{p.name ?? ''}</p>
                            {desc && !expanded ? (
                              <p className="cal-date-task-item-desc-one">{desc}</p>
                            ) : null}
                            {expanded ? (
                              <>
                                {desc ? (
                                  <div className="cal-date-task-item-desc-full-wrap">
                                    <p className="cal-date-task-item-desc-full">{desc}</p>
                                  </div>
                                ) : null}
                                <div className="cal-date-task-item-meta">
                                  <div className="cal-date-task-item-meta-row">
                                    Created {fmtDate(p.createdAt)} · Expected finish{' '}
                                    {fmtDate(p.expectedFinishDate)}
                                  </div>
                                  {p.serialNumber != null ? (
                                    <div className="cal-date-task-item-meta-row">
                                      S/N #{p.serialNumber}
                                    </div>
                                  ) : null}
                                  {p.id ? (
                                    <div className="cal-date-task-item-meta-row">
                                      <button
                                        type="button"
                                        className="cal-date-task-item-project-link"
                                        onClick={(e) =>
                                          handleOpenProjectFromProject(e, p.id)
                                        }
                                      >
                                        Go to project page
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </>
                            ) : null}
                          </motion.button>
                        </motion.li>
                      )
                    })}
              </motion.ul>
            )}

            <motion.div
              className="modal-actions"
              style={{ marginTop: 14 }}
              layout="position"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...layoutSpring, delay: reduceMotion ? 0 : 0.1 }}
            >
              {!isTaskView && typeof onAddNewProject === 'function' ? (
                <>
                  <motion.button
                    type="button"
                    className="modal-btn modal-btn-primary"
                    onClick={(e) => onAddNewProject?.(e)}
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...layoutSpring, delay: reduceMotion ? 0 : 0.12 }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={reduceMotion ? {} : { y: -1 }}
                  >
                    Add new project
                  </motion.button>
                  <motion.button
                    type="button"
                    className="modal-btn modal-btn-secondary"
                    onClick={onClose}
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...layoutSpring, delay: reduceMotion ? 0 : 0.12 }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={reduceMotion ? {} : { y: -1 }}
                  >
                    Cancel
                  </motion.button>
                </>
              ) : (
                <>
                  {isTaskView && typeof onAddNewTask === 'function' ? (
                    <motion.button
                      type="button"
                      className="modal-btn modal-btn-primary"
                      onClick={(e) => onAddNewTask?.(e)}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ ...layoutSpring, delay: reduceMotion ? 0 : 0.12 }}
                      whileTap={{ scale: 0.97 }}
                      whileHover={reduceMotion ? {} : { y: -1 }}
                    >
                      Add new task
                    </motion.button>
                  ) : null}
                  <motion.button
                    type="button"
                    className="modal-btn modal-btn-secondary"
                    onClick={onClose}
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...layoutSpring, delay: reduceMotion ? 0 : 0.12 }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={reduceMotion ? {} : { y: -1 }}
                  >
                    Close
                  </motion.button>
                </>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default CalendarDateTaskPop
