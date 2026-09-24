/*
 * Settings page: the theme picker and a read-only estimate of how much
 * localStorage the site uses.
 */
(function () {
  'use strict'

  const { store, ui, theme } = window.TimeTracker
  const { el, setText } = ui

  const themeOptions = document.getElementById('theme-options')
  const summary = document.getElementById('storage-summary')
  const usedEl = document.getElementById('storage-used')
  const limitEl = document.getElementById('storage-limit')
  const bar = document.getElementById('storage-bar')
  const fill = bar.querySelector('.progress-fill')
  const percentEl = document.getElementById('storage-percent')
  const breakdown = document.getElementById('storage-breakdown')
  const statusEl = document.getElementById('storage-status')

  const KNOWN_KEYS = [store.STORAGE_KEY, store.CORRUPT_BACKUP_KEY, theme.THEME_KEY]

  // ---- Theme ----------------------------------------------------------------

  const radios = Array.from(themeOptions.querySelectorAll('input[name="theme"]'))

  const syncThemeRadios = (choice) => radios.forEach((radio) => (radio.checked = radio.value === choice))

  themeOptions.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'theme') theme.setTheme(event.target.value)
  })

  // ---- Storage --------------------------------------------------------------

  // "0.4%", with "< 0.1%" for amounts too small to show but not nothing.
  const percentText = (total, limit) => {
    const percent = (total / limit) * 100
    return total > 0 && percent < 0.1 ? '< 0.1%' : `${Math.round(percent * 10) / 10}%`
  }

  const breakdownRow = ({ label, detail, size }) =>
    el(
      'div',
      { className: 'storage-row' },
      el('dt', {}, el('span', { className: 'storage-label', text: label }), detail && el('span', { className: 'storage-detail', text: detail })),
      el('dd', { text: store.formatSize(size) }),
    )

  const statusText = (usage) => {
    if (!usage) return 'This browser is blocking storage, so nothing can be saved or measured. Your tasks last only until this tab closes.'
    if (!store.isPersistent()) return 'The last save failed, so recent changes are only in this tab. Use Export JSON below to keep a copy.'
    return 'Saving normally to this browser.'
  }

  const renderStorage = () => {
    const usage = store.estimateUsage()
    summary.hidden = !usage
    breakdown.hidden = !usage
    setText(statusEl, statusText(usage))
    if (!usage) return

    const { items, total, limit } = usage
    const sizeOf = (key) => items.find((item) => item.key === key)?.size ?? 0
    const otherSize = items.filter((item) => !KNOWN_KEYS.includes(item.key)).reduce((sum, item) => sum + item.size, 0)
    const { tasks, sessions } = store.getState()

    setText(usedEl, store.formatSize(total))
    setText(limitEl, store.formatSize(limit))
    setText(percentEl, `${percentText(total, limit)} of the estimated limit`)
    const percent = Math.min(100, (total / limit) * 100)
    // A sliver stays visible for tiny amounts, so a nearly empty bar still reads as "some" rather than "none".
    fill.style.width = total > 0 ? `max(4px, ${percent}%)` : '0'
    bar.setAttribute('aria-valuenow', String(Math.round(percent * 10) / 10))
    bar.setAttribute('aria-valuetext', `${store.formatSize(total)} of about ${store.formatSize(limit)}, ${percentText(total, limit)}`)

    const rows = [
      { label: 'Tasks and sessions', detail: `${ui.plural(tasks.length, 'task')} · ${ui.plural(sessions.length, 'session')}`, size: sizeOf(store.STORAGE_KEY), always: true },
      { label: 'Backup of unreadable data', detail: `Kept under “${store.CORRUPT_BACKUP_KEY}” when saved data couldn't be read`, size: sizeOf(store.CORRUPT_BACKUP_KEY) },
      { label: 'Theme setting', size: sizeOf(theme.THEME_KEY) },
      { label: 'Other data at this address', detail: 'Saved by other pages served from the same address. It shares the same limit.', size: otherSize },
    ]
    breakdown.replaceChildren(...rows.filter((row) => row.always || row.size > 0).map(breakdownRow))
  }

  // ---- Init -----------------------------------------------------------------

  ui.mountChrome()
  syncThemeRadios(theme.getTheme())
  theme.subscribe((choice) => {
    syncThemeRadios(choice)
    renderStorage()
  })
  // Imports and edits on this page, plus any key another tab changes (other apps' keys and the corrupt backup included).
  store.subscribe(() => renderStorage())
  window.addEventListener('storage', () => renderStorage())
  renderStorage()
})()
