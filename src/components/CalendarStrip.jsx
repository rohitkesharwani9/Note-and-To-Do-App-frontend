import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  formatDayKey,
  isSameLocalDay,
  startOfLocalDay,
} from '../lib/dateUtils'
import './CalendarStrip.css'

const DAY_MS = 86400000
const RANGE = 120

function addDays(d, n) {
  return new Date(d.getTime() + n * DAY_MS)
}

const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function monthShortLabel(monthIndex) {
  return new Date(2024, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'short',
  })
}

/** Month/year trigger + dropdown. `dropdownAlign`: center under trigger (legacy header) or end (toolbar right). */
export function CalendarMonthPicker({
  selectedDate,
  onSelectDate,
  suppressSelection = false,
  dropdownAlign = 'center',
  initialOpen = false,
  showTrigger = true,
  overlayTitle = '',
  onRequestClose = null,
}) {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(initialOpen)
  const [viewYear, setViewYear] = useState(() => selectedDate.getFullYear())
  const [mode, setMode] = useState('months') // 'months' => pick month; 'days' => pick date inside picked month
  const [tempMonth, setTempMonth] = useState(() => selectedDate.getMonth())
  const wrapRef = useRef(null)

  const monthYearLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [selectedDate],
  )

  const selectedMonth = selectedDate.getMonth()
  const selectedYear = selectedDate.getFullYear()

  const now = useMemo(() => new Date(), [])
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  useEffect(() => {
    if (initialOpen) {
      setOpen(true)
    }
  }, [initialOpen])

  useEffect(() => {
    if (!open) return
    setViewYear(selectedYear)
    setTempMonth(selectedMonth)
    setMode('months')
  }, [open, selectedMonth, selectedYear])

  const toggleOpen = () => {
    if (!open) {
      setViewYear(selectedYear)
      setTempMonth(selectedMonth)
      setMode('months')
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pickMonth = (monthIndex) => {
    // Important: do not commit to `onSelectDate` yet.
    // This prevents extra DB fetches while the user is just choosing a month.
    setTempMonth(monthIndex)
    setMode('days')
  }

  const yearBack = () => setViewYear((y) => y - 1)
  const yearFwd = () => setViewYear((y) => y + 1)

  const alignEnd = dropdownAlign === 'end'
  const panelClass = `cal-month-picker-wrap${alignEnd ? ' cal-month-picker-wrap--align-end' : ''}`

  const panelMotion = alignEnd
    ? {
        initial: reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: -10, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: -6, scale: 0.98 },
      }
    : {
        initial: reduceMotion
          ? { opacity: 0, x: '-50%' }
          : { opacity: 0, y: -10, scale: 0.96, x: '-50%' },
        animate: { opacity: 1, y: 0, scale: 1, x: '-50%' },
        exit: reduceMotion
          ? { opacity: 0, x: '-50%' }
          : { opacity: 0, y: -6, scale: 0.98, x: '-50%' },
      }

  const isOpen = showTrigger ? open : true
  const panelClasses = showTrigger
    ? panelClass
    : `${panelClass} cal-month-picker-wrap--inline`

  return (
    <>
      <AnimatePresence>
        {showTrigger && open ? (
          <motion.div
            key="cal-month-backdrop"
            className="cal-month-picker-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.2 }}
            onClick={() => setOpen(false)}
          />
        ) : null}
      </AnimatePresence>
      <div
        className={`cal-month-picker-host cal-month-picker-host--${dropdownAlign}${!showTrigger && overlayTitle ? ' cal-month-picker-host--with-head' : ''}`}
        ref={wrapRef}
      >
        {!showTrigger && overlayTitle ? (
          <div className="cal-month-picker-overlay-head">
            <div className="cal-month-picker-overlay-title">{overlayTitle}</div>
            <motion.button
              type="button"
              className="cal-month-picker-overlay-close"
              onClick={() => onRequestClose?.()}
              whileTap={{ scale: 0.96 }}
            >
              Close
            </motion.button>
          </div>
        ) : null}
        {showTrigger ? (
          <div className="cal-strip-header-inner">
            <motion.button
              type="button"
              className="cal-strip-month-trigger"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-controls="cal-month-picker-panel"
              id="cal-month-picker-trigger"
              onClick={toggleOpen}
              whileTap={{ scale: 0.98 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              <span className="cal-strip-month-label">{monthYearLabel}</span>
              <motion.span
                className="cal-strip-month-chevron-icon"
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
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
            </motion.button>
          </div>
        ) : null}

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              key="cal-month-picker"
              id="cal-month-picker-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={showTrigger ? 'cal-month-picker-trigger' : undefined}
              className={panelClasses}
              style={alignEnd ? { left: 'auto', right: 0 } : { left: '50%' }}
              initial={panelMotion.initial}
              animate={panelMotion.animate}
              exit={panelMotion.exit}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <div className="cal-month-picker-year">
                <motion.button
                  type="button"
                  className="cal-month-picker-year-btn"
                  aria-label="Previous year"
                  onClick={yearBack}
                  whileTap={{ scale: 0.94 }}
                  whileHover={reduceMotion ? {} : { scale: 1.05 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M15 6l-6 6 6 6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.button>
                {mode === 'days' ? (
                  <motion.button
                    type="button"
                    className="cal-month-picker-month-btn"
                    whileTap={{ scale: 0.95 }}
                    whileHover={reduceMotion ? {} : { y: -1 }}
                    onClick={() => setMode('months')}
                    aria-label="Change month"
                  >
                    {new Date(viewYear, tempMonth, 1).toLocaleDateString(
                      undefined,
                      { month: 'long' },
                    )}
                  </motion.button>
                ) : null}
                <motion.span
                  key={viewYear}
                  className={
                    `cal-month-picker-year-value` +
                    (viewYear === currentYear ? ' cal-month-picker-year-value--current' : '') +
                    (!suppressSelection && viewYear === selectedYear
                      ? ' cal-month-picker-year-value--selected'
                      : '')
                  }
                  initial={reduceMotion ? false : { opacity: 0.5, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                >
                  {viewYear}
                </motion.span>
                <motion.button
                  type="button"
                  className="cal-month-picker-year-btn"
                  aria-label="Next year"
                  onClick={yearFwd}
                  whileTap={{ scale: 0.94 }}
                  whileHover={reduceMotion ? {} : { scale: 1.05 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
              <motion.div
                key={mode}
                className={mode === 'days' ? 'cal-month-picker-days-grid' : 'cal-month-picker-grid'}
                initial="hidden"
                animate="show"
                variants={{
                  hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, rotateX: 18, y: 10 },
                  show: {
                    opacity: 1,
                    rotateX: 0,
                    y: 0,
                    transition: {
                      staggerChildren: reduceMotion ? 0 : 0.024,
                    },
                  },
                }}
              >
                {mode === 'months'
                  ? MONTH_INDEXES.map((mi) => {
                      const isSel = !suppressSelection && mi === tempMonth
                      const isCurrent = mi === currentMonth && viewYear === currentYear
                      return (
                        <motion.button
                          key={mi}
                          type="button"
                          className={
                            (isSel
                              ? 'cal-month-picker-cell cal-month-picker-cell--selected'
                              : 'cal-month-picker-cell') +
                            (isCurrent && !isSel ? ' cal-month-picker-cell--current' : '')
                          }
                          onClick={() => pickMonth(mi)}
                          whileTap={{ scale: 0.95 }}
                          whileHover={reduceMotion ? {} : { y: -1 }}
                          variants={{
                            hidden: { opacity: 0, y: 10 },
                            show: {
                              opacity: 1,
                              y: 0,
                              transition: {
                                type: 'spring',
                                stiffness: 420,
                                damping: 28,
                              },
                            },
                          }}
                        >
                          {monthShortLabel(mi)}
                        </motion.button>
                      )
                    })
                  : (() => {
                      const daysInMonth = new Date(
                        viewYear,
                        tempMonth + 1,
                        0,
                      ).getDate()
                      const selDay =
                        !suppressSelection &&
                        viewYear === selectedYear &&
                        tempMonth === selectedMonth
                          ? selectedDate.getDate()
                          : null
                      const todayDay =
                        viewYear === currentYear && tempMonth === currentMonth
                          ? now.getDate()
                          : null
                      return Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                        (dayNum) => (
                          <motion.button
                            key={dayNum}
                            type="button"
                            className={
                              (selDay === dayNum
                                ? 'cal-month-picker-cell cal-month-picker-cell--selected'
                                : 'cal-month-picker-cell') +
                              (todayDay === dayNum && selDay !== dayNum ? ' cal-month-picker-cell--current' : '')
                            }
                            onClick={() => {
                              onSelectDate(
                                startOfLocalDay(
                                  new Date(viewYear, tempMonth, dayNum),
                                ),
                              )
                              setMode('months')
                              setOpen(false)
                            }}
                            whileTap={{ scale: 0.95 }}
                            whileHover={reduceMotion ? {} : { y: -1 }}
                            variants={{
                              hidden: { opacity: 0, y: 10 },
                              show: {
                                opacity: 1,
                                y: 0,
                                transition: {
                                  type: 'spring',
                                  stiffness: 420,
                                  damping: 28,
                                },
                              },
                            }}
                          >
                            {dayNum}
                          </motion.button>
                        ),
                      )
                    })()}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  )
}

/**
 * Today / Yesterday quick jumps. Optional `middle` slot (e.g. month picker) between them.
 */
export function CalendarQuickDates({
  selectedDate,
  onSelectDate,
  middle = null,
  suppressSelection = false,
}) {
  const reduceMotion = useReducedMotion()
  const today = useMemo(() => startOfLocalDay(new Date()), [])
  const yesterday = useMemo(() => addDays(today, -1), [today])
  const tomorrow = useMemo(() => addDays(today, 1), [today])
  const isTodaySelected = !suppressSelection && isSameLocalDay(selectedDate, today)
  const isYesterdaySelected = !suppressSelection && isSameLocalDay(selectedDate, yesterday)
  const isTomorrowSelected = !suppressSelection && isSameLocalDay(selectedDate, tomorrow)

  const rowClass = middle
    ? 'cal-strip-header-row'
    : 'cal-strip-quick-dates'

  return (
    <div className={rowClass}>
      <motion.button
        type="button"
        className={
          isTodaySelected
            ? 'cal-strip-quick cal-strip-quick--active'
            : 'cal-strip-quick'
        }
        aria-pressed={isTodaySelected}
        aria-label="Jump to today"
        onClick={() => onSelectDate(today)}
        whileTap={{ scale: 0.98 }}
        whileHover={reduceMotion ? {} : { y: -1 }}
      >
        Today
      </motion.button>
      {middle}
      <motion.button
        type="button"
        className={
          isYesterdaySelected
            ? 'cal-strip-quick cal-strip-quick--active'
            : 'cal-strip-quick'
        }
        aria-pressed={isYesterdaySelected}
        aria-label="Jump to yesterday"
        onClick={() => onSelectDate(yesterday)}
        whileTap={{ scale: 0.98 }}
        whileHover={reduceMotion ? {} : { y: -1 }}
      >
        Yesterday
      </motion.button>
      <motion.button
        type="button"
        className={
          isTomorrowSelected
            ? 'cal-strip-quick cal-strip-quick--active'
            : 'cal-strip-quick'
        }
        aria-pressed={isTomorrowSelected}
        aria-label="Jump to tomorrow"
        onClick={() => onSelectDate(tomorrow)}
        whileTap={{ scale: 0.98 }}
        whileHover={reduceMotion ? {} : { y: -1 }}
      >
        Tomorrow
      </motion.button>
    </div>
  )
}

/** Legacy: Today | month | Yesterday centered above the strip (standalone calendar block). */
export function CalendarMonthHeader({ selectedDate, onSelectDate }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="cal-strip-header">
      <div className="cal-strip-header-anchor">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0.85, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        >
          <CalendarQuickDates
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            middle={
              <div className="cal-strip-header-inner">
                <CalendarMonthPicker
                  selectedDate={selectedDate}
                  onSelectDate={onSelectDate}
                  dropdownAlign="center"
                />
              </div>
            }
          />
        </motion.div>
      </div>
    </div>
  )
}

export function CalendarDayStrip({ selectedDate, onSelectDate, suppressSelection = false }) {
  const reduceMotion = useReducedMotion()
  const scrollRef = useRef(null)
  const dayRefs = useRef(new Map())
  const dragRef = useRef({
    active: false,
    startX: 0,
    startScroll: 0,
    moved: false,
    pointerId: null,
  })
  /** After drag-from-pill, suppress the synthetic click (desktop). */
  const pillDragSuppressClickRef = useRef(false)
  const hasScrolledInitially = useRef(false)

  const today = useMemo(() => startOfLocalDay(new Date()), [])
  const [windowAnchor, setWindowAnchor] = useState(() => startOfLocalDay(new Date()))
  const days = useMemo(() => {
    const list = []
    const start = addDays(windowAnchor, -RANGE)
    for (let i = 0; i <= RANGE * 2; i += 1) {
      list.push(addDays(start, i))
    }
    return list
  }, [windowAnchor])

  useEffect(() => {
    const sel = startOfLocalDay(selectedDate)
    const min = addDays(windowAnchor, -RANGE)
    const max = addDays(windowAnchor, RANGE)
    if (sel < min || sel > max) {
      setWindowAnchor(sel)
    }
  }, [selectedDate, windowAnchor])

  const scrollKeyIntoCenter = useCallback(
    (key, behavior = 'smooth') => {
      const wrapEl = dayRefs.current.get(key)
      const sc = scrollRef.current
      if (!wrapEl || !sc) return

      // offsetLeft/offsetParent is unreliable for flex children across browsers.
      // Align the pill’s center to the scroll viewport center using geometry.
      const scrollRect = sc.getBoundingClientRect()
      const wrapRect = wrapEl.getBoundingClientRect()
      const wrapCenterX = wrapRect.left + wrapRect.width / 2
      const viewCenterX = scrollRect.left + scrollRect.width / 2
      const delta = wrapCenterX - viewCenterX
      const maxScroll = Math.max(0, sc.scrollWidth - sc.clientWidth)
      const nextLeft = Math.max(0, Math.min(sc.scrollLeft + delta, maxScroll))

      sc.scrollTo({
        left: nextLeft,
        behavior: reduceMotion ? 'auto' : behavior,
      })
    },
    [reduceMotion],
  )

  useLayoutEffect(() => {
    const key = formatDayKey(selectedDate)
    const behavior = reduceMotion
      ? 'auto'
      : hasScrolledInitially.current
        ? 'smooth'
        : 'auto'
    hasScrolledInitially.current = true
    // Double rAF: layout + paint so refs and flex positions match what the user sees.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollKeyIntoCenter(key, behavior)
      })
    })
  }, [selectedDate, windowAnchor, scrollKeyIntoCenter, reduceMotion])

  useLayoutEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let raf = 0
    const applyEdgeFocus = () => {
      const rect = sc.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const halfW = Math.max(rect.width * 0.55, 120)
      dayRefs.current.forEach((wrapEl) => {
        const btn = wrapEl.querySelector('.cal-strip-day')
        if (!btn) return
        const r = wrapEl.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const d = Math.abs(cx - center) / halfW
        const t = Math.min(1, Math.max(0, d))
        const scale = 1 - t * 0.14
        const opacity = 0.58 + (1 - t) * 0.42
        btn.style.setProperty('--cal-focus-scale', scale.toFixed(4))
        btn.style.setProperty('--cal-focus-opacity', opacity.toFixed(4))
      })
    }
    const onScrollOrResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(applyEdgeFocus)
    }
    sc.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    requestAnimationFrame(applyEdgeFocus)
    return () => {
      cancelAnimationFrame(raf)
      sc.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [days])

  const DRAG_THRESHOLD_PX = 8

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    // Pills handle their own pointer session (see onDayPointerDown) so we never
    // setPointerCapture on the scroll area — that breaks native `click` on buttons on desktop.
    if (e.target.closest?.('.cal-strip-day')) return
    const sc = scrollRef.current
    if (!sc) return
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startScroll: sc.scrollLeft,
      moved: false,
      pointerId: e.pointerId,
    }
    try {
      sc.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onDayPointerDown = (e) => {
    e.stopPropagation()
    dragRef.current.moved = false
    if (e.button !== 0) return
    const sc = scrollRef.current
    if (!sc) return
    const startX = e.clientX
    const startScroll = sc.scrollLeft
    const pointerId = e.pointerId
    let moved = false
    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      const dx = ev.clientX - startX
      if (Math.abs(dx) > DRAG_THRESHOLD_PX) moved = true
      sc.scrollLeft = startScroll - dx
    }
    const finish = (ev) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      pillDragSuppressClickRef.current = moved
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d.active || d.pointerId !== e.pointerId) return
    const sc = scrollRef.current
    if (!sc) return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true
    sc.scrollLeft = d.startScroll - dx
  }

  const endDrag = (e) => {
    const d = dragRef.current
    if (!d.active || (e && e.pointerId !== d.pointerId)) return
    dragRef.current.active = false
    try {
      scrollRef.current?.releasePointerCapture(d.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handleDayClick = (day, e) => {
    if (pillDragSuppressClickRef.current) {
      pillDragSuppressClickRef.current = false
      e.preventDefault()
      return
    }
    if (dragRef.current.moved) {
      e.preventDefault()
      dragRef.current.moved = false
      return
    }
    onSelectDate(startOfLocalDay(day))
  }

  return (
    <div className="cal-strip-day-outer">
      <div
        ref={scrollRef}
        className="cal-strip-scroll"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="listbox"
        aria-label="Choose a day"
      >
        <div className="cal-strip-inner">
          {days.map((day) => {
            const key = formatDayKey(day)
            const sel = !suppressSelection && isSameLocalDay(day, selectedDate)
            const isToday = isSameLocalDay(day, today)
            const wd = day.toLocaleDateString(undefined, { weekday: 'short' })
            const num = day.getDate()
            return (
              <div
                key={key}
                ref={(node) => {
                  if (node) dayRefs.current.set(key, node)
                  else dayRefs.current.delete(key)
                }}
                className="cal-strip-day-wrap"
              >
                <motion.button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  className={`cal-strip-day ${sel ? 'cal-strip-day--selected' : ''} ${isToday ? 'cal-strip-day--today' : ''}`}
                  onPointerDown={onDayPointerDown}
                  onClick={(e) => handleDayClick(day, e)}
                  transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                  whileTap={{ scale: 0.94 }}
                  whileHover={reduceMotion ? {} : { y: -1 }}
                >
                  <span className="cal-strip-num">{num}</span>
                  <span className="cal-strip-wd">{wd}</span>
                </motion.button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Full calendar (month header + day strip) for layouts where both sit in one column. */
export default function CalendarStrip({ selectedDate, onSelectDate }) {
  return (
    <div className="cal-strip-outer">
      <CalendarMonthHeader
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />
      <CalendarDayStrip selectedDate={selectedDate} onSelectDate={onSelectDate} />
    </div>
  )
}
