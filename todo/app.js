(async () => {
const { db } = window;
const form = document.getElementById('new-task-form');
const input = document.getElementById('new-task');
const dueInput = document.getElementById('new-due');
const tagsInput = document.getElementById('new-tags');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty-state');
const count = document.getElementById('remaining');
const clearBtn = document.getElementById('clear-completed');
const error = document.getElementById('form-error');
const statusButtons = document.querySelectorAll('[data-status]');
const tagFilter = document.getElementById('tag-filter');
const clearFilters = document.getElementById('clear-filters');

let tasks = [];
const filter = { status: 'all', tag: '' };

// --- helpers -------------------------------------------------------------

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

function visibleTasks() {
  return tasks
    .filter((t) => filter.status === 'all' || (filter.status === 'done' ? t.done : !t.done))
    .filter((t) => !filter.tag || t.tags.includes(filter.tag))
    .sort(byDue);
}

// --- rendering -----------------------------------------------------------

function render() {
  renderTagOptions();
  const shown = visibleTasks();
  list.replaceChildren(...shown.map(renderTask));

  const filtered = filter.status !== 'all' || filter.tag;
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
  toggle.addEventListener('change', () => save({ ...task, done: toggle.checked }));

  const body = document.createElement('div');
  body.className = 'body';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = task.title;
  title.title = 'Double-click to edit';
  title.addEventListener('dblclick', () => startEdit(li, task));

  const meta = document.createElement('div');
  meta.className = 'meta';
  for (const tag of task.tags) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip tag';
    chip.textContent = `#${tag}`;
    chip.setAttribute('aria-label', `Show tasks tagged ${tag}`);
    chip.addEventListener('click', () => { filter.tag = tag; render(); });
    meta.append(chip);
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

  editor.append(titleField, dueField, tagsField);
  li.querySelector('.body').replaceWith(editor);
  titleField.focus();
  titleField.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const value = titleField.value.trim();
    if (!commit) return render();
    save({ ...task, title: value || task.title, dueDate: dueField.value || null, tags: parseTags(tagsField.value) });
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
  tasks.push(await db.add({ title, dueDate: dueInput.value || null, tags: parseTags(tagsInput.value) }));
  form.reset();
  input.focus();
  render();
});

input.addEventListener('input', () => { error.hidden = true; });

statusButtons.forEach((b) => b.addEventListener('click', () => { filter.status = b.dataset.status; render(); }));
tagFilter.addEventListener('change', () => { filter.tag = tagFilter.value; render(); });
clearFilters.addEventListener('click', () => { filter.status = 'all'; filter.tag = ''; render(); });

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
