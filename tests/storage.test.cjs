const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

const source = readFileSync(join(__dirname, '../js/storage.js'), 'utf8')
const KEY = 'timeTracker.v1'
const WRITE_LOCK = `${KEY}.write`

// Independent document globals sharing storage and an explicitly scheduled Web Lock.
const browser = (initial) => {
  const data = new Map(initial ? [[KEY, JSON.stringify(initial)]] : [])
  const writes = []
  const queue = []
  let held = null
  const locks = {
    request(name, callback) {
      return new Promise((resolve, reject) => queue.push({ name, callback, resolve, reject }))
    },
    async flush() {
      while (queue.length) {
        const { name, callback, resolve, reject } = queue.shift()
        held = name
        try {
          resolve(await callback({ name, mode: 'exclusive' }))
        } catch (error) {
          reject(error)
        } finally {
          held = null
        }
      }
    },
  }
  const tab = ({ webLocks = true, writable = true, readable = true } = {}) => {
    const events = new Map()
    const window = {
      localStorage: {
        getItem(key) {
          if (!readable) throw new Error('Storage blocked')
          return data.get(key) ?? null
        },
        setItem(key, value) {
          if (!writable) throw new Error('Storage full')
          writes.push({ key, value, lock: held })
          data.set(key, value)
        },
        removeItem: (key) => data.delete(key),
      },
      addEventListener(name, callback) {
        events.set(name, callback)
      },
    }
    const navigator = webLocks === 'denied'
      ? { locks: { request: () => Promise.reject(new Error('Lock denied')) } }
      : webLocks ? { locks } : {}
    vm.runInNewContext(source, { window, navigator })
    return { store: window.TimeTracker.store, events }
  }
  return { tab, data, writes, locks, saved: () => JSON.parse(data.get(KEY)) }
}

const legacy = () => ({
  version: 1,
  tasks: [{ id: 'reading', name: 'Reading', dailyGoalMinutes: 30 }],
  sessions: [],
  active: { taskId: 'reading', start: 1000 },
})

test('startup upgrades wait for the shared write lock and read the latest saved data', async () => {
  const env = browser(legacy())
  const { store } = env.tab()
  assert.equal(env.saved().version, 1, 'startup must not rewrite data before acquiring the lock')
  let notifications = 0
  store.subscribe(() => {
    notifications += 1
    assert.equal(env.saved().version, store.SCHEMA_VERSION)
  })

  // Another lock holder finishes a task edit and records a session while startup waits.
  const latest = legacy()
  latest.tasks.push({ id: 'gym', name: 'Gym', dailyGoalMinutes: 45 })
  latest.sessions.push({ id: 'completed', taskId: 'reading', start: 100, end: 900 })
  env.data.set(KEY, JSON.stringify(latest))
  await env.locks.flush()

  const saved = env.saved()
  assert.equal(saved.version, store.SCHEMA_VERSION)
  assert.deepEqual(saved.tasks.map((task) => task.id), ['reading', 'gym'])
  assert.equal(saved.sessions[0].id, 'completed')
  assert.equal(saved.active.taskId, 'reading')
  assert.equal(JSON.parse(store.exportJSON()).tasks.length, 2)
  assert.equal(notifications, 1)
  assert.deepEqual(JSON.parse(env.data.get(`${KEY}.pre-upgrade`)), latest)
  assert.ok(env.writes.filter((write) => write.key === KEY).every((write) => write.lock === WRITE_LOCK))
})

test('without Web Locks, changes stay exportable in this page without overwriting saved data', async () => {
  const env = browser({ ...legacy(), version: 3 })
  const before = env.data.get(KEY)
  const { store, events } = env.tab({ webLocks: false })
  await store.update((state) => store.addTask(state, { name: 'Gym' }, 2000, 'gym'))
  await store.update((state) => store.pauseActive(state, 3000, 'completed'))

  assert.equal(env.data.get(KEY), before, 'an unlocked tab must never overwrite shared saved data')
  assert.equal(store.isPersistent(), false)
  assert.match(store.getWarning(), /https:\/\/|localhost/)
  const exported = JSON.parse(store.exportJSON())
  assert.deepEqual(exported.tasks.map((task) => task.id), ['reading', 'gym'])
  assert.equal(exported.sessions[0].id, 'completed')
  assert.equal(exported.active, null)
  assert.ok(events.has('beforeunload'))
})

