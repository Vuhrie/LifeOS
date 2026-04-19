import { buildAiBridgePrompt } from "./ai-bridge-prompts.js";
import { buildPlanningWindows } from "./planner-policy.js";

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toHHMM = (dateLike) => {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
};

const necessityDefinitionsFromProfile = (profile) => {
  const definitions = profile?.necessities || {};
  const labels = {
    breakfast: "Breakfast",
    dinner: "Dinner",
    morningShower: "Morning Shower",
    nightShower: "Night Shower",
  };
  return Object.entries(labels).map(([key, title]) => {
    const value = definitions[key] || {};
    return {
      id: key,
      title,
      enabled: Boolean(value.enabled),
      durationMinutes: Math.max(5, Number(value.durationMinutes || 0)),
    };
  });
};

const isLifeOsManagedCalendarEvent = (event) =>
  Boolean(event?.isLifeOsManaged)
  || String(event?.description || "").includes("lifeos_slot_id:")
  || String(event?.description || "").includes("lifeos_commit_id:")
  || String(event?.title || "").startsWith("[LifeOS]");

const managedCommitWriteIds = (week) =>
  new Set(
    (week?.commitLog || [])
      .flatMap((entry) => Array.isArray(entry?.writes) ? entry.writes : [])
      .map((item) => String(item?.id || ""))
      .filter(Boolean),
  );

export const buildPlannerPromptContext = async ({
  week,
  weekKey,
  writeClient,
  lastAuthStateRef,
  onGoogleContextCaptured,
}) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const rollingDays = Array.from({ length: 7 }).map((_, offset) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const mondayOffset = (date.getDay() + 6) % 7;
    const mondayStart = new Date(date);
    mondayStart.setDate(date.getDate() - mondayOffset);
    return {
      date: toIsoDate(date),
      weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
      mondaySundayWeekStart: toIsoDate(mondayStart),
    };
  });
  const habitRequirements = (week.habits || []).map((habit) => ({
    id: String(habit.id || ""),
    name: String(habit.name || ""),
    frequencyPerWeek: Math.max(0, Number(habit.frequency || 0)),
    durationMinutes: Math.max(15, Number(habit.durationMinutes || 60)),
    preferredWindow: String(habit.window || "anytime"),
    weekModel: "monday_to_sunday",
    maxPerDay: 1,
    frequencyIsHardCap: true,
    preferNonConsecutiveDays: true,
  }));
  const necessityDefinitions = necessityDefinitionsFromProfile(week.profile);
  const dismissedGoogleIds = new Set((week.dismissedGoogleCommitmentIds || []).map((item) => String(item || "")).filter(Boolean));
  const managedIdsFromCommitLog = managedCommitWriteIds(week);
  const ignoredGoogleIds = new Set((week.ignoredGoogleEventIds || []).map((item) => String(item || "")).filter(Boolean));
  const eventsRaw = lastAuthStateRef.current.isSignedIn
    ? await writeClient.fetchExistingEvents({ startIso: start.toISOString(), endIso: end.toISOString() })
    : [];
  const totalEvents = (eventsRaw || []).length;
  const managedEvents = (eventsRaw || []).filter((event) =>
    managedIdsFromCommitLog.has(String(event?.id || "")) || isLifeOsManagedCalendarEvent(event),
  ).length;
  const events = (eventsRaw || []).filter((event) => {
    const eventId = String(event?.id || "");
    if (!eventId) return true;
    return !dismissedGoogleIds.has(eventId)
      && !ignoredGoogleIds.has(eventId)
      && !managedIdsFromCommitLog.has(eventId)
      && !isLifeOsManagedCalendarEvent(event);
  });
  onGoogleContextCaptured?.({
    lastCapturedAt: new Date().toISOString(),
    horizonStartIso: start.toISOString(),
    horizonEndIso: end.toISOString(),
    totalEvents,
    externalEvents: events.length,
    managedEvents,
    dismissedEvents: dismissedGoogleIds.size,
  });
  const promptCommitments = (week.profile.commitments || []).filter((item) => {
    if (String(item.source || "") !== "google_imported") return true;
    const eventId = String(item.googleEventId || "");
    return !eventId || (!dismissedGoogleIds.has(eventId) && !managedIdsFromCommitLog.has(eventId));
  });
  const capacity = buildPlanningWindows({
    horizonStart: start,
    horizonDays: 7,
    profile: week.profile,
    availabilityRules: week.availabilityRules,
    reservedSlots: [],
  });

  return buildAiBridgePrompt({
    definedElements: {
      dailyRhythm: { wakeTime: week.profile.wakeTime, sleepTime: week.profile.sleepTime },
      necessities: week.profile.necessities,
      necessityDefinitions,
      commitments: promptCommitments,
      habits: week.habits,
      habitRequirements,
      majorGoals: week.goals,
    },
    aiManaged: {
      minorGoals: week.minorGoals,
      tasks: week.tasks,
    },
    plannerInputs: week.aiPlannerInputs || {},
    scheduleContext: {
      weekKey,
      rollingStart: start.toISOString(),
      rollingEnd: end.toISOString(),
      existingCalendarEvents: events,
      rollingDays,
      hardBlocks: capacity.hardBlocks.map((item) => ({
        title: item.title,
        start: item.start.toISOString(),
        end: item.end.toISOString(),
        source: item.source,
        durationMinutes: Math.round((item.end - item.start) / 60000),
        startTime: toHHMM(item.start),
        endTime: toHHMM(item.end),
      })),
      necessityDurationByType: necessityDefinitions.map((item) => ({
        id: item.id,
        title: item.title,
        enabled: item.enabled,
        durationMinutes: item.durationMinutes,
      })),
      dailyRhythmByDay: rollingDays.map((item) => ({
        date: item.date,
        wakeTime: week.profile.wakeTime,
        sleepTime: week.profile.sleepTime,
      })),
      capacityByWindow: capacity.windows.map((item) => ({
        start: item.start.toISOString(),
        end: item.end.toISOString(),
        maxMinutes: item.maxMinutes,
      })),
    },
    policy: {
      rollingDays: 7,
      rollingExcludesToday: true,
      restFreeTimePolicy: {
        aiManaged: true,
        manualInputs: false,
        openTimeIsNotAutomaticallyWorkTime: true,
        protectFreeTimeWhenCapacityAllows: true,
        useRestAfterLongCommitments: true,
        useRestAfterGym: true,
        avoidExactBackToBackWhenRealistic: true,
      },
      lunchPolicy: {
        aiManaged: true,
        preferredWindow: "11:30-14:00",
        defaultDurationMinutes: 45,
        includeWhenMiddayIsFree: true,
        ifCoveredByLongCommitment: "assume internal lunch only when realistic and state assumption",
      },
      habitsUseMondaySundayWeek: true,
      habitMaxPerDayDefault: 1,
      habitFrequencyHardCap: true,
      habitPreferNonConsecutiveDays: true,
      dismissedGoogleEventIds: [...dismissedGoogleIds],
      aiMayModify: ["minorGoals", "tasks", "habitExecutionTiming", "necessityExecutionTiming"],
      aiMayNotModify: ["majorGoals", "commitments", "dailyRhythm", "necessityDefinitions", "habitDefinitions"],
    },
  });
};
