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

  // ---- Icons ----------------------------------------------------------------

  const SVG_NS = 'http://www.w3.org/2000/svg'
  // 24×24 paths. Play and pause are filled; the rest are stroked (see .icon-* in css/styles.css).
  const ICON_PATHS = Object.freeze({
    play: 'M8 5.5v13l10.5-6.5z',
    pause: 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7.5',
  })

  const icon = (name) => {
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('class', `icon icon-${name}`)
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', ICON_PATHS[name])
    svg.append(path)
    return svg
  }

  // Swaps an icon in place only when it changes, so a ticking render doesn't churn the DOM.
  const setIcon = (button, name) => {
    if (button.dataset.icon === name) return
    button.dataset.icon = name
    button.replaceChildren(icon(name))
  }

  // A progress bar whose width caps at 100% while its label reports the real percentage. Nine ticks cut it into tenths.
  const createProgressBar = (label) => {
    const fill = el('div', { className: 'progress-fill' })
    const ticks = el('div', { className: 'progress-ticks', 'aria-hidden': 'true' }, Array.from({ length: 9 }, () => el('i')))
    const bar = el(
      'div',
      { className: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label },
      fill,
      ticks,
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

  // Human text for a goal that may be met or not: "18m left" / "Goal met (+12m)".
  const remainingText = (progress) => {
    if (!progress.met) return `${time.formatShort(progress.remainingMs, { ceil: true })} left`
    return progress.overMs >= 1000 ? `Goal met (+${time.formatShort(progress.overMs)})` : 'Goal met'
  }

  /*
   * CSS variables for anything drawn in a task's color:
   * --task-color fills, --task-ink is text on top of that fill, and --task-edge
   * is for lines and text against the page. On the light theme a dark color's
   * edge is the color itself, so it doesn't show, and a light one (White) gets
   * a gray that keeps the fill and its outline visible on a white page. On the
   * dark theme the edge is the color tinted lighter (store.darkEdge).
   * light-dark() picks by the page's color-scheme, so a theme change restyles
   * without re-rendering.
   */
  const taskColorVars = (color) => {
    const light = store.needsDarkText(color)
    return {
      '--task-color': color,
      '--task-ink': light ? store.DARK_TEXT : '#ffffff',
      '--task-edge': `light-dark(${light ? 'var(--text-muted)' : color}, ${store.darkEdge(color)})`,
    }
  }

  // Same as taskColorVars, for nodes that are patched in place rather than rebuilt.
  const setTaskColor = (node, color) =>
    Object.entries(taskColorVars(color)).forEach(([prop, value]) => node.style.setProperty(prop, value))

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

    replaceBtn.addEventListener('click', async () => {
      if (!pending) return
      const imported = pending
      closeConfirm()
      await store.replaceAll(imported)
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

  // ---- Rail: every task, startable from any page ---------------------------

  // Only one timer runs at a time, so starting a task pauses whichever is running.
  const toggleTimer = (taskId) => {
    const now = Date.now()
    return store.update((state) =>
      state.active && state.active.taskId === taskId ? store.pauseActive(state, now) : store.startTask(state, taskId, now),
    )
  }

  // The Activities page, relative to this one. The brand link always points there.
  const homeHref = () => {
    const brand = document.querySelector('.brand')
    return brand ? brand.getAttribute('href') : 'index.html'
  }

  /*
   * "#task-<id>", which the Activities page reads. Ids can come from an imported file, so they're encoded to stay a
   * valid fragment. Half of a surrogate pair on its own can't be encoded and would throw here, in the task list every
   * page shows. The store drops such ids; one that still gets here becomes a link that selects nothing.
   */
  const taskHash = (taskId) => `#task-${encodeURIComponent(String(taskId).replace(/\p{Surrogate}/gu, '�'))}`

  const PERIOD_SUFFIX = Object.freeze({ week: 'wk', month: 'mo' })

  /*
   * The rail's task list: today's tasks first, then the rest, each with a
   * start/pause button and its time so far. A name links to that task on the
   * Activities page, which reads the #task-… hash. Rows are keyed by task id
   * and patched in place, like the Activities stage, so focus survives a
   * render triggered from another tab. On phones the list is hidden on every
   * page but Activities, and the running task shows in a strip instead.
   */
  const mountRail = () => {
    const mount = document.getElementById('rail-tasks')
    const chip = document.getElementById('now-chip')
    if (!mount) return { setSelected: () => {} }

    // On Activities itself the links are bare hashes, so choosing a task never reloads the page (even when it was opened as "/").
    const home = document.body.dataset.page === 'activities' ? '' : homeHref()
    const rows = new Map()
    let selected = null
    let renderedDayKey = ''

    const todayTitle = el('h2', { className: 'rail-group-title', id: uid('rail-today'), text: 'Today' })
    const todayNote = el('p', { className: 'rail-note' })
    const todayList = el('ul', { className: 'rail-list', 'aria-labelledby': todayTitle.id })
    const otherTitle = el('h2', { className: 'rail-group-title', id: uid('rail-other'), text: 'Not today' })
    const otherList = el('ul', { className: 'rail-list', 'aria-labelledby': otherTitle.id })
    const addLink = el('a', { className: 'rail-add', href: `${home}#add` }, icon('plus'), 'Add a task')
    mount.append(todayTitle, todayNote, todayList, otherTitle, otherList, addLink)

    const createRow = (taskId) => {
      const nameEl = el('span', { className: 'rail-task-name' })
      const timeEl = el('span')
      const periodEl = el('span', { className: 'rail-task-period', 'aria-hidden': 'true' })
      const metEl = el('span', { className: 'rail-task-met' }, icon('check'), el('span', { className: 'visually-hidden', text: ', goal met' }))
      const srPeriod = el('span', { className: 'visually-hidden' })
      const link = el(
        'a',
        { className: 'rail-task-link', href: `${home}${taskHash(taskId)}` },
        el('span', { className: 'task-square', 'aria-hidden': 'true' }),
        nameEl,
        el('span', { className: 'rail-task-time' }, timeEl, periodEl, srPeriod, metEl),
      )
      const playBtn = el('button', { type: 'button', className: 'rail-play', onClick: () => toggleTimer(taskId) })
      const root = el('li', { className: 'rail-task' }, link, playBtn)
      return { root, link, nameEl, timeEl, periodEl, srPeriod, metEl, playBtn, color: '' }
    }

    // Only move nodes that are out of place: moving a node drops focus inside it.
    const place = (list, tasks) =>
      tasks.forEach((task, index) => {
        const { root } = rows.get(task.id)
        if (list.children[index] !== root) list.insertBefore(root, list.children[index] || null)
      })

    const paintSelection = () => {
      rows.forEach((row, id) => {
        const isSelected = id === selected
        row.root.classList.toggle('is-selected', isSelected)
        if (isSelected) row.link.setAttribute('aria-current', 'true')
        else row.link.removeAttribute('aria-current')
      })
      if (selected === 'add') addLink.setAttribute('aria-current', 'true')
      else addLink.removeAttribute('aria-current')
    }

    const paintChip = (state, activeTask, sessions, now) => {
      if (!chip) return
      chip.hidden = !activeTask
      if (!activeTask) return
      setTaskColor(chip, activeTask.color)
      const goal = time.goalFor(activeTask, now)
      const link = chip.querySelector('.now-chip-link')
      link.href = `${home}${taskHash(activeTask.id)}`
      setText(chip.querySelector('.now-chip-name'), activeTask.name)
      setText(chip.querySelector('.now-chip-time'), time.formatHMS(time.totalForRange(sessions, goal.start, goal.end, activeTask.id)))
      chip.querySelector('.now-chip-pause').setAttribute('aria-label', `Pause ${activeTask.name}`)
    }

    const tick = (now) => {
      if (time.dayKey(now) !== renderedDayKey) {
        render(now)
        return
      }
      const state = store.getState()
      const sessions = time.withActive(state.sessions, state.active, now)
      const activeId = state.active && state.active.taskId
      state.tasks.forEach((task) => {
        const row = rows.get(task.id)
        if (!row) return
        const goal = time.goalFor(task, now)
        const doneMs = time.totalForRange(sessions, goal.start, goal.end, task.id)
        const running = task.id === activeId
        const progress = time.goalProgress(doneMs, goal.minutes)
        setText(row.timeEl, running ? time.formatHMS(doneMs) : doneMs === 0 ? '0m' : time.formatShort(doneMs))
        row.metEl.hidden = !progress.met || goal.minutes === 0
        row.root.classList.toggle('is-running', running)
        row.root.classList.toggle('is-off', goal.minutes === 0)
        setIcon(row.playBtn, running ? 'pause' : 'play')
        row.playBtn.setAttribute('aria-label', `${running ? 'Pause' : 'Start'} ${task.name}`)
      })
      paintChip(state, state.tasks.find((t) => t.id === activeId), sessions, now)
    }

    const render = (now = Date.now()) => {
      const { tasks } = store.getState()
      const ids = new Set(tasks.map((t) => t.id))
      const isToday = (task) => time.goalFor(task, now).minutes > 0
      const today = tasks.filter(isToday)
      const others = tasks.filter((task) => !isToday(task))
      renderedDayKey = time.dayKey(now)

      Array.from(rows.keys())
        .filter((id) => !ids.has(id))
        .forEach((id) => {
          rows.get(id).root.remove()
          rows.delete(id)
        })

      tasks.forEach((task) => {
        if (!rows.has(task.id)) rows.set(task.id, createRow(task.id))
        const row = rows.get(task.id)
        if (row.color !== task.color) {
          setTaskColor(row.root, task.color)
          row.color = task.color
        }
        setText(row.nameEl, task.name)
        setText(row.periodEl, PERIOD_SUFFIX[task.goalPeriod] || '')
        setText(row.srPeriod, task.goalPeriod === 'day' ? ' today' : ` ${time.periodLabel(task.goalPeriod).toLowerCase()}`)
      })
      place(todayList, today)
      place(otherList, others)

      setText(todayNote, tasks.length === 0 ? 'No tasks yet.' : today.length === 0 ? 'Nothing scheduled today.' : '')
      todayNote.hidden = todayNote.textContent === ''
      todayList.hidden = today.length === 0
      otherTitle.hidden = others.length === 0
      otherList.hidden = others.length === 0
      paintSelection()
      tick(now)
    }

    if (chip) {
      chip.querySelector('.now-chip-pause').addEventListener('click', () => {
        const { active } = store.getState()
        if (active) toggleTimer(active.taskId)
      })
    }

    store.subscribe(() => render())
    render()
    startTicker(tick)

    return {
      // A task id, 'add' for the add form, or null.
      setSelected: (value) => {
        selected = value
        paintSelection()
      },
    }
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
    icon,
    setIcon,
    createProgressBar,
    setProgress,
    remainingText,
    plural,
    taskColorVars,
    setTaskColor,
    taskHash,
    toggleTimer,
    mountRail,
    mountChrome,
  })
})()
