/** Main category color; subs use `light` (note bg) / `dark` (accents). */
export const LINK_MAIN_THEMES = {
  development_tech: { solid: '#2563eb', light: '#dbeafe', dark: '#1d4ed8' },
  ai_llm: { solid: '#7c3aed', light: '#ede9fe', dark: '#6d28d9' },
  tools_resources: { solid: '#0891b2', light: '#cffafe', dark: '#0e7490' },
  learning_knowledge: { solid: '#ca8a04', light: '#fef9c3', dark: '#a16207' },
  design_ui_ux: { solid: '#db2777', light: '#fce7f3', dark: '#be185d' },
  code_repositories: { solid: '#4f46e5', light: '#e0e7ff', dark: '#4338ca' },
  productivity_workflow: { solid: '#059669', light: '#d1fae5', dark: '#047857' },
  business_growth: { solid: '#ea580c', light: '#ffedd5', dark: '#c2410c' },
  quality_security: { solid: '#dc2626', light: '#fee2e2', dark: '#b91c1c' },
}

export function getMainTheme(key) {
  return (
    LINK_MAIN_THEMES[key] ?? {
      solid: '#64748b',
      light: '#f1f5f9',
      dark: '#475569',
    }
  )
}
