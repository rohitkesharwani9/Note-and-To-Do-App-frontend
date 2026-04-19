/**
 * Task main/sub categories + visual themes for AddTask popup and task list borders.
 * Keys are stable API values (UPPER_SNAKE_CASE).
 */

export const TASK_CATEGORY_TREE = [
  {
    key: 'DEVELOPMENT',
    label: 'Development',
    defaultTheme: {
      border: 'rgba(202, 138, 4, 0.85)',
      panelBg: 'linear-gradient(165deg, rgba(254, 243, 199, 0.55) 0%, rgba(253, 230, 138, 0.2) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #ca8a04 0%, #a16207 100%)',
      chipTextOn: '#fffbeb',
    },
    subs: [
      { key: 'REFACTOR', label: 'Refactor', theme: { border: '#fde047', intensity: 'lightest' } },
      { key: 'IMPROVEMENT', label: 'Improvement', theme: { border: '#eab308', intensity: 'light' } },
      { key: 'FEATURE', label: 'Feature', theme: { border: '#ca8a04', intensity: 'medium' } },
    ],
  },
  {
    key: 'ISSUES',
    label: 'Issues',
    defaultTheme: {
      border: 'rgba(239, 68, 68, 0.85)',
      panelBg: 'linear-gradient(165deg, rgba(254, 226, 226, 0.55) 0%, rgba(252, 165, 165, 0.2) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 100%)',
      chipTextOn: '#fef2f2',
    },
    subs: [
      { key: 'UI_BUG', label: 'UI Bug', theme: { border: '#fca5a5', intensity: 'light' } },
      { key: 'BUG', label: 'Bug', theme: { border: '#ef4444', intensity: 'medium' } },
      { key: 'CRITICAL_BUG', label: 'Critical Bug', theme: { border: '#991b1b', intensity: 'dark' } },
    ],
  },
  {
    key: 'PLANNING',
    label: 'Planning',
    defaultTheme: {
      border: 'rgba(139, 92, 246, 0.85)',
      panelBg: 'linear-gradient(165deg, rgba(237, 233, 254, 0.55) 0%, rgba(196, 181, 253, 0.25) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)',
      chipTextOn: '#f5f3ff',
    },
    subs: [
      { key: 'RESEARCH', label: 'Research', theme: { border: '#c4b5fd', intensity: 'light' } },
      { key: 'IDEA', label: 'Idea', theme: { border: '#8b5cf6', intensity: 'medium' } },
      { key: 'FUTURE_UPGRADE', label: 'Future Upgrade', theme: { border: '#6d28d9', intensity: 'dark' } },
    ],
  },
  {
    key: 'DESIGN',
    label: 'Design',
    /** Warm coral/orange — distinct from purple Planning & slate Documentation */
    defaultTheme: {
      border: 'rgba(249, 115, 22, 0.9)',
      panelBg:
        'linear-gradient(165deg, rgba(255, 237, 213, 0.65) 0%, rgba(254, 215, 170, 0.28) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #f97316 0%, #c2410c 100%)',
      chipTextOn: '#fff7ed',
    },
    subs: [
      { key: 'RESPONSIVENESS', label: 'Responsiveness', theme: { border: '#fed7aa', intensity: 'lightest' } },
      { key: 'UI', label: 'UI', theme: { border: '#fb923c', intensity: 'light' } },
      { key: 'UX', label: 'UX', theme: { border: '#c2410c', intensity: 'dark' } },
    ],
  },
  {
    key: 'TECHNICAL',
    label: 'Technical',
    defaultTheme: {
      border: 'rgba(37, 99, 235, 0.85)',
      panelBg: 'linear-gradient(165deg, rgba(219, 234, 254, 0.55) 0%, rgba(147, 197, 253, 0.25) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
      chipTextOn: '#eff6ff',
    },
    subs: [
      { key: 'PERFORMANCE', label: 'Performance', theme: { border: '#0ea5e9', intensity: 'light' } },
      { key: 'API', label: 'API', theme: { border: '#3b82f6', intensity: 'medium' } },
      { key: 'BACKEND', label: 'Backend', theme: { border: '#2563eb', intensity: 'medium' } },
      { key: 'DATABASE', label: 'Database', theme: { border: '#1e40af', intensity: 'dark' } },
      { key: 'SECURITY', label: 'Security', theme: { border: '#1e3a8a', intensity: 'dark' } },
    ],
  },
  {
    key: 'TESTING',
    label: 'Testing',
    defaultTheme: {
      border: 'rgba(20, 184, 166, 0.85)',
      panelBg: 'linear-gradient(165deg, rgba(204, 251, 241, 0.55) 0%, rgba(153, 246, 228, 0.25) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #0d9488 0%, #0f766e 100%)',
      chipTextOn: '#f0fdfa',
    },
    subs: [
      { key: 'BUG_VERIFICATION', label: 'Bug Verification', theme: { border: '#5eead4', intensity: 'light' } },
      { key: 'UNIT_TESTING', label: 'Unit Testing', theme: { border: '#14b8a6', intensity: 'medium' } },
      { key: 'MANUAL_TESTING', label: 'Manual Testing', theme: { border: '#0f766e', intensity: 'dark' } },
    ],
  },
  {
    key: 'DEPLOYMENT',
    label: 'Deployment',
    /** Fuchsia/magenta pipeline — distinct from violet Planning & blue Technical */
    defaultTheme: {
      border: 'rgba(192, 38, 211, 0.9)',
      panelBg:
        'linear-gradient(165deg, rgba(250, 232, 255, 0.58) 0%, rgba(240, 171, 252, 0.28) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #c026d3 0%, #86198f 100%)',
      chipTextOn: '#fdf4ff',
    },
    subs: [
      { key: 'CI_CD', label: 'CI/CD', theme: { border: '#f0abfc', intensity: 'lightest' } },
      { key: 'BUILD', label: 'Build', theme: { border: '#d946ef', intensity: 'medium' } },
      { key: 'RELEASE', label: 'Release', theme: { border: '#86198f', intensity: 'dark' } },
    ],
  },
  {
    key: 'DOCUMENTATION',
    label: 'Documentation',
    /** Cool slate / manuscript — distinct from green Testing & teal accents */
    defaultTheme: {
      border: 'rgba(71, 85, 105, 0.92)',
      panelBg:
        'linear-gradient(165deg, rgba(241, 245, 249, 0.75) 0%, rgba(203, 213, 225, 0.35) 45%), var(--surface)',
      chipSelected: 'linear-gradient(180deg, #475569 0%, #1e293b 100%)',
      chipTextOn: '#f8fafc',
    },
    subs: [
      { key: 'USER_GUIDE', label: 'User Guide', theme: { border: '#cbd5e1', intensity: 'lightest' } },
      { key: 'README', label: 'README', theme: { border: '#64748b', intensity: 'medium' } },
      { key: 'API_DOCS', label: 'API Docs', theme: { border: '#0f172a', intensity: 'dark' } },
    ],
  },
]

