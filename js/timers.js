/*
 * Timers page: create tasks and start/pause each task's stopwatch.
 *
 * Cards are keyed by task id and patched in place on every render. Rebuilding
 * them would wipe a half-typed edit form, or steal focus, whenever another
 * tab changes the data.
 */
(function () {
  'use strict'

  const { time, store, ui } = window.TimeTracker
  const { el, setText } = ui

  const BASE_TITLE = document.title

  const form = document.getElementById('add-task-form')
  const nameInput = document.getElementById('new-task-name')
  const goalInput = document.getElementById('new-task-goal')
  const colorsBox = document.getElementById('new-task-colors')
  const listEl = document.getElementById('task-list')
  const emptyEl = document.getElementById('empty-state')
  const liveStatus = document.getElementById('live-status')
  const todayLabel = document.getElementById('today-label')

  const cards = new Map()

  const findTask = (taskId) => store.getState().tasks.find((t) => t.id === taskId)

  // Clearing first makes screen readers announce a message even when it repeats.
  const announce = (message) => {
    liveStatus.textContent = ''
    window.setTimeout(() => {
      liveStatus.textContent = message
    }, 50)
  }

  // ---- Form helpers, shared by the add form and each card's edit form ----

  const buildSwatches = (groupName, selected) =>
    store.PALETTE.map(({ name, value }) =>
      el(
        'label',
        { className: 'swatch', style: { '--swatch': value } },
        el('input', { type: 'radio', name: groupName, value, checked: value === selected }),
        el('span', { className: 'swatch-chip', 'aria-hidden': 'true' }),
        el('span', { className: 'visually-hidden', text: name }),
      ),
    )

  const selectColor = (container, color) => {
    container.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.checked = radio.value === color
    })
  }

  const field = (id, labelText, input) =>
    el(
      'div',
      { className: 'field' },
      el('label', { for: id, text: labelText }),
      input,
      el('p', { className: 'field-error', id: `${id}-error` }),
    )

  const setFieldError = (input, message) => {
    const errorEl = document.getElementById(input.getAttribute('aria-describedby'))
    if (errorEl) setText(errorEl, message)
    if (message) input.setAttribute('aria-invalid', 'true')
    else input.removeAttribute('aria-invalid')
  }

  const clearErrorsOnInput = (formEl) =>
    formEl.addEventListener('input', (event) => {
      if (event.target.matches('[aria-invalid]')) setFieldError(event.target, '')
    })

  // Returns cleaned fields, or null after flagging invalid inputs inline and focusing the first one.
  const readTaskFields = (formEl, fallbackColor) => {
    const nameField = formEl.elements.namedItem('name')
    const goalField = formEl.elements.namedItem('goal')
    const name = nameField.value.trim()
    const goal = Number(goalField.value)
    const nameError = name ? '' : 'Enter a task name.'
    const goalValid = goalField.value !== '' && Number.isInteger(goal) && goal >= store.GOAL_MIN && goal <= store.GOAL_MAX
    const goalError = goalValid ? '' : `Enter whole minutes from ${store.GOAL_MIN} to ${store.GOAL_MAX}.`
    setFieldError(nameField, nameError)
    setFieldError(goalField, goalError)
    const firstInvalid = (nameError && nameField) || (goalError && goalField)
    if (firstInvalid) {
      firstInvalid.focus()
      return null
    }
    const checked = formEl.querySelector('input[type="radio"]:checked')
    return { name, dailyGoalMinutes: goal, color: checked ? checked.value : fallbackColor }
  }

  // ---- Actions ------------------------------------------------------------

  const toggleTimer = (taskId) => {
    const now = Date.now()
    store.update((state) =>
      state.active && state.active.taskId === taskId
        ? store.pauseActive(state, now)
        : store.startTask(state, taskId, now),
    )
  }

  const setMode = (card, mode) => {
    card.mode = mode
    card.view.hidden = mode === 'edit'
    card.actions.hidden = mode !== 'view'
    card.editForm.hidden = mode !== 'edit'
    card.confirmBox.hidden = mode !== 'confirm'
  }

  const openEdit = (taskId) => {
    const card = cards.get(taskId)
    const task = findTask(taskId)
    if (!card || !task) return
    // Inputs are filled only when editing starts, so later re-renders never overwrite what's being typed.
    card.editName.value = task.name
    card.editGoal.value = String(task.dailyGoalMinutes)
    selectColor(card.editSwatches, task.color)
    setFieldError(card.editName, '')
    setFieldError(card.editGoal, '')
    setMode(card, 'edit')
    card.editName.focus()
  }

  const closeEdit = (taskId) => {
    const card = cards.get(taskId)
    if (!card) return
    setMode(card, 'view')
    card.editBtn.focus()
  }

  const saveEdit = (taskId) => {
    const card = cards.get(taskId)
    const task = findTask(taskId)
    if (!card || !task) return
    const fields = readTaskFields(card.editForm, task.color)
    if (!fields) return
    store.update((state) => store.updateTask(state, taskId, fields))
    setMode(card, 'view')
    card.editBtn.focus()
    announce(`Saved ${fields.name}.`)
  }

  const openConfirm = (taskId) => {
    const card = cards.get(taskId)
    const task = findTask(taskId)
    if (!card || !task) return
    card.confirmText.textContent = `Delete “${task.name}” and all of its tracked time? This can't be undone.`
    setMode(card, 'confirm')
    // Focus the safe choice, so a stray Enter doesn't delete anything.
    card.cancelDeleteBtn.focus()
  }

  const cancelDelete = (taskId) => {
    const card = cards.get(taskId)
    if (!card) return
    setMode(card, 'view')
    card.deleteBtn.focus()
  }

  const confirmDelete = (taskId) => {
    const before = store.getState().tasks
    const index = before.findIndex((t) => t.id === taskId)
    const task = before[index]
    if (!task) return
    store.update((state) => store.deleteTask(state, taskId))
    // Put focus somewhere sensible, since the focused card no longer exists.
    const remaining = store.getState().tasks
    const neighbour = remaining[Math.min(index, remaining.length - 1)]
    const target = neighbour && cards.get(neighbour.id)
    if (target) target.toggleBtn.focus()
    else nameInput.focus()
    announce(`Deleted ${task.name}.`)
  }

  // ---- Cards --------------------------------------------------------------

  const createCard = (taskId) => {
    const nameEl = el('h3', { className: 'task-name' })
    const badge = el('span', { className: 'badge', text: 'Running', hidden: true })
    const timeEl = el('p', { className: 'task-time', role: 'timer' })
    const goalEl = el('p', { className: 'task-goal' })
    const remainingEl = el('p', { className: 'task-remaining' })
    const progress = ui.createProgressBar('Goal progress')
    const toggleBtn = el('button', { type: 'button', className: 'btn btn-toggle', onClick: () => toggleTimer(taskId) })
    const editBtn = el('button', { type: 'button', className: 'btn btn-quiet', text: 'Edit', onClick: () => openEdit(taskId) })
    const deleteBtn = el('button', { type: 'button', className: 'btn btn-quiet btn-quiet-danger', text: 'Delete', onClick: () => openConfirm(taskId) })
    const actions = el('div', { className: 'btn-row card-actions' }, toggleBtn, editBtn, deleteBtn)

    const view = el(
      'div',
      { className: 'card-view' },
      el('div', { className: 'task-head' }, el('span', { className: 'dot', 'aria-hidden': 'true' }), nameEl, badge),
      el('p', { className: 'time-label', text: 'Today' }),
      timeEl,
      el('div', { className: 'goal-row' }, goalEl, remainingEl),
      progress.bar,
    )

    const editNameId = ui.uid('edit-name')
    const editGoalId = ui.uid('edit-goal')
    const editName = el('input', {
      id: editNameId,
      name: 'name',
      type: 'text',
      maxlength: store.NAME_MAX_LENGTH,
      autocomplete: 'off',
      required: true,
      'aria-describedby': `${editNameId}-error`,
    })
    const editGoal = el('input', {
      id: editGoalId,
      name: 'goal',
      type: 'number',
      inputmode: 'numeric',
      min: store.GOAL_MIN,
      max: store.GOAL_MAX,
      step: 1,
      required: true,
      'aria-describedby': `${editGoalId}-error`,
    })
    const editSwatches = el('div', { className: 'swatches' }, buildSwatches(ui.uid('edit-color'), null))
    const cancelEditBtn = el('button', { type: 'button', className: 'btn', text: 'Cancel', onClick: () => closeEdit(taskId) })
    const editForm = el(
      'form',
      { className: 'card-edit', novalidate: true, hidden: true, 'aria-label': 'Edit task' },
      field(editNameId, 'Task name', editName),
      field(editGoalId, 'Daily goal (minutes)', editGoal),
      el('fieldset', { className: 'field' }, el('legend', { text: 'Color' }), editSwatches),
      el('div', { className: 'btn-row' }, el('button', { type: 'submit', className: 'btn btn-primary', text: 'Save' }), cancelEditBtn),
    )
    editForm.addEventListener('submit', (event) => {
      event.preventDefault()
      saveEdit(taskId)
    })
    editForm.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeEdit(taskId)
    })
    clearErrorsOnInput(editForm)

    const confirmText = el('p', { className: 'confirm-text' })
    const confirmBtn = el('button', { type: 'button', className: 'btn btn-danger', text: 'Delete', onClick: () => confirmDelete(taskId) })
    const cancelDeleteBtn = el('button', { type: 'button', className: 'btn', text: 'Cancel', onClick: () => cancelDelete(taskId) })
    const confirmBox = el(
      'div',
      { className: 'inline-confirm', role: 'group', 'aria-label': 'Confirm delete', hidden: true },
      confirmText,
      el('div', { className: 'btn-row' }, confirmBtn, cancelDeleteBtn),
    )
    confirmBox.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') cancelDelete(taskId)
    })

    const root = el('li', { className: 'task-card' }, view, actions, editForm, confirmBox)

    return {
      root, view, actions, nameEl, badge, timeEl, goalEl, remainingEl, progress,
      toggleBtn, editBtn, deleteBtn, editForm, editName, editGoal, editSwatches,
      confirmBox, confirmText, confirmBtn, cancelDeleteBtn, mode: 'view',
    }
  }

  // Parts of a card that change only when the task itself changes.
  const paintStatic = (card, task) => {
    card.root.style.setProperty('--task-color', task.color)
    setText(card.nameEl, task.name)
    setText(card.goalEl, `Goal: ${time.formatGoal(task.dailyGoalMinutes)}`)
    card.progress.bar.setAttribute('aria-label', `${task.name}: progress toward daily goal`)
    card.editBtn.setAttribute('aria-label', `Edit ${task.name}`)
    card.deleteBtn.setAttribute('aria-label', `Delete ${task.name}`)
    card.confirmBtn.setAttribute('aria-label', `Delete ${task.name} permanently`)
  }

  /*
   * Live values. Recomputed from timestamps on every tick, so a running timer
   * rolls over at local midnight on its own: "today" simply moves forward and
   * the display starts again from 0.
   */
  const tick = (now) => {
    const state = store.getState()
    const sessions = time.withActive(state.sessions, state.active, now)
    const dayStart = time.startOfDay(now)
    setText(todayLabel, time.formatLongDate(now))

    state.tasks.forEach((task) => {
      const card = cards.get(task.id)
      if (!card) return
      const doneMs = time.totalForDay(sessions, dayStart, task.id)
      const progress = time.goalProgress(doneMs, task.dailyGoalMinutes)
      const running = Boolean(state.active && state.active.taskId === task.id)
      const action = running ? 'Pause' : doneMs > 0 ? 'Resume' : 'Start'
      setText(card.timeEl, time.formatHMS(doneMs))
      setText(card.remainingEl, ui.remainingText(progress))
      ui.setProgress(card.progress, progress)
      setText(card.toggleBtn, action)
      card.toggleBtn.setAttribute('aria-label', `${action} ${task.name}`)
      card.toggleBtn.classList.toggle('is-running', running)
      card.root.classList.toggle('is-running', running)
      card.root.classList.toggle('is-met', progress.met)
      card.badge.hidden = !running
    })

    const activeTask = state.active && state.tasks.find((t) => t.id === state.active.taskId)
    document.title = activeTask
      ? `${time.formatHMS(time.totalForDay(sessions, dayStart, activeTask.id))} · ${activeTask.name} · Time Tracker`
      : BASE_TITLE
  }

  const render = () => {
    const { tasks } = store.getState()
    const ids = new Set(tasks.map((t) => t.id))
    emptyEl.hidden = tasks.length > 0
    listEl.hidden = tasks.length === 0

    Array.from(cards.keys())
      .filter((id) => !ids.has(id))
      .forEach((id) => {
        cards.get(id).root.remove()
        cards.delete(id)
      })

    tasks.forEach((task, index) => {
      if (!cards.has(task.id)) cards.set(task.id, createCard(task.id))
      const card = cards.get(task.id)
      // Only move nodes that are out of place: moving a node drops focus inside it.
      if (listEl.children[index] !== card.root) listEl.insertBefore(card.root, listEl.children[index] || null)
      paintStatic(card, task)
    })

    tick(Date.now())
  }

  // ---- Add form -------------------------------------------------------------

  const resetAddForm = () => {
    form.reset()
    setFieldError(nameInput, '')
    setFieldError(goalInput, '')
    selectColor(colorsBox, store.nextColor(store.getState()))
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const fields = readTaskFields(form, store.nextColor(store.getState()))
    if (!fields) return
    store.update((state) => store.addTask(state, fields, Date.now()))
    resetAddForm()
    nameInput.focus()
    announce(`Added ${fields.name}. Press Start on its card to begin tracking.`)
  })
  clearErrorsOnInput(form)

  // ---- Boot -----------------------------------------------------------------

  colorsBox.append(...buildSwatches('color', store.nextColor(store.getState())))
  ui.mountChrome()
  store.subscribe(render)
  render()
  ui.startTicker(tick)
})()