test('a rejected startup lock falls back to memory without rewriting shared data', async () => {
  const env = browser(legacy())
  const before = env.data.get(KEY)
  const { store } = env.tab({ webLocks: 'denied' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.isPersistent(), false)
  assert.match(store.getWarning(), /Web Locks/)
  await store.update((state) => store.pauseActive(state, 3000, 'completed'))
  assert.equal(env.data.get(KEY), before)
  assert.equal(JSON.parse(store.exportJSON()).sessions[0].id, 'completed')
})

test('without Web Locks, neither migration nor import rewrites shared saved data', async () => {
  const env = browser(legacy())
  const before = env.data.get(KEY)
  const { store, events } = env.tab({ webLocks: false })
  assert.equal(env.data.get(KEY), before)
  assert.equal(env.data.has(`${KEY}.pre-upgrade`), false)
  assert.equal(store.getState().version, store.SCHEMA_VERSION)
  await store.replaceAll({ tasks: [{ id: 'imported', name: 'Imported' }], sessions: [], active: null })
  // Storage events must not replace this tab's unsaved in-memory changes.
  events.get('storage')({ key: KEY })
  assert.equal(JSON.parse(store.exportJSON()).tasks[0].id, 'imported')
  assert.equal(env.data.get(KEY), before)
})

test('concurrent task additions re-read under the lock and notify only after saving', async () => {
  const env = browser()
  const a = env.tab().store
  const b = env.tab().store
  await env.locks.flush()
  const notified = []
  a.subscribe(() => notified.push(env.saved().tasks.map((task) => task.id)))
  b.subscribe(() => notified.push(env.saved().tasks.map((task) => task.id)))
  const pending = [
    a.update((state) => a.addTask(state, { name: 'Reading' }, 1000, 'reading')),
    b.update((state) => b.addTask(state, { name: 'Gym' }, 2000, 'gym')),
  ]
  assert.equal(env.data.has(KEY), false)
  assert.equal(notified.length, 0)
  await env.locks.flush()
  await Promise.all(pending)
  assert.deepEqual(env.saved().tasks.map((task) => task.id), ['reading', 'gym'])
  assert.deepEqual(notified, [['reading'], ['reading', 'gym']])
  assert.ok(env.writes.filter((write) => write.key === KEY).every((write) => write.lock === WRITE_LOCK))
})

test('a task edit cannot erase a concurrently recorded session or record the same pause twice', async () => {
  const env = browser({ ...legacy(), version: 3 })
  const a = env.tab().store
  const b = env.tab().store
  await env.locks.flush()
  const pending = [
    a.update((state) => a.pauseActive(state, 3000, 'completed')),
    b.update((state) => b.updateTask(state, 'reading', { name: 'Edited reading' })),
    b.update((state) => b.pauseActive(state, 4000, 'duplicate')),
  ]
  await env.locks.flush()
  await Promise.all(pending)
  assert.equal(env.saved().tasks[0].name, 'Edited reading')
  assert.deepEqual(env.saved().sessions, [{ id: 'completed', taskId: 'reading', start: 1000, end: 3000 }])
  assert.equal(env.saved().active, null)
})

test('import replacement and a following mutation share the same write lock', async () => {
  const env = browser(legacy())
  const a = env.tab().store
  const b = env.tab().store
  await env.locks.flush()
  const pending = [
    a.replaceAll({ tasks: [{ id: 'imported', name: 'Imported' }], sessions: [], active: null }),
    b.update((state) => b.addTask(state, { name: 'Gym' }, 2000, 'gym')),
  ]
  await env.locks.flush()
  await Promise.all(pending)
  assert.deepEqual(env.saved().tasks.map((task) => task.id), ['imported', 'gym'])
  assert.ok(env.writes.filter((write) => write.key === KEY).every((write) => write.lock === WRITE_LOCK))
})

test('full or blocked storage still supports protected memory-only changes', async () => {
  for (const readable of [true, false]) {
    const env = browser(legacy())
    const before = env.data.get(KEY)
    const { store, events } = env.tab({ writable: false, readable })
    assert.equal(store.isPersistent(), false)
    assert.equal(store.getState().tasks.length, readable ? 1 : 0)
    assert.match(store.getWarning(), readable ? /full or read-only/ : /blocking storage/)
    await store.update((state) => store.addTask(state, { name: 'Gym' }, 2000, 'gym'))
    assert.ok(events.has('beforeunload'))
    assert.equal(env.data.get(KEY), before)
  }
})

// A lone surrogate can't be written into a "#task-<id>" link, so such an id would break every page's task list.
test('task ids that cannot be linked are dropped with their sessions, on import and on load', async () => {
  const exported = '{"tasks":[{"id":"\\ud800","name":"Reading"},{"id":"gym\\udc00","name":"Gym"},{"id":"100%","name":"Walk"},{"id":"\\ud83d\\ude00","name":"Fun"}],'
    + '"sessions":[{"id":"bad","taskId":"\\ud800","start":100,"end":900},{"id":"good","taskId":"100%","start":100,"end":900}],'
    + '"active":{"taskId":"\\ud800","start":1000}}'
  // The store's arrays belong to its own script context, so their ids are copied out before comparing.
  const ids = (items) => Array.from(items, (item) => item.id)

  const { store } = browser().tab()
  const imported = store.parseImport(exported)
  assert.deepEqual(ids(imported.tasks), ['100%', '\ud83d\ude00'])
  assert.deepEqual(ids(imported.sessions), ['good'])
  assert.equal(imported.active, null)

  // Data saved by an earlier version is cleaned the same way when a page loads it.
  const env = browser({ version: 3, ...JSON.parse(exported) })
  const loaded = env.tab().store
  await env.locks.flush()
  assert.deepEqual(ids(loaded.getState().tasks), ['100%', '\ud83d\ude00'])
  assert.deepEqual(ids(loaded.getState().sessions), ['good'])
  assert.equal(loaded.getState().active, null)
})
