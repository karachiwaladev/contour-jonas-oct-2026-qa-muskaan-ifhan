(async () => {
const { db } = window;
const form = document.getElementById('new-task-form');
const input = document.getElementById('new-task');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty-state');
const count = document.getElementById('remaining');
const clearBtn = document.getElementById('clear-completed');
const error = document.getElementById('form-error');

let tasks = [];

function render() {
  list.replaceChildren(...tasks.map(renderTask));
  empty.hidden = tasks.length > 0;

  const left = tasks.filter((t) => !t.done).length;
  count.textContent = `${left} ${left === 1 ? 'task' : 'tasks'} left`;
  clearBtn.disabled = !tasks.some((t) => t.done);
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' done' : '');
  li.dataset.id = task.id;

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = task.done;
  toggle.setAttribute('aria-label', `Mark "${task.title}" as ${task.done ? 'not done' : 'done'}`);
  toggle.addEventListener('change', () => save({ ...task, done: toggle.checked }));

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = task.title;
  title.title = 'Double-click to edit';
  title.addEventListener('dblclick', () => startEdit(li, task));

  const del = document.createElement('button');
  del.className = 'delete';
  del.type = 'button';
  del.textContent = '×';
  del.setAttribute('aria-label', `Delete "${task.title}"`);
  del.addEventListener('click', () => removeTask(task));

  li.append(toggle, title, del);
  return li;
}

function startEdit(li, task) {
  const field = document.createElement('input');
  field.className = 'edit';
  field.value = task.title;
  field.setAttribute('aria-label', 'Edit task');
  li.querySelector('.title').replaceWith(field);
  field.focus();
  field.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const value = field.value.trim();
    if (commit && value && value !== task.title) save({ ...task, title: value });
    else render();
  };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  field.addEventListener('blur', () => finish(true));
}

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
  tasks.push(await db.add(title));
  input.value = '';
  render();
});

input.addEventListener('input', () => { error.hidden = true; });

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
