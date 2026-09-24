/*
 * Calendar page: a Google Calendar–style week view with one block per tracked session.
 *
 * Blocks are positioned in wall-clock minutes (top = minutes since midnight /
 * 1440), so they line up with the hour labels even on DST days. Their labels
 * and popovers report real durations from timestamps. render() rebuilds the
 * grid when the data, the week or the date changes. tick() only grows the
 * running block, moves the now-line and updates the day totals.
 */
(function () {
  'use strict'

  const { time, store, ui } = window.TimeTracker
  const { el, setText } = ui

  const HOUR_PX = 48
  const DAY_MINUTES = time.DAY_MINUTES
  const DEFAULT_SCROLL_HOUR = 7
  // How much text fits in a block, by its rendered height.
  const FULL_LABEL_PX = 34
  const NAME_ONLY_PX = 16

  const scrollEl = document.getElementById('cal-scroll')
  const gridEl = document.getElementById('cal-grid')
  const weekLabel = document.getElementById('week-label')
  const emptyNote = document.getElementById('cal-empty')
  const popover = document.getElementById('cal-popover')

  let weekStart = time.startOfWeek(Date.now())
  let renderedDayKey = ''
  let view = { heads: [], running: [], blocks: new Map(), nowLine: null }
  let popoverKey = null
  let popoverPinned = false

  const pct = (minutes) => `${(minutes / DAY_MINUTES) * 100}%`
  const weekEnd = () => time.addDays(weekStart, 7)
  const inViewedWeek = (ms) => ms >= weekStart && ms < weekEnd()

  // A piece that runs to the next midnight ends at 1440, not at 0 of the following day.
  const pieceMinutes = (piece) => {
    const startMin = time.minutesSinceMidnight(piece.start)
    const endMin = piece.end >= time.addDays(piece.dayStart, 1) ? DAY_MINUTES : time.minutesSinceMidnight(piece.end)
    // On a DST fall-back day, wall-clock end can precede start; the 3px minimum height keeps it visible.
    return { startMin, endMin: Math.max(startMin, endMin) }
  }

  const activePiecesInWeek = (state, now) =>
    state.active
      ? time.splitByDay(time.withActive([], state.active, now)[0]).filter((p) => inViewedWeek(p.dayStart))
      : []

  // Every session piece in the viewed week, grouped by day column and sorted by start.
  const collectPieces = (state, days, now) => {
    const tasksById = new Map(state.tasks.map((t) => [t.id, t]))
    const pieces = time
      .withActive(state.sessions, state.active, now)
      .filter((s) => tasksById.has(s.taskId) && s.end > weekStart && s.start < weekEnd())
      .flatMap((session) =>
        time.splitByDay(session).map((piece) => ({ session, piece, task: tasksById.get(session.taskId) })),
      )
    return days.map((dayStart) =>
      pieces
        .filter(({ piece }) => time.isSameDay(piece.dayStart, dayStart))
        .sort((a, b) => a.piece.start - b.piece.start),
    )
  }

  // ---- Blocks ---------------------------------------------------------------

  const sessionSummary = (block, sessionEnd) => {
    const { session, task } = block
    const startLabel = time.isSameDay(session.start, sessionEnd)
      ? time.formatClock(session.start)
      : `${time.formatMonthDay(session.start)}, ${time.formatClock(session.start)}`
    const range = session.isActive ? `${startLabel} – now` : time.formatSessionRange(session.start, sessionEnd)
    const duration = time.formatShort(sessionEnd - session.start)
    return { title: task.name, range, duration: session.isActive ? `${duration} so far · running` : duration }
  }

  const paintBlock = (block, piece, sessionEnd) => {
    const { startMin, endMin } = pieceMinutes(piece)
    const heightPx = ((endMin - startMin) / 60) * HOUR_PX
    const size = heightPx >= FULL_LABEL_PX ? 'size-full' : heightPx >= NAME_ONLY_PX ? 'size-name' : 'size-none'
    const summary = sessionSummary(block, sessionEnd)
    block.node.style.top = pct(startMin)
    block.node.style.height = pct(endMin - startMin)
    block.node.classList.remove('size-full', 'size-name', 'size-none')
    block.node.classList.add(size)
    setText(block.metaEl, time.formatShort(piece.end - piece.start))
    block.node.setAttribute('aria-label', `${summary.title}, ${summary.range}, ${summary.duration}`)
    block.sessionEnd = sessionEnd
  }

  const buildBlock = ({ session, piece, task }, layout) => {
    const key = `${session.id}@${time.dayKey(piece.dayStart)}`
    const nameEl = el('span', { className: 'block-name', text: task.name })
    const metaEl = el('span', { className: 'block-meta' })
    const node = el(
      'button',
      {
        type: 'button',
        className: `cal-block${session.isActive ? ' is-running' : ''}`,
        dataset: { key },
        style: {
          '--task-color': task.color,
          left: `calc(${(layout.col / layout.cols) * 100}% + 2px)`,
          width: `calc(${100 / layout.cols}% - 4px)`,
        },
      },
      nameEl,
      metaEl,
    )
    const block = { key, node, metaEl, session, task, sessionEnd: session.end }
    paintBlock(block, piece, session.end)

    node.addEventListener('mouseenter', () => {
      if (!popoverPinned) showPopover(key)
    })
    node.addEventListener('mouseleave', () => {
      if (!popoverPinned) hidePopover()
    })
    node.addEventListener('focus', () => showPopover(key))
    node.addEventListener('blur', () => {
      if (!popoverPinned) hidePopover()
    })
    // Clicking pins the popover, so it also works on touch screens where hover doesn't exist.
    node.addEventListener('click', () => {
      if (popoverKey === key && popoverPinned) {
        hidePopover()
        return
      }
      showPopover(key)
      popoverPinned = true
    })
    return block
  }

  // ---- Popover --------------------------------------------------------------

  const fillPopover = (block) => {
    const summary = sessionSummary(block, block.sessionEnd)
    popover.style.setProperty('--task-color', block.task.color)
    popover.replaceChildren(
      el('p', { className: 'pop-title' }, el('span', { className: 'dot', 'aria-hidden': 'true' }), summary.title),
      el('p', { className: 'pop-range', text: summary.range }),
      el('p', { className: 'pop-duration', text: summary.duration }),
    )
  }

  /*
   * Only the on-screen part of a block counts as the anchor: a long running
   * block can start far above the scroll area, and anchoring to its real top
   * would pin the popover to the top of the window.
   */
  const visibleRect = (anchor) => {
    const rect = anchor.getBoundingClientRect()
    const bounds = scrollEl.getBoundingClientRect()
    const head = gridEl.querySelector('.cal-day-head')
    const top = Math.max(rect.top, bounds.top + (head ? head.offsetHeight : 0))
    const bottom = Math.max(top, Math.min(rect.bottom, bounds.bottom))
    return { top, bottom, left: rect.left, right: rect.right }
  }

  // Beside the block if there's room, otherwise below or above it, always clamped to the viewport.
  const positionPopover = (anchor) => {
    const margin = 8
    const rect = visibleRect(anchor)
    const { width, height } = popover.getBoundingClientRect()
    const maxLeft = window.innerWidth - width - margin
    const maxTop = window.innerHeight - height - margin
    const clamp = (value, max) => Math.max(margin, Math.min(value, max))
    const beside =
      rect.right + margin + width <= window.innerWidth ? rect.right + margin
        : rect.left - margin - width >= 0 ? rect.left - margin - width
          : null
    const left = beside === null ? clamp(rect.left, maxLeft) : beside
    const top = beside === null
      ? clamp(rect.bottom + margin + height <= window.innerHeight ? rect.bottom + margin : rect.top - margin - height, maxTop)
      : clamp(rect.top, maxTop)
    popover.style.left = `${left}px`
    popover.style.top = `${top}px`
  }

  const showPopover = (key) => {
    const block = view.blocks.get(key)
    if (!block) {
      hidePopover()
      return
    }
    popoverKey = key
    fillPopover(block)
    popover.hidden = false
    positionPopover(block.node)
  }

  const hidePopover = () => {
    popoverKey = null
    popoverPinned = false
    popover.hidden = true
  }

  // ---- Grid -----------------------------------------------------------------

  const buildHead = (dayStart, now) => {
    const totalEl = el('span')
    const node = el(
      'div',
      { className: `cal-day-head${time.isSameDay(dayStart, now) ? ' is-today' : ''}` },
      el('span', { className: 'visually-hidden', text: time.formatLongDate(dayStart) }),
      el('span', { className: 'cal-dow', 'aria-hidden': 'true', text: time.formatWeekday(dayStart) }),
      el('span', { className: 'cal-date', 'aria-hidden': 'true', text: String(new Date(dayStart).getDate()) }),
      el('span', { className: 'cal-total' }, el('span', { className: 'visually-hidden', text: 'Tracked ' }), totalEl),
    )
    return { node, totalEl, dayStart }
  }

  const buildGutter = () =>
    el(
      'div',
      { className: 'cal-gutter', 'aria-hidden': 'true' },
      Array.from({ length: 23 }, (_, i) =>
        el('span', { className: 'hour-label', style: { top: `${(i + 1) * HOUR_PX}px` }, text: time.formatHourLabel(i + 1) }),
      ),
    )

  const buildColumn = (dayStart, entries, now) => {
    // Overlap layout works in the same wall-clock minutes the blocks are drawn in.
    const layouts = time.layoutIntervals(entries.map(({ piece }) => {
      const { startMin, endMin } = pieceMinutes(piece)
      return { start: startMin, end: endMin }
    }))
    const blocks = entries.map((entry, i) => buildBlock(entry, layouts[i]))
    const isToday = time.isSameDay(dayStart, now)
    const nowLine = isToday ? el('div', { className: 'now-line', 'aria-hidden': 'true' }) : null
    const node = el(
      'div',
      { className: `cal-day${isToday ? ' is-today' : ''}`, role: 'group', 'aria-label': time.formatLongDate(dayStart) },
      blocks.map((b) => b.node),
      nowLine,
    )
    return { node, blocks, nowLine }
  }

  const render = (now = Date.now()) => {
    const state = store.getState()
    const days = time.daysFrom(weekStart, 7)
    const piecesByDay = collectPieces(state, days, now)
    // A rebuild replaces the focused block, so remember it and refocus its replacement.
    const focusedKey = gridEl.contains(document.activeElement) ? document.activeElement.dataset.key : null

    renderedDayKey = time.dayKey(now)
    setText(weekLabel, time.formatWeekRange(weekStart))
    emptyNote.hidden = state.tasks.length > 0

    const heads = days.map((dayStart) => buildHead(dayStart, now))
    const columns = days.map((dayStart, i) => buildColumn(dayStart, piecesByDay[i], now))
    const blocks = columns.flatMap((c) => c.blocks)

    gridEl.style.setProperty('--hour-height', `${HOUR_PX}px`)
    gridEl.replaceChildren(
      el('div', { className: 'cal-corner', 'aria-hidden': 'true' }),
      ...heads.map((h) => h.node),
      buildGutter(),
      ...columns.map((c) => c.node),
    )

    view = {
      heads,
      running: blocks.filter((b) => b.session.isActive),
      blocks: new Map(blocks.map((b) => [b.key, b])),
      nowLine: columns.map((c) => c.nowLine).find(Boolean) || null,
    }

    if (focusedKey && view.blocks.has(focusedKey)) view.blocks.get(focusedKey).node.focus({ preventScroll: true })
    if (popoverKey && view.blocks.has(popoverKey)) showPopover(popoverKey)
    else hidePopover()

    tick(now)
  }

  const tick = (now) => {
    const state = store.getState()
    const activePieces = activePiecesInWeek(state, now)
    // A new day, or a running session that just gained or lost a visible piece, needs a full rebuild.
    if (time.dayKey(now) !== renderedDayKey || activePieces.length !== view.running.length) {
      render(now)
      return
    }
    const activeEnd = state.active ? Math.max(now, state.active.start) : 0
    view.running.forEach((block, i) => paintBlock(block, activePieces[i], activeEnd))

    const sessions = time.withActive(state.sessions, state.active, now)
    view.heads.forEach(({ totalEl, dayStart }) => setText(totalEl, time.formatHMS(time.totalForDay(sessions, dayStart))))
    if (view.nowLine) view.nowLine.style.top = pct(time.minutesSinceMidnight(now))

    const openBlock = popoverKey && view.blocks.get(popoverKey)
    if (openBlock && openBlock.session.isActive) fillPopover(openBlock)
  }

  // ---- Navigation -----------------------------------------------------------

  /*
   * Scroll to the current hour when this week is on screen, otherwise to the
   * start of a typical day. Half an hour of the previous hour stays visible so
   * the target hour's label isn't hidden under the sticky header.
   */
  const scrollToFocusHour = (now) => {
    const hour = inViewedWeek(now) ? new Date(now).getHours() : DEFAULT_SCROLL_HOUR
    scrollEl.scrollTop = Math.max(0, (hour - 0.5) * HOUR_PX)
  }

  const goToWeek = (start) => {
    weekStart = start
    hidePopover()
    render()
    scrollToFocusHour(Date.now())
  }

  document.getElementById('prev-week').addEventListener('click', () => goToWeek(time.addDays(weekStart, -7)))
  document.getElementById('next-week').addEventListener('click', () => goToWeek(time.addDays(weekStart, 7)))
  document.getElementById('today-week').addEventListener('click', () => goToWeek(time.startOfWeek(Date.now())))

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.cal-block')) hidePopover()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hidePopover()
  })
  /*
   * The popover is fixed-position, so it has to follow its block while
   * scrolling. Hiding it on scroll instead would also hide it when focusing a
   * block, because the browser scrolls a focused block into view.
   */
  const followAnchor = () => {
    const block = popoverKey && view.blocks.get(popoverKey)
    if (!block || popover.hidden) return
    const rect = block.node.getBoundingClientRect()
    const bounds = scrollEl.getBoundingClientRect()
    if (rect.bottom < bounds.top || rect.top > bounds.bottom) hidePopover()
    else positionPopover(block.node)
  }
  scrollEl.addEventListener('scroll', followAnchor, { passive: true })
  window.addEventListener('scroll', followAnchor, { passive: true })
  window.addEventListener('resize', followAnchor)

  ui.mountChrome()
  store.subscribe(() => render())
  render()
  scrollToFocusHour(Date.now())
  ui.startTicker(tick)
})()
