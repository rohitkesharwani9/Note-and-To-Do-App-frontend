import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import './LoginPage.css'
import './AppHomePage.css'
import './AppInstallPage.css'

export default function AppInstallPage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const manifestLink = document.createElement('link')
    manifestLink.rel = 'manifest'
    manifestLink.href = '/manifest.webmanifest'
    document.head.appendChild(manifestLink)

    let swRegistration = null
    ;(async () => {
      if (!('serviceWorker' in navigator)) return
      try {
        swRegistration = await navigator.serviceWorker.register('/service-worker.js')
      } catch {
        /* ignore */
      }
    })()

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      setIsInstalling(false)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      manifestLink.remove()
      if (swRegistration) {
        void swRegistration.unregister()
      }
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setIsInstalling(true)
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setIsInstalling(false)
    setDeferredPrompt(null)
    if (choice?.outcome === 'accepted') {
      setInstalled(true)
    }
  }

  const canInstall = !!deferredPrompt

  return (
    <div className="app-home-root app-install-root">
      <motion.header
        className="app-home-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      >
        <div className="app-home-header-inner">
          <div>
            <h1 className="app-home-title">App</h1>
            <p className="app-home-greet">Install our app on your device.</p>
          </div>
          <div className="app-home-header-actions">
            <motion.button
              type="button"
              className="app-home-signout"
              onClick={() => navigate('/app-home')}
              whileTap={{ scale: 0.98 }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              Home
            </motion.button>
          </div>
        </div>
      </motion.header>

      <section className="app-home-section app-install-section">
        <div className="app-install-card">
          <img src="/app-logo.png" alt="App logo" className="app-install-logo" />
          <motion.button
            type="button"
            className="app-home-toolbar-btn app-home-toolbar-btn--primary app-install-btn"
            onClick={handleInstall}
            disabled={!canInstall || isInstalling || installed}
            whileTap={{ scale: canInstall ? 0.97 : 1 }}
            whileHover={reduceMotion || !canInstall ? {} : { y: -1 }}
          >
            {installed
              ? 'App Installed'
              : isInstalling
                ? 'Opening installer...'
                : 'Download our app'}
          </motion.button>
          {!canInstall && !installed ? (
            <p className="app-install-hint">
              Install prompt is not available yet on this device/browser.
            </p>
          ) : null}
        </div>
      </section>

      <AnimatePresence>
        {isInstalling ? (
          <motion.div
            className="app-install-splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
          >
            <motion.img
              src="/app-logo.png"
              alt="Installing app"
              className="app-install-splash-logo"
              initial={reduceMotion ? { scale: 1 } : { scale: 0.9, opacity: 0.8 }}
              animate={reduceMotion ? { scale: 1 } : { scale: 1, opacity: 1 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.35 }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
