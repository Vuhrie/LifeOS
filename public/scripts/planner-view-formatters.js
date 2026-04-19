export const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const formatTime = (value) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

export const formatDate = (value) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));

export const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const draftCard = (item) => `
  <article class="draft-event-card" data-kind="${escapeHtml(item.kind)}">
    <p class="draft-event-time">${escapeHtml(formatTime(item.start))} - ${escapeHtml(formatTime(item.end))}</p>
    <h3>${escapeHtml(item.title)}</h3>
    <div class="draft-event-meta">
      <span class="draft-event-badge">${escapeHtml(item.badge)}</span>
      ${
        item.kind === "existing"
          ? `<button type="button" class="action-button draft-edit-imported" data-edit-imported="${escapeHtml(item.id)}">Edit</button><button type="button" class="inline-remove draft-remove-imported" data-rm-imported="${escapeHtml(item.id)}">Remove</button>`
          : ""
      }
    </div>
  </article>
`;
