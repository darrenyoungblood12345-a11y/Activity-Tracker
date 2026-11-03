---
name: Time Tracker
description: A personal stopwatch log where the screen wears the color of the one running task.
colors:
  ground: "#f5f4f7"
  rail: "#ebe9f0"
  rail-raised: "#dcd9e3"
  surface: "#ffffff"
  surface-muted: "#efedf3"
  text: "#17151c"
  text-muted: "#59546a"
  placeholder: "#6a6578"
  border: "#dcd9e2"
  border-strong: "#838094"
  grid-line: "#e4e1ea"
  ink: "#17151c"
  on-ink: "#ffffff"
  today-bg: "#eeecf3"
  danger: "#b91c1c"
  danger-soft: "#fdf1f1"
  success: "#166534"
  warning-bg: "#fff6dc"
  warning-text: "#5f3f00"
  ground-dark: "#121016"
  rail-dark: "#19171e"
  rail-raised-dark: "#2a2631"
  surface-dark: "#1d1a23"
  surface-muted-dark: "#24212b"
  text-dark: "#ece9f2"
  text-muted-dark: "#a8a2b4"
  border-dark: "#2d2934"
  border-strong-dark: "#757083"
  ink-dark: "#ece9f2"
  on-ink-dark: "#17151c"
  danger-dark: "#dc2626"
  danger-text-dark: "#f28b82"
  success-dark: "#6fcf8f"
  task-ink-dark-text: "#1a1d21"
  task-blue: "#2563eb"
  task-green: "#15803d"
  task-red: "#dc2626"
  task-purple: "#7c3aed"
  task-amber: "#a16207"
  task-ocean: "#0369a1"
  task-pink: "#be185d"
  task-magenta: "#c026d3"
  task-charcoal: "#1f2937"
  task-white: "#ffffff"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "9rem"
    fontWeight: 700
    lineHeight: 0.86
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  page-title:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
  body:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  label:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
  figure:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    fontFeature: "tnum"
  figure-large:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
  mark: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  gutter: "clamp(16px, 4vw, 48px)"
  rail-width: "248px"
  tabbar-height: "60px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "40px"
    typography: "{typography.body-small}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-muted}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "40px"
  button-quiet-hover:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
  button-stage:
    backgroundColor: "{colors.task-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 28px"
    height: "56px"
    width: "10rem"
  button-stage-running:
    backgroundColor: "#ffffff"
    textColor: "{colors.task-blue}"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "42px"
  chip-day:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    height: "38px"
  chip-day-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "7px 8px"
  nav-item-active:
    backgroundColor: "{colors.rail-raised}"
    textColor: "{colors.text}"
  rail-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
    height: "36px"
  rail-row-running:
    backgroundColor: "{colors.task-blue}"
    textColor: "#ffffff"
  goal-track:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.mark}"
    height: "8px"
  goal-track-stage:
    backgroundColor: "{colors.rail-raised}"
    rounded: "{rounded.mark}"
    height: "14px"
---

# Design System: Time Tracker

## Overview

**Creative North Star: "The Color Stage"**

One timer runs at a time, so the screen wears one color at a time. The app is a quiet lilac-grey room with an ink rail down its left side; nothing on it carries a hue of its own. When a task starts, the whole content column (the stage) and that task's row in the rail flood with the task's color, and every word and control on the stage switches to the task's ink. Pause, and the stage drains back to the ground. The color is information, never decoration: it says "this is running" from across the room.

Density is low on the stage and moderate everywhere else. The stage gives the running clock almost all of its height: a status line on top, then name, schedule, a condensed clock at 9rem, a full-width ticked goal track and one large control. The other pages (Analytics, Calendar, Settings) read in rows and tracks divided by hairline rules, not in boxed tiles. The system is flat: depth comes from the rail's slightly darker tone and from 1px rules, and the only shadow belongs to things that float over the page.

Explicitly rejected: the category default of a grid of equal white cards with a blue accent and KPI tiles.

**Key Characteristics:**
- No brand accent. Ink is the action color; the ten task colors are the only hues anywhere.
- The running task floods the stage and its rail row, on every page where the rail is visible.
- Barlow for words, Barlow Condensed tabular numerals for every clock and figure.
- Squared corners (6px), hairline rules, no card shadows.
- Goal progress is always a ten-segment ticked track.
- Light and Dark themes share every rule; only the token values change.

## Colors

A neutral lilac-grey ground and ink, against which ten fixed task colors are the only saturated hues.

