let tasks = [];
let currentSort = "manual";
let dragSrcId = null;

const SORTS = [
  { key: "manual", label: "Manual" },
  { key: "oldest", label: "Oldest" },
  { key: "newest", label: "Newest" },
  { key: "az",     label: "A → Z" },
  { key: "za",     label: "Z → A" },
];

async function fetchTasks() {
  const res = await fetch("/api/tasks");
  tasks = await res.json();
  render();
}

function sortedPending() {
  const pending = tasks.filter(t => !t.done);
  if (currentSort === "oldest") return [...pending].sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (currentSort === "newest") return [...pending].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (currentSort === "az")     return [...pending].sort((a, b) => a.text.localeCompare(b.text));
  if (currentSort === "za")     return [...pending].sort((a, b) => b.text.localeCompare(a.text));
  return pending;
}

function render() {
  const pending = sortedPending();
  const [current, ...queue] = pending;

  // Count badge
  const countEl = document.getElementById("task-count");
  countEl.textContent = pending.length ? `${pending.length} task${pending.length > 1 ? "s" : ""}` : "";

  // Focus area
  const focusEl = document.getElementById("focus-area");
  if (current) {
    const isDraggable = pending.length > 1;
    focusEl.innerHTML = `
      <div class="focus-card" ${isDraggable ? `draggable="true" data-id="${current.id}"` : ""}>
        ${isDraggable ? `<span class="focus-drag-handle" title="Drag to send to queue">⠿</span>` : ""}
        <p class="task-text">${escapeHtml(current.text)}</p>
        <div class="focus-actions">
          <button class="btn-done" data-id="${current.id}">Done</button>
          ${isDraggable ? `<button class="btn-skip" data-id="${current.id}" title="Do this later">Skip ↓</button>` : ""}
          <button class="btn-delete" data-id="${current.id}">Delete</button>
        </div>
      </div>`;
    focusEl.querySelector(".btn-done").addEventListener("click", () => completeTask(current.id));
    focusEl.querySelector(".btn-delete").addEventListener("click", () => deleteTask(current.id));
    if (isDraggable) {
      focusEl.querySelector(".btn-skip").addEventListener("click", () => skipTask(current.id));
      const card = focusEl.querySelector(".focus-card");
      card.addEventListener("dragstart", (e) => {
        dragSrcId = current.id;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        dragSrcId = null;
        document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
      });
    }
  } else {
    focusEl.innerHTML = `
      <div class="empty-state">
        <span class="emoji">✓</span>
        All clear — add a task below
      </div>`;
  }

  // Sort bar
  const sortBarEl = document.getElementById("sort-bar");
  sortBarEl.style.display = pending.length > 1 ? "" : "none";
  sortBarEl.innerHTML = `<span class="sort-label">Sort</span>` +
    SORTS.map(s => `<button class="sort-btn${currentSort === s.key ? " active" : ""}" data-sort="${s.key}">${s.label}</button>`).join("");
  sortBarEl.querySelectorAll(".sort-btn").forEach(btn =>
    btn.addEventListener("click", () => applySort(btn.dataset.sort))
  );

  // Queue
  const queueLabel = document.getElementById("queue-label");
  const queueList = document.getElementById("queue-list");
  queueLabel.style.display = queue.length ? "" : "none";

  queueList.innerHTML = queue.map(t => `
    <li class="queue-item" draggable="true" data-id="${t.id}">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <span>${escapeHtml(t.text)}</span>
      <button class="queue-promote" data-id="${t.id}" title="Make current">↑</button>
      <button class="queue-delete" data-id="${t.id}" title="Delete">✕</button>
    </li>`).join("");

  queueList.querySelectorAll(".queue-promote").forEach(btn =>
    btn.addEventListener("click", () => promoteTask(btn.dataset.id))
  );
  queueList.querySelectorAll(".queue-delete").forEach(btn =>
    btn.addEventListener("click", () => deleteTask(btn.dataset.id))
  );
  queueList.querySelectorAll(".queue-item").forEach(item => {
    item.addEventListener("dragstart", onQueueDragStart);
    item.addEventListener("dragover", onQueueDragOver);
    item.addEventListener("dragleave", onQueueDragLeave);
    item.addEventListener("drop", onQueueDrop);
    item.addEventListener("dragend", onQueueDragEnd);
  });
}

