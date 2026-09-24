/*
 * Shared page chrome and DOM helpers: the storage-warning banner, the
 * Export/Import footer, a ticker aligned to the second, and small builders
 * used by more than one page.
 */
(function () {
  'use strict'

  const { time, store } = window.TimeTracker

  let idCounter = 0
  const uid = (prefix = 'tt') => `${prefix}-${++idCounter}`

  /*
   * Minimal hyperscript: el('button', { className, text, onClick, 'aria-label': … }, ...children).
   * Keys in `style` are CSS property names, so custom properties like
   * '--task-color' work too.
   */
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag)
    Object.entries(props).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return
      if (key === 'className') node.className = value
      else if (key === 'text') node.textContent = value
      else if (key === 'style') Object.entries(value).forEach(([prop, v]) => node.style.setProperty(prop, v))
      else if (key === 'dataset') Object.assign(node.dataset, value)
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value)
      else node.setAttribute(key, value === true ? '' : String(value))
    })
    children.flat().forEach((child) => {
      if (child === null || child === undefined || child === false) return
      node.append(child instanceof Node ? child : String(child))
    })
    return node
  }

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text
  }

  /*
   * Ticks just after each wall-clock second, so an H:MM:SS display never skips
   * or repeats a second. Values are always recomputed from timestamps, so a
   * throttled background tab simply catches up on its next tick.
   */
  const startTicker = (onTick) => {
    let timeoutId = 0
    const run = () => {
      window.clearTimeout(timeoutId)
      onTick(Date.now())
      timeoutId = window.setTimeout(run, 1000 - (Date.now() % 1000) + 10)
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') run()
    })
    run()
  }

  // A progress bar whose width caps at 100% while its label reports the real percentage.
  const createProgressBar = (label) => {
    const fill = el('div', { className: 'progress-fill' })
    const bar = el(
      'div',
      { className: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label },
      fill,
    )
    return { bar, fill }
  }

  const setProgress = ({ bar, fill }, progress) => {
    const width = `${Math.min(100, progress.percent)}%`
    if (fill.style.width !== width) fill.style.width = width
    bar.setAttribute('aria-valuenow', String(Math.min(100, progress.percent)))
    bar.setAttribute('aria-valuetext', `${progress.percent}% of goal`)
    bar.classList.toggle('is-met', progress.met)
  }

  // Human text for a goal that may be met or not: "18m left" / "Goal met ✓ (+12m)".
  const remainingText = (progress) => {
    if (!progress.met) return `${time.formatShort(progress.remainingMs, { ceil: true })} left`
    return progress.overMs >= 1000 ? `Goal met ✓ (+${time.formatShort(progress.overMs)})` : 'Goal met ✓'
  }

  /*
   * CSS variables for anything drawn in a task's color:
   * --task-color fills, --task-ink is text on top of that fill, and --task-edge
   * is for lines and text against the page. On a dark color the edge is the
   * color itself, so it doesn't show; on a light one (White) it's a gray that
   * keeps the fill and its outline visible on a white page.
   */
  const taskColorVars = (color) => {
    const light = store.needsDarkText(color)
    return {
      '--task-color': color,
      '--task-ink': light ? store.DARK_TEXT : '#ffffff',
      '--task-edge': light ? 'var(--text-muted)' : color,
    }
  }

  // Same as taskColorVars, for nodes that are patched in place rather than rebuilt.
  const setTaskColor = (node, color) =>
    Object.entries(taskColorVars(color)).forEach(([prop, value]) => node.style.setProperty(prop, value))

  const colorDot = (color) => el('span', { className: 'dot', 'aria-hidden': 'true', style: taskColorVars(color) })

  // ---- Storage warning banner -------------------------------------------

  const mountBanner = () => {
    const banner = document.getElementById('storage-warning')
    if (!banner) return
    const sync = () => {
      const message = store.getWarning()
      banner.hidden = !message
      setText(banner, message)
    }
    store.subscribe(sync)
    sync()
  }

  // ---- Export / import footer -------------------------------------------

  const downloadText = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = el('a', { href: url, download: filename, hidden: true })
    document.body.append(link)
    link.click()
    link.remove()
    // Revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

  const mountDataTools = () => {
    const footer = document.getElementById('site-footer')
    if (!footer) return

    const status = el('p', { className: 'data-status', role: 'status' })
    const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, tabindex: '-1' })
    const exportBtn = el('button', { type: 'button', className: 'btn btn-quiet', text: 'Export JSON' })
    const importBtn = el('button', { type: 'button', className: 'btn btn-quiet', text: 'Import JSON' })
    const confirmText = el('p', { className: 'confirm-text' })
    const replaceBtn = el('button', { type: 'button', className: 'btn btn-danger', text: 'Replace data' })
    const cancelBtn = el('button', { type: 'button', className: 'btn', text: 'Cancel' })
    const confirmBox = el('div', { className: 'inline-confirm', hidden: true }, confirmText, el('div', { className: 'btn-row' }, replaceBtn, cancelBtn))

    let pending = null

    const closeConfirm = () => {
      pending = null
      confirmBox.hidden = true
    }

    exportBtn.addEventListener('click', () => {
      downloadText(`time-tracker-${time.dayKey(Date.now())}.json`, store.exportJSON())
      status.textContent = 'Exported a backup of your data.'
    })

    importBtn.addEventListener('click', () => fileInput.click())

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0]
      // Reset so choosing the same file again still fires `change`.
      fileInput.value = ''
      if (!file) return
      try {
        pending = store.parseImport(await file.text())
        confirmText.textContent = `Replace all current data with ${plural(pending.tasks.length, 'task')} and ${plural(pending.sessions.length, 'session')} from “${file.name}”? This can't be undone.`
        confirmBox.hidden = false
        status.textContent = ''
        cancelBtn.focus()
      } catch (error) {
        closeConfirm()
        status.textContent = error instanceof Error ? error.message : 'Import failed.'
      }
    })

    replaceBtn.addEventListener('click', () => {
      if (!pending) return
      store.replaceAll(pending)
      closeConfirm()
      status.textContent = 'Import complete.'
      importBtn.focus()
    })

    cancelBtn.addEventListener('click', () => {
      closeConfirm()
      status.textContent = 'Import cancelled.'
      importBtn.focus()
    })

    confirmBox.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      closeConfirm()
      importBtn.focus()
    })

    footer.append(
      el('p', { className: 'footer-note', text: 'Your data stays in this browser.' }),
      el('div', { className: 'btn-row' }, exportBtn, importBtn, fileInput),
      confirmBox,
      status,
    )
  }

  const mountChrome = () => {
    mountBanner()
    mountDataTools()
  }

  window.TimeTracker.ui = Object.freeze({
    uid,
    el,
    setText,
    startTicker,
    createProgressBar,
    setProgress,
    remainingText,
    taskColorVars,
    setTaskColor,
    colorDot,
    mountChrome,
  })
})()
