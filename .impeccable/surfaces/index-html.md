---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["analytics/index.html","calendar/index.html","settings/index.html"]
---

# Surface brief: Time Tracker app shell (all four pages)

Scope: Activities (index.html), Analytics, Calendar, Settings. Mode: Operate.
Job: start, pause and switch the one running stopwatch; see what's left today; review the week.
Constraints: static HTML/CSS/vanilla JS, localStorage only, no hosted fonts, Light/Dark/Match device themes, WCAG AA.
Chosen direction: sample C "Color stage", picked by the user over A (Timetable) and B (Stamp card). Memorable moment: starting a task floods the stage with its color.

## Direction contract

THESIS: One timer runs at a time, so the screen wears one color at a time. Refuses the category default of a grid of equal white cards with a blue accent and KPI tiles.

OWN-WORLD: Quiet ink rail (light #ebe9f0 / dark #19171e) on a lilac-grey ground; no brand accent, ink is the action color and the 10 task colors are the only hues. Barlow for UI, Barlow Condensed tabular numerals for every clock and figure. Hairline rules instead of shadowed cards; squared 6px corners; tick-marked goal tracks.

STORY: The visitor sees immediately what is running and how long is left, starts or switches any task from the rail on any page, and reads the week in rows and tracks rather than tiles.

FIRST VIEWPORT: Desktop: 248px sticky rail at left (brand, nav, Today / Not today task rows with play-pause buttons, Add a task); the rest is the stage, flooded in the running task's color: period label and start time on top (an ink band across the full stage width while White runs on the light theme or Charcoal on the dark one, whose floods sit too close to the ground to read as running), task name, schedule, a 9rem condensed clock (7rem under 1100px; 9rem was chosen in the build so the clock spans about half the stage at 1440px), a full-width ten-tick goal track, remaining text, then a large squared Pause button with Edit and Delete beside it. Mobile: brand bar, stage band, task rows below, nav as a bottom tab bar.

FORM: Color stage (user-pinned sample C; ranked first of three presented; a pinned direction beats the roll). seed:f47ef9857b5232ce

Signature interaction: starting or switching a task re-floods the stage and the task's rail row with its color (250ms, off under reduced motion). Motion grammar: state changes only, 150–250ms ease-out.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
