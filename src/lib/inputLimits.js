/**
 * instruction.txt rule 8 — shared min/max for inputs (login, profile, app-home).
 */

export const EMAIL_MIN = 5
export const EMAIL_MAX = 50

export const PASS_MIN = 6
export const PASS_MAX = 25

export const FIRST_NAME_MIN = 3
export const FIRST_NAME_MAX = 25

export const LAST_NAME_MIN = 0
export const LAST_NAME_MAX = 25

/** instruction.txt rule 8 — project name & select-project search */
export const PROJECT_NAME_MIN = 3
export const PROJECT_NAME_MAX = 30

export const PROJECT_SEARCH_MIN = 3
export const PROJECT_SEARCH_MAX = 30

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validatePasswordField(value) {
  const v = String(value ?? '')
  if (v.length < PASS_MIN) {
    return `Password must be at least ${PASS_MIN} characters`
  }
  if (v.length > PASS_MAX) {
    return `Password can't be longer than ${PASS_MAX} characters`
  }
  return null
}

export function validateEmailField(value) {
  const v = String(value ?? '').trim()
  if (v.length < EMAIL_MIN) {
    return `Email must be at least ${EMAIL_MIN} characters`
  }
  if (v.length > EMAIL_MAX) {
    return `Email can't be longer than ${EMAIL_MAX} characters`
  }
  if (!EMAIL_RE.test(v)) {
    return 'Enter a valid email address'
  }
  return null
}

export function validateProfileFirstName(value) {
  const t = String(value ?? '').trim()
  if (t.length < FIRST_NAME_MIN) {
    return `First name must be at least ${FIRST_NAME_MIN} characters`
  }
  if (t.length > FIRST_NAME_MAX) {
    return `First name can't be longer than ${FIRST_NAME_MAX} characters`
  }
  return null
}

export function validateProfileLastName(value) {
  const t = String(value ?? '').trim()
  if (t.length > LAST_NAME_MAX) {
    return `Last name can't be longer than ${LAST_NAME_MAX} characters`
  }
  return null
}
