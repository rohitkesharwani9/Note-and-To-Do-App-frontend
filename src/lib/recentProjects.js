const MAX_RECENT = 8

function storageKey(userId) {
  return userId
    ? `todo_app_recent_project_ids:${userId}`
    : 'todo_app_recent_project_ids'
}

export function loadRecentProjectIds(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr)
      ? arr.filter((id) => typeof id === 'string' && id.length > 0)
      : []
  } catch {
    return []
  }
}

export function recordRecentProjectId(projectId, userId) {
  if (!projectId) return
  const ids = loadRecentProjectIds(userId).filter((id) => id !== projectId)
  ids.unshift(projectId)
  localStorage.setItem(
    storageKey(userId),
    JSON.stringify(ids.slice(0, MAX_RECENT)),
  )
}
