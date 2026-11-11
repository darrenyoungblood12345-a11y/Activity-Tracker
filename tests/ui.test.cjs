const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

// ui.js only touches the document when its functions run, so its pure helpers load without one.
const loadUi = () => {
  const window = { TimeTracker: { time: {}, store: {} } }
  vm.runInNewContext(readFileSync(join(__dirname, '../js/ui.js'), 'utf8'), { window })
  return window.TimeTracker.ui
}

test('taskHash encodes ids for a link and never throws, whatever the id', () => {
  const { taskHash } = loadUi()
  assert.equal(taskHash('reading'), '#task-reading')
  assert.equal(taskHash('100%'), '#task-100%25')
  assert.equal(decodeURIComponent(taskHash('a b#c').slice('#task-'.length)), 'a b#c')
  assert.equal(decodeURIComponent(taskHash('😀').slice('#task-'.length)), '😀')
  // The store drops these ids; the list every page shows must still not break if one reaches it.
  assert.doesNotThrow(() => taskHash('\ud800'))
  assert.doesNotThrow(() => taskHash('gym\udc00'))
})
