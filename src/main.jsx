import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

function AppMotionProvider({ children }) {
  const [liteMotion, setLiteMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(max-width: 1024px), (pointer: coarse)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(max-width: 1024px), (pointer: coarse)')
    const onChange = (e) => setLiteMotion(e.matches)
    setLiteMotion(media.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [])

  return <MotionConfig reducedMotion={liteMotion ? 'always' : 'never'}>{children}</MotionConfig>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppMotionProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppMotionProvider>
  </StrictMode>,
)
