const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getDayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const formatDayHeader = (date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);

const formatTimeRange = (event) => {
  if (event.isAllDay) {
    return "All day";
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const startText = event.start ? formatter.format(event.start) : "TBD";
  const endText = event.end ? formatter.format(event.end) : "";
  return endText ? `${startText} - ${endText}` : startText;
};

const eventCard = (event) => {
  const location = event.location
    ? `<p class="event-location">${escapeHtml(event.location)}</p>`
    : "";
  const details = event.description
    ? `<p class="event-description">${escapeHtml(event.description)}</p>`
    : "";
  const link = event.htmlLink
    ? `<a class="event-link" href="${escapeHtml(event.htmlLink)}" target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>`
    : "";

  return `
    <article class="event-card">
      <p class="event-time">${escapeHtml(formatTimeRange(event))}</p>
      <h3>${escapeHtml(event.title)}</h3>
      ${location}
      ${details}
      ${link}
    </article>
  `;
};

const emptyState = (title, body) => `
  <article class="event-empty">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(body)}</p>
  </article>
`;

export const renderEvents = (container, events, options) => {
  const { emptyTitle, emptyBody, groupByDay } = options;
  if (!events.length) {
    container.innerHTML = emptyState(emptyTitle, emptyBody);
    return;
  }

  if (!groupByDay) {
    container.innerHTML = events.map(eventCard).join("");
    return;
  }

  const buckets = new Map();
  events.forEach((event) => {
    const key = getDayKey(event.start);
    if (!buckets.has(key)) {
      buckets.set(key, { date: event.start, events: [] });
    }
    buckets.get(key).events.push(event);
  });

  const sections = [...buckets.values()]
    .sort((left, right) => left.date - right.date)
    .map(
      (bucket) => `
      <section class="event-day-group">
        <h2>${escapeHtml(formatDayHeader(bucket.date))}</h2>
        <div class="event-day-list">
          ${bucket.events.map(eventCard).join("")}
        </div>
      </section>
    `,
    );

  container.innerHTML = sections.join("");
};
