(async () => {
const { db } = window;
const form = document.getElementById('new-task-form');
const input = document.getElementById('new-task');
const dueInput = document.getElementById('new-due');
const tagsInput = document.getElementById('new-tags');
const repeatInput = document.getElementById('new-repeat');
const everyInput = document.getElementById('new-every');
const priorityInput = document.getElementById('new-priority');
const priorityFilter = document.getElementById('priority-filter');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty-state');
const count = document.getElementById('remaining');
const clearBtn = document.getElementById('clear-completed');
const error = document.getElementById('form-error');
const statusButtons = document.querySelectorAll('[data-status]');
const tagFilter = document.getElementById('tag-filter');
const clearFilters = document.getElementById('clear-filters');

let tasks = [];
const filter = { status: 'all', tag: '', priority: '' }; // priority: '' = all, 'none' = no priority

// Ticket #6: High > Medium > Low > None
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const rank = (task) => PRIORITY_RANK[task.priority] ?? 3;

// --- helpers -------------------------------------------------------------

const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toYmd(new Date());

// --- recurrence (Ticket #5): repeat = { unit: 'day'|'week'|'month', every: N, day?: anchor day-of-month }

function readRepeat(select, every) {
  if (!select.value) return null;
  if (select.value === 'custom') return { unit: 'day', every: Math.max(1, parseInt(every.value, 10) || 1) };
  const [unit, n] = select.value.split(':');
  return { unit, every: Number(n) };
}

function repeatValue(repeat) {
  if (!repeat) return '';
  if (repeat.every === 1) return `${repeat.unit}:1`;
  return 'custom';
}

function repeatLabel({ unit, every }) {
  if (every === 1) return { day: 'Repeats daily', week: 'Repeats weekly', month: 'Repeats monthly' }[unit];
  return `Repeats every ${every} ${unit}s`;
}

function step(ymd, repeat) {
  const d = fromYmd(ymd);
  if (repeat.unit === 'day') d.setDate(d.getDate() + repeat.every);
  else if (repeat.unit === 'week') d.setDate(d.getDate() + 7 * repeat.every);
  else {
    // same day-of-month, clamped to the month's last day (Jan 31 -> Feb 28 -> Mar 31)
    const anchor = repeat.day ?? d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + repeat.every, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(anchor, last));
    return toYmd(target);
  }
  return toYmd(d);
}

// next occurrence after `due`, moved forward until it is today or later
function nextDue(due, repeat) {
  let next = step(due, repeat);
  while (next < today()) next = step(next, repeat);
  return next;
}

// recurring tasks need a due date; monthly ones remember their day-of-month
function withRepeat(fields, repeat) {
  if (!repeat) return { ...fields, repeat: null };
  const dueDate = fields.dueDate || today();
  if (repeat.unit === 'month') repeat = { ...repeat, day: fromYmd(dueDate).getDate() };
  return { ...fields, dueDate, repeat };
}

function parseTags(text) {
  const tags = text.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
  return [...new Set(tags)];
}

function formatDue(due) {
  const [y, m, d] = due.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const opts = { month: 'short', day: 'numeric' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}

const isOverdue = (task) => !task.done && task.dueDate && task.dueDate < today();

// due date ascending, undated last, then oldest first
function byDue(a, b) {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

const byPriorityThenDue = (a, b) => rank(a) - rank(b) || byDue(a, b);

function visibleTasks() {
  return tasks
    .filter((t) => filter.status === 'all' || (filter.status === 'done' ? t.done : !t.done))
    .filter((t) => !filter.tag || t.tags.includes(filter.tag))
    .filter((t) => !filter.priority || (filter.priority === 'none' ? !t.priority : t.priority === filter.priority))
    .sort(byPriorityThenDue);
}

// --- rendering -----------------------------------------------------------

function render() {
  renderTagOptions();
  const shown = visibleTasks();
  list.replaceChildren(...shown.map(renderTask));

  const filtered = filter.status !== 'all' || filter.tag || filter.priority;
  priorityFilter.value = filter.priority;
  empty.hidden = shown.length > 0;
  empty.textContent = tasks.length && filtered ? 'No tasks match this filter.' : 'No tasks yet. Add one above.';

  statusButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === filter.status)));
  clearFilters.hidden = !filtered;

  const left = tasks.filter((t) => !t.done).length;
  count.textContent = `${left} ${left === 1 ? 'task' : 'tasks'} left`;
  clearBtn.disabled = !tasks.some((t) => t.done);
}

function renderTagOptions() {
  const all = [...new Set(tasks.flatMap((t) => t.tags))].sort();
  if (filter.tag && !all.includes(filter.tag)) filter.tag = '';
  const options = [new Option('All tags', ''), ...all.map((t) => new Option(`#${t}`, t))];
  tagFilter.replaceChildren(...options);
  tagFilter.value = filter.tag;
  tagFilter.disabled = all.length === 0;
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' done' : '') + (isOverdue(task) ? ' overdue' : '');
  li.dataset.id = task.id;

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = task.done;
  toggle.setAttribute('aria-label', `Mark "${task.title}" as ${task.done ? 'not done' : 'done'}`);
  toggle.addEventListener('change', () => setDone(task, toggle.checked));

  const body = document.createElement('div');
  body.className = 'body';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = task.title;
  title.title = 'Double-click to edit';
  title.addEventListener('dblclick', () => startEdit(li, task));

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (task.priority) {
    const pri = document.createElement('span');
    pri.className = `chip priority priority-${task.priority}`;
    pri.textContent = PRIORITY_LABEL[task.priority];
    pri.dataset.priority = task.priority;
    meta.append(pri);
  }
  for (const tag of task.tags) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip tag';
    chip.textContent = `#${tag}`;
    chip.setAttribute('aria-label', `Show tasks tagged ${tag}`);
    chip.addEventListener('click', () => { filter.tag = tag; render(); });
    meta.append(chip);
  }
  if (task.repeat) {
    const rep = document.createElement('span');
    rep.className = 'chip repeat';
    rep.textContent = '↻ ' + repeatLabel(task.repeat);
    meta.append(rep);
  }
  if (task.dueDate) {
    const due = document.createElement('span');
    due.className = 'chip due';
    due.textContent = (isOverdue(task) ? 'Overdue · ' : 'Due ') + formatDue(task.dueDate);
    due.dataset.due = task.dueDate;
    meta.append(due);
  }

  body.append(title);
  if (meta.childElementCount) body.append(meta);

  const del = document.createElement('button');
  del.className = 'delete';
  del.type = 'button';
  del.textContent = '×';
  del.setAttribute('aria-label', `Delete "${task.title}"`);
  del.addEventListener('click', () => removeTask(task));

  li.append(toggle, body, del);
  return li;
}

