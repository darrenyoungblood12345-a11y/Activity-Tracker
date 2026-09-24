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
    const node = el(
      'li',
      { className: 'progress-item', style: ui.taskColorVars(task.color) },
      el('div', { className: 'progress-item-head' }, el('span', { className: 'dot', 'aria-hidden': 'true' }), el('h3', { className: 'task-name', text: task.name }), percentEl),
      el('p', { className: 'task-schedule', text: time.describeSchedule(task.weekdayGoals) }),
      progress.bar,
      el('dl', { className: 'metrics' }, done.node, goal.node, remaining.node),
    )
    return { node, percentEl, progress, done, goal, remaining }
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
      { style: ui.taskColorVars(task.color) },
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

  /*
   * Days before the task existed, and days it isn't scheduled, have no goal to
   * measure against. Time tracked on an unscheduled day is still shown, but
   * never as a percentage or a ✓.
   */
  const paintCell = (cell, task, dayStart, doneMs) => {
    const day = time.formatMonthDay(dayStart)
    const beforeCreated = dayStart < time.startOfDay(task.createdAt) && doneMs === 0
    const goalMinutes = time.weekdayGoal(task.weekdayGoals, dayStart)
    const off = !beforeCreated && goalMinutes === 0
    const progress = time.goalProgress(doneMs, goalMinutes)
    const met = !beforeCreated && progress.met
    const tracked = doneMs > 0 ? time.formatShort(doneMs) : ''
    setText(cell.valueEl, beforeCreated ? '—' : off ? tracked || '—' : `${progress.percent}%`)
    setText(cell.srEl, beforeCreated ? 'not tracked yet' : off ? `${tracked ? ', ' : ''}not scheduled` : met ? ', goal met' : '')
    cell.checkEl.hidden = !met
    cell.td.classList.toggle('is-met', met)
    cell.td.classList.toggle('is-empty', beforeCreated || off || doneMs === 0)
    cell.td.title = beforeCreated ? `${day}: task not created yet`
      : off ? `${day}: not scheduled${tracked ? `, ${tracked} tracked` : ''}`
        : `${day}: ${time.formatShort(doneMs)} of ${time.formatGoal(goalMinutes)}`
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
      const goalMinutes = time.weekdayGoal(task.weekdayGoals, now)
      return { task, doneMs, goalMinutes, progress: time.goalProgress(doneMs, goalMinutes) }
    })
    // Tasks that are off today don't count toward "goals met" either way.
    const scheduled = todays.filter((t) => t.goalMinutes > 0)

    setText(todayLabel, time.formatLongDate(now))
    setText(totalEl, time.formatHMS(time.totalForDay(sessions, today)))
    setText(goalsMetEl, `${scheduled.filter((t) => t.progress.met).length} of ${scheduled.length}`)

    todays.forEach(({ task, doneMs, goalMinutes, progress }) => {
      const row = rows.get(task.id)
      if (!row) return
      const { item, week } = row
      const off = goalMinutes === 0
      setText(item.percentEl, off ? 'Off today' : `${progress.percent}%`)
      ui.setProgress(item.progress, progress)
      item.progress.bar.hidden = off
      setText(item.done.dd, time.formatHMS(doneMs))
      setText(item.goal.dd, off ? 'None today' : time.formatGoal(goalMinutes))
      setText(item.remaining.dt, progress.met ? 'Over goal' : 'Remaining')
      setText(item.remaining.dd, off ? '—' : progress.met ? `+${time.formatShort(progress.overMs)} ✓` : time.formatShort(progress.remainingMs, { ceil: true }))
      item.node.classList.toggle('is-met', progress.met)
      item.node.classList.toggle('is-off', off)
      days.forEach((dayStart, i) => paintCell(week.cells[i], task, dayStart, time.totalForDay(sessions, dayStart, task.id)))
    })
  }

  ui.mountChrome()
  store.subscribe(() => render())
  render()
  ui.startTicker(tick)
})()
