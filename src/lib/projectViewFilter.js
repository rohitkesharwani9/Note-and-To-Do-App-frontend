/** @typedef {{ kind: string, id?: string, name?: string, serialNumber?: number }} ViewFilter */

/**
 * Sort modes alphabetically by label. Labels are user-facing (English).
 * Add new modes here; they appear in the select in A–Z order.
 */
export const VIEW_MODE_DEFS = [
  { kind: 'all', label: 'All projects' },
  { kind: 'active', label: 'Active projects' },
  { kind: 'inactive', label: 'Inactive projects' },
  { kind: 'critical_bug', label: 'Critical bug projects' },
  { kind: 'future', label: 'Future projects' },
  { kind: 'archived', label: 'Archived projects' },
  { kind: 'finished', label: 'Finished projects' },
  { kind: 'unfinished', label: 'Non finished projects' },
  { kind: 'on_hold', label: 'On hold projects' },
  { kind: 'overdue', label: 'Overdue projects' },
  { kind: 'recent', label: 'Recent projects' },
]

/** “All projects” first, then every other mode A–Z by label. */
export function getViewModesForSelect() {
  const all = VIEW_MODE_DEFS.find((d) => d.kind === 'all')
  const rest = VIEW_MODE_DEFS.filter((d) => d.kind !== 'all').sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
  return all ? [all, ...rest] : rest
}

/** Sentinel: project chosen from list (not in mode list). */
export const PROJECT_SELECT_SENTINEL = 'mode:_selected_project_'

export function viewFilterToSelectValue(filter) {
  if (!filter || filter.kind === 'all') return 'mode:all'
  if (filter.kind === 'project' && filter.id) {
    return PROJECT_SELECT_SENTINEL
  }
  const known = VIEW_MODE_DEFS.some((d) => d.kind === filter.kind)
  if (known) return `mode:${filter.kind}`
  return 'mode:all'
}

/**
 * @param {string} value from <option value>
 * @param {Map} projectsById unused (projects picked from list only)
 * @param {object | null} currentFilter preserve when sentinel unchanged
 */
export function selectValueToViewFilter(value, _projectsById, currentFilter) {
  if (!value || value === 'mode:all') return { kind: 'all' }
  if (value === PROJECT_SELECT_SENTINEL && currentFilter?.kind === 'project') {
    return currentFilter
  }
  if (value.startsWith('mode:')) {
    const kind = value.slice('mode:'.length)
    return { kind }
  }
  return { kind: 'all' }
}

const CRITICAL_TITLE_RE = /critical|bug|blocker|severity|urgent/i

/**
 * Filter the project list inside the Select project modal only (does not affect Home).
 * @param {object[]} projects from GET /api/projects
 * @param {{ kind: string }} listFilter same kinds as VIEW_MODE_DEFS
 * @param {{ recentIds: string[], dayStart: Date, todos?: object[] }} ctx
 */
export function filterProjectsForModalList(projects, listFilter, ctx) {
  const { recentIds, dayStart, todos } = ctx
  const recentSet = new Set(recentIds ?? [])
  if (!listFilter || listFilter.kind === 'all') return projects

  const hasTag = (p, tag) => {
    const tags = Array.isArray(p.statusTags) ? p.statusTags : []
    if (tags.includes(tag)) return true
    // Back-compat for older data: infer basic tags from enum status.
    if (!tags.length) {
      if (tag === 'ACTIVE_PROJECT' && p.status === 'ACTIVE') return true
      if (tag === 'ON_HOLD_PROJECT' && p.status === 'ON_HOLD') return true
      if (tag === 'FINISHED_PROJECT' && p.status === 'COMPLETED') return true
      if (tag === 'ARCHIVED_PROJECT' && p.status === 'ARCHIVED') return true
    }
    return false
  }

  switch (listFilter.kind) {
    case 'active':
      return projects.filter((p) => hasTag(p, 'ACTIVE_PROJECT'))
    case 'inactive':
      return projects.filter((p) => hasTag(p, 'INACTIVE_PROJECT'))
    case 'archived':
      return projects.filter((p) => hasTag(p, 'ARCHIVED_PROJECT'))
    case 'on_hold':
      return projects.filter((p) => hasTag(p, 'ON_HOLD_PROJECT'))
    case 'finished':
      return projects.filter((p) => hasTag(p, 'FINISHED_PROJECT'))
    case 'unfinished':
      return projects.filter((p) => hasTag(p, 'NON_FINISHED_PROJECT'))
    case 'future':
      return projects.filter((p) => hasTag(p, 'FUTURE_PROJECT'))
    case 'recent':
      return projects.filter((p) => recentSet.has(p.id))
    case 'overdue': {
      // If tagged as overdue, prefer that. Otherwise fall back to date logic.
      const cutoff = dayStart.getTime()
      return projects.filter((p) => {
        if (hasTag(p, 'OVERDUE_PROJECT')) return true
        if (p.expectedFinishDate == null) return false
        return new Date(p.expectedFinishDate).getTime() < cutoff
      })
    }
    case 'critical_bug': {
      // Prefer explicit tag; fall back to heuristic from task titles.
      const tagged = projects.filter((p) => hasTag(p, 'CRITICAL_BUG_PROJECT'))
      if (tagged.length) return tagged
      const ids = new Set()
      for (const t of todos ?? []) {
        if (CRITICAL_TITLE_RE.test(t.title ?? '') && t.project?.id) {
          ids.add(t.project.id)
        }
      }
      return projects.filter((p) => ids.has(p.id))
    }
    default:
      return projects
  }
}

/**
 * Map Select project "View & filter" kinds to a single status tag, for server fetches.
 * Returns null for kinds that are not backed by a single tag (e.g. recent).
 */
export function viewKindToStatusTag(kind) {
  switch (kind) {
    case 'active':
      return 'ACTIVE_PROJECT'
    case 'inactive':
      return 'INACTIVE_PROJECT'
    case 'archived':
      return 'ARCHIVED_PROJECT'
    case 'on_hold':
      return 'ON_HOLD_PROJECT'
    case 'finished':
      return 'FINISHED_PROJECT'
    case 'unfinished':
      return 'NON_FINISHED_PROJECT'
    case 'future':
      return 'FUTURE_PROJECT'
    case 'critical_bug':
      return 'CRITICAL_BUG_PROJECT'
    case 'overdue':
      return 'OVERDUE_PROJECT'
    default:
      return null
  }
}

/**
 * Home page only respects: all, critical_bug, or a single project.
 * @param {object[]} todos
 * @param {ViewFilter} viewFilter
 * @param {{ recentIds: string[], dayStart: Date }} _ctx reserved for API stability
 */
export function applyProjectViewFilter(todos, viewFilter, _ctx) {
  if (!viewFilter || viewFilter.kind === 'all') {
    return todos
  }

  if (viewFilter.kind === 'critical_bug') {
    return todos.filter(
      (t) =>
        t.subCategory === 'CRITICAL_BUG' &&
        (t.status === 'NOT_STARTED' || t.status === 'IN_PROGRESS'),
    )
  }

  if (viewFilter.kind === 'project' && viewFilter.id) {
    return todos.filter((t) => t.project?.id === viewFilter.id)
  }

  return todos
}

export function viewFilterSummaryLabel(viewFilter) {
  if (!viewFilter || viewFilter.kind === 'all') return null
  if (viewFilter.kind === 'project') {
    return `#${viewFilter.serialNumber} ${viewFilter.name}`
  }
  const def = VIEW_MODE_DEFS.find((d) => d.kind === viewFilter.kind)
  return def ? def.label : viewFilter.kind
}
