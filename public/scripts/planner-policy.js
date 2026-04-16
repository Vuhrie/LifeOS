import { toMinutes } from "./planner-time.js";

const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;

const atMinutes = (date, minute) => {
  const next = new Date(date);
  next.setHours(0, minute, 0, 0);
  return next;
};

const parseDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const inDateRange = (date, startDate, endDate) => {
  if (!startDate || !endDate) return false;
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return target >= startDate.getTime() && target <= endDate.getTime();
};

const pickRule = (availabilityRules, day) =>
  availabilityRules.find((rule) => Number(rule.day) === day && !rule.hardBlock) || null;

const toBlock = (date, startMinute, endMinute, source, title) => ({
  start: atMinutes(date, startMinute),
  end: atMinutes(date, endMinute),
  source,
  title,
});

const necessityBlocks = ({ profile, date }) => {
  const wake = toMinutes(profile.wakeTime);
  const sleep = toMinutes(profile.sleepTime);
  const rules = profile.necessities || {};
  const blocks = [];
  const breakfast = rules.breakfast;
  const dinner = rules.dinner;
  const morningShower = rules.morningShower;
  const nightShower = rules.nightShower;
  let breakfastEnd = wake + 30;
  if (breakfast?.enabled) {
    const start = Math.min(wake + 30, sleep - 30);
    breakfastEnd = start + breakfast.durationMinutes;
    blocks.push(toBlock(date, start, breakfastEnd, "necessity", "Breakfast"));
  }
  if (morningShower?.enabled) {
    const start = Math.min(Math.max(wake + 15, breakfastEnd), sleep - 60);
    blocks.push(toBlock(date, start, start + morningShower.durationMinutes, "necessity", "Morning Shower"));
  }
  if (dinner?.enabled) {
    const end = Math.max(wake + 120, sleep - 60);
    blocks.push(toBlock(date, end - dinner.durationMinutes, end, "necessity", "Dinner"));
  }
  if (nightShower?.enabled) {
    const end = Math.max(wake + 60, sleep - 15);
    blocks.push(toBlock(date, end - nightShower.durationMinutes, end, "necessity", "Night Shower"));
  }
  return blocks.filter((block) => block.end > block.start);
};

const commitmentBlocks = ({ profile, date }) =>
  (Array.isArray(profile.commitments) ? profile.commitments : [])
    .filter((item) => {
      if (!item || !item.mode) return false;
      if (item.mode === "weekly_recurring") return Array.isArray(item.days) && item.days.includes(date.getDay());
      if (item.mode === "date_range_recurring") {
        const startDate = parseDate(item.startDate);
        const endDate = parseDate(item.endDate);
        if (!inDateRange(date, startDate, endDate)) return false;
        return Array.isArray(item.days) && item.days.includes(date.getDay());
      }
      if (item.mode === "one_off") {
        const oneOffDate = parseDate(item.date);
        if (!oneOffDate) return false;
        return oneOffDate.getTime() === new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      }
      return false;
    })
    .map((item) => toBlock(date, toMinutes(item.start), toMinutes(item.end), "commitment", item.title || "Commitment"))
    .filter((block) => block.end > block.start);

const subtractWindows = (windows, blocks) => {
  let result = [...windows];
  blocks.forEach((block) => {
    const next = [];
    result.forEach((window) => {
      if (!overlaps(window.start, window.end, block.start, block.end)) {
        next.push(window);
        return;
      }
      if (window.start < block.start) next.push({ ...window, end: block.start });
      if (window.end > block.end) next.push({ ...window, start: block.end });
    });
    result = next.filter((window) => window.end > window.start);
  });
  return result;
};

export const lockExistingSlots = ({ existingSlots, lockedUntil }) =>
  existingSlots
    .filter((slot) => new Date(slot.start) < lockedUntil)
    .map((slot) => ({
      ...slot,
      start: new Date(slot.start),
      end: new Date(slot.end),
      isLocked: true,
    }));

export const buildPlanningWindows = ({
  horizonStart,
  horizonDays,
  profile,
  availabilityRules,
  reservedSlots,
}) => {
  const windows = [];
  const hardBlocks = [];

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = new Date(horizonStart);
    date.setDate(horizonStart.getDate() + offset);
    const weekday = date.getDay();
    const rule = pickRule(availabilityRules, weekday);
    const wake = toMinutes(profile.wakeTime);
    const sleep = toMinutes(profile.sleepTime);
    const dayStart = rule ? Math.max(wake, toMinutes(rule.start)) : wake;
    const dayEnd = rule ? Math.min(sleep, toMinutes(rule.end)) : sleep;
    if (dayEnd <= dayStart) continue;

    const baseWindow = {
      day: weekday,
      date: new Date(date),
      start: atMinutes(date, dayStart),
      end: atMinutes(date, dayEnd),
      maxMinutes: Math.max(0, Number(rule?.maxHours || 0) * 60) || dayEnd - dayStart,
      maxDeepBlocks: Math.max(1, Number(rule?.maxDeepBlocks || 2)),
    };

    const blocks = [
      ...commitmentBlocks({ profile, date }),
      ...necessityBlocks({ profile, date }),
      ...reservedSlots
        .filter((slot) => new Date(slot.start).toDateString() === date.toDateString())
        .map((slot) => ({ start: new Date(slot.start), end: new Date(slot.end), source: "locked", title: slot.title })),
    ].sort((left, right) => left.start - right.start);

    hardBlocks.push(...blocks);
    const split = subtractWindows([baseWindow], blocks);
    split.forEach((item) => {
      const minutes = Math.min(item.maxMinutes, Math.max(0, (item.end - item.start) / 60000));
      if (minutes >= 30) windows.push({ ...item, maxMinutes: minutes });
    });
  }
  return { windows, hardBlocks };
};

export const canKeepExistingSlot = ({ slot, hardBlocks, lockedUntil, horizonStart, horizonEnd }) => {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (start >= horizonEnd || end <= horizonStart) return false;
  if (start < lockedUntil) return true;
  const hitsHard = hardBlocks.some((block) => overlaps(start, end, block.start, block.end));
  return !hitsHard;
};

export const hasOverlap = overlaps;
