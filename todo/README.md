# Todo

A simple todo app that runs entirely in the browser and stores tasks in **IndexedDB**.
Tickets #3, #4, #5, #6 and #9.

## Features
- Add a task (Enter or **Add**); blank tasks are rejected
- Optional **priority** (High / Medium / Low), shown as a colored chip; tasks sort by
  priority first (High → None), then due date
- Optional **due date** (undated last within a priority); overdue tasks are red
- Optional **tags** (`work, urgent`): trimmed, lowercased, de-duplicated, shown as chips
- **Filters:** All / Active / Completed, a tag dropdown (or click any tag chip), and a
  priority dropdown; they combine, and *Clear filters* resets them all
- **Recurring tasks:** repeat daily, weekly, monthly or every N days (default due date: today).
  Ticking one keeps it as done and creates the next occurrence; monthly keeps its day,
  clamped to short months (Jan 31 → Feb 28 → Mar 31). Unticking never deletes the copy,
  and re-ticking never duplicates it.
- Tick a task to mark it done, untick to undo
- Double-click a task's text to edit its title, due date, tags, priority and repeat
  (Enter saves, Esc cancels)
- **×** deletes a task after confirmation
- **Clear completed** removes all done tasks after confirmation
- Footer counts: **"3 open · 2 done"**, always across all tasks (filters don't change them)
- Tasks persist across reloads

## Run
No build step: open `todo/index.html` in a browser. To serve it over HTTP instead:

```bash
"C:/Program Files/nodejs/npx" -y http-server todo -p 8080 -c-1
```

## Structure
| File | Role |
|------|------|
| `index.html` | Markup |
| `styles.css` | Layout; light/dark follows the OS setting |
| `db.js` | IndexedDB wrapper: DB `factory-todo`, store `tasks` |
| `app.js` | Rendering and event handling |
| `docs/screenshots/` | Browser verification screenshots per ticket |

## Data model
`tasks` store, `keyPath: id` (auto-increment), indexes on `createdAt`, `dueDate`,
`tags` (multiEntry) and `priority`:

```js
{ id, title, done, dueDate /* 'YYYY-MM-DD' or null */, tags /* string[] */,
  priority /* 'high' | 'medium' | 'low' | null */,
  repeat /* null or { unit: 'day'|'week'|'month', every, day? } */,
  nextId /* id of the occurrence created when this one was completed */,
  createdAt, updatedAt }
```

`repeat` and `nextId` need no index, so #5 didn't bump the version.

| Version | Ticket | Change |
|---------|--------|--------|
| 1 | #3 | `tasks` store |
| 2 | #4 | `dueDate` + `tags` indexes |
| 3 | #6 | `priority` index |

Schema changes are per-version steps in `upgrade()`; existing records are then migrated
in **one** pass by `normalize()`, which also runs on every read. Don't add a cursor per
version step: when a user skips versions (v1 → v3), those cursors race and a later step
writes back a stale record.

To add a field: give it a default in `normalize()`. To add an index: bump `DB_VERSION`
in `db.js` and add an `oldVersion < N` step in `upgrade()` that only changes the schema.
