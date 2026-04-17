const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const isAiManaged = (item) => {
  const source = normalizeKey(item?.source || "ai");
  return !source || source === "ai" || source === "ai_assisted";
};

const list = (value) => (Array.isArray(value) ? value : []);

export const cleanupPlannerWeek = (week, { clearDraftOnChange = true } = {}) => {
  if (!week || typeof week !== "object") {
    return { changed: false, removedMinorGoals: 0, removedTasks: 0, clearedDraft: false };
  }

  const goalIds = new Set(list(week.goals).map((item) => String(item?.id || "")).filter(Boolean));
  const originalMinorGoals = list(week.minorGoals);
  const keptMinorGoals = originalMinorGoals.filter((item) => {
    const majorGoalId = String(item?.majorGoalId || "");
    if (!isAiManaged(item)) return true;
    return majorGoalId && goalIds.has(majorGoalId);
  });

  const keptMinorIds = new Set(keptMinorGoals.map((item) => String(item?.id || "")).filter(Boolean));
  const removedMinorIds = new Set(
    originalMinorGoals
      .filter((item) => !keptMinorGoals.includes(item))
      .map((item) => String(item?.id || ""))
      .filter(Boolean),
  );
  const removedMinorTitles = new Set(
    originalMinorGoals
      .filter((item) => !keptMinorGoals.includes(item))
      .map((item) => normalizeKey(item?.title))
      .filter(Boolean),
  );

  const originalTasks = list(week.tasks);
  const keptTasks = originalTasks.filter((item) => {
    if (!isAiManaged(item)) return true;
    if (item?.habitId) return true;

    const majorGoalId = String(item?.majorGoalId || "");
    const minorGoalId = String(item?.minorGoalId || "");
    const minorGoalTitle = normalizeKey(item?.minorGoalTitle);

    if (majorGoalId && !goalIds.has(majorGoalId)) return false;
    if (minorGoalId) return keptMinorIds.has(minorGoalId);
    if (minorGoalTitle && removedMinorTitles.has(minorGoalTitle)) return false;

    // AI tasks must belong to a minor goal. If no link exists, the task is stale.
    return false;
  });

  const removedTaskIds = new Set(
    originalTasks
      .filter((item) => !keptTasks.includes(item))
      .map((item) => String(item?.id || ""))
      .filter(Boolean),
  );
  const removedTaskTitles = new Set(
    originalTasks
      .filter((item) => !keptTasks.includes(item))
      .map((item) => normalizeKey(item?.title))
      .filter(Boolean),
  );

  const removedMinorGoals = originalMinorGoals.length - keptMinorGoals.length;
  const removedTasks = originalTasks.length - keptTasks.length;
  const changed = removedMinorGoals > 0 || removedTasks > 0;
  if (!changed) return { changed: false, removedMinorGoals: 0, removedTasks: 0, clearedDraft: false };

  week.minorGoals = keptMinorGoals;
  week.tasks = keptTasks;

  if (Array.isArray(week.managedSlots)) {
    week.managedSlots = week.managedSlots.filter((slot) => {
      const sourceId = String(slot?.sourceId || "");
      const title = normalizeKey(slot?.title);
      return !removedTaskIds.has(sourceId)
        && !removedMinorIds.has(sourceId)
        && !removedTaskTitles.has(title)
        && !removedMinorTitles.has(title);
    });
  }

  let clearedDraft = false;
  if (clearDraftOnChange && week.draft) {
    week.draft = null;
    clearedDraft = true;
  }

  return { changed: true, removedMinorGoals, removedTasks, clearedDraft };
};