### Primary
- **Ink** (`ink`, light; `ink-dark`, dark): the action color. Primary buttons, selected day and period chips, focus rings (3px outline, 2px offset), text selection, the brand mark. In dark theme ink inverts to near-white with `on-ink-dark` text on it.

### Task Palette
Ten fixed colors, chosen by the person per task. The first eight (Blue, Green, Red, Purple, Amber, Ocean, Pink, Magenta) carry white text at 4.5:1 or better and are ordered to pass an adjacent-pair colorblind separation check; Charcoal and White are neutrals offered last. Text on any task color is picked per color by contrast: white, or `task-ink-dark-text`. A task's name always appears beside its color, so identity never depends on hue alone.

Each task color is expressed through three derived variables set in script: the fill (the color), the task ink (text on the fill), and the task edge (lines and text against the page; on light theme a dark color's edge is itself and White's edge is muted text; on dark theme the edge is the color tinted lighter until it reads on the dark muted surface).

### Neutral
- **Lilac-Grey Ground** (`ground` / `ground-dark`): the page and the idle stage.
- **Rail Ink-Wash** (`rail` / `rail-dark`): the sidebar, the phone brand bar and the bottom tab bar. One step darker than the ground in light theme, one step lighter in dark.
- **Rail Raised** (`rail-raised` / `rail-raised-dark`): hover and current state in the rail and nav; the idle stage's goal-track background.
- **Surface** (`surface` / `surface-dark`): input fields, chips, the calendar popover.
- **Surface Muted** (`surface-muted` / `surface-muted-dark`): button hover fills and the default goal-track background. The dark value is duplicated as `DARK_SURFACE_MUTED` in `js/storage.js` and must be changed in both places.
- **Text / Text Muted / Placeholder**: primary copy, secondary copy (4.5:1 on ground and surface), input placeholders.
- **Border** (`border`): hairline rules between sections, rows and the rail edge.
- **Border Strong** (`border-strong`): input and button edges, at 3:1 or better against white and the ground (WCAG 1.4.11).
- **Grid Line / Today** (`grid-line`, `today-bg`): calendar hour lines and the current-day column tint.
- **Danger / Success / Warning**: delete confirmation, met goals in tables, the storage warning banner. Status only; never decorative.

### Named Rules
**The One Hue at a Time Rule.** There is no global accent. The only saturated color on a screen is the running task's, plus small task squares that label rows. Never introduce a brand blue, a link color or a decorative tint.

**The Near-Ground Band Rule.** When the running color barely differs from the ground (contrast against the ground below 1.5: White on light, Charcoal on dark), the stage's status line becomes a full-width band in the task's ink with the task color as text, weight 600. This is the running mark that does not depend on hue. For every other color the status line stays unbanded; the flood itself is the signal. The ground hexes are duplicated as `GROUNDS` in `js/activities.js` and must stay in sync with `ground` / `ground-dark`.

**The Full-Ink Rule.** On a flooded stage, secondary text stays full task ink and steps down by size, not by opacity, because the palette only just reaches 4.5:1.

## Typography

**Display Font:** Barlow Condensed 600/700 (with Barlow, system-ui)
**Body Font:** Barlow 400/500/600 (with system-ui, -apple-system, Segoe UI, Roboto)

Both families are self-hosted woff2 files in `fonts/`; no font request leaves the site.

**Character:** Barlow is a plain, slightly rounded grotesque that keeps labels calm; its condensed cut turns every figure into a gauge that can grow huge without getting wide.

### Hierarchy
- **Display** (Barlow Condensed 700, 9rem; 7rem under 1100px; clamp(4.5rem, 22vw, 6rem) on phones; line-height 0.86, tabular): the stage clock only.
- **Headline** (Barlow 600, 2.25rem; 1.75rem on phones; line-height 1.1, -0.01em): the stage task name and the add/edit form title.
- **Page Title** (Barlow 600, 1.875rem, line-height 1.15, -0.01em): Analytics, Calendar and Settings page headings.
- **Title** (Barlow 600, 1.1875rem): section titles, empty-state titles, the analytics summary sentence, the calendar range.
- **Body** (Barlow 400, 16px, line-height 1.5): default copy; the stage schedule and goal line step up to 1.0625rem.
- **Body Small** (Barlow 400–600, 0.9375rem): buttons, the stage status line, notes, table cells.
- **Label** (Barlow 500, 0.8125rem, sentence case): rail group titles ("Today", "Not today"), hour labels, table column heads, metric names.
- **Figure** (Barlow Condensed 600, 1rem–1.125rem, tabular): rail times, percents, metrics, table numbers. **Figure Large** (Barlow Condensed 700, 1.625rem) for summary totals; up to 2.5rem for the storage value.

