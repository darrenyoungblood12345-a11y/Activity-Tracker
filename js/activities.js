/*
 * Activities page: the stage. The rail (ui.mountRail) lists every task; the
 * stage shows one of them, the selected task, at full size with its
 * stopwatch, goal and controls, and it holds the add and edit forms.
 *
 * Only one timer runs at a time, so while the selected task runs the stage
 * floods with its color. The selection lives in the URL hash (#task-<id>, or
 * #add), so the rail's links work from every page and a reload keeps your
 * place. Starting a task selects it. The stage is built once and patched in
 * place: rebuilding it would wipe a half-typed edit form, or steal focus,
 * whenever another tab changes the data.
 */
(function () {
  'use strict'

  const { time, store, ui } = window.TimeTracker
  const { el, setText } = ui

  const BASE_TITLE = document.title
  const DEFAULT_GOAL = {
    goalPeriod: 'day',
    weekdayGoals: time.WEEKDAYS.map(() => store.DEFAULT_GOAL_MINUTES),
    periodGoalMinutes: store.DEFAULT_PERIOD_GOAL_MINUTES,
  }
  const GOAL_ERROR = `Enter whole minutes from ${store.GOAL_MIN} to ${store.GOAL_MAX}.`
  const PRESETS = [
    { label: 'Every day', days: time.WEEKDAYS },
    { label: 'Weekdays', days: time.WORKDAYS },
    { label: 'Weekends', days: time.WEEKEND },
  ]
  const PERIODS = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ]
  const MINUTES_PER_HOUR = 60

  const stage = document.getElementById('main')
  const viewEl = document.getElementById('stage-view')
  const displayEl = document.getElementById('stage-display')
  const statusEl = document.getElementById('stage-status')
  const todayLabel = document.getElementById('today-label')
  const nameEl = document.getElementById('stage-name')
  const scheduleEl = document.getElementById('stage-schedule')
  const timeEl = document.getElementById('stage-time')
  const goalEl = document.getElementById('stage-goal')
  const remainingEl = document.getElementById('stage-remaining')
  const lastEl = document.getElementById('stage-last')
  const actionsEl = document.getElementById('stage-actions')
  const toggleBtn = document.getElementById('stage-toggle')
  const editBtn = document.getElementById('stage-edit')
  const deleteBtn = document.getElementById('stage-delete')
  const confirmBox = document.getElementById('stage-confirm')
  const confirmText = document.getElementById('stage-confirm-text')
  const confirmBtn = document.getElementById('confirm-delete')
  const cancelDeleteBtn = document.getElementById('cancel-delete')
  const addSection = document.getElementById('stage-add')
  const addTitle = document.getElementById('add-task-heading')
  const addIntro = document.getElementById('add-intro')
  const cancelAddBtn = document.getElementById('cancel-add')
  const form = document.getElementById('add-task-form')
  const nameInput = document.getElementById('new-task-name')
  const scheduleMount = document.getElementById('new-task-schedule')
  const colorsBox = document.getElementById('new-task-colors')
  const liveStatus = document.getElementById('live-status')

  // The page grounds (--bg in css/styles.css). A task color this close to one barely changes the stage when it floods.
  const GROUNDS = Object.freeze({ light: '#f5f4f7', dark: '#121016' })
  const NEAR_GROUND = 1.5

  // 'view' (the selected task), 'confirm' (deleting it), 'edit' (editing it) or 'add' (the add form).
  let mode = 'view'
  let selectedId = null
  let lastActiveId = null
  let renderedDayKey = ''

  const findTask = (taskId) => store.getState().tasks.find((t) => t.id === taskId)
  const isScheduledOn = (task, ms) => time.goalFor(task, ms).minutes > 0

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

  const numberInput = (id, describedBy, min, max) =>
    el('input', {
      id,
      type: 'number',
      inputmode: 'numeric',
      min,
      max,
      step: 1,
      'aria-describedby': describedBy,
    })

  const minutesInput = (id, describedBy = `${id}-error`) => numberInput(id, describedBy, store.GOAL_MIN, store.GOAL_MAX)

  const isValidGoal = (input) => {
    const goal = Number(input.value)
    return input.value !== '' && Number.isInteger(goal) && goal >= store.GOAL_MIN && goal <= store.GOAL_MAX
  }

  // A whole number from 0 to `max`, or null. An empty field counts as 0, so "5 hours" can leave minutes blank.
  const readWhole = (input, max) => {
    const n = input.value === '' ? 0 : Number(input.value)
    return Number.isInteger(n) && n >= 0 && n <= max ? n : null
  }

  /*
   * A task's goal. "Goal per" picks the period. For Day: which weekdays the
   * task happens on, and its goal on each. One goal covers every chosen day,
   * unless "Different goal for each day" is on: then each chosen day gets its
   * own minutes field. Turning that on copies the single goal into every day;
   * turning it off copies the first chosen day's goal back. For Week and
   * Month: one goal in hours and minutes, with no days to choose. Each period
   * keeps its own values while another is picked, so switching back and forth
   * loses nothing.
   */
  const createScheduleEditor = () => {
    const prefix = ui.uid('schedule')
    const daysError = el('p', { className: 'field-error', id: `${prefix}-days-error` })
    const gridErrorId = `${prefix}-day-goals-error`

    const periodLabelId = `${prefix}-period-label`
    const periodRadios = PERIODS.map(({ value }) => el('input', { type: 'radio', name: `${prefix}-period`, value }))
    const periodPicker = el(
      'div',
      { className: 'period-row' },
      el('span', { className: 'period-label', id: periodLabelId, text: 'Goal per' }),
      el(
        'div',
        { className: 'period-picker', role: 'radiogroup', 'aria-labelledby': periodLabelId },
        PERIODS.map(({ label }, i) =>
          el('label', { className: 'day-chip' }, periodRadios[i], el('span', { className: 'day-chip-text', text: label })),
        ),
      ),
    )
    const checkedPeriod = () => (periodRadios.find((radio) => radio.checked) || periodRadios[0]).value

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

    const periodErrorId = `${prefix}-period-goal-error`
    const periodLegend = el('legend')
    const hoursInput = numberInput(`${prefix}-hours`, periodErrorId, 0, null)
    const extraMinutes = numberInput(`${prefix}-minutes`, periodErrorId, 0, MINUTES_PER_HOUR - 1)
    const durationPart = (input, labelText) =>
      el('div', { className: 'duration-part' }, el('label', { for: input.id, text: labelText }), input)
    const periodBlock = el(
      'fieldset',
      { className: 'field period-goal', hidden: true },
      periodLegend,
      el('div', { className: 'duration-inputs' }, durationPart(hoursInput, 'Hours'), durationPart(extraMinutes, 'Minutes')),
      el('p', { className: 'field-error', id: periodErrorId }),
    )

    const goalInputs = [sameGoal, ...dayGoals, hoursInput, extraMinutes]
    const checkedDays = () => time.WEEKDAYS.filter((day) => dayBoxes[day].checked)

    const clearErrors = () => {
      setText(daysError, '')
      goalInputs.forEach((input) => setFieldError(input, ''))
    }

    const sync = () => {
      const period = checkedPeriod()
      dayBlock.hidden = period !== 'day'
      periodBlock.hidden = period === 'day'
      if (period !== 'day') {
        setText(periodLegend, `Goal per ${period}`)
        hoursInput.max = String(store.periodGoalMax(period) / MINUTES_PER_HOUR)
      }
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

    periodRadios.forEach((radio) =>
      radio.addEventListener('change', () => {
        clearErrors()
        sync()
      }),
    )

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

    const dayBlock = el(
      'div',
      { className: 'day-block' },
      el('div', { className: 'schedule-days' }, dayGroup, el('div', { className: 'btn-row' }, presetButtons)),
      daysError,
      sameField,
      el('label', { className: 'check-row' }, customBox, 'Different goal for each day'),
      customBlock,
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

    const setValue = ({ goalPeriod, weekdayGoals, periodGoalMinutes }) => {
      const on = time.WEEKDAYS.filter((day) => weekdayGoals[day] > 0)
      periodRadios.forEach((radio) => {
        radio.checked = radio.value === goalPeriod
      })
      time.WEEKDAYS.forEach((day) => {
        dayBoxes[day].checked = weekdayGoals[day] > 0
        dayGoals[day].value = weekdayGoals[day] > 0 ? String(weekdayGoals[day]) : ''
      })
      sameGoal.value = String(on.length > 0 ? weekdayGoals[on[0]] : store.DEFAULT_GOAL_MINUTES)
      customBox.checked = new Set(on.map((day) => weekdayGoals[day])).size > 1
      hoursInput.value = String(Math.floor(periodGoalMinutes / MINUTES_PER_HOUR))
      extraMinutes.value = String(periodGoalMinutes % MINUTES_PER_HOUR)
      clearErrors()
      sync()
    }

    const readDays = () => {
      const days = checkedDays()
      if (days.length === 0) {
        setText(daysError, 'Pick at least one day.')
        return { invalid: dayBoxes[0] }
      }
      const inputFor = (day) => (customBox.checked ? dayGoals[day] : sameGoal)
      const invalid = [...new Set(days.map(inputFor))].filter((input) => !isValidGoal(input))
      invalid.forEach((input) => setFieldError(input, GOAL_ERROR))
      if (invalid.length > 0) return { invalid: invalid[0] }
      return { goalPeriod: 'day', weekdayGoals: time.WEEKDAYS.map((day) => (dayBoxes[day].checked ? Number(inputFor(day).value) : 0)) }
    }

    const readPeriodGoal = (period) => {
      const max = store.periodGoalMax(period)
      const maxHours = max / MINUTES_PER_HOUR
      const hours = readWhole(hoursInput, maxHours)
      const minutes = readWhole(extraMinutes, MINUTES_PER_HOUR - 1)
      const flag = (inputs, message) => {
        inputs.forEach((input) => setFieldError(input, message))
        return { invalid: inputs[0] }
      }
      if (hours === null || minutes === null) {
        return flag(
          [hours === null && hoursInput, minutes === null && extraMinutes].filter(Boolean),
          `Enter whole hours from 0 to ${maxHours}, and minutes from 0 to ${MINUTES_PER_HOUR - 1}.`,
        )
      }
      const total = hours * MINUTES_PER_HOUR + minutes
      if (total < store.GOAL_MIN) return flag([hoursInput, extraMinutes], 'Enter a goal of at least 1 minute.')
      if (total > max) return flag([extraMinutes], `A goal per ${period} can be at most ${maxHours} hours.`)
      return { goalPeriod: period, periodGoalMinutes: total }
    }

    // Returns the goal fields, or { invalid } with the first control to fix after flagging errors inline.
    const read = () => {
      clearErrors()
      const period = checkedPeriod()
      return period === 'day' ? readDays() : readPeriodGoal(period)
    }

    const node = el(
      'fieldset',
      { className: 'field field-schedule' },
      el('legend', { text: 'Schedule' }),
      periodPicker,
      dayBlock,
      periodBlock,
    )

    return { node, setValue, read }
  }

  // Returns cleaned fields, or null after flagging invalid inputs inline and focusing the first one.
  const readTaskFields = (formEl, schedule, fallbackColor) => {
    const nameField = formEl.elements.namedItem('name')
    const name = nameField.value.trim()
    setFieldError(nameField, name ? '' : 'Enter a task name.')
    const { invalid, ...goal } = schedule.read()
    const firstInvalid = (!name && nameField) || invalid
    if (firstInvalid) {
      firstInvalid.focus()
      return null
    }
    // Scoped to the swatches, since the "Goal per" picker is a radio group too.
    const checked = formEl.querySelector('.swatch input:checked')
    return { name, ...goal, color: checked ? checked.value : fallbackColor }
  }

  // ---- Selection --------------------------------------------------------------

  // The running task, else the first one scheduled today, else the first one.
  const defaultTaskId = (state, now) => {
    if (state.active) return state.active.taskId
    const first = state.tasks.find((task) => isScheduledOn(task, now)) || state.tasks[0]
    return first ? first.id : null
  }

  // "#task-<id>" or "#add", as written by the rail's links. Anything else, a malformed escape included, selects nothing.
  const readHash = () => {
    const hash = window.location.hash.slice(1)
    if (hash === 'add') return { add: true }
    if (!hash.startsWith('task-')) return {}
    try {
      return { taskId: decodeURIComponent(hash.slice('task-'.length)) }
    } catch {
      return {}
    }
  }

  // replaceState doesn't fire hashchange, and keeps Back from stepping through every selection.
  const writeHash = () => {
    const hash = mode === 'add' ? '#add' : selectedId ? ui.taskHash(selectedId) : ''
    if (window.location.hash === hash) return
    window.history.replaceState(null, '', hash || window.location.pathname + window.location.search)
  }

  // On phones the rail's list sits below the stage, so bring the stage back into view.
  const revealStage = () => {
    if (stage.getBoundingClientRect().top < 0) stage.scrollIntoView({ block: 'start' })
  }

  // ---- Stage --------------------------------------------------------------------

  const progress = ui.createProgressBar('Goal progress')
  document.getElementById('stage-progress').replaceWith(progress.bar)

  const remainingIcon = el('span', { className: 'remaining-icon', 'aria-hidden': 'true' }, ui.icon('check'))
  const remainingLabel = el('span')
  remainingEl.append(remainingIcon, remainingLabel)

  const toggleIcon = el('span', { className: 'toggle-icon' })
  const toggleLabel = el('span')
  toggleBtn.append(toggleIcon, toggleLabel)

  const editTitle = el('h2', { className: 'stage-form-title', id: ui.uid('edit-title') })
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
  const editSchedule = createScheduleEditor()
  const editSwatches = el('div', { className: 'swatches' }, buildSwatches(ui.uid('edit-color'), null))
  const editForm = el(
    'form',
    { className: 'form-grid', novalidate: true, 'aria-labelledby': editTitle.id },
    field(editNameId, 'Task name', editName),
    editSchedule.node,
    el('fieldset', { className: 'field' }, el('legend', { text: 'Color' }), editSwatches),
    el(
      'div',
      { className: 'btn-row' },
      el('button', { type: 'submit', className: 'btn btn-primary', text: 'Save' }),
      el('button', { type: 'button', className: 'btn btn-quiet', text: 'Cancel', onClick: () => closeEdit() }),
    ),
  )
  const editSection = el('div', { className: 'stage-edit', hidden: true }, el('div', { className: 'stage-form-head' }, editTitle), editForm)
  viewEl.append(editSection)

  const applyMode = (hasTasks) => {
    const adding = mode === 'add'
    addSection.hidden = !adding
    viewEl.hidden = adding || !selectedId
    displayEl.hidden = mode === 'edit'
    actionsEl.hidden = mode !== 'view'
    confirmBox.hidden = mode !== 'confirm'
    editSection.hidden = mode !== 'edit'
    // With no tasks yet, the add form is the whole page, so it introduces itself and has nothing to cancel back to.
    setText(addTitle, hasTasks ? 'Add a task' : 'Add your first task')
    addIntro.hidden = hasTasks
    cancelAddBtn.hidden = !hasTasks
  }

  // The most recent stretch tracked on a task, if it ended today.
  const lastSessionToday = (state, taskId, now) => {
    const last = state.sessions
      .filter((s) => s.taskId === taskId)
      .reduce((latest, s) => (!latest || s.end > latest.end ? s : latest), null)
    return last && last.end >= time.startOfDay(now) ? last : null
  }

  // Parts of the stage that change only when the data or the selection changes.
  const paintStatic = (task) => {
    ui.setTaskColor(stage, task.color)
    stage.classList.toggle('is-near-light', store.contrastRatio(task.color, GROUNDS.light) < NEAR_GROUND)
    stage.classList.toggle('is-near-dark', store.contrastRatio(task.color, GROUNDS.dark) < NEAR_GROUND)
    setText(nameEl, task.name)
    setText(scheduleEl, time.describeGoal(task))
    progress.bar.setAttribute('aria-label', `${task.name}: progress toward ${time.periodLabel(task.goalPeriod).toLowerCase()}'s goal`)
    editBtn.setAttribute('aria-label', `Edit ${task.name}`)
    deleteBtn.setAttribute('aria-label', `Delete ${task.name}`)
    confirmBtn.setAttribute('aria-label', `Delete ${task.name} permanently`)
  }

  /*
   * Live values. Recomputed from timestamps on every tick, so a running timer
   * rolls over at local midnight on its own: "today" simply moves forward and
   * the display starts again from 0. Weeks and months start at a midnight too,
   * so weekly and monthly totals reset the same way. A new day can also change
   * which tasks are scheduled, so it triggers a full render.
   */
  const tick = (now) => {
    if (time.dayKey(now) !== renderedDayKey) {
      render(now)
      return
    }
    const state = store.getState()
    const sessions = time.withActive(state.sessions, state.active, now)
    // Today for a daily task, otherwise this week or this month.
    const periodTotal = (task, goal = time.goalFor(task, now)) => time.totalForRange(sessions, goal.start, goal.end, task.id)
    setText(todayLabel, time.formatLongDate(now))

    const activeTask = state.active && state.tasks.find((t) => t.id === state.active.taskId)
    document.title = activeTask
      ? `${time.formatHMS(periodTotal(activeTask))} · ${activeTask.name} · Time Tracker`
      : BASE_TITLE

    const task = findTask(selectedId)
    const running = Boolean(task && activeTask && activeTask.id === task.id)
    // The flood belongs to the task view; the forms always sit on the plain stage.
    stage.classList.toggle('is-running', running && (mode === 'view' || mode === 'confirm'))
    if (!task) return

    const goal = time.goalFor(task, now)
    const doneMs = periodTotal(task, goal)
    const off = goal.minutes === 0
    const goalProgress = time.goalProgress(doneMs, goal.minutes)
    const action = running ? 'Pause' : doneMs > 0 ? 'Resume' : 'Start'
    const period = time.periodLabel(task.goalPeriod)
    const last = running ? null : lastSessionToday(state, task.id, now)

    setText(statusEl, running ? `${period} · running since ${time.formatClock(state.active.start)}` : period)
    setText(timeEl, time.formatHMS(doneMs))
    setText(goalEl, off ? 'Not scheduled today' : `Goal: ${time.formatGoal(goal.minutes)}`)
    setText(remainingLabel, off ? '' : ui.remainingText(goalProgress))
    remainingIcon.hidden = off || !goalProgress.met
    ui.setProgress(progress, goalProgress)
    progress.bar.hidden = off
    setText(lastEl, last ? `Last session: ${time.formatShort(last.end - last.start)}, ended at ${time.formatClock(last.end)}.` : '')
    lastEl.hidden = !last
    ui.setIcon(toggleIcon, running ? 'pause' : 'play')
    setText(toggleLabel, action)
    toggleBtn.setAttribute('aria-label', `${action} ${task.name}`)
    stage.classList.toggle('is-met', goalProgress.met)
  }

  const render = (now = Date.now()) => {
    const state = store.getState()
    const activeId = state.active ? state.active.taskId : null
    renderedDayKey = time.dayKey(now)

    // Starting a task, here, in the rail or in another tab, puts it on stage, unless a form is open.
    if (activeId && activeId !== lastActiveId && mode === 'view') selectedId = activeId
    lastActiveId = activeId

    // The selected task was deleted, or nothing has been chosen yet.
    if (!findTask(selectedId)) {
      selectedId = defaultTaskId(state, now)
      if (mode !== 'add') mode = 'view'
    }
    if (state.tasks.length === 0) mode = 'add'

    const task = findTask(selectedId)
    applyMode(state.tasks.length > 0)
    if (task) paintStatic(task)
    rail.setSelected(mode === 'add' ? 'add' : selectedId)
    writeHash()
    tick(now)
  }

  // ---- Actions ------------------------------------------------------------

  const select = (taskId) => {
    selectedId = taskId
    mode = 'view'
    render()
  }

  const openEdit = () => {
    const task = findTask(selectedId)
    if (!task) return
    // Inputs are filled only when editing starts, so later re-renders never overwrite what's being typed.
    setText(editTitle, `Edit ${task.name}`)
    editName.value = task.name
    editSchedule.setValue(task)
    selectColor(editSwatches, task.color)
    setFieldError(editName, '')
    mode = 'edit'
    render()
    editName.focus()
  }

  const closeEdit = () => {
    mode = 'view'
    render()
    editBtn.focus()
  }

  // Changes resolve once saved and rendered, so focus waits for the buttons to be back on screen.
  const saveEdit = async () => {
    const task = findTask(selectedId)
    if (!task) return
    const fields = readTaskFields(editForm, editSchedule, task.color)
    if (!fields) return
    mode = 'view'
    await store.update((state) => store.updateTask(state, task.id, fields))
    editBtn.focus()
    announce(`Saved ${fields.name}.`)
  }

  const openConfirm = () => {
    const task = findTask(selectedId)
    if (!task) return
    confirmText.textContent = `Delete “${task.name}” and all of its tracked time? This can't be undone.`
    mode = 'confirm'
    render()
    // Focus the safe choice, so a stray Enter doesn't delete anything.
    cancelDeleteBtn.focus()
  }

  const cancelDelete = () => {
    mode = 'view'
    render()
    deleteBtn.focus()
  }

  const confirmDelete = async () => {
    const before = store.getState().tasks
    const index = before.findIndex((t) => t.id === selectedId)
    const task = before[index]
    if (!task) return
    // Show the task that takes its place in the list, so focus has somewhere sensible to go.
    const remaining = before.filter((t) => t.id !== task.id)
    const neighbour = remaining[Math.min(index, remaining.length - 1)]
    selectedId = neighbour ? neighbour.id : null
    mode = 'view'
    await store.update((state) => store.deleteTask(state, task.id))
    if (neighbour) toggleBtn.focus()
    else nameInput.focus()
    announce(`Deleted ${task.name}.`)
  }

  const openAdd = () => {
    mode = 'add'
    render()
    revealStage()
    nameInput.focus()
  }

  const closeAdd = () => {
    if (store.getState().tasks.length === 0) return
    mode = 'view'
    render()
    toggleBtn.focus()
  }

  toggleBtn.addEventListener('click', () => {
    if (selectedId) ui.toggleTimer(selectedId)
  })
  editBtn.addEventListener('click', openEdit)
  deleteBtn.addEventListener('click', openConfirm)
  confirmBtn.addEventListener('click', confirmDelete)
  cancelDeleteBtn.addEventListener('click', cancelDelete)
  cancelAddBtn.addEventListener('click', closeAdd)

  editForm.addEventListener('submit', (event) => {
    event.preventDefault()
    saveEdit()
  })
  editForm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeEdit()
  })
  clearErrorsOnInput(editForm)

  confirmBox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancelDelete()
  })

  window.addEventListener('hashchange', () => {
    const target = readHash()
    if (target.add) {
      openAdd()
      return
    }
    if (target.taskId && findTask(target.taskId)) {
      select(target.taskId)
      revealStage()
    }
  })

  // ---- Add form -------------------------------------------------------------

  const addSchedule = createScheduleEditor()

  const resetAddForm = () => {
    form.reset()
    setFieldError(nameInput, '')
    addSchedule.setValue(DEFAULT_GOAL)
    selectColor(colorsBox, store.nextColor(store.getState()))
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const fields = readTaskFields(form, addSchedule, store.nextColor(store.getState()))
    if (!fields) return
    const now = Date.now()
    const id = store.createId()
    await store.update((state) => store.addTask(state, fields, now, id))
    if (!findTask(id)) return
    // Put the new task on stage, ready to start.
    resetAddForm()
    select(id)
    toggleBtn.focus()
    announce(
      isScheduledOn(fields, now)
        ? `Added ${fields.name}. Press Start to begin tracking.`
        : `Added ${fields.name}. It isn't scheduled today, so it's listed under Not today.`,
    )
  })
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAdd()
  })
  clearErrorsOnInput(form)

  // ---- Boot -----------------------------------------------------------------

  scheduleMount.replaceWith(addSchedule.node)
  addSchedule.setValue(DEFAULT_GOAL)
  colorsBox.append(...buildSwatches('color', store.nextColor(store.getState())))
  ui.mountChrome()
  const rail = ui.mountRail()

  const initial = readHash()
  if (initial.add) mode = 'add'
  else if (initial.taskId) selectedId = initial.taskId
  // A task already running at load doesn't override the task the link asked for.
  const { active } = store.getState()
  lastActiveId = active ? active.taskId : null

  // Subscribers receive the state as an argument; render's only parameter is `now`.
  store.subscribe(() => render())
  render()
  ui.startTicker(tick)
})()
