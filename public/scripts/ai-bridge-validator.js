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

const inDateRange = (dateText, startDate, endDate) => {
  if (!dateText || !startDate || !endDate) return false;
  return dateText >= startDate && dateText <= endDate;
};

const expandCommitmentsByDate = (commitments, dates) => {
  const byDate = new Map(dates.map((date) => [date, []]));
  (commitments || []).forEach((item) => {
    const mode = String(item?.mode || "weekly_recurring");
    const days = Array.isArray(item?.days) ? item.days.map(Number) : [];
    const title = String(item?.title || "Commitment");
    const start = toMinutes(item?.start);
    const end = toMinutes(item?.end);
    if (start == null || end == null || end <= start) return;
    dates.forEach((dateText) => {
      const date = dateFromIso(dateText);
      if (!date) return;
      const day = date.getDay();
      let include = false;
      if (mode === "weekly_recurring") include = days.includes(day);
      if (mode === "date_range_recurring") include = days.includes(day) && inDateRange(dateText, item?.startDate, item?.endDate);
      if (mode === "one_off") include = dateText === item?.date;
      if (!include) return;
      byDate.get(dateText).push({ title, start, end });
    });
  });
  return byDate;
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

const habitDefinitionMap = (habits) =>
  new Map((habits || []).map((item) => [String(item.name || "").toLowerCase(), item]));

const plannedHabitCountByWeek = ({ rollingPlan, habits }) => {
  const habitByName = new Map((habits || []).map((item) => [String(item.name || "").toLowerCase(), item]));
  const counter = new Map();
  const daysPerWeek = new Map();
  const unknownHabitItems = [];
  rollingPlan.forEach((day) => {
    const date = dateFromIso(day.date);
    if (!date) return;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const weekKey = isoDate(weekStart);
    daysPerWeek.set(weekKey, (daysPerWeek.get(weekKey) || 0) + 1);
    day.items.forEach((item) => {
      if (item.type !== "habit") return;
      const habit = habitByName.get(String(item.title || "").toLowerCase());
      if (!habit) {
        unknownHabitItems.push({ date: day.date, title: String(item.title || "") });
        return;
      }
      const key = `${habit.id}|${weekKey}`;
      counter.set(key, (counter.get(key) || 0) + 1);
    });
  });
  return { counter, daysPerWeek, unknownHabitItems };
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
  const rollingDates = days.map((day) => day.date).filter(Boolean);
  const expandedCommitments = expandCommitmentsByDate(week.profile?.commitments || [], rollingDates);
  expandedCommitments.forEach((value, key) => commitmentsByDate.set(key, value));
  const dismissedGoogleIds = new Set(
    (week.dismissedGoogleCommitmentIds || []).map((item) => String(item || "")).filter(Boolean),
  );

  days.forEach((day) => {
    const commitmentList = commitmentsByDate.get(day.date) || [];
    const slots = [];
    const habitDailyCounter = new Map();
    const habitsByName = habitDefinitionMap(week.habits || []);
    day.items.forEach((item) => {
      const start = toMinutes(item.start);
      const end = toMinutes(item.end);
      if (start == null || end == null) return;
      if (wakeMin != null && sleepMin != null && (start < wakeMin || end > sleepMin)) {
        errors.push(`${day.date}: "${item.title}" is outside daily rhythm.`);
      }
      commitmentList.forEach((commitment) => {
        if (item.type !== "commitment" && hasOverlap(start, end, commitment.start, commitment.end)) {
          errors.push(`${day.date}: "${item.title}" overlaps commitment "${commitment.title}".`);
        }
      });
      if (item.type === "habit") {
        const key = String(item.title || "").toLowerCase();
        habitDailyCounter.set(key, (habitDailyCounter.get(key) || 0) + 1);
        const habit = habitsByName.get(key);
        if (habit) {
          const expected = Math.max(15, Number(habit.durationMinutes || 0));
          const actual = end - start;
          if (expected > 0 && actual !== expected) {
            errors.push(`${day.date}: habit "${item.title}" duration must be ${expected} minutes, got ${actual}.`);
          }
        }
      }
      if (item.type === "commitment" && item.sourceId && dismissedGoogleIds.has(String(item.sourceId))) {
        errors.push(`${day.date}: "${item.title}" references a dismissed Google event and must not be reintroduced.`);
      }
      const collides = slots.some((slot) => hasOverlap(start, end, slot.start, slot.end));
      if (collides) errors.push(`${day.date}: overlapping plan items detected.`);
      slots.push({ start, end });
    });
    habitDailyCounter.forEach((count, title) => {
      if (count > 1) errors.push(`${day.date}: habit "${title}" is scheduled more than once in a day.`);
    });
  });

  const habitSummary = plannedHabitCountByWeek({
    rollingPlan: days,
    habits: week.habits || [],
  });
  habitSummary.unknownHabitItems.forEach((item) => {
    errors.push(`${item.date}: habit "${item.title}" is not defined in planner habits.`);
  });
  (week.habits || []).forEach((habit) => {
    const frequency = Math.max(0, Number(habit.frequency || 0));
    const habitKeys = [...habitSummary.counter.keys()].filter((key) => key.startsWith(`${habit.id}|`));
    if (!habitKeys.length && frequency > 0) warnings.push(`Habit "${habit.name}" was not scheduled in rolling plan output.`);
    const weekRuns = [];
    days.forEach((day) => {
      const dayDate = dateFromIso(day.date);
      if (!dayDate) return;
      const hasHabit = (day.items || []).some(
        (item) => item.type === "habit" && String(item.title || "").toLowerCase() === String(habit.name || "").toLowerCase(),
      );
      weekRuns.push({ date: day.date, hasHabit });
    });
    for (let i = 2; i < weekRuns.length; i += 1) {
      if (weekRuns[i - 2].hasHabit && weekRuns[i - 1].hasHabit && weekRuns[i].hasHabit) {
        warnings.push(`Habit "${habit.name}" is scheduled three consecutive days (${weekRuns[i - 2].date} to ${weekRuns[i].date}).`);
      }
    }
    habitKeys.forEach((key) => {
      const weekKey = key.split("|")[1] || "";
      const count = habitSummary.counter.get(key) || 0;
      const daysInWeekPortion = habitSummary.daysPerWeek.get(weekKey) || 0;
      const partialWeekCap = Math.ceil((frequency * daysInWeekPortion) / 7);
      const hardCap = Math.min(frequency, Math.max(0, partialWeekCap));
      if (frequency === 0 && count > 0) {
        errors.push(`Habit "${habit.name}" has frequency 0 but was scheduled ${count} times in week ${weekKey}.`);
      }
      if (frequency > 0 && count > hardCap) {
        errors.push(`Habit "${habit.name}" exceeds allowed placements in week ${weekKey}: ${count} scheduled, cap ${hardCap}.`);
      }
    });
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
