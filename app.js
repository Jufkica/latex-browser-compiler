const texInput = document.getElementById("texInput");
const compileBtn = document.getElementById("compileBtn");
const downloadBtn = document.getElementById("downloadBtn");
const loadExampleBtn = document.getElementById("loadExampleBtn");
const logOutput = document.getElementById("logOutput");
const pdfContainer = document.getElementById("pdfContainer");
const statusText = document.getElementById("statusText");

const BUSYTEX_BASE_PATH = "https://texlyre.github.io/texlyre-busytex/core/busytex";
const BUSYTEX_DRIVER = "pdftex_bibtex8";
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

function setLog(text) {
  logOutput.textContent = text || "";
}

function appendLog(text) {
  if (!text) return;
  logOutput.textContent = `${logOutput.textContent || ""}\n${text}`.trim();
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
  compileBtn.disabled = true;

  try {
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

      busyWorker.postMessage(getInitPayload());
    });

    workerReady = true;
    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
    setStatus("Ready");
    setLog("BusyTeX ready. Click Compile.");
  } catch (error) {
    workerReady = false;
    setStatus("Error");
    setLog(
      "BusyTeX failed to initialize.\n" +
      `${String(error)}\n\n` +
      "The runtime assets are loaded from:\n" +
      `${BUSYTEX_BASE_PATH}`
    );
    compileBtn.disabled = true;
  }
}

async function compileCurrentTex() {
  if (!busyWorker || !workerReady) {
    setLog("Engine is not ready yet.");
    return;
  }

  setButtonsCompiling(true);
  setStatus("Compiling...");
  setLog("Compiling...");

  try {
    const result = await new Promise((resolve, reject) => {
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
        files: [{ path: "main.tex", contents: texInput.value }],
        main_tex_path: "main.tex",
        bibtex: null,
        verbose: "info",
        driver: BUSYTEX_DRIVER,
        data_packages_js: null,
      });
    });
    setLog(result.log || logOutput.textContent || "");

    if (result.exit_code === 0 && result.pdf) {
      setPdfPreview(result.pdf);
      setStatus("Success");
    } else {
      setStatus(`Failed (${result.exit_code})`);
      downloadBtn.disabled = true;
    }
  } catch (error) {
    setStatus("Error");
    setLog(`Compilation failed.\n${String(error)}`);
    downloadBtn.disabled = true;
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
window.addEventListener("beforeunload", () => {
  revokePdfUrl();
  if (busyWorker) {
    busyWorker.terminate();
    busyWorker = null;
  }
});

initEngine();
