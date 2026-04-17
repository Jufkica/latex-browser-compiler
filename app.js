const texInput = document.getElementById("texInput");
const compileBtn = document.getElementById("compileBtn");
const downloadBtn = document.getElementById("downloadBtn");
const loadExampleBtn = document.getElementById("loadExampleBtn");
const logOutput = document.getElementById("logOutput");
const pdfContainer = document.getElementById("pdfContainer");
const statusText = document.getElementById("statusText");
const startupOverlay = document.getElementById("startupOverlay");
const startupMessage = document.getElementById("startupMessage");
const startupDetail = document.getElementById("startupDetail");
const logPanel = document.getElementById("logPanel");
const logToggle = document.getElementById("logToggle");

const BUSYTEX_BASE_PATH = "https://texlyre.github.io/texlyre-busytex/core/busytex";
const BUSYTEX_DRIVER = "xetex_bibtex8_dvipdfmx";
const COMPILE_PASSES = 2;
const DEFAULT_TEX = `\\documentclass{article}
\\title{BusyTeX Browser Compile}
\\author{GitHub Pages Static App}
\\date{\\today}
\\begin{document}
\\maketitle
Hello from BusyTeX in your browser.
\\end{document}
`;

let busyWorker = null;
let workerReady = false;
let pdfBlobUrl = null;

function setStatus(text) {
  statusText.textContent = text;
}

function setStartupState(visible, title = "", detail = "") {
  if (!startupOverlay) return;
  startupOverlay.classList.toggle("hidden", !visible);
  if (startupMessage && title) startupMessage.textContent = title;
  if (startupDetail && detail) startupDetail.textContent = detail;
}

function setLog(text) {
  logOutput.textContent = text || "";
}

function appendLog(text) {
  if (!text) return;
  logOutput.textContent = `${logOutput.textContent || ""}\n${text}`.trim();
}

function syncLogPanelAria() {
  if (!logToggle || !logPanel) return;
  const collapsed = logPanel.classList.contains("log-panel--collapsed");
  logToggle.setAttribute("aria-expanded", String(!collapsed));
}

function setLogPanelCollapsed(collapsed) {
  if (!logPanel) return;
  logPanel.classList.toggle("log-panel--collapsed", collapsed);
  syncLogPanelAria();
}

function setButtonsCompiling(isCompiling) {
  compileBtn.disabled = isCompiling;
  compileBtn.textContent = isCompiling ? "Compiling..." : "Compile";
  loadExampleBtn.disabled = isCompiling;
}

function revokePdfUrl() {
  if (pdfBlobUrl) {
    URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = null;
  }
}

function setPdfPreview(pdfBytes) {
  revokePdfUrl();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  pdfBlobUrl = URL.createObjectURL(blob);
  pdfContainer.innerHTML = `<embed src="${pdfBlobUrl}" type="application/pdf">`;
  downloadBtn.disabled = false;
}

function enableXcolorTableSupport(texSource) {
  if (!/\\rowcolor\b/.test(texSource)) {
    return { source: texSource, changed: false };
  }

  const xcolorPattern = /\\usepackage(?:\[([^\]]*)\])?\{xcolor\}/;
  const xcolorMatch = texSource.match(xcolorPattern);
  if (xcolorMatch) {
    const currentOptions = (xcolorMatch[1] || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (currentOptions.includes("table")) {
      return { source: texSource, changed: false };
    }

    const updatedOptions = [...currentOptions, "table"].join(",");
    const replacement = `\\usepackage[${updatedOptions}]{xcolor}`;
    return {
      source: texSource.replace(xcolorPattern, replacement),
      changed: true,
    };
  }

  const docclassPattern = /(\\documentclass(?:\[[^\]]*\])?\{[^}]+\})/;
  if (!docclassPattern.test(texSource)) {
    return { source: texSource, changed: false };
  }

  return {
    source: texSource.replace(docclassPattern, `$1\n\\usepackage[table]{xcolor}`),
    changed: true,
  };
}

function applyCompatibilityFixes(texSource, compileLog) {
  let source = texSource;
  const notes = [];
  const rowcolorUndefinedPattern = /Undefined control sequence[\s\S]*\\rowcolor/;
  if (rowcolorUndefinedPattern.test(compileLog || "")) {
    const result = enableXcolorTableSupport(source);
    if (result.changed) {
      source = result.source;
      notes.push("Auto-enabled `xcolor` table support for `\\rowcolor`.");
    }
  }
  return { source, notes };
}

function runCompilePass(texSource) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Compilation timed out"));
    }, 120000);

    busyWorker.onmessage = ({ data }) => {
      if (data?.print) {
        appendLog(data.print);
        return;
      }
      if (data?.exception) {
        clearTimeout(timeout);
        reject(new Error(data.exception));
        return;
      }
      if (data && Object.prototype.hasOwnProperty.call(data, "pdf")) {
        clearTimeout(timeout);
        resolve(data);
      }
    };

    busyWorker.onerror = (event) => {
      clearTimeout(timeout);
      reject(new Error(event.message || "Worker compilation error"));
    };

    busyWorker.postMessage({
      files: [{ path: "main.tex", contents: texSource }],
      main_tex_path: "main.tex",
      bibtex: null,
      verbose: "info",
      driver: BUSYTEX_DRIVER,
      data_packages_js: null,
    });
  });
}