### Named Rules
**The Condensed Figures Rule.** Every clock, duration, percent and count is set in Barlow Condensed with tabular numerals, so ticking digits never shift. Words are never set condensed.

**The Sentence Case Rule.** Labels are small and muted, never uppercase and never letter-spaced. There is no eyebrow or kicker type in this system.

## Layout

A two-column shell: a sticky 248px rail (`rail-width`) on the left, full viewport height, scrolling on its own, separated by a 1px border; the rest is the main column. On Activities the main column is the stage, at least the full viewport height, with a 28px top pad and a horizontal gutter of clamp(16px, 4vw, 48px). The stage's status line spans edge to edge (it pulls out through the stage padding) so it can become a band; the task block sits vertically centered beneath it, capped at 980px wide. Other pages use a 1080px max-width column with 36px top padding and 32px between sections.

The rail holds, in order: brand (with a small square mark: an ink outline half-filled with ink), the four-item nav, the Today task list, the Not today list, and "Add a task". Every task row carries a task square, name, time so far and a 36px play/pause button.

Spacing rhythm is 4 / 8 / 12 / 16 / 24 / 32px; 2px gaps separate stacked rail rows and nav items.

**Responsive:**
- Under 1100px: the clock drops to 7rem; analytics rows fold their metrics beside the head.
- Under 900px (phones and small tablets): the rail dissolves. Its head becomes a brand bar on top, the nav becomes a fixed bottom tab bar (60px plus safe area, equal-width items, 46px tall targets), and the task list moves below the stage on Activities (hidden on other pages). Rail rows and buttons grow to 48px targets. The stage loses its full-height minimum, the large control goes full width.
- **Now-running strip:** on phones, on every page except Activities, the running task docks as a strip 8px above the tab bar: task color fill, task ink text, name, condensed time (1.375rem, 700), and a 56px pause button behind a 30%-ink divider.

## Elevation & Depth

