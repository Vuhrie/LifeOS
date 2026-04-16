export const createAiBridgeUi = ({
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
      setStatus("Build a prompt first, then copy it.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(output.value);
      setStatus("Prompt copied. Paste it into any chatbot.", "success");
    } catch {
      output.focus();
      output.select();
      const copied = document.execCommand("copy");
      setStatus(copied ? "Prompt copied." : "Clipboard blocked. Copy manually.", copied ? "success" : "warning");
    }
  };

  buildButton.addEventListener("click", async () => {
    buildButton.disabled = true;
    setStatus("Building prompt context...", "neutral");
    try {
      const prompt = await onBuildPrompt();
      output.value = prompt;
      clearValidation();
      onPersist({
        lastPrompt: prompt,
        lastImportText: importInput.value,
      });
      setStatus("Prompt built. Ask your AI tool for organized reasoning plus a final fenced JSON block.", "success");
    } catch (error) {
      setStatus(`Prompt build failed: ${error.message}`, "error");
    } finally {
      buildButton.disabled = false;
    }
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
    applyButton.disabled = false;
    const warningText = result.warnings.length ? ` Warnings: ${result.warnings.join(" ")}` : "";
    setStatus(`Import looks valid.${warningText}`, "success");
    onPersist({
      lastPrompt: output.value,
      lastImportText: importInput.value,
    });
  });

  applyButton.addEventListener("click", () => {
    if (!validatedPlan) {
      setStatus("Validate AI JSON before applying.", "warning");
      return;
    }
    try {
      const summary = onApplyImport(validatedPlan);
      clearValidation();
      setStatus(`AI plan applied: ${summary}.`, "success");
      onPersist({
        lastPrompt: output.value,
        lastImportText: importInput.value,
        lastAppliedAt: new Date().toISOString(),
        lastApplySummary: summary,
      });
    } catch (error) {
      setStatus(`AI plan blocked: ${error.message}`, "error");
    }
  });

  clearButton.addEventListener("click", () => {
    output.value = "";
    importInput.value = "";
    clearValidation();
    onPersist({
      lastPrompt: "",
      lastImportText: "",
    });
    setStatus("AI assist fields cleared.", "neutral");
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
  };
};
