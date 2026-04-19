/**
 * Local calendar-day parsing and validation (same rules as Edit project details dates).
 */

export function toInputDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseInputDateLocal(v) {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const date = new Date(y, mo, d)
    if (date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d) {
      return date
    }
    return null
  }
  const date = new Date(v)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isValidDateInput(v) {
  return !!parseInputDateLocal(v)
}

export function startOfDay(dateValue) {
  const d =
    typeof dateValue === 'string'
      ? parseInputDateLocal(dateValue)
      : new Date(dateValue)
  if (!d) return null
  d.setHours(0, 0, 0, 0)
  return d
}
