/*
 * Activities page: create tasks and start/pause each task's stopwatch.
 *
 * Cards are keyed by task id and patched in place on every render. Rebuilding
 * them would wipe a half-typed edit form, or steal focus, whenever another
 * tab changes the data. Tasks scheduled today are listed first; the rest sit
 * in a "Not scheduled today" section and can still be started.
 */
(function () {
  'use strict'

  const { time, store, ui } = window.TimeTracker
  const { el, setText } = ui

  const BASE_TITLE = document.title
  const DEFAULT_SCHEDULE = time.WEEKDAYS.map(() => store.DEFAULT_GOAL_MINUTES)
  const GOAL_ERROR = `Enter whole minutes from ${store.GOAL_MIN} to ${store.GOAL_MAX}.`
  const PRESETS = [
    { label: 'Every day', days: time.WEEKDAYS },
    { label: 'Weekdays', days: time.WORKDAYS },
    { label: 'Weekends', days: time.WEEKEND },
  ]

  const form = document.getElementById('add-task-form')
  const nameInput = document.getElementById('new-task-name')
  const scheduleMount = document.getElementById('new-task-schedule')
  const colorsBox = document.getElementById('new-task-colors')
  const listEl = document.getElementById('task-list')
  const otherSection = document.getElementById('other-section')
  const otherListEl = document.getElementById('other-task-list')
  const emptyEl = document.getElementById('empty-state')
  const noneTodayEl = document.getElementById('none-today')
  const liveStatus = document.getElementById('live-status')
  const todayLabel = document.getElementById('today-label')

  const cards = new Map()
  let renderedDayKey = ''

  const findTask = (taskId) => store.getState().tasks.find((t) => t.id === taskId)
  const isScheduledOn = (task, ms) => time.weekdayGoal(task.weekdayGoals, ms) > 0

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
        { className: 'swatch', style: ui.taskColorVars(value) },
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

  const minutesInput = (id, describedBy = `${id}-error`) =>
    el('input', {
      id,
      type: 'number',
      inputmode: 'numeric',
      min: store.GOAL_MIN,
      max: store.GOAL_MAX,
      step: 1,
      'aria-describedby': describedBy,
    })

  const isValidGoal = (input) => {
    const goal = Number(input.value)
    return input.value !== '' && Number.isInteger(goal) && goal >= store.GOAL_MIN && goal <= store.GOAL_MAX
  }

  /*
   * Which weekdays a task happens on, and its goal on each. One goal covers
   * every chosen day, unless "Different goal for each day" is on: then each
   * chosen day gets its own minutes field. Turning that on copies the single
   * goal into every day; turning it off copies the first chosen day's goal back.
   */
  const createScheduleEditor = () => {
    const prefix = ui.uid('schedule')
    const daysError = el('p', { className: 'field-error', id: `${prefix}-days-error` })
    const gridErrorId = `${prefix}-day-goals-error`

    const dayBoxes = time.WEEKDAYS.map((day) => el('input', { type: 'checkbox', value: day }))
    const dayGroup = el(
      'div',
      { className: 'day-picker', role: 'group', 'aria-label': 'Days', 'aria-describedby': daysError.id },
      time.WEEKDAYS.map((day) =>
        el(
          'label',
          { className: 'day-chip' },
          dayBoxes[day],
          el('span', { className: 'day-chip-text', 'aria-hidden': 'true', text: time.weekdayName(day, 'short') }),
          el('span', { className: 'visually-hidden', text: time.weekdayName(day, 'long') }),
        ),
      ),
    )

    const sameGoal = minutesInput(`${prefix}-goal`)
    const sameField = field(sameGoal.id, 'Goal per day (minutes)', sameGoal)

    const customBox = el('input', { type: 'checkbox' })
    const dayGoals = time.WEEKDAYS.map((day) => minutesInput(`${prefix}-goal-${day}`, gridErrorId))
    const dayGoalFields = time.WEEKDAYS.map((day) =>
      el(
        'div',
        { className: 'day-goal' },
        el(
          'label',
          { for: dayGoals[day].id },
          el('span', { 'aria-hidden': 'true', text: time.weekdayName(day, 'short') }),
          el('span', { className: 'visually-hidden', text: `${time.weekdayName(day, 'long')} goal (minutes)` }),
        ),
        dayGoals[day],
      ),
    )
    const customBlock = el(
      'div',
      { className: 'custom-goals', hidden: true },
      el('div', { className: 'day-goals' }, dayGoalFields),
      el('p', { className: 'field-error', id: gridErrorId }),
    )

    const goalInputs = [sameGoal, ...dayGoals]
    const checkedDays = () => time.WEEKDAYS.filter((day) => dayBoxes[day].checked)

    const clearErrors = () => {
      setText(daysError, '')
      goalInputs.forEach((input) => setFieldError(input, ''))
    }

    const sync = () => {
      sameField.hidden = customBox.checked
      customBlock.hidden = !customBox.checked
      time.WEEKDAYS.forEach((day) => {
        dayGoalFields[day].hidden = !dayBoxes[day].checked
      })
    }

    // A day chosen in custom mode starts from the single goal rather than an empty field.
    const onDaysChanged = () => {
      if (customBox.checked) {
        checkedDays()
          .filter((day) => dayGoals[day].value === '')
          .forEach((day) => {
            dayGoals[day].value = sameGoal.value
          })
      }
      if (checkedDays().length > 0) setText(daysError, '')
      sync()
    }

    dayBoxes.forEach((box) => box.addEventListener('change', onDaysChanged))

    const presetButtons = PRESETS.map(({ label, days }) =>
      el('button', {
        type: 'button',
        className: 'btn btn-quiet btn-small',
        text: label,
        onClick: () => {
          time.WEEKDAYS.forEach((day) => {
            dayBoxes[day].checked = days.includes(day)
          })
          onDaysChanged()
        },
      }),
    )

    customBox.addEventListener('change', () => {
      if (customBox.checked) {
        dayGoals.forEach((input) => {
          input.value = sameGoal.value
        })
      } else {
        const first = checkedDays()[0]
        if (first !== undefined) sameGoal.value = dayGoals[first].value
      }
      clearErrors()
      sync()
    })

    const setValue = (weekdayGoals) => {
      const on = time.WEEKDAYS.filter((day) => weekdayGoals[day] > 0)
      time.WEEKDAYS.forEach((day) => {
        dayBoxes[day].checked = weekdayGoals[day] > 0
        dayGoals[day].value = weekdayGoals[day] > 0 ? String(weekdayGoals[day]) : ''
      })
      sameGoal.value = String(on.length > 0 ? weekdayGoals[on[0]] : store.DEFAULT_GOAL_MINUTES)
      customBox.checked = new Set(on.map((day) => weekdayGoals[day])).size > 1
      clearErrors()
      sync()
    }

    // Returns { weekdayGoals }, or { invalid } with the first control to fix after flagging errors inline.
    const read = () => {
      clearErrors()
      const days = checkedDays()
      if (days.length === 0) {
        setText(daysError, 'Pick at least one day.')
        return { invalid: dayBoxes[0] }
      }
      const inputFor = (day) => (customBox.checked ? dayGoals[day] : sameGoal)
      const invalid = [...new Set(days.map(inputFor))].filter((input) => !isValidGoal(input))
      invalid.forEach((input) => setFieldError(input, GOAL_ERROR))
      if (invalid.length > 0) return { invalid: invalid[0] }
      return { weekdayGoals: time.WEEKDAYS.map((day) => (dayBoxes[day].checked ? Number(inputFor(day).value) : 0)) }
    }

    const node = el(
      'fieldset',
      { className: 'field field-schedule' },
      el('legend', { text: 'Schedule' }),
      el('div', { className: 'schedule-days' }, dayGroup, el('div', { className: 'btn-row' }, presetButtons)),
      daysError,
      sameField,
      el('label', { className: 'check-row' }, customBox, 'Different goal for each day'),
      customBlock,
    )

    return { node, setValue, read }
  }

  // Returns cleaned fields, or null after flagging invalid inputs inline and focusing the first one.
  const readTaskFields = (formEl, schedule, fallbackColor) => {
    const nameField = formEl.elements.namedItem('name')
    const name = nameField.value.trim()
    setFieldError(nameField, name ? '' : 'Enter a task name.')
    const { weekdayGoals, invalid } = schedule.read()
    const firstInvalid = (!name && nameField) || invalid
    if (firstInvalid) {
      firstInvalid.focus()
      return null
    }
    const checked = formEl.querySelector('input[type="radio"]:checked')
    return { name, weekdayGoals, color: checked ? checked.value : fallbackColor }
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
    card.schedule.setValue(task.weekdayGoals)
    selectColor(card.editSwatches, task.color)
    setFieldError(card.editName, '')
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
    const fields = readTaskFields(card.editForm, card.schedule, task.color)
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
    const scheduleEl = el('p', { className: 'task-schedule' })
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
      scheduleEl,
      el('p', { className: 'time-label', text: 'Today' }),
      timeEl,
      el('div', { className: 'goal-row' }, goalEl, remainingEl),
      progress.bar,
    )

    const editNameId = ui.uid('edit-name')
    const editName = el('input', {
      id: editNameId,
      name: 'name',
      type: 'text',
      maxlength: store.NAME_MAX_LENGTH,
      autocomplete: 'off',
      required: true,
      'aria-describedby': `${editNameId}-error`,
    })
    const schedule = createScheduleEditor()
    const editSwatches = el('div', { className: 'swatches' }, buildSwatches(ui.uid('edit-color'), null))
    const cancelEditBtn = el('button', { type: 'button', className: 'btn', text: 'Cancel', onClick: () => closeEdit(taskId) })
    const editForm = el(
      'form',
      { className: 'card-edit', novalidate: true, hidden: true, 'aria-label': 'Edit task' },
      field(editNameId, 'Task name', editName),
      schedule.node,
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
      root, view, actions, nameEl, badge, scheduleEl, timeEl, goalEl, remainingEl, progress,
      toggleBtn, editBtn, deleteBtn, editForm, editName, schedule, editSwatches,
      confirmBox, confirmText, confirmBtn, cancelDeleteBtn, mode: 'view',
    }
  }

  // Parts of a card that change only when the task itself changes.
  const paintStatic = (card, task) => {
    ui.setTaskColor(card.root, task.color)
    setText(card.nameEl, task.name)
    setText(card.scheduleEl, time.describeSchedule(task.weekdayGoals))
    card.progress.bar.setAttribute('aria-label', `${task.name}: progress toward today's goal`)
    card.editBtn.setAttribute('aria-label', `Edit ${task.name}`)
    card.deleteBtn.setAttribute('aria-label', `Delete ${task.name}`)
    card.confirmBtn.setAttribute('aria-label', `Delete ${task.name} permanently`)
  }

  /*
   * Live values. Recomputed from timestamps on every tick, so a running timer
   * rolls over at local midnight on its own: "today" simply moves forward and
   * the display starts again from 0. A new day can also change which tasks are
   * scheduled, so it triggers a full render.
   */
  const tick = (now) => {
    if (time.dayKey(now) !== renderedDayKey) {
      render(now)
      return
    }
    const state = store.getState()
    const sessions = time.withActive(state.sessions, state.active, now)
    const dayStart = time.startOfDay(now)
    setText(todayLabel, time.formatLongDate(now))

    state.tasks.forEach((task) => {
      const card = cards.get(task.id)
      if (!card) return
      const doneMs = time.totalForDay(sessions, dayStart, task.id)
      const goalMinutes = time.weekdayGoal(task.weekdayGoals, now)
      const off = goalMinutes === 0
      const progress = time.goalProgress(doneMs, goalMinutes)
      const running = Boolean(state.active && state.active.taskId === task.id)
      const action = running ? 'Pause' : doneMs > 0 ? 'Resume' : 'Start'
      setText(card.timeEl, time.formatHMS(doneMs))
      setText(card.goalEl, off ? 'Not scheduled today' : `Goal: ${time.formatGoal(goalMinutes)}`)
      setText(card.remainingEl, off ? '' : ui.remainingText(progress))
      ui.setProgress(card.progress, progress)
      card.progress.bar.hidden = off
      setText(card.toggleBtn, action)
      card.toggleBtn.setAttribute('aria-label', `${action} ${task.name}`)
      card.toggleBtn.classList.toggle('is-running', running)
      card.root.classList.toggle('is-running', running)
      card.root.classList.toggle('is-met', progress.met)
      card.root.classList.toggle('is-off', off)
      card.badge.hidden = !running
    })

    const activeTask = state.active && state.tasks.find((t) => t.id === state.active.taskId)
    document.title = activeTask
      ? `${time.formatHMS(time.totalForDay(sessions, dayStart, activeTask.id))} · ${activeTask.name} · Time Tracker`
      : BASE_TITLE
  }

  // Only move nodes that are out of place: moving a node drops focus inside it.
  const placeCards = (container, tasks) =>
    tasks.forEach((task, index) => {
      const { root } = cards.get(task.id)
      if (container.children[index] !== root) container.insertBefore(root, container.children[index] || null)
    })

  const render = (now = Date.now()) => {
    const { tasks } = store.getState()
    const ids = new Set(tasks.map((t) => t.id))
    const today = tasks.filter((task) => isScheduledOn(task, now))
    const others = tasks.filter((task) => !isScheduledOn(task, now))
    renderedDayKey = time.dayKey(now)
    emptyEl.hidden = tasks.length > 0
    noneTodayEl.hidden = tasks.length === 0 || today.length > 0
    listEl.hidden = today.length === 0
    otherSection.hidden = others.length === 0

    Array.from(cards.keys())
      .filter((id) => !ids.has(id))
      .forEach((id) => {
        cards.get(id).root.remove()
        cards.delete(id)
      })

    tasks.forEach((task) => {
      if (!cards.has(task.id)) cards.set(task.id, createCard(task.id))
      paintStatic(cards.get(task.id), task)
    })
    placeCards(listEl, today)
    placeCards(otherListEl, others)

    tick(now)
  }

  // ---- Add form -------------------------------------------------------------

  const addSchedule = createScheduleEditor()

  const resetAddForm = () => {
    form.reset()
    setFieldError(nameInput, '')
    addSchedule.setValue(DEFAULT_SCHEDULE)
    selectColor(colorsBox, store.nextColor(store.getState()))
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const fields = readTaskFields(form, addSchedule, store.nextColor(store.getState()))
    if (!fields) return
    const now = Date.now()
    store.update((state) => store.addTask(state, fields, now))
    resetAddForm()
    nameInput.focus()
    announce(
      isScheduledOn(fields, now)
        ? `Added ${fields.name}. Press Start on its card to begin tracking.`
        : `Added ${fields.name}. It isn't scheduled today, so it's listed under Not scheduled today.`,
    )
  })
  clearErrorsOnInput(form)

  // ---- Boot -----------------------------------------------------------------

  scheduleMount.replaceWith(addSchedule.node)
  addSchedule.setValue(DEFAULT_SCHEDULE)
  colorsBox.append(...buildSwatches('color', store.nextColor(store.getState())))
  ui.mountChrome()
  // Subscribers receive the state as an argument; render's only parameter is `now`.
  store.subscribe(() => render())
  render()
  ui.startTicker(tick)
})()
