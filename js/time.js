/*
 * Pure date and duration helpers. No DOM, no storage, and no Date.now():
 * callers pass `now` in, so every function here is deterministic and testable.
 *
 * Day boundaries use the local timezone and are always built with the Date
 * constructor (y, m, d + n) instead of adding 86 400 000 ms, so DST days
 * correctly come out 23 or 25 hours long. Durations are always plain
 * timestamp differences, so they stay correct across DST and clock changes.
 */
(function () {
  'use strict'

  const SECOND_MS = 1000
  const MINUTE_MS = 60 * SECOND_MS
  const DAY_MINUTES = 24 * 60

  const pad2 = (n) => String(n).padStart(2, '0')

  const startOfDay = (ms) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }

  // Local midnight `days` calendar days after the day containing `ms`.
  const addDays = (ms, days) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime()
  }

  // Weeks run Sunday–Saturday, matching the calendar's column order.
  const startOfWeek = (ms) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime()
  }

  const dayKey = (ms) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  const isSameDay = (a, b) => dayKey(a) === dayKey(b)

  // Consecutive day starts, e.g. the 7 columns of a week.
  const daysFrom = (firstDayStart, count) =>
    Array.from({ length: count }, (_, i) => addDays(firstDayStart, i))

  // The last `count` days ending with today, oldest first.
  const lastNDays = (now, count) => daysFrom(addDays(now, 1 - count), count)

  const isValidInterval = ({ start, end }) =>
    Number.isFinite(start) && Number.isFinite(end) && end > start

  /*
   * Splits a session at each local midnight it crosses, so an overnight session
   * counts toward (and renders in) both days. The raw record is never changed;
   * each piece copies the session's other fields (id, taskId, …) and adds the
   * `dayStart` it belongs to.
   */
  const splitByDay = (session) => {
    if (!isValidInterval(session)) return []
    const dayStart = startOfDay(session.start)
    const nextDayStart = addDays(dayStart, 1)
    if (session.end <= nextDayStart) return [{ ...session, dayStart }]
    return [
      { ...session, end: nextDayStart, dayStart },
      ...splitByDay({ ...session, start: nextDayStart }),
    ]
  }

  const overlapMs = (start, end, rangeStart, rangeEnd) =>
    Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart))

  /*
   * Treats the running timer as a session that ends "now". Every total and
   * every calendar block is then computed the same way whether a timer is
   * running or not, which keeps all three pages in agreement.
   * `max(now, start)` keeps a clock that jumped backwards from producing a
   * negative duration.
   */
  const withActive = (sessions, active, now) =>
    active
      ? [
          ...sessions,
          {
            id: `active-${active.start}`,
            taskId: active.taskId,
            start: active.start,
            end: Math.max(now, active.start),
            isActive: true,
          },
        ]
      : sessions

  // Single source of truth for "how much time in this range". Omit `taskId` for all tasks.
  const totalForRange = (sessions, rangeStart, rangeEnd, taskId) =>
    sessions
      .filter((s) => taskId === undefined || s.taskId === taskId)
      .reduce((sum, s) => sum + overlapMs(s.start, s.end, rangeStart, rangeEnd), 0)

  const totalForDay = (sessions, dayStart, taskId) =>
    totalForRange(sessions, dayStart, addDays(dayStart, 1), taskId)

  /*
   * `percent` is floored and left uncapped: 99.9 % must never read "100 %"
   * before the goal is actually met, and overachievement should show its true size.
   */
  const goalProgress = (doneMs, goalMinutes) => {
    const goalMs = goalMinutes * MINUTE_MS
    const done = Math.max(0, doneMs)
    return {
      goalMs,
      percent: goalMs > 0 ? Math.floor((done / goalMs) * 100) : 0,
      remainingMs: Math.max(0, goalMs - done),
      overMs: Math.max(0, done - goalMs),
      met: goalMs > 0 && done >= goalMs,
    }
  }

  // Wall-clock minutes, not elapsed minutes, so calendar blocks line up with the hour labels on DST days.
  const minutesSinceMidnight = (ms) => {
    const d = new Date(ms)
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / MINUTE_MS
  }

  /*
   * Side-by-side layout for overlapping intervals, like Google Calendar:
   * group transitively overlapping items into clusters, then give each item
   * the first column that is free at its start. Touching intervals
   * (a.end === b.start) don't overlap, so back-to-back sessions stay full width.
   * Returns `{ ...item, col, cols }` in the input order.
   */
  const layoutIntervals = (items) => {
    const sorted = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.start - b.item.start || b.item.end - a.item.end)

    const clusters = sorted.reduce((acc, entry) => {
      const last = acc[acc.length - 1]
      if (last && entry.item.start < last.maxEnd) {
        return [
          ...acc.slice(0, -1),
          { entries: [...last.entries, entry], maxEnd: Math.max(last.maxEnd, entry.item.end) },
        ]
      }
      return [...acc, { entries: [entry], maxEnd: entry.item.end }]
    }, [])

    const placed = clusters.flatMap(({ entries }) => {
      const { columnEnds, withCols } = entries.reduce(
        (acc, entry) => {
          const free = acc.columnEnds.findIndex((colEnd) => colEnd <= entry.item.start)
          const col = free === -1 ? acc.columnEnds.length : free
          const columnEnds = acc.columnEnds.slice()
          columnEnds[col] = entry.item.end
          return { columnEnds, withCols: [...acc.withCols, { ...entry, col }] }
        },
        { columnEnds: [], withCols: [] },
      )
      return withCols.map((entry) => ({ ...entry, cols: columnEnds.length }))
    })

    return placed
      .sort((a, b) => a.index - b.index)
      .map(({ item, col, cols }) => ({ ...item, col, cols }))
  }

  // "H:MM:SS". Hours are not wrapped, so a 25-hour DST day still reads correctly.
  const formatHMS = (ms) => {
    const totalSeconds = Math.floor(Math.max(0, ms) / SECOND_MS)
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${h}:${pad2(m)}:${pad2(s)}`
  }

  /*
   * Compact duration: "1h 5m", "2h", "12m", "45s". `ceil` rounds up to whole
   * minutes, for "time left" labels that must never say "0m left" while the
   * goal isn't met yet.
   */
  const formatShort = (ms, { ceil = false } = {}) => {
    const safe = Math.max(0, ms)
    if (!ceil && safe < MINUTE_MS) return `${Math.floor(safe / SECOND_MS)}s`
    const totalMinutes = ceil ? Math.ceil(safe / MINUTE_MS) : Math.floor(safe / MINUTE_MS)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    if (h === 0) return `${m}m`
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }

  const formatGoal = (minutes) =>
    minutes < 60 ? `${minutes} min` : formatShort(minutes * MINUTE_MS)

  const formatClock = (ms) =>
    new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const formatHourLabel = (hour) =>
    new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric' })

  const formatWeekday = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short' })

  const formatMonthDay = (ms) =>
    new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })

  const formatLongDate = (ms) =>
    new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  // ---- Weekly schedules ---------------------------------------------------

  const WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6])
  const WORKDAYS = Object.freeze([1, 2, 3, 4, 5])
  const WEEKEND = Object.freeze([0, 6])

  // Localized weekday name for a Date#getDay() index. 2 Jan 2000 was a Sunday.
  const weekdayName = (day, style = 'short') =>
    new Date(2000, 0, 2 + day).toLocaleDateString([], { weekday: style })

  // Goal minutes for the local weekday containing `ms`; 0 when the task is off that day.
  const weekdayGoal = (weekdayGoals, ms) => weekdayGoals[new Date(ms).getDay()] || 0

  const sameDays = (a, b) => a.length === b.length && a.every((day, i) => day === b[i])

  /*
   * One-line summary: "Every day · 30 min", "Weekdays · 1h", "Mon, Wed, Fri · 45 min",
   * or "Mon 1h, Tue 30 min" when the goal differs between days.
   */
  const describeSchedule = (weekdayGoals) => {
    const on = WEEKDAYS.filter((day) => weekdayGoals[day] > 0)
    if (on.length === 0) return 'No days scheduled'
    const goals = new Set(on.map((day) => weekdayGoals[day]))
    if (goals.size > 1) return on.map((day) => `${weekdayName(day)} ${formatGoal(weekdayGoals[day])}`).join(', ')
    const days = sameDays(on, WEEKDAYS) ? 'Every day'
      : sameDays(on, WORKDAYS) ? 'Weekdays'
        : sameDays(on, WEEKEND) ? 'Weekends'
          : on.map((day) => weekdayName(day)).join(', ')
    return `${days} · ${formatGoal(weekdayGoals[on[0]])}`
  }

  // "9:00 AM – 9:30 AM", or with dates when the session crosses midnight.
  const formatSessionRange = (start, end) => {
    if (isSameDay(start, end)) return `${formatClock(start)} – ${formatClock(end)}`
    return `${formatMonthDay(start)}, ${formatClock(start)} – ${formatMonthDay(end)}, ${formatClock(end)}`
  }

  // "Sep 20 – 26, 2026", "Sep 27 – Oct 3, 2026", "Dec 27, 2026 – Jan 2, 2027".
  const formatWeekRange = (weekStart) => {
    const first = new Date(weekStart)
    const last = new Date(addDays(weekStart, 6))
    const fmt = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', year: 'numeric' })
    return typeof fmt.formatRange === 'function'
      ? fmt.formatRange(first, last)
      : `${fmt.format(first)} – ${fmt.format(last)}`
  }

  window.TimeTracker = window.TimeTracker || {}
  window.TimeTracker.time = Object.freeze({
    MINUTE_MS,
    DAY_MINUTES,
    startOfDay,
    addDays,
    startOfWeek,
    dayKey,
    isSameDay,
    daysFrom,
    lastNDays,
    splitByDay,
    overlapMs,
    withActive,
    totalForRange,
    totalForDay,
    goalProgress,
    minutesSinceMidnight,
    layoutIntervals,
    formatHMS,
    formatShort,
    formatGoal,
    formatClock,
    formatHourLabel,
    formatWeekday,
    formatMonthDay,
    formatLongDate,
    formatSessionRange,
    formatWeekRange,
    WEEKDAYS,
    WORKDAYS,
    WEEKEND,
    weekdayName,
    weekdayGoal,
    describeSchedule,
  })
})()
