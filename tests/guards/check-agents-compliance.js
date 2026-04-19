const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

const CONFIG = {
  maxAverageCodeLines: 300,
  maxLinesPerFile: 300,
  codeExtensions: new Set([".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx", ".css", ".html"]),
  scanRoots: ["public", "cloudflare", "tests", "docs"],
  ignorePrefixes: ["node_modules/", ".git/", "tests/visual/screenshots/", "tests/visual/baselines/"],
  oversizeAllowlist: new Set(),
  allowedMarkdownOutsideDocs: new Set(["AGENTS.md", "CODEBASE_TREE.md", "DEPLOYMENT.md"]),
};

const posix = (value) => value.split(path.sep).join("/");

const isIgnored = (relPath) => {
  const normalized = posix(relPath);
  return CONFIG.ignorePrefixes.some((prefix) => normalized.startsWith(prefix));
};

const walkFiles = (startDir) => {
  const output = [];
  if (!fs.existsSync(startDir)) return output;
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      const relPath = posix(path.relative(repoRoot, fullPath));
      if (isIgnored(relPath)) return;
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      output.push({ fullPath, relPath });
    });
  }
  return output;
};

const countLines = (fullPath) => {
  const content = fs.readFileSync(fullPath, "utf8");
  if (!content) return 0;
  return content.split(/\r?\n/).length;
};

const getScannedFiles = () => {
  const files = [];
  CONFIG.scanRoots.forEach((root) => {
    files.push(...walkFiles(path.join(repoRoot, root)));
  });
  return files;
};

const getAllRepoFiles = () => walkFiles(repoRoot);

const printHeader = (title) => {
  process.stdout.write(`\n[AGENTS CHECK] ${title}\n`);
};

const printList = (rows) => {
  rows.forEach((row) => process.stdout.write(` - ${row}\n`));
};

const run = () => {
  const errors = [];
  const warnings = [];
  const scannedFiles = getScannedFiles();
  const codeFiles = scannedFiles.filter((file) => CONFIG.codeExtensions.has(path.extname(file.relPath).toLowerCase()));
  const lineStats = codeFiles.map((file) => ({ ...file, lines: countLines(file.fullPath) }));
  const totalLines = lineStats.reduce((sum, file) => sum + file.lines, 0);
  const avgLines = lineStats.length ? totalLines / lineStats.length : 0;

  if (!fs.existsSync(path.join(repoRoot, "CODEBASE_TREE.md"))) {
    errors.push("Missing CODEBASE_TREE.md (required by AGENTS.md).");
  }

  if (avgLines > CONFIG.maxAverageCodeLines) {
    errors.push(
      `Average code file length is ${avgLines.toFixed(1)} lines (limit: ${CONFIG.maxAverageCodeLines}).`,
    );
  }

  const oversizeFiles = lineStats
    .filter((file) => file.lines > CONFIG.maxLinesPerFile)
    .sort((left, right) => right.lines - left.lines);

  const disallowedOversize = oversizeFiles.filter((file) => !CONFIG.oversizeAllowlist.has(file.relPath));
  if (disallowedOversize.length) {
    errors.push(
      `Found ${disallowedOversize.length} oversized code file(s) above ${CONFIG.maxLinesPerFile} lines outside allowlist.`,
    );
  }

  const allFiles = getAllRepoFiles();
  const htmlOutsidePublic = allFiles
    .filter((file) => path.extname(file.relPath).toLowerCase() === ".html")
    .filter((file) => !file.relPath.startsWith("public/"))
    .map((file) => file.relPath)
    .sort((a, b) => a.localeCompare(b));
  if (htmlOutsidePublic.length) {
    errors.push("Found .html files outside public/ (deployable site files must stay under public/).");
  }

  const markdownOutsideDocs = allFiles
    .filter((file) => path.extname(file.relPath).toLowerCase() === ".md")
    .filter((file) => !file.relPath.startsWith("docs/"))
    .map((file) => file.relPath)
    .filter((relPath) => !CONFIG.allowedMarkdownOutsideDocs.has(relPath))
    .sort((a, b) => a.localeCompare(b));
  if (markdownOutsideDocs.length) {
    errors.push("Found markdown docs outside docs/ that are not explicitly allowed.");
  }

  printHeader("Summary");
  process.stdout.write(` - Scanned code files: ${lineStats.length}\n`);
  process.stdout.write(` - Average lines/file: ${avgLines.toFixed(1)}\n`);
  process.stdout.write(` - Oversized files (> ${CONFIG.maxLinesPerFile}): ${oversizeFiles.length}\n`);

  if (oversizeFiles.length) {
    printHeader("Oversized Files");
    printList(
      oversizeFiles.map((file) => {
        const allowed = CONFIG.oversizeAllowlist.has(file.relPath) ? "allowlisted" : "NOT allowlisted";
        return `${file.lines} lines | ${file.relPath} | ${allowed}`;
      }),
    );
  }

  if (disallowedOversize.length) {
    printHeader("Disallowed Oversized Files");
    printList(disallowedOversize.map((file) => `${file.lines} lines | ${file.relPath}`));
  }

  if (htmlOutsidePublic.length) {
    printHeader("HTML Outside public/");
    printList(htmlOutsidePublic);
  }

  if (markdownOutsideDocs.length) {
    printHeader("Markdown Outside docs/");
    printList(markdownOutsideDocs);
  }

  if (warnings.length) {
    printHeader("Warnings");
    printList(warnings);
  }

  if (errors.length) {
    printHeader("Failures");
    printList(errors);
    process.exitCode = 1;
    return;
  }

  printHeader("Pass");
  process.stdout.write(" - AGENTS.md structure and line-count guard checks passed.\n");
};

run();
