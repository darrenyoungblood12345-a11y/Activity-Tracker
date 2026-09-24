/*
 * Analytics page: today's progress per goal and a 7-day history.
 *
 * render() builds the structure whenever the data or the date changes. tick()
 * only rewrites numbers inside it once a second, so screen readers and text
 * selection aren't disturbed by a DOM rebuilt on every tick.
 */
(function () {
  'use strict'

  const { time, store, ui } = window.TimeTracker
  const { el, setText } = ui

  const DAYS_SHOWN = 7

  const todayLabel = document.getElementById('today-label')
  const totalEl = document.getElementById('total-today')
  const goalsMetEl = document.getElementById('goals-met')
  const emptyEl = document.getElementById('empty-state')
  const contentEl = document.getElementById('analytics-content')
  const listEl = document.getElementById('progress-list')
  const headEl = document.getElementById('week-head')
  const bodyEl = document.getElementById('week-body')
  const tableScroll = document.getElementById('week-scroll')

  let rows = new Map()
  let days = []
  let renderedDayKey = ''

  const metric = (label) => {
    const dt = el('dt', { text: label })
    const dd = el('dd')
    return { node: el('div', { className: 'metric' }, dt, dd), dt, dd }
  }

  const buildProgressItem = (task) => {
    const percentEl = el('span', { className: 'percent' })
    const progress = ui.createProgressBar(`${task.name}: progress toward daily goal`)
    const done = metric('Done')
    const goal = metric('Goal')
    const remaining = metric('Remaining')
    setText(goal.dd, time.formatGoal(task.dailyGoalMinutes))
    const node = el(
      'li',
      { className: 'progress-item', style: { '--task-color': task.color } },
      el('div', { className: 'progress-item-head' }, el('span', { className: 'dot', 'aria-hidden': 'true' }), el('h3', { className: 'task-name', text: task.name }), percentEl),
      progress.bar,
      el('dl', { className: 'metrics' }, done.node, goal.node, remaining.node),
    )
    return { node, percentEl, progress, done, remaining }
  }

  const buildHeaderRow = (now) =>
    el(
      'tr',
      {},
      el('th', { scope: 'col', className: 'col-task', text: 'Task' }),
      days.map((dayStart) => {
        const isToday = time.isSameDay(dayStart, now)
        return el(
          'th',
          { scope: 'col', className: isToday ? 'is-today' : '' },
          el('span', { className: 'th-day', text: isToday ? 'Today' : time.formatWeekday(dayStart) }),
          el('span', { className: 'th-date', text: time.formatMonthDay(dayStart) }),
        )
      }),
    )

  const buildCell = () => {
    const valueEl = el('span', { className: 'cell-value' })
    const checkEl = el('span', { className: 'cell-check', 'aria-hidden': 'true', text: '✓' })
    const srEl = el('span', { className: 'visually-hidden' })
    return { td: el('td', {}, valueEl, checkEl, srEl), valueEl, checkEl, srEl }
  }

  const buildWeekRow = (task) => {
    const cells = days.map(buildCell)
    const tr = el(
      'tr',
      { style: { '--task-color': task.color } },
      el('th', { scope: 'row', className: 'col-task' }, el('span', { className: 'dot', 'aria-hidden': 'true' }), el('span', { text: task.name })),
      cells.map((c) => c.td),
    )
    return { tr, cells }
  }

  const render = (now = Date.now()) => {
    const { tasks } = store.getState()
    renderedDayKey = time.dayKey(now)
    days = time.lastNDays(now, DAYS_SHOWN)
    emptyEl.hidden = tasks.length > 0
    contentEl.hidden = tasks.length === 0

    rows = new Map(tasks.map((task) => [task.id, { item: buildProgressItem(task), week: buildWeekRow(task) }]))
    listEl.replaceChildren(...Array.from(rows.values(), (r) => r.item.node))
    headEl.replaceChildren(buildHeaderRow(now))
    bodyEl.replaceChildren(...Array.from(rows.values(), (r) => r.week.tr))
    tick(now)
    // On narrow screens the table scrolls sideways. Start at the newest day, which matters most,
    // after tick() has filled the cells so the final width is known.
    tableScroll.scrollLeft = tableScroll.scrollWidth
  }

  const paintCell = (cell, task, dayStart, doneMs) => {
    // Days before the task existed have no goal to measure against.
    const beforeCreated = dayStart < time.startOfDay(task.createdAt) && doneMs === 0
    const progress = time.goalProgress(doneMs, task.dailyGoalMinutes)
    const met = !beforeCreated && progress.met
    setText(cell.valueEl, beforeCreated ? '—' : `${progress.percent}%`)
    setText(cell.srEl, beforeCreated ? 'not tracked yet' : met ? ', goal met' : '')
    cell.checkEl.hidden = !met
    cell.td.classList.toggle('is-met', met)
    cell.td.classList.toggle('is-empty', beforeCreated || doneMs === 0)
    cell.td.title = beforeCreated
      ? `${time.formatMonthDay(dayStart)}: task not created yet`
      : `${time.formatMonthDay(dayStart)}: ${time.formatShort(doneMs)} of ${time.formatGoal(task.dailyGoalMinutes)}`
  }

  const tick = (now) => {
    // At midnight the 7-day window slides forward, so the table columns change.
    if (time.dayKey(now) !== renderedDayKey) {
      render(now)
      return
    }
    const state = store.getState()
    const sessions = time.withActive(state.sessions, state.active, now)
    const today = time.startOfDay(now)

    const todays = state.tasks.map((task) => {
      const doneMs = time.totalForDay(sessions, today, task.id)
      return { task, doneMs, progress: time.goalProgress(doneMs, task.dailyGoalMinutes) }
    })

    setText(todayLabel, time.formatLongDate(now))
    setText(totalEl, time.formatHMS(time.totalForDay(sessions, today)))
    setText(goalsMetEl, `${todays.filter((t) => t.progress.met).length} of ${todays.length}`)

    todays.forEach(({ task, doneMs, progress }) => {
      const row = rows.get(task.id)
      if (!row) return
      const { item, week } = row
      setText(item.percentEl, `${progress.percent}%`)
      ui.setProgress(item.progress, progress)
      setText(item.done.dd, time.formatHMS(doneMs))
      setText(item.remaining.dt, progress.met ? 'Over goal' : 'Remaining')
      setText(item.remaining.dd, progress.met ? `+${time.formatShort(progress.overMs)} ✓` : time.formatShort(progress.remainingMs, { ceil: true }))
      item.node.classList.toggle('is-met', progress.met)
      days.forEach((dayStart, i) => paintCell(week.cells[i], task, dayStart, time.totalForDay(sessions, dayStart, task.id)))
    })
  }

  ui.mountChrome()
  store.subscribe(() => render())
  render()
  ui.startTicker(tick)
})()
