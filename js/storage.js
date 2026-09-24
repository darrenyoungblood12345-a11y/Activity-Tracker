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
  const SCHEMA_VERSION = 2
  const NAME_MAX_LENGTH = 60
  const GOAL_MIN = 1
  const GOAL_MAX = 1440
  const DEFAULT_GOAL_MINUTES = 30
  const DAYS_PER_WEEK = 7
  const DARK_TEXT = '#1a1d21'

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

  const normalizeTask = (raw) => {
    if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null
    const name = cleanName(raw.name)
    if (!name) return null
    return {
      id: raw.id,
      name,
      color: isHexColor(raw.color) ? raw.color.toLowerCase() : PALETTE[0].value,
      weekdayGoals: normalizeWeekdayGoals(raw),
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

  const backupCorrupt = (raw) => {
    try {
      window.localStorage.setItem(CORRUPT_BACKUP_KEY, raw)
    } catch {
      // Best effort only: the backup is a courtesy, and failing to write it must not stop the app.
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
      backupCorrupt(raw)
      setWarning(`Saved data couldn't be read, so the tracker started fresh. The original was kept under "${CORRUPT_BACKUP_KEY}".`)
      return emptyState()
    }
  }

  const writePersisted = (state) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      return true
    } catch {
      return false
    }
  }

  const goMemoryOnly = (message) => {
    persistent = false
    setWarning(message)
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
    if (next !== base && persistent && !writePersisted(next)) {
      goMemoryOnly("Couldn't save to browser storage (it may be full or blocked). Changes are kept only while this tab is open, so use Export to back them up.")
    }
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

  // ---- Init -----------------------------------------------------------------

  if (probeStorage()) {
    persistent = true
    memoryState = readPersisted() || emptyState()
  } else {
    goMemoryOnly("This browser is blocking storage, so tracked time will be lost when this tab closes. Use Export to keep a copy.")
  }
  window.addEventListener('storage', onStorageEvent)

  window.TimeTracker = window.TimeTracker || {}
  window.TimeTracker.store = Object.freeze({
    STORAGE_KEY,
    PALETTE,
    NAME_MAX_LENGTH,
    GOAL_MIN,
    GOAL_MAX,
    DEFAULT_GOAL_MINUTES,
    DARK_TEXT,
    needsDarkText,
    emptyState,
    normalize,
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
  })
})()
