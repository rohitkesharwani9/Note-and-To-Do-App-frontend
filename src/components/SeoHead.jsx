import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'

const BRAND = 'To‑Do Planner'

/** Match route keys even with trailing slashes or Vite `base` prefix. */
function normalizeAppPathname(pathname) {
  let p = pathname || '/'
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  const baseRaw = import.meta.env.BASE_URL || '/'
  const basePath = baseRaw === '/' ? '' : baseRaw.replace(/\/$/, '')
  if (basePath && (p === basePath || p.startsWith(`${basePath}/`))) {
    const rest = p === basePath ? '/' : p.slice(basePath.length)
    p = rest.startsWith('/') ? rest : `/${rest}`
  }
  return p || '/'
}

function absoluteUrl(pathname) {
  if (typeof window === 'undefined') return ''
  const path = normalizeAppPathname(pathname)
  const baseRaw = import.meta.env.BASE_URL || '/'
  const prefix = baseRaw === '/' ? '' : baseRaw.replace(/\/$/, '')
  const fullPath = prefix ? `${prefix}${path === '/' ? '' : path}` : path
  return `${window.location.origin}${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`
}

/** Absolute URL for og:image / Twitter (social crawlers expect a full URL). */
function absoluteAssetUrl() {
  if (typeof window === 'undefined') return ''
  const base = window.location.origin + (import.meta.env.BASE_URL || '/')
  return new URL('app-logo-512.png', base).href
}

/** Same-origin path for `<link rel="apple-touch-icon">` — no hard-coded localhost. */
function logoAssetPath() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '')
  const path = `${base}/app-logo-512.png`.replace(/\/+/g, '/')
  return path.startsWith('/') ? path : `/${path}`
}

function setDescriptionMeta(content) {
  let el = document.getElementById('app-meta-description')
  if (!el) {
    el = document.createElement('meta')
    el.id = 'app-meta-description'
    el.setAttribute('name', 'description')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setMetaName(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setMetaProperty(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLinkRel(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Route-specific SEO: unique title + meta description (length tuned for SERP snippets),
 * Open Graph, Twitter Card, canonical, and JSON-LD WebPage for Google/Bing.
 */
function seoForPath(pathname) {
  const p = normalizeAppPathname(pathname)
  if (p === '/' || p === '/login') {
    return {
      title: `Sign In | ${BRAND} — Tasks, Projects, Calendar & Notes`,
      description:
        'Sign in to your workspace: plan tasks and projects, use the calendar, save links, and capture notes in one focused app. Secure access from any device.',
    }
  }
  if (p === '/app-home') {
    return {
      title: `Home Dashboard | Daily Tasks, Projects & Progress — ${BRAND}`,
      description:
        'Your home dashboard: see today’s progress, add tasks or projects, jump to calendar, links, or notes, and keep work organized without switching tools.',
    }
  }
  if (p === '/profile') {
    return {
      title: `Account & Profile Settings | ${BRAND}`,
      description:
        'Update your profile, manage sign-in and preferences, and control your account from one place. Return to Home or Calendar when you are done.',
    }
  }
  if (p === '/calendar') {
    return {
      title: `Task & Project Calendar | Month View — ${BRAND}`,
      description:
        'Browse a full month of work: switch task-wise or project-wise views, spot busy days, and open any date to review or add items tied to that day.',
    }
  }
  if (p === '/saved-links') {
    return {
      title: `Saved Links & Bookmarks | ${BRAND}`,
      description:
        'Store and reopen important URLs next to your tasks. Save new links, browse your library, and keep reference material one click away from your workflow.',
    }
  }
  if (p === '/note') {
    return {
      title: `Notes & To‑Dos | Rich Notes & Lists — ${BRAND}`,
      description:
        'Capture long-form notes and checklist to-dos together. Filter by list mode, sort your board, and open items in full view when you need more space.',
    }
  }
  if (p.startsWith('/project/')) {
    return {
      title: `Project Workspace | Tasks, Status & Dates — ${BRAND}`,
      description:
        'Work inside one project: review tasks, change status, edit project details, and reach calendar, links, or notes without losing context for that project.',
    }
  }
  return {
    title: `Page Not Found (404) | ${BRAND}`,
    description:
      'We could not find that page. Use Home or Sign in from the menu to get back on track, or open your dashboard if you are already signed in.',
  }
}

export default function SeoHead() {
  const { pathname: pathnameRaw } = useLocation()
  const { title, description } = useMemo(() => seoForPath(pathnameRaw), [pathnameRaw])

  useEffect(() => {
    document.title = title

    const pageUrl =
      typeof window !== 'undefined'
        ? window.location.href.replace(/#.*$/, '')
        : absoluteUrl(pathnameRaw)
    const imageUrl = absoluteAssetUrl()
    const touchIconHref = logoAssetPath()

    setDescriptionMeta(description)
    setMetaName(
      'robots',
      'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    )

    setMetaProperty('og:site_name', BRAND)
    setMetaProperty('og:type', 'website')
    setMetaProperty('og:title', title)
    setMetaProperty('og:description', description)
    setMetaProperty('og:url', pageUrl)
    setMetaProperty('og:image', imageUrl)
    setMetaProperty('og:image:width', '512')
    setMetaProperty('og:image:height', '512')
    setMetaProperty('og:image:alt', `${BRAND} — app logo`)
    setMetaProperty('og:locale', 'en_US')

    setMetaName('twitter:card', 'summary_large_image')
    setMetaName('twitter:title', title)
    setMetaName('twitter:description', description)
    setMetaName('twitter:image', imageUrl)
    setMetaName('twitter:image:alt', `${BRAND} — app logo`)

    setLinkRel('canonical', pageUrl)
    setLinkRel('apple-touch-icon', touchIconHref)

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: pageUrl,
      isPartOf: {
        '@type': 'WebSite',
        name: BRAND,
        url: absoluteUrl('/'),
      },
    }
    const prev = document.getElementById('seo-structured-data')
    if (prev) prev.remove()
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = 'seo-structured-data'
    script.textContent = JSON.stringify(ld)
    document.head.appendChild(script)
  }, [pathnameRaw, title, description])

  return null
}
