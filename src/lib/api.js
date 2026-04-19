import { getToken } from './session.js'

/** Base URL for the Node API (see root `.env.example`). */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_URL
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().replace(/\/$/, '')
  }
  return 'http://localhost:3100'
}

/**
 * POST /api/auth/login — returns { token, user } or throws Error(message) with friendly text.
 */
export async function loginApi(email, password) {
  const base = getApiBaseUrl()
  let res
  try {
    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new Error(
      "We can't reach the server right now. Check that the API is running and try again",
    )
  }

  let data = {}
  try {
    data = await res.json()
  } catch {
    throw new Error('The server returned an unexpected response. Try again in a moment')
  }

  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : 'Invalid email or password. Try again'
    throw new Error(msg)
  }

  if (!data.token || !data.user?.id) {
    throw new Error('Sign-in succeeded but the response was incomplete. Try again')
  }

  return data
}

export async function apiFetch(path, options = {}) {
  const base = getApiBaseUrl()
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  let res
  try {
    res = await fetch(`${base}${path}`, { ...options, headers })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new Error(
      "We can't reach the server right now. Check your connection and try again",
    )
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    if (!res.ok) {
      throw new Error('The server returned an unexpected response')
    }
  }
  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : 'Something went wrong. Try again in a moment'
    throw new Error(msg)
  }
  return data
}

export function fetchTodayTodos() {
  return apiFetch('/api/todos/today')
}

/** `from` / `to` should be start and end of the same local calendar day (ISO strings). */
export function fetchTodosForDayRange(from, to, options = {}) {
  const q = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  })
  if (options.page) q.set('page', String(options.page))
  if (options.status) q.set('status', options.status)
  if (options.sortBy) q.set('sortBy', options.sortBy)
  if (options.sortDir) q.set('sortDir', options.sortDir)
  if (options.categories?.length) q.set('categories', options.categories.join(','))
  if (options.subCategories?.length) q.set('subCategories', options.subCategories.join(','))
  if (options.projectStatuses?.length) q.set('projectStatuses', options.projectStatuses.join(','))
  if (options.dateField) q.set('dateField', options.dateField)
  if (options.dateFrom) q.set('dateFrom', options.dateFrom)
  if (options.dateTo) q.set('dateTo', options.dateTo)
  if (options.showExpiredTasks) {
    q.set('showExpiredTasks', '1')
    if (options.expiredTodayStart) q.set('expiredTodayStart', options.expiredTodayStart)
  }
  return apiFetch(`/api/todos/day?${q.toString()}`)
}

/** Returns up to 200 most recently updated projects + `truncated` if the user has more. */
export function fetchProjects() {
  return apiFetch('/api/projects')
}

/**
 * Tasks that overlap a calendar window [from, to] (e.g. visible month grid). Omits DONE.
 * @param {string} fromIso
 * @param {string} toIso
 */
export function fetchTodosForCalendarRange(fromIso, toIso) {
  const q = new URLSearchParams({ from: fromIso, to: toIso })
  return apiFetch(`/api/todos?${q.toString()}`)
}

/**
 * Projects whose created/finish interval overlaps [from, to] (calendar grid).
 * @param {string} fromIso
 * @param {string} toIso
 */
export function fetchProjectsForCalendarRange(fromIso, toIso) {
  const q = new URLSearchParams({ from: fromIso, to: toIso })
  return apiFetch(`/api/projects?${q.toString()}`)
}

/** Search all projects by name / serial (min 3 chars). Max 50 rows from DB. */
export function searchProjectsDatabase(query) {
  const q = String(query ?? '').trim()
  const params = new URLSearchParams({ q })
  return apiFetch(`/api/projects/search?${params.toString()}`)
}

/** Returns up to 200 most recently updated projects for a status tag + `truncated` if more exist. */
export function fetchProjectsByStatusTag(tag) {
  const t = String(tag ?? '').trim()
  const params = new URLSearchParams({ tag: t })
  return apiFetch(`/api/projects/by-tag?${params.toString()}`)
}

