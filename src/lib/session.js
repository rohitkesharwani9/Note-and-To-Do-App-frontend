const TOKEN_KEY = 'to-do-app:auth-token'
const USER_KEY = 'to-do-app:auth-user'

function parseUser(raw) {
  if (!raw) return null
  try {
    const u = JSON.parse(raw)
    if (u && typeof u.id === 'string' && typeof u.email === 'string') {
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName != null ? String(u.firstName) : '',
        lastName: u.lastName != null ? String(u.lastName) : '',
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveSession(token, user, remember) {
  try {
    const storage = remember ? localStorage : sessionStorage
    const other = remember ? sessionStorage : localStorage
    other.removeItem(TOKEN_KEY)
    other.removeItem(USER_KEY)
    storage.setItem(TOKEN_KEY, token)
    storage.setItem(
      USER_KEY,
      JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName != null ? String(user.firstName) : '',
        lastName: user.lastName != null ? String(user.lastName) : '',
      }),
    )
  } catch {
    /* private mode — ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)
    return parseUser(raw)
  } catch {
    return null
  }
}

/** Merge into the stored user object (same storage slot as the active token). */
export function updateStoredUser(updates) {
  try {
    const useLocal = localStorage.getItem(TOKEN_KEY) != null
    const storage = useLocal ? localStorage : sessionStorage
    if (!storage.getItem(TOKEN_KEY)) return
    const prev = parseUser(storage.getItem(USER_KEY))
    if (!prev) return
    const next = {
      ...prev,
      ...updates,
      id: prev.id,
      email: prev.email,
    }
    storage.setItem(USER_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function isLoggedIn() {
  return Boolean(getToken())
}
