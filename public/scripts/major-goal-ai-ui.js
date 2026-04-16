export const createMajorGoalAiUi = ({
  output,
  importInput,
  status,
  buildButton,
  copyButton,
  validateButton,
  applyButton,
  clearButton,
  onBuildPrompt,
  onValidateImport,
  onApplyImport,
  onPersist,
}) => {
  let validatedPlan = null;

  const setStatus = (text, kind = "neutral") => {
    status.dataset.kind = kind;
    status.textContent = text;
  };

  const clearValidation = () => {
    validatedPlan = null;
    applyButton.disabled = true;
  };

  const copyToClipboard = async () => {
    if (!output.value.trim()) {
      setStatus("Build a major-goal prompt first, then copy it.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(output.value);
      setStatus("Major-goal prompt copied.", "success");
    } catch {
      output.focus();
      output.select();
      const copied = document.execCommand("copy");
      setStatus(copied ? "Major-goal prompt copied." : "Clipboard blocked. Copy manually.", copied ? "success" : "warning");
    }
  };

  buildButton.addEventListener("click", () => {
    buildButton.disabled = true;
    setStatus("Building major-goal prompt...", "neutral");
    Promise.resolve(onBuildPrompt())
      .then((prompt) => {
        if (!String(prompt || "").trim()) {
          throw new Error("No prompt was generated.");
        }
        output.value = prompt;
        clearValidation();
        onPersist({
          lastPrompt: prompt,
          lastImportText: importInput.value,
        });
        setStatus("Major-goal prompt built.", "success");
      })
      .catch((error) => {
        setStatus(`Prompt build failed: ${error.message}`, "error");
      })
      .finally(() => {
        buildButton.disabled = false;
        if (typeof buildButton.blur === "function") buildButton.blur();
      });
  });

  copyButton.addEventListener("click", () => {
    copyToClipboard();
  });

  validateButton.addEventListener("click", () => {
    const result = onValidateImport(importInput.value);
    if (!result.ok || !result.plan) {
      clearValidation();
      setStatus(result.errors.join(" "), "error");
      return;
    }
    validatedPlan = result.plan;
    const warningText = result.warnings.length ? ` Warnings: ${result.warnings.join(" ")}` : "";
    if (validatedPlan.status === "proposals_ready") {
      applyButton.disabled = false;
      setStatus(`JSON looks valid and ready to insert.${warningText}`, "success");
    } else {
      applyButton.disabled = true;
      setStatus(`Draft is valid but still in progress. Continue AI Q&A, then paste final proposals_ready JSON.${warningText}`, "warning");
    }
    onPersist({
      lastPrompt: output.value,
      lastImportText: importInput.value,
    });
  });

  applyButton.addEventListener("click", () => {
    if (!validatedPlan) {
      setStatus("Validate major-goal JSON before inserting.", "warning");
      return;
    }
    try {
      const summary = onApplyImport(validatedPlan);
      clearValidation();
      setStatus(`Major-goal AI result applied: ${summary}.`, "success");
      onPersist({
        lastPrompt: output.value,
        lastImportText: importInput.value,
        lastAppliedAt: new Date().toISOString(),
        lastApplySummary: summary,
      });
    } catch (error) {
      setStatus(`Major-goal AI blocked: ${error.message}`, "error");
    }
  });

  clearButton.addEventListener("click", () => {
    output.value = "";
    importInput.value = "";
    clearValidation();
    onPersist({
      lastPrompt: "",
      lastImportText: "",
      lastAppliedAt: "",
      lastApplySummary: "",
    });
    setStatus("Major-goal AI fields cleared.", "neutral");
  });

  importInput.addEventListener("input", () => {
    clearValidation();
  });

  return {
    hydrateSavedState: (saved) => {
      output.value = saved?.lastPrompt || "";
      importInput.value = saved?.lastImportText || "";
      if (saved?.lastApplySummary) {
        setStatus(`Last applied: ${saved.lastApplySummary}.`, "neutral");
      }
    },
    setStatus,
    clearValidation,
  };
};
