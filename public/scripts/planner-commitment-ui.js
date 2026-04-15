const parseDateOnly = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const addDays = (date, count) => {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
};

const getDaysInRange = (startDate, endDate) => {
  if (!startDate || !endDate || endDate < startDate) return new Set();
  const days = new Set();
  const spanDays = Math.floor((endDate - startDate) / 86400000);
  for (let offset = 0; offset <= spanDays; offset += 1) days.add(addDays(startDate, offset).getDay());
  return days;
};

const resetDays = (buttons) => {
  buttons.forEach((button) => {
    const isWeekday = ["1", "2", "3", "4", "5"].includes(button.dataset.day || "");
    button.disabled = false;
    button.classList.remove("is-disabled");
    button.classList.toggle("is-selected", isWeekday);
    button.setAttribute("aria-pressed", String(isWeekday));
    button.title = "";
  });
};

const updateChip = (button, selected) => {
  button.classList.toggle("is-selected", selected);
  button.setAttribute("aria-pressed", String(selected));
};

export const createCommitmentTypeUi = (ui) => {
  const dayButtons = [...ui.commitmentDays.querySelectorAll(".day-chip")];
  let applicableDays = new Set([0, 1, 2, 3, 4, 5, 6]);

  const selectedDays = () =>
    dayButtons
      .filter((button) => button.classList.contains("is-selected") && !button.disabled)
      .map((button) => Number(button.dataset.day))
      .filter((value) => Number.isInteger(value));

  const currentMode = () => ui.commitmentType.value;

  const syncApplicabilityHint = () => {
    const mode = currentMode();
    if (mode === "one_off") return;
    if (mode === "weekly_recurring") {
      ui.commitmentWeekdayHint.textContent = "Select at least one day.";
      return;
    }
    const hasRange = ui.commitmentStartDate.value && ui.commitmentEndDate.value;
    if (!hasRange) {
      ui.commitmentWeekdayHint.textContent = "Choose start and end date to enable valid weekdays.";
      return;
    }
    const hasAny = applicableDays.size > 0;
    ui.commitmentWeekdayHint.textContent = hasAny
      ? "Only weekdays that occur in this date range are selectable."
      : "No weekdays available for this range.";
  };

  const updateApplicableDays = () => {
    if (currentMode() !== "date_range_recurring") {
      applicableDays = new Set([0, 1, 2, 3, 4, 5, 6]);
      dayButtons.forEach((button) => {
        button.disabled = false;
        button.classList.remove("is-disabled");
        button.title = "";
      });
      syncApplicabilityHint();
      return;
    }
    const startDate = parseDateOnly(ui.commitmentStartDate.value);
    const endDate = parseDateOnly(ui.commitmentEndDate.value);
    applicableDays = getDaysInRange(startDate, endDate);
    dayButtons.forEach((button) => {
      const day = Number(button.dataset.day);
      const enabled = applicableDays.has(day);
      button.disabled = !enabled;
      button.classList.toggle("is-disabled", !enabled);
      button.title = enabled ? "" : "Not applicable in selected date range";
      if (!enabled) updateChip(button, false);
    });
    syncApplicabilityHint();
  };

  const applyModeVisibility = () => {
    const mode = currentMode();
    const isOneOff = mode === "one_off";
    const isDateRange = mode === "date_range_recurring";
    ui.commitmentDayWrap.hidden = !isOneOff;
    ui.commitmentDateRangeRow.hidden = !isDateRange;
    ui.commitmentWeekdays.hidden = isOneOff;
    if (isOneOff) {
      ui.commitmentStartDate.value = "";
      ui.commitmentEndDate.value = "";
      resetDays(dayButtons);
    }
    if (mode === "weekly_recurring") {
      ui.commitmentDay.value = "";
      resetDays(dayButtons);
    }
    updateApplicableDays();
  };

  const toggleDay = (button) => {
    if (button.disabled) return;
    const active = button.classList.contains("is-selected");
    updateChip(button, !active);
  };

  dayButtons.forEach((button) =>
    button.addEventListener("click", () => {
      toggleDay(button);
    }),
  );

  ui.commitmentType.addEventListener("change", applyModeVisibility);
  [ui.commitmentStartDate, ui.commitmentEndDate].forEach((input) =>
    input.addEventListener("change", updateApplicableDays),
  );

  applyModeVisibility();

  return {
    getSelectedDays: selectedDays,
    getApplicableDays: () => new Set(applicableDays),
    refresh: applyModeVisibility,
  };
};
