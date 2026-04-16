const toMinutes = (time) => {
  const [hour, minute] = String(time || "").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const hasOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

const isoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromIso = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveMajorGoalId = (item, majorByTitle) => {
  if (item.majorGoalId) return item.majorGoalId;
  const byTitle = majorByTitle.get(String(item.majorGoalTitle || "").toLowerCase());
  return byTitle?.id || "";
};

const resolveMinorGoalId = (item, minorByTitle) => {
  if (item.minorGoalId) return item.minorGoalId;
  const byTitle = minorByTitle.get(String(item.minorGoalTitle || "").toLowerCase());
  return byTitle?.id || "";
};

const plannedHabitCountByWeek = ({ rollingPlan, habits }) => {
  const habitByName = new Map((habits || []).map((item) => [String(item.name || "").toLowerCase(), item]));
  const counter = new Map();
  rollingPlan.forEach((day) => {
    const date = dateFromIso(day.date);
    if (!date) return;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const weekKey = isoDate(weekStart);
    day.items.forEach((item) => {
      if (item.type !== "habit") return;
      const habit = habitByName.get(String(item.title || "").toLowerCase());
      if (!habit) return;
      const key = `${habit.id}|${weekKey}`;
      counter.set(key, (counter.get(key) || 0) + 1);
    });
  });
  return counter;
};

export const validateAiRollingPlan = ({ plan, week }) => {
  if (plan?.kind !== "rolling_v3") return { ok: true, errors: [], warnings: [], plan };
  const errors = [];
  const warnings = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expectedStart = new Date(now);
  expectedStart.setDate(now.getDate() + 1);
  const expectedStartIso = isoDate(expectedStart);
  const days = Array.isArray(plan.rollingPlan) ? plan.rollingPlan : [];

  if (days.length !== 7) errors.push("rollingPlan must contain exactly 7 days.");
  if (days[0]?.date !== expectedStartIso) {
    errors.push(`rollingPlan must start tomorrow (${expectedStartIso}).`);
  }

  for (let i = 1; i < days.length; i += 1) {
    const prev = dateFromIso(days[i - 1].date);
    const curr = dateFromIso(days[i].date);
    if (!prev || !curr) continue;
    const expected = new Date(prev);
    expected.setDate(prev.getDate() + 1);
    if (isoDate(expected) !== days[i].date) errors.push("rollingPlan dates must be continuous.");
  }

  const majorByTitle = new Map((week.goals || []).map((item) => [String(item.title || "").toLowerCase(), item]));
  const normalizedMinor = (plan.minorGoals || []).map((item, index) => ({
    ...item,
    id: item.id || `mgoal_${index + 1}`,
    majorGoalId: resolveMajorGoalId(item, majorByTitle),
  }));
  normalizedMinor.forEach((item) => {
    if (!item.majorGoalId) errors.push(`Minor goal "${item.title}" is not linked to a major goal.`);
  });

  const minorByTitle = new Map(normalizedMinor.map((item) => [String(item.title || "").toLowerCase(), item]));
  const normalizedTasks = (plan.tasks || []).map((item) => ({
    ...item,
    minorGoalId: resolveMinorGoalId(item, minorByTitle),
  }));
  normalizedTasks.forEach((item) => {
    if (!item.minorGoalId) errors.push(`Task "${item.title}" is not linked to a minor goal.`);
  });

  normalizedMinor.forEach((minor) => {
    const linkedTasks = normalizedTasks.filter((task) => task.minorGoalId === minor.id);
    if (!linkedTasks.length) errors.push(`Minor goal "${minor.title}" requires at least one task.`);
  });

  const wakeMin = toMinutes(week.profile?.wakeTime || "06:00");
  const sleepMin = toMinutes(week.profile?.sleepTime || "22:00");
  const commitmentsByDate = new Map();
  (week.profile?.commitments || []).forEach((item) => {
    if (item.mode !== "one_off" || !item.date) return;
    if (!commitmentsByDate.has(item.date)) commitmentsByDate.set(item.date, []);
    commitmentsByDate.get(item.date).push(item);
  });

  days.forEach((day) => {
    const commitmentList = commitmentsByDate.get(day.date) || [];
    const slots = [];
    day.items.forEach((item) => {
      const start = toMinutes(item.start);
      const end = toMinutes(item.end);
      if (start == null || end == null) return;
      if (wakeMin != null && sleepMin != null && (start < wakeMin || end > sleepMin)) {
        errors.push(`${day.date}: "${item.title}" is outside daily rhythm.`);
      }
      commitmentList.forEach((commitment) => {
        const cStart = toMinutes(commitment.start);
        const cEnd = toMinutes(commitment.end);
        if (cStart == null || cEnd == null) return;
        if (item.type !== "commitment" && hasOverlap(start, end, cStart, cEnd)) {
          errors.push(`${day.date}: "${item.title}" overlaps commitment "${commitment.title}".`);
        }
      });
      const collides = slots.some((slot) => hasOverlap(start, end, slot.start, slot.end));
      if (collides) errors.push(`${day.date}: overlapping plan items detected.`);
      slots.push({ start, end });
    });
  });

  const habitCounter = plannedHabitCountByWeek({
    rollingPlan: days,
    habits: week.habits || [],
  });
  (week.habits || []).forEach((habit) => {
    const hasAnyWeek = [...habitCounter.keys()].some((key) => key.startsWith(`${habit.id}|`));
    if (!hasAnyWeek && Number(habit.frequency || 0) > 0) {
      warnings.push(`Habit "${habit.name}" was not scheduled in rolling plan output.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    plan: {
      ...plan,
      minorGoals: normalizedMinor,
      tasks: normalizedTasks,
    },
  };
};
