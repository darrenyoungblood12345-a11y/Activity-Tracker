/*
 * Light, dark or match-the-device theme.
 *
 * This is the one script that isn't deferred. It sits in <head> before the
 * stylesheet, so data-theme is on <html> before the first paint and a dark
 * page never flashes light. The choice is a per-browser preference, so it
 * lives under its own key rather than in the tracked data, and it isn't part
 * of Export/Import.
 */
(function () {
  'use strict'

  const THEME_KEY = 'timeTracker.theme'
  const THEMES = Object.freeze(['light', 'dark', 'system'])
  const DEFAULT_THEME = 'light'

  const deviceDark = window.matchMedia('(prefers-color-scheme: dark)')
  const listeners = new Set()

  const readChoice = () => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY)
      return THEMES.includes(saved) ? saved : DEFAULT_THEME
    } catch {
      return DEFAULT_THEME
    }
  }

  let choice = readChoice()

  const resolve = (theme) => (theme === 'system' ? (deviceDark.matches ? 'dark' : 'light') : theme)

  const apply = () => {
    document.documentElement.dataset.theme = resolve(choice)
    listeners.forEach((fn) => fn(choice))
  }

  const setTheme = (theme) => {
    if (!THEMES.includes(theme)) return
    choice = theme
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Storage is blocked or full: the theme still applies to this tab, and the storage banner already explains why it won't stick.
    }
    apply()
  }

  const subscribe = (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  deviceDark.addEventListener('change', () => {
    if (choice === 'system') apply()
  })

  // Another tab changed the theme, or cleared storage (a null key).
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_KEY && event.key !== null) return
    choice = readChoice()
    apply()
  })

  apply()

  window.TimeTracker = window.TimeTracker || {}
  window.TimeTracker.theme = Object.freeze({
    THEME_KEY,
    THEMES,
    getTheme: () => choice,
    setTheme,
    subscribe,
  })
})()