Flat. Surfaces sit at rest with no shadow; depth is tonal (rail one step off the ground, rail-raised for hover/current) and linear (1px `border` rules). Task-colored fills carry a 1px inset ring in the task edge color so White stays visible on a white surface; that ring is an edge, not elevation.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 8px 24px rgba(23, 21, 28, 0.16)` light; `0 8px 24px rgba(0, 0, 0, 0.55)` dark): only for things that float above the page: the calendar session popover and the phone now-running strip.

### Named Rules
**The Rules-Not-Boxes Rule.** Sections are divided by a top hairline rule with 20px above the content, never boxed in a card. If it doesn't float over other content, it has no shadow.

## Shapes

Squared, quietly softened corners. Controls, rail rows, inputs, chips, swatches, the now-running strip and the few bordered containers all use 6px (`rounded.md`). Calendar session blocks use 4px (`rounded.sm`). Small identity marks go tighter: task squares and the goal track 2px, the brand mark and stage task square 3px. Nothing is a pill or a circle. Borders are 1px; selected states add a second 1px ink ring rather than thickening.

## Components

### Buttons
Squared, plain, confident; the label carries the weight (600).
- **Shape:** gently squared (6px), 40px minimum height, 8px 14px padding, 0.9375rem. Small variant 32px, 4px 10px, 0.875rem. Icon-only 40px square.
- **Primary:** ink fill, on-ink text. Hover mixes ink 86% into the ground.
- **Secondary (default):** transparent with a `border-strong` 1px edge, text color; hover fills `surface-muted`.
- **Quiet:** no border, muted text; hover fills `surface-muted` and goes full text. Quiet-danger hover uses `danger-soft` / danger text. On a flooded stage, quiet buttons use stage ink and hover with 10% stage ink.
- **Danger:** danger fill, white text, darker on hover; used only to confirm a delete.
- **Stage toggle:** the one big control. 56px tall, at least 10rem wide, 0 28px padding, 1.125rem. Idle: filled with the selected task's color, task ink text, inset task-edge ring. Running: inverts to task ink fill with the task color as text (Pause). Full width on phones.
- **Transitions:** background and color, 150ms, ease-out `cubic-bezier(0.22, 1, 0.36, 1)`.

### Chips
- **Day and period chips:** the same chip used as checkbox (weekdays) and radio (Day / Week / Month). 38px tall, `border-strong` edge, surface fill, muted 600 0.875rem text. Selected: ink fill, on-ink text. The native input stays in place, invisible, for keyboard and screen readers.
- **Color swatches:** task-color squares at 6px with an inset task-edge ring; the selected one gets a 2px ground gap then a 2px ink ring.

### Cards / Containers
There are no cards. Sections are `panel`s: a top hairline rule and 20px top padding. The inline delete confirmation is the one bordered container (6px, 14px padding). Settings theme options are bordered 6px choices with a live mini-preview; the selected one gets an ink border plus a 1px ink ring.

### Inputs / Fields
- **Style:** surface fill, 1px `border-strong`, 6px, 42px tall, 8px 12px padding, tabular numerals. Legends are 600 at 0.9375rem.
- **Focus:** the global 3px ink outline at 2px offset.
- **Error:** danger border plus a 1px danger ring; message in danger text at 0.875rem.

### Navigation
- **Desktop:** a vertical list in the rail. Items are muted 500 text, 7px 8px padding, 6px corners; hover and current both fill `rail-raised` with full text, current at 600. No pills, no underline bars, no icons.
- **Phone:** the same list as a fixed bottom tab bar on the rail color, items centered, 0.9375rem.

### Rail Task Row (signature)
Task square, name (1.25 line height, wraps), condensed time with a small period suffix ("wk", "mo") and a check when the goal is met, then a 36px play/pause icon button. Selected (not running): `rail-raised` fill, 600. Off-schedule: muted. **Running:** the row fills with the task color, task ink text, inset task-edge ring, the square turns task ink; hover inside it is 16% task ink. Background and color transition over 250ms.

### Stage (signature)
Idle, the stage is the ground. Running, it floods with the task color, all text and controls switch to task ink, focus rings switch to task ink, and the track background becomes 30% ink mixed into the color. The flood transitions over 250ms and is removed under reduced motion. See The Near-Ground Band Rule for White and Charcoal. Add and edit forms only ever sit on the idle stage.

### Goal Track (signature)
A bar cut into ten equal segments by nine 2px ticks drawn in the color of whatever the track sits on (the ground, or the flooded stage). 8px tall in lists, 14px on the stage, 2px corners. The fill is the task color (with its edge ring) and caps at 100% while the label reports the true percent; on a running stage the fill is task ink. The width transitions over 300ms.

### Icons
A small authored SVG set on a 24px grid, sized 1em: play and pause are solid shapes; plus, check and the calendar's chevron-left/right are 2.25 stroked lines with round caps and joins. Always `aria-hidden` with a text label on the control.

### Calendar Blocks
Session blocks in the week grid: task-color fill at 4px, task ink 0.8125rem text, inset task-edge ring plus a 1px ground gap so adjacent blocks separate. The running block gets a 2px inset task-ink ring. The now line is a 2px task-edge (or ink) rule with a small 4×10px cap.

## Do's and Don'ts

### Do:
- **Do** let ink be the only action color: primary buttons, selected chips, focus rings, selection.
- **Do** flood the stage and the running task's rail row with the task color, and switch everything on it to task ink.
- **Do** band the stage status line in task ink when the running color's contrast with the ground is under 1.5.
- **Do** set every number in Barlow Condensed with tabular numerals.
- **Do** show goal progress as the ten-segment ticked track, capped at 100%.
- **Do** keep corners at 6px (4px for calendar blocks, 2–3px for small marks).
- **Do** divide sections with 1px hairline rules.
- **Do** keep motion to state changes: 150–250ms, ease-out, off under reduced motion.
- **Do** keep `ground-dark` / `ground` in sync with `GROUNDS` in `js/activities.js`, and `surface-muted-dark` with `DARK_SURFACE_MUTED` in `js/storage.js`.

### Don't:
- **Don't** add a global accent hue, brand color or colored links; the task palette is the only source of hue.
- **Don't** put shadows on cards, panels, rows or buttons; the pop shadow is for floating overlays only.
- **Don't** build grids of equal white cards or KPI tiles; read data in rows and tracks.
- **Don't** use pill shapes for nav, buttons or chips.
- **Don't** use uppercase or letter-spaced micro-labels, eyebrows or kickers.
- **Don't** use unicode glyphs or emoji as icons; use the authored SVG set.
- **Don't** fade secondary text on a flooded stage; step it down by size.
- **Don't** put a form on a flooded stage.
