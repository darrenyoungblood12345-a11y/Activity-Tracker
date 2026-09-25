/*
 * Data model, persistence and cross-tab sync.
 *
 * Everything lives under one versioned localStorage key. State is never
 * mutated in place: reducers return a new state, and `update()` persists it and
 * notifies subscribers. When storage is unavailable, the same code runs
 * against an in-memory copy, so the app keeps working in private windows and
 * locked-down browsers.
 */
(function () {
  'use strict'

  // The key keeps its original name so saved data survives schema upgrades; `version` inside it tracks the shape.
  const STORAGE_KEY = 'timeTracker.v1'
  const CORRUPT_BACKUP_KEY = `${STORAGE_KEY}.corrupt`
  const UPGRADE_BACKUP_KEY = `${STORAGE_KEY}.pre-upgrade`
  const SCHEMA_VERSION = 3
  const NAME_MAX_LENGTH = 60
  const GOAL_MIN = 1
  const GOAL_MAX = 1440
  const DEFAULT_GOAL_MINUTES = 30
  const DAYS_PER_WEEK = 7
  // A task's goal is set per day (with a weekly schedule), per week, or per calendar month.
  const GOAL_PERIODS = Object.freeze(['day', 'week', 'month'])
  const WEEK_GOAL_MAX = DAYS_PER_WEEK * GOAL_MAX
  const MONTH_GOAL_MAX = 31 * GOAL_MAX
  const DEFAULT_PERIOD_GOAL_MINUTES = 300
  const DARK_TEXT = '#1a1d21'
  // The dark theme's --surface-muted in css/styles.css.
  const DARK_SURFACE_MUTED = '#23272d'
  /*
   * Major browsers let each site keep about 5 million characters of keys and
   * values in localStorage, so usage is measured in characters and shown as
   * bytes. It's an estimate: no browser reports localStorage usage directly.
   */
  const STORAGE_LIMIT = 5 * 1024 * 1024

  /*
   * The first eight are dark enough that white text on each passes WCAG AA
   * (≥ 4.5:1), and in this order they pass an adjacent-pair colorblind-separation
   * check. Charcoal and White are neutrals added last, so new tasks are still
   * offered the eight hues first. Text on a task color is chosen per color by
   * `needsDarkText`, which is what makes White usable. Identity never depends
   * on color alone: the task name always appears next to it.
   */
  const PALETTE = Object.freeze([
    Object.freeze({ name: 'Blue', value: '#2563eb' }),
    Object.freeze({ name: 'Green', value: '#15803d' }),
    Object.freeze({ name: 'Red', value: '#dc2626' }),
    Object.freeze({ name: 'Purple', value: '#7c3aed' }),
    Object.freeze({ name: 'Amber', value: '#a16207' }),
    Object.freeze({ name: 'Ocean', value: '#0369a1' }),
    Object.freeze({ name: 'Pink', value: '#be185d' }),
    Object.freeze({ name: 'Magenta', value: '#c026d3' }),
    Object.freeze({ name: 'Charcoal', value: '#1f2937' }),
    Object.freeze({ name: 'White', value: '#ffffff' }),
  ])

  // ---- Color contrast (WCAG 2 relative luminance) -------------------------

  const channelLuminance = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }

  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => channelLuminance(parseInt(hex.slice(i, i + 2), 16)))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  const contrastRatio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  // True when the site's dark text reads better on this color than white does.
  const needsDarkText = (hex) => contrastRatio(hex, DARK_TEXT) > contrastRatio(hex, '#ffffff')

  // Moves each channel `t` of the way toward white (0 = unchanged, 1 = white).
  const tintHex = (hex, t) =>
    `#${[1, 3, 5]
      .map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16)
        return Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')
      })
      .join('')}`

  /*
   * The task color for lines and text on the dark theme. The palette is dark
   * so white text reads on it, which also makes it too dark to read on a dark
   * page, so it's tinted toward white just enough to reach 4.5:1 against the
   * lightest background task text sits on there. Pure white always qualifies.
   */
  const darkEdge = (hex) =>
    Array.from({ length: 21 }, (_, i) => tintHex(hex, i / 20)).find((c) => contrastRatio(c, DARK_SURFACE_MUTED) >= 4.5)

  const emptyState = () => ({ version: SCHEMA_VERSION, tasks: [], sessions: [], active: null })

  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  // ---- Validation ---------------------------------------------------------

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  const isTimestamp = (v) => typeof v === 'number' && Number.isFinite(v)
  const isHexColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
  const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, NAME_MAX_LENGTH) : '')
  const clampGoal = (v) => Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(v)))

  // One day's goal in minutes, where 0 means "not scheduled that day".
  const cleanDayGoal = (v) => {
    const minutes = Math.round(Number(v))
    return Number.isFinite(minutes) && minutes > 0 ? Math.min(GOAL_MAX, minutes) : 0
  }

  /*
   * Goals indexed by Date#getDay(), so [0] is Sunday. Version 1 stored a single
   * `dailyGoalMinutes`, which becomes the same goal every day.
   */
  const normalizeWeekdayGoals = (raw) => {
    if (Array.isArray(raw.weekdayGoals) && raw.weekdayGoals.length === DAYS_PER_WEEK) {
      return raw.weekdayGoals.map(cleanDayGoal)
    }
    const legacy = Number(raw.dailyGoalMinutes)
    return Array(DAYS_PER_WEEK).fill(Number.isFinite(legacy) ? clampGoal(legacy) : DEFAULT_GOAL_MINUTES)
  }

  // A daily task never uses its period goal, so the month cap is the loosest that still keeps it sane.
  const periodGoalMax = (period) => (period === 'week' ? WEEK_GOAL_MAX : MONTH_GOAL_MAX)

  // Anything missing or invalid gets the default, including version 2 tasks, which had no period goal.
  const cleanPeriodGoal = (v, period) => {
    const minutes = Math.round(Number(v))
    return Number.isFinite(minutes) && minutes >= GOAL_MIN ? Math.min(periodGoalMax(period), minutes) : DEFAULT_PERIOD_GOAL_MINUTES
  }

  /*
   * Both goals are always kept, whichever period is active, so switching a task
   * from daily to weekly and back again restores its old day schedule.
   */
  const normalizeTask = (raw) => {
    if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null
    const name = cleanName(raw.name)
    if (!name) return null
    const goalPeriod = GOAL_PERIODS.includes(raw.goalPeriod) ? raw.goalPeriod : 'day'
    return {
      id: raw.id,
      name,
      color: isHexColor(raw.color) ? raw.color.toLowerCase() : PALETTE[0].value,
      goalPeriod,
      weekdayGoals: normalizeWeekdayGoals(raw),
      periodGoalMinutes: cleanPeriodGoal(raw.periodGoalMinutes, goalPeriod),
      createdAt: isTimestamp(raw.createdAt) ? raw.createdAt : 0,
    }
  }

  /*
   * Accepts anything (corrupt storage, hand-edited or foreign imports) and
   * returns a valid state, dropping whatever can't be trusted instead of throwing.
   * Missing session ids are derived from the data, not random, so repeated
   * loads of the same data produce the same ids.
   */
  const normalize = (raw) => {
    if (!isObject(raw)) return emptyState()
    const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
      .map(normalizeTask)
      .filter(Boolean)
      .filter((task, i, all) => all.findIndex((t) => t.id === task.id) === i)
    const taskIds = new Set(tasks.map((t) => t.id))
    const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
      .filter((s) => isObject(s) && taskIds.has(s.taskId) && isTimestamp(s.start) && isTimestamp(s.end) && s.end > s.start)
      .map((s) => ({
        id: typeof s.id === 'string' && s.id ? s.id : `s-${s.taskId}-${s.start}`,
        taskId: s.taskId,
        start: s.start,
        end: s.end,
      }))
    const active =
      isObject(raw.active) && taskIds.has(raw.active.taskId) && isTimestamp(raw.active.start)
        ? { taskId: raw.active.taskId, start: raw.active.start }
        : null
    return { version: SCHEMA_VERSION, tasks, sessions, active }
  }

  // ---- Reducers (pure: state in, new state out) ---------------------------

  const addTask = (state, fields, now, id = createId()) => {
    const task = normalizeTask({ ...fields, id, createdAt: now })
    return task ? { ...state, tasks: [...state.tasks, task] } : state
  }

  const updateTask = (state, taskId, patch) => ({
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? normalizeTask({ ...task, ...patch, id: task.id, createdAt: task.createdAt }) || task : task,
    ),
  })

  // Closing a zero-length stretch (e.g. the clock jumped backwards) records nothing.
  const pauseActive = (state, now, sessionId = createId()) => {
    if (!state.active) return state
    const { taskId, start } = state.active
    const end = Math.max(now, start)
    const sessions = end > start ? [...state.sessions, { id: sessionId, taskId, start, end }] : state.sessions
    return { ...state, sessions, active: null }
  }

  // Only one timer runs at a time, so starting one closes whichever is running.
  const startTask = (state, taskId, now, sessionId = createId()) => {
    if (state.active && state.active.taskId === taskId) return state
    if (!state.tasks.some((t) => t.id === taskId)) return state
    return { ...pauseActive(state, now, sessionId), active: { taskId, start: now } }
  }

  const deleteTask = (state, taskId) => ({
    ...state,
    tasks: state.tasks.filter((t) => t.id !== taskId),
    sessions: state.sessions.filter((s) => s.taskId !== taskId),
    active: state.active && state.active.taskId === taskId ? null : state.active,
  })

  const nextColor = (state) => {
    const used = new Set(state.tasks.map((t) => t.color))
    const unused = PALETTE.find((c) => !used.has(c.value))
    return (unused || PALETTE[state.tasks.length % PALETTE.length]).value
  }

  // ---- Persistence ----------------------------------------------------------

  const listeners = new Set()
  let memoryState = emptyState()
  // True while localStorage works and our last write succeeded. Once false, memory is the source of truth.
  let persistent = false
  let warning = ''

  const notify = () => listeners.forEach((fn) => fn(memoryState))

  const setWarning = (message) => {
    if (warning === message) return
    warning = message
    notify()
  }

  const probeStorage = () => {
    try {
      const probeKey = `${STORAGE_KEY}.probe`
      window.localStorage.setItem(probeKey, '1')
      window.localStorage.removeItem(probeKey)
      return true
    } catch {
      return false
    }
  }

  const readRaw = () => {
    try {
      return { ok: true, raw: window.localStorage.getItem(STORAGE_KEY) }
    } catch {
      return { ok: false, raw: null }
    }
  }

  const backupRaw = (key, raw) => {
    try {
      window.localStorage.setItem(key, raw)
    } catch {
      // Best effort only: a backup is a courtesy, and failing to write it must not stop the app.
    }
  }

  // Returns the stored state, or null if storage can't be read at all.
  const readPersisted = () => {
    const { ok, raw } = readRaw()
    if (!ok) return null
    if (raw === null) return emptyState()
    try {
      return normalize(JSON.parse(raw))
    } catch {
      backupRaw(CORRUPT_BACKUP_KEY, raw)
      setWarning(`Saved data couldn't be read, so the tracker started fresh. The original was kept under "${CORRUPT_BACKUP_KEY}".`)
      return emptyState()
    }
  }

  const writeRaw = (text) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, text)
      return true
    } catch {
      return false
    }
  }

  const writePersisted = (state) => writeRaw(JSON.stringify(state))

  const goMemoryOnly = (message) => {
    persistent = false
    setWarning(message)
  }

  const SAVE_FAILED = "Couldn't save to browser storage (it may be full or blocked). Changes are kept only while this tab is open, so use Export to back them up."

  // ---- Upgrading saved data -------------------------------------------------

  // Saved by an older version. Data from a newer version is left alone rather than downgraded.
  const isOutdated = (raw) => isObject(raw) && !(Number(raw.version) >= SCHEMA_VERSION)

  // Stored text → the same data in the current shape, or null when there's nothing to upgrade (current, newer or unreadable).
  const upgradeText = (raw) => {
    const parsed = (() => {
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    })()
    return isOutdated(parsed) ? JSON.stringify(normalize(parsed)) : null
  }

  /*
   * normalize() already reads old data correctly, but on its own the stored
   * copy would stay in the old shape until the next change. This rewrites it
   * once, on the first load after an upgrade, keeping the original under
   * UPGRADE_BACKUP_KEY. Unreadable data is left for readPersisted to back up
   * as corrupt.
   */
  const upgradeStored = () => {
    const { raw } = readRaw()
    const upgraded = raw === null ? null : upgradeText(raw)
    if (upgraded === null) return
    backupRaw(UPGRADE_BACKUP_KEY, raw)
    if (!writeRaw(upgraded)) goMemoryOnly(SAVE_FAILED)
  }

  /*
   * Re-reads the latest stored state before applying the change, so a tab
   * holding a stale copy can't overwrite what another tab just saved.
   */
  const update = (mutator) => {
    const base = (persistent && readPersisted()) || memoryState
    const next = mutator(base)
    const changed = next !== memoryState
    memoryState = next
    if (next !== base && persistent && !writePersisted(next)) goMemoryOnly(SAVE_FAILED)
    if (changed) notify()
  }

  const subscribe = (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  // Another tab saved: adopt its state. A null key means another tab cleared storage.
  const onStorageEvent = (event) => {
    if (!persistent) return
    if (event.key !== STORAGE_KEY && event.key !== null) return
    memoryState = readPersisted() || memoryState
    notify()
  }

  // ---- Export / import ------------------------------------------------------

  const exportJSON = () => JSON.stringify(memoryState, null, 2)

  const parseImport = (text) => {
    const raw = (() => {
      try {
        return JSON.parse(text)
      } catch {
        throw new Error("That file isn't valid JSON.")
      }
    })()
    if (!isObject(raw) || !Array.isArray(raw.tasks) || !Array.isArray(raw.sessions)) {
      throw new Error("That file doesn't look like a Time Tracker export.")
    }
    return normalize(raw)
  }

  const replaceAll = (state) => update(() => normalize(state))

  // ---- Usage estimate -------------------------------------------------------

  // [[key, value], …] → [{ key, size }], where size counts the characters of both.
  const measureEntries = (entries) => entries.map(([key, value]) => ({ key, size: key.length + value.length }))

  // Everything stored at this origin, other apps' keys included, since they share the quota. Null if storage can't be read.
  const estimateUsage = () => {
    try {
      const { localStorage } = window
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => k !== null)
      const items = measureEntries(keys.map((key) => [key, localStorage.getItem(key) || '']))
      return { items, total: items.reduce((sum, item) => sum + item.size, 0), limit: STORAGE_LIMIT }
    } catch {
      return null
    }
  }

  // 0 B, 812 B, 4.2 KB, 18 KB, 1.3 MB: one decimal only while it's a single digit.
  const formatSize = (bytes) => {
    const [value, unit] =
      bytes < 1024 ? [bytes, 'B'] : bytes < 1024 * 1024 ? [bytes / 1024, 'KB'] : [bytes / (1024 * 1024), 'MB']
    const rounded = unit === 'B' || value >= 9.95 ? Math.round(value) : Math.round(value * 10) / 10
    return `${rounded} ${unit}`
  }

  // ---- Init -----------------------------------------------------------------

  if (probeStorage()) {
    persistent = true
    upgradeStored()
    memoryState = readPersisted() || emptyState()
  } else {
    goMemoryOnly("This browser is blocking storage, so tracked time will be lost when this tab closes. Use Export to keep a copy.")
  }
  window.addEventListener('storage', onStorageEvent)

  window.TimeTracker = window.TimeTracker || {}
  window.TimeTracker.store = Object.freeze({
    STORAGE_KEY,
    CORRUPT_BACKUP_KEY,
    UPGRADE_BACKUP_KEY,
    SCHEMA_VERSION,
    STORAGE_LIMIT,
    PALETTE,
    NAME_MAX_LENGTH,
    GOAL_MIN,
    GOAL_MAX,
    DEFAULT_GOAL_MINUTES,
    DEFAULT_PERIOD_GOAL_MINUTES,
    periodGoalMax,
    DARK_TEXT,
    DARK_SURFACE_MUTED,
    contrastRatio,
    needsDarkText,
    darkEdge,
    emptyState,
    normalize,
    isOutdated,
    upgradeText,
    addTask,
    updateTask,
    pauseActive,
    startTask,
    deleteTask,
    nextColor,
    getState: () => memoryState,
    getWarning: () => warning,
    isPersistent: () => persistent,
    update,
    subscribe,
    exportJSON,
    parseImport,
    replaceAll,
    measureEntries,
    estimateUsage,
    formatSize,
  })
})()