/**
 * @param {string} id
 * @param {{ withTodos?: boolean, page?: number, status?: string }} [options]
 */
export function fetchProjectById(id, options = {}) {
  const params = new URLSearchParams()
  if (options.withTodos) params.set('withTodos', '1')
  if (options.page) params.set('page', String(options.page))
  if (options.status) params.set('status', options.status)
  if (options.sortBy) params.set('sortBy', options.sortBy)
  if (options.sortDir) params.set('sortDir', options.sortDir)
  if (options.categories?.length) params.set('categories', options.categories.join(','))
  if (options.subCategories?.length) params.set('subCategories', options.subCategories.join(','))
  if (options.dateField) params.set('dateField', options.dateField)
  if (options.dateFrom) params.set('dateFrom', options.dateFrom)
  if (options.dateTo) params.set('dateTo', options.dateTo)
  if (options.showExpiredTasks) {
    params.set('showExpiredTasks', '1')
    if (options.expiredTodayStart) params.set('expiredTodayStart', options.expiredTodayStart)
  }
  const qs = params.toString()
  return apiFetch(
    `/api/projects/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
  )
}

export function patchProject(id, body) {
  return apiFetch(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteProject(id) {
  return apiFetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function createProject(name, extra = {}) {
  return apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, ...extra }),
  })
}

export function createTodo(body) {
  return apiFetch('/api/todos', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** POST /api/saved-links — persists a row in `saved_links` for the signed-in user. */
export function createSavedLink(body) {
  return apiFetch('/api/saved-links', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** GET /api/saved-links — saved links for the signed-in user (paginated, max 30 per page). Optional `q` (ILIKE title/description/url), `sortDir` (asc|desc on created_at), `dateFrom`/`dateTo` (YYYY-MM-DD on created_at), `mainKeys` / `subKeys` (comma-separated category keys). Pass `signal` to cancel in-flight requests. */
export function fetchSavedLinks(page = 1, options = {}) {
  const p = Math.max(1, Number(page) || 1)
  const qs = new URLSearchParams({ page: String(p) })
  const q = typeof options.q === 'string' ? options.q.trim() : ''
  if (q) qs.set('q', q)
  const { sortDir, dateFrom, dateTo, mainKeys, subKeys, signal } = options
  if (sortDir === 'asc' || sortDir === 'desc') qs.set('sortDir', sortDir)
  if (typeof dateFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    qs.set('dateFrom', dateFrom)
  }
  if (typeof dateTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    qs.set('dateTo', dateTo)
  }
  if (Array.isArray(mainKeys) && mainKeys.length > 0) {
    qs.set('mainKeys', mainKeys.join(','))
  }
  if (Array.isArray(subKeys) && subKeys.length > 0) {
    qs.set('subKeys', subKeys.join(','))
  }
  return apiFetch(`/api/saved-links?${qs.toString()}`, signal ? { signal } : {})
}

/** PATCH /api/saved-links/:id — update one saved link for the signed-in user. */
export function patchSavedLink(id, body) {
  return apiFetch(`/api/saved-links/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/** DELETE /api/saved-links/:id — remove one saved link for the signed-in user. */
export function deleteSavedLink(id) {
  return apiFetch(`/api/saved-links/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}

export function patchTodo(id, body) {
  return apiFetch(`/api/todos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteTodo(id) {
  return apiFetch(`/api/todos/${id}`, { method: 'DELETE' })
}

export function fetchTaskComments(todoId) {
  return apiFetch(`/api/todos/${encodeURIComponent(todoId)}/comments`)
}

export function createTaskComment(todoId, body) {
  return apiFetch(`/api/todos/${encodeURIComponent(todoId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function patchTaskComment(todoId, commentId, body) {
  return apiFetch(
    `/api/todos/${encodeURIComponent(todoId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
}

export function deleteTaskComment(todoId, commentId) {
  return apiFetch(
    `/api/todos/${encodeURIComponent(todoId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  )
}

export function fetchTodosForProject(projectId) {
  return apiFetch(`/api/todos/project/${projectId}`)
}

export function fetchAllTodos() {
  return apiFetch('/api/todos')
}

export function fetchProfile() {
  return apiFetch('/api/auth/me')
}

/** Load current user with a Bearer token (used after Google OAuth redirect). */
export async function fetchProfileWithToken(token) {
  const base = getApiBaseUrl()
  let res
  try {
    res = await fetch(`${base}/api/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
  } catch {
    throw new Error(
      "We can't reach the server right now. Check that the API is running and try again",
    )
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    throw new Error('The server returned an unexpected response')
  }
  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : 'Could not complete Google sign-in. Try again'
    throw new Error(msg)
  }
  if (!data.user?.id || !data.user?.email) {
    throw new Error('Sign-in succeeded but profile data was incomplete')
  }
  return data.user
}

export function patchProfile(body) {
  return apiFetch('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function changePassword(body) {
  return apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Request a password reset email (public). Same response whether or not the email exists.
 */
/**
 * GET /api/small-notes — list current user's small notes (newest first).
 */
export function fetchSmallNotes() {
  return apiFetch('/api/small-notes')
}

/** GET /api/small-notes/meta — { total } small notes for the signed-in user. */
export function fetchSmallNotesMeta() {
  return apiFetch('/api/small-notes/meta')
}

/**
 * GET /api/small-notes/search — full-library search (same filters as list + sort via).
 * @param {{ q: string, listMode: string, dateOrder?: 'asc' | 'desc', todoStatus?: 'completed' | 'uncompleted' }} params
 */
export function searchSmallNotes(params) {
  const q = new URLSearchParams()
  q.set('q', String(params.q ?? '').trim())
  q.set('listMode', params.listMode)
  if (params.dateOrder === 'asc') q.set('dateOrder', 'asc')
  if (params.todoStatus === 'completed' || params.todoStatus === 'uncompleted') {
    q.set('todoStatus', params.todoStatus)
  }
  return apiFetch(`/api/small-notes/search?${q.toString()}`)
}

/** DELETE /api/small-notes/:id — remove one small note for the signed-in user. */
export function deleteSmallNote(id) {
  return apiFetch(`/api/small-notes/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}

/** PATCH /api/small-notes/:id — update one small note for the signed-in user. */
export function patchSmallNote(id, body) {
  return apiFetch(`/api/small-notes/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/** PATCH /api/small-notes/:id/pin — pin or unpin (max 5 per user; order stored in DB). */
export function patchSmallNotePin(id, body) {
  return apiFetch(
    `/api/small-notes/${encodeURIComponent(String(id))}/pin`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
}

/** PATCH /api/small-notes/pin-order — reorder pinned items for the current list view. */
export function patchSmallNotesPinOrder(body) {
  return apiFetch('/api/small-notes/pin-order', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/**
 * POST /api/small-notes — create a small note (NOTE or TODO mode).
 */
export function createSmallNote(body) {
  return apiFetch('/api/small-notes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function requestPasswordReset(email) {
  const base = getApiBaseUrl()
  let res
  try {
    res = await fetch(`${base}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    throw new Error(
      "We can't reach the server right now. Check that the API is running and try again",
    )
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    throw new Error('The server returned an unexpected response. Try again in a moment')
  }
  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : 'Could not send reset instructions. Try again in a moment'
    throw new Error(msg)
  }
  return data
}

/** POST /api/auth/complete-password-reset — public; body { token, newPassword }. */
export async function completePasswordReset(token, newPassword) {
  const base = getApiBaseUrl()
  let res
  try {
    res = await fetch(`${base}/api/auth/complete-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    })
  } catch {
    throw new Error(
      "We can't reach the server right now. Check that the API is running and try again",
    )
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    throw new Error('The server returned an unexpected response. Try again in a moment')
  }
  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : 'Could not update your password. Try again in a moment'
    throw new Error(msg)
  }
  return data
}
