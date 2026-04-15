const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const mondayOfWeek = (date) => {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
};

const toTimeString = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const dayName = (day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "Day";

export const normalizeTime = (value, fallback) => (TIME_PATTERN.test(value || "") ? value : fallback);

export const toMinutes = (value) => {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return hour * 60 + minute;
};

export const getWeekKey = (date = new Date()) => {
  const year = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = year.getUTCDay() || 7;
  year.setUTCDate(year.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(year.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((year - yearStart) / 86400000) + 1) / 7);
  return `${year.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
};

export const getPlanningWeekKey = (now = new Date()) => {
  const copy = new Date(now);
  if (copy.getDay() === 0 && copy.getHours() >= 22) copy.setDate(copy.getDate() + 1);
  return getWeekKey(copy);
};

export const getWeekStartFromKey = (weekKey) => {
  const [yearStr, weekStr] = weekKey.split("-");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0, 0);
};

export const getDateForDay = (weekStart, day) => {
  const mondayDay = mondayOfWeek(weekStart);
  const offset = day === 0 ? 6 : day - 1;
  const target = new Date(mondayDay);
  target.setDate(mondayDay.getDate() + offset);
  return target;
};

export const buildAvailabilityRulesFromProfile = (profileInput) => {
  const profile = profileInput || {};
  const wake = toMinutes(normalizeTime(profile.wakeTime, "07:00"));
  const sleep = toMinutes(normalizeTime(profile.sleepTime, "22:00"));
  const dayEnd = sleep > wake ? sleep : wake + 60;
  const fixedCommitments = Array.isArray(profile.fixedCommitments) ? profile.fixedCommitments : [];
  return [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const blocks = fixedCommitments
      .filter((item) => Number(item.day) === day)
      .map((item) => ({ start: toMinutes(item.start), end: toMinutes(item.end) }))
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start);
    let cursor = wake;
    let best = { start: wake, end: dayEnd };
    blocks.forEach((block) => {
      const gap = Math.max(0, block.start - cursor);
      if (gap > best.end - best.start) best = { start: cursor, end: block.start };
      cursor = Math.max(cursor, block.end);
    });
    if (dayEnd - cursor > best.end - best.start) best = { start: cursor, end: dayEnd };
    if (best.end <= best.start) best = { start: Math.max(wake, dayEnd - 60), end: dayEnd };
    const minutes = Math.max(60, best.end - best.start);
    const maxHours = Math.max(1, Number((minutes / 60).toFixed(1)));
    return {
      day,
      start: toTimeString(best.start),
      end: toTimeString(best.end),
      maxHours,
      maxDeepBlocks: Math.max(1, Math.min(4, Math.ceil(maxHours / 2))),
      hardBlock: false,
    };
  });
};