function getInitPayload() {
  const texliveBasic = `${BUSYTEX_BASE_PATH}/texlive-basic.js`;
  const texliveExtra = `${BUSYTEX_BASE_PATH}/texlive-extra.js`;
  return {
    busytex_js: `${BUSYTEX_BASE_PATH}/busytex.js`,
    busytex_wasm: `${BUSYTEX_BASE_PATH}/busytex.wasm`,
    preload_data_packages_js: [texliveBasic, texliveExtra],
    data_packages_js: [texliveBasic],
    texmf_local: [],
    preload: true,
  };
}

async function initEngine() {
  texInput.value = DEFAULT_TEX;
  setStatus("Initializing BusyTeX...");
  setLog("Loading BusyTeX worker runtime...");
  setStartupState(true, "Initializing BusyTeX", "Preparing in-browser runtime...");
  compileBtn.disabled = true;

  try {
    setStartupState(true, "Starting worker", "Creating isolated compile environment...");
    busyWorker = new Worker("./busytex-worker-proxy.js");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for BusyTeX worker initialization"));
      }, 120000);

      busyWorker.onmessage = ({ data }) => {
        if (data?.initialized) {
          clearTimeout(timeout);
          resolve();
        } else if (data?.exception) {
          clearTimeout(timeout);
          reject(new Error(data.exception));
        }
      };

      busyWorker.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message || "Worker initialization error"));
      };

      setStartupState(true, "Downloading BusyTeX assets", "Fetching TeX runtime and package indexes...");
      busyWorker.postMessage(getInitPayload());
    });

    workerReady = true;
    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
    setStatus("Ready");
    setLog("BusyTeX ready (XeLaTeX mode). Click Compile.");
    setStartupState(true, "Runtime ready", "Initialization complete.");
    setTimeout(() => setStartupState(false), 450);
  } catch (error) {
    workerReady = false;
    setStatus("Error");
    setLog(
      "BusyTeX failed to initialize.\n" +
      `${String(error)}\n\n` +
      "The runtime assets are loaded from:\n" +
      `${BUSYTEX_BASE_PATH}`
    );
    setStartupState(true, "Initialization failed", "See Compiler Log for details.");
    compileBtn.disabled = true;
    setLogPanelCollapsed(false);
  }
}

async function compileCurrentTex() {
  if (!busyWorker || !workerReady) {
    setLog("Engine is not ready yet.");
    return;
  }

  setButtonsCompiling(true);
  setStatus("Compiling (pass 1/2)...");
  setLog("Compiling...");

  try {
    let sourceToCompile = texInput.value;
    let result = null;
    let lastNonZeroExit = null;
    const passLogs = [];
    const compatibilityNotes = [];

    for (let pass = 1; pass <= COMPILE_PASSES; pass += 1) {
      setStatus(`Compiling (pass ${pass}/${COMPILE_PASSES})...`);
      result = await runCompilePass(sourceToCompile);
      passLogs.push(`--- Pass ${pass}/${COMPILE_PASSES} ---\n${result.log || ""}`.trim());

      if (result.exit_code !== 0) {
        lastNonZeroExit = result.exit_code;
        if (pass === 1) {
          const fixResult = applyCompatibilityFixes(sourceToCompile, result.log || "");
          if (fixResult.source !== sourceToCompile) {
            sourceToCompile = fixResult.source;
            compatibilityNotes.push(...fixResult.notes);
            passLogs.push("Applied compatibility fix. Retrying compilation...");
            continue;
          }
        }
        break;
      }
    }

    const combinedLog = [...compatibilityNotes, ...passLogs].join("\n\n").trim();
    setLog(combinedLog || logOutput.textContent || "");

    if (result?.exit_code === 0 && result.pdf) {
      setPdfPreview(result.pdf);
      setStatus("Success");
    } else {
      setStatus(`Failed (${lastNonZeroExit ?? "unknown"})`);
      downloadBtn.disabled = true;
      setLogPanelCollapsed(false);
    }
  } catch (error) {
    setStatus("Error");
    setLog(`Compilation failed.\n${String(error)}`);
    downloadBtn.disabled = true;
    setLogPanelCollapsed(false);
  } finally {
    setButtonsCompiling(false);
  }
}

function downloadPdf() {
  if (!pdfBlobUrl) {
    return;
  }
  const link = document.createElement("a");
  link.href = pdfBlobUrl;
  link.download = "main.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function loadTemplate() {
  texInput.value = DEFAULT_TEX;
  setStatus("Template loaded");
  setLog("Loaded built-in template.");
}

compileBtn.addEventListener("click", compileCurrentTex);
downloadBtn.addEventListener("click", downloadPdf);
loadExampleBtn.addEventListener("click", loadTemplate);
logToggle?.addEventListener("click", () => {
  logPanel?.classList.toggle("log-panel--collapsed");
  syncLogPanelAria();
});
syncLogPanelAria();
window.addEventListener("beforeunload", () => {
  revokePdfUrl();
  if (busyWorker) {
    busyWorker.terminate();
    busyWorker = null;
  }
});

initEngine();