function startEdit(li, task) {
  const editor = document.createElement('div');
  editor.className = 'editor';

  const titleField = Object.assign(document.createElement('input'), { className: 'edit', value: task.title });
  titleField.setAttribute('aria-label', 'Edit task');
  const dueField = Object.assign(document.createElement('input'), { type: 'date', className: 'edit-due', value: task.dueDate ?? '' });
  dueField.setAttribute('aria-label', 'Edit due date');
  const tagsField = Object.assign(document.createElement('input'), { className: 'edit-tags', value: task.tags.join(', '), placeholder: 'tags' });
  tagsField.setAttribute('aria-label', 'Edit tags');

  const repeatField = repeatInput.cloneNode(true);
  repeatField.removeAttribute('id');
  repeatField.className = 'edit-repeat';
  repeatField.value = repeatValue(task.repeat);
  const everyField = everyInput.cloneNode(true);
  everyField.removeAttribute('id');
  everyField.className = 'edit-every';
  everyField.value = task.repeat?.every > 1 ? task.repeat.every : 3;
  everyField.hidden = repeatField.value !== 'custom';
  repeatField.addEventListener('change', () => { everyField.hidden = repeatField.value !== 'custom'; });

  const priorityField = priorityInput.cloneNode(true);
  priorityField.removeAttribute('id');
  priorityField.className = 'edit-priority';
  priorityField.value = task.priority ?? '';

  const fields = { title: titleField, due: dueField, tags: tagsField, priority: priorityField, repeat: repeatField, every: everyField };
  for (const [name, el] of Object.entries(fields)) el.name = `edit-${name}`;
  editor.append(...Object.values(fields));
  li.querySelector('.body').replaceWith(editor);
  titleField.focus();
  titleField.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const value = titleField.value.trim();
    if (!commit) return render();
    const fields = {
      title: value || task.title,
      dueDate: dueField.value || null,
      tags: parseTags(tagsField.value),
      priority: priorityField.value || null,
    };
    save({ ...task, ...withRepeat(fields, readRepeat(repeatField, everyField)) });
  };
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  // save when focus leaves the whole editor, not when moving between its fields
  editor.addEventListener('focusout', (e) => { if (!editor.contains(e.relatedTarget)) finish(true); });
}

// --- actions -------------------------------------------------------------

async function save(task) {
  const updated = await db.update(task);
  tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
  render();
}

// Checking off a recurring task keeps it as done and creates the next occurrence once.
// The done task remembers that copy (nextId), so unchecking/re-checking never duplicates,
// and unchecking never deletes the copy.
async function setDone(task, done) {
  if (done && task.repeat && !task.nextId) {
    const next = await db.add({
      title: task.title,
      tags: task.tags,
      priority: task.priority ?? null,
      repeat: task.repeat,
      dueDate: nextDue(task.dueDate || today(), task.repeat),
    });
    tasks.push(next);
    return save({ ...task, done, nextId: next.id });
  }
  return save({ ...task, done });
}

async function removeTask(task) {
  if (!confirm(`Delete "${task.title}"?`)) return;
  await db.remove(task.id);
  tasks = tasks.filter((t) => t.id !== task.id);
  render();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) {
    error.hidden = false;
    input.focus();
    return;
  }
  error.hidden = true;
  const fields = { title, dueDate: dueInput.value || null, tags: parseTags(tagsInput.value), priority: priorityInput.value || null };
  tasks.push(await db.add(withRepeat(fields, readRepeat(repeatInput, everyInput))));
  form.reset();
  everyInput.hidden = true;
  input.focus();
  render();
});

repeatInput.addEventListener('change', () => { everyInput.hidden = repeatInput.value !== 'custom'; });

input.addEventListener('input', () => { error.hidden = true; });

statusButtons.forEach((b) => b.addEventListener('click', () => { filter.status = b.dataset.status; render(); }));
tagFilter.addEventListener('change', () => { filter.tag = tagFilter.value; render(); });
priorityFilter.addEventListener('change', () => { filter.priority = priorityFilter.value; render(); });
clearFilters.addEventListener('click', () => { filter.status = 'all'; filter.tag = ''; filter.priority = ''; render(); });

clearBtn.addEventListener('click', async () => {
  const done = tasks.filter((t) => t.done);
  if (!done.length) return;
  if (!confirm(`Delete ${done.length} completed ${done.length === 1 ? 'task' : 'tasks'}?`)) return;
  await db.remove(done.map((t) => t.id));
  tasks = tasks.filter((t) => !t.done);
  render();
});

tasks = await db.getAll();
render();
})();
