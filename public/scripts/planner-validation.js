import { toMinutes } from "./planner-storage.js";

const parseDateOnly = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const validateCommitmentInput = ({
  mode,
  start,
  end,
  date,
  startDate,
  endDate,
  selectedDays,
  applicableDays,
}) => {
  if (toMinutes(end) <= toMinutes(start)) {
    return { ok: false, message: "Commitment end must be after start." };
  }
  if (mode === "one_off") {
    if (!date) return { ok: false, message: "One-off commitments need a date." };
    return { ok: true, days: [] };
  }
  if (mode === "weekly_recurring") {
    if (!selectedDays.length) return { ok: false, message: "Weekly commitments need at least one weekday." };
    return { ok: true, days: selectedDays };
  }
  if (mode === "date_range_recurring") {
    if (!startDate || !endDate) return { ok: false, message: "Date-range commitments need start and end dates." };
    const startParsed = parseDateOnly(startDate);
    const endParsed = parseDateOnly(endDate);
    if (!startParsed || !endParsed || endParsed < startParsed) {
      return { ok: false, message: "Date range is invalid." };
    }
    if (!selectedDays.length) return { ok: false, message: "Select at least one weekday in range." };
    if (applicableDays && applicableDays.size) {
      const validDays = selectedDays.filter((day) => applicableDays.has(day));
      if (!validDays.length) return { ok: false, message: "Selected weekdays are not available in this date range." };
      return { ok: true, days: validDays };
    }
    return { ok: true, days: selectedDays };
  }
  return { ok: false, message: "Unsupported commitment type." };
};