// Focus area drop zone — lights up when dragging a queue item over it
const focusArea = document.getElementById("focus-area");
let focusDragCounter = 0; // track nested dragenter/dragleave

focusArea.addEventListener("dragenter", (e) => {
  const pending = sortedPending();
  if (!dragSrcId || dragSrcId === pending[0]?.id) return; // ignore focus card dragging itself
  focusDragCounter++;
  focusArea.classList.add("drop-target");
});

focusArea.addEventListener("dragleave", () => {
  focusDragCounter--;
  if (focusDragCounter <= 0) {
    focusDragCounter = 0;
    focusArea.classList.remove("drop-target");
  }
});

focusArea.addEventListener("dragover", (e) => {
  const pending = sortedPending();
  if (!dragSrcId || dragSrcId === pending[0]?.id) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
});

focusArea.addEventListener("drop", async (e) => {
  e.preventDefault();
  focusDragCounter = 0;
  focusArea.classList.remove("drop-target");
  const pending = sortedPending();
  if (!dragSrcId || dragSrcId === pending[0]?.id) return;
  await promoteTask(dragSrcId);
});

// Queue drag handlers
function onQueueDragStart(e) {
  dragSrcId = this.dataset.id;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onQueueDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".queue-item").forEach(el => el.classList.remove("drag-over"));
  if (this.dataset.id !== dragSrcId) this.classList.add("drag-over");
}

function onQueueDragLeave() {
  this.classList.remove("drag-over");
}

async function onQueueDrop(e) {
  e.preventDefault();
  if (this.dataset.id === dragSrcId) return;

  const pending = sortedPending();
  const srcIdx = pending.findIndex(t => t.id === dragSrcId);
  const dstIdx = pending.findIndex(t => t.id === this.dataset.id);
  if (srcIdx === -1 || dstIdx === -1) return;

  pending.splice(dstIdx, 0, pending.splice(srcIdx, 1)[0]);
  currentSort = "manual";
  await fetch("/api/tasks/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: pending.map(t => t.id) }),
  });
  fetchTasks();
}

function onQueueDragEnd() {
  dragSrcId = null;
  document.querySelectorAll(".queue-item, .focus-card").forEach(el => {
    el.classList.remove("dragging", "drag-over");
  });
  focusDragCounter = 0;
  focusArea.classList.remove("drop-target");
}

async function applySort(sortKey) {
  currentSort = sortKey;
  const ordered = sortedPending();
  await fetch("/api/tasks/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: ordered.map(t => t.id) }),
  });
  fetchTasks();
}

async function skipTask(id) {
  const pending = sortedPending();
  const reordered = [...pending.filter(t => t.id !== id), pending.find(t => t.id === id)];
  currentSort = "manual";
  await fetch("/api/tasks/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: reordered.map(t => t.id) }),
  });
  fetchTasks();
}

async function promoteTask(id) {
  const pending = sortedPending();
  const reordered = [pending.find(t => t.id === id), ...pending.filter(t => t.id !== id)];
  currentSort = "manual";
  await fetch("/api/tasks/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: reordered.map(t => t.id) }),
  });
  fetchTasks();
}

async function completeTask(id) {
  await fetch(`/api/tasks/${id}`, { method: "PATCH" });
  fetchTasks();
}

async function deleteTask(id) {
  await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  fetchTasks();
}

document.getElementById("add-form").addEventListener("submit", async e => {
  e.preventDefault();
  const input = document.getElementById("task-input");
  const text = input.value.trim();
  if (!text) return;
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  input.value = "";
  fetchTasks();
});

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

fetchTasks();