const MAIN_BY_KEY = new Map(TASK_CATEGORY_TREE.map((m) => [m.key, m]))

/** Sub chips: lightest → light → medium → dark (then label) for Add task row order */
export const SUB_INTENSITY_ORDER = {
  lightest: 0,
  light: 1,
  medium: 2,
  dark: 3,
}

export function sortSubsByIntensity(subs) {
  if (!Array.isArray(subs)) return []
  return [...subs].sort((a, b) => {
    const ia = SUB_INTENSITY_ORDER[a.theme?.intensity] ?? 2
    const ib = SUB_INTENSITY_ORDER[b.theme?.intensity] ?? 2
    if (ia !== ib) return ia - ib
    return String(a.label ?? '').localeCompare(String(b.label ?? ''), undefined, {
      sensitivity: 'base',
    })
  })
}

/**
 * Theme for popup + task row: border is primary visual for list items.
 */
export function getTaskCategoryTheme(mainKey, subKey) {
  const neutral = {
    border: 'rgba(255, 255, 255, 0.45)',
    panelBg: undefined,
    chipSelected: undefined,
    chipTextOn: undefined,
    subBorder: undefined,
    label: '',
  }
  if (!mainKey) return neutral
  const main = MAIN_BY_KEY.get(mainKey)
  if (!main) return neutral
  if (!subKey) {
    return {
      ...neutral,
      border: main.defaultTheme.border,
      panelBg: main.defaultTheme.panelBg,
      chipSelected: main.defaultTheme.chipSelected,
      chipTextOn: main.defaultTheme.chipTextOn,
      label: main.label,
    }
  }
  const sub = main.subs.find((s) => s.key === subKey)
  if (!sub) {
    return {
      ...neutral,
      border: main.defaultTheme.border,
      panelBg: main.defaultTheme.panelBg,
      label: main.label,
    }
  }
  return {
    border: sub.theme.border,
    panelBg: main.defaultTheme.panelBg,
    chipSelected: main.defaultTheme.chipSelected,
    chipTextOn: main.defaultTheme.chipTextOn,
    subBorder: sub.theme.border,
    label: `${main.label} · ${sub.label}`,
    mainLabel: main.label,
    subLabel: sub.label,
  }
}

export function getCategoryLabels(mainKey, subKey) {
  const main = MAIN_BY_KEY.get(mainKey)
  if (!main) return { main: '', sub: '' }
  const sub = main.subs.find((s) => s.key === subKey)
  return { main: main.label, sub: sub ? sub.label : '' }
}
