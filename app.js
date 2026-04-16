const texInput = document.getElementById("texInput");
const compileBtn = document.getElementById("compileBtn");
const downloadBtn = document.getElementById("downloadBtn");
const loadExampleBtn = document.getElementById("loadExampleBtn");
const logOutput = document.getElementById("logOutput");
const pdfContainer = document.getElementById("pdfContainer");
const statusText = document.getElementById("statusText");

const DEFAULT_TEX = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\title{Browser LaTeX Compile}
\\author{GitHub Pages Static App}
\\date{\\today}
\\begin{document}
\\maketitle
Hello from in-browser compilation.
\\end{document}
`;

let engine = null;
let pdfBlobUrl = null;
const FORMAT_FILE_ERROR = "can't find the format file `swiftlatexpdftex.fmt`";

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

async function initEngine() {
  texInput.value = DEFAULT_TEX;
  setStatus("Initializing engine...");
  setLog("Loading PdfTeX WebAssembly engine...");
  compileBtn.disabled = true;

  try {
    engine = new PdfTeXEngine();
    await engine.loadEngine();
    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
    setStatus("Ready");
    setLog("Engine ready. Click Compile.");
  } catch (error) {
    setStatus("Error");
    setLog(`Engine failed to initialize.\n${String(error)}`);
    compileBtn.disabled = true;
  }
}

async function compileCurrentTex() {
  if (!engine || !engine.isReady()) {
    setLog("Engine is not ready yet.");
    return;
  }

  setButtonsCompiling(true);
  setStatus("Compiling...");
  setLog("Compiling...");

  try {
    engine.writeMemFSFile("main.tex", texInput.value);
    engine.setEngineMainFile("main.tex");
    const result = await engine.compileLaTeX();
    setLog(result.log || "");

    if (result.status === 0 && result.pdf) {
      setPdfPreview(result.pdf);
      setStatus("Success");
    } else {
      setStatus(`Failed (${result.status})`);
      downloadBtn.disabled = true;
      if ((result.log || "").toLowerCase().includes(FORMAT_FILE_ERROR)) {
        setStatus("Mirror unavailable");
        appendLog(
          "[INFO] The upstream SwiftLaTeX TeX mirror is currently unavailable, " +
          "so required format files cannot be downloaded. " +
          "Try again later or use the desktop compiler in this repository."
        );
      }
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

async function loadExample() {
  texInput.value = DEFAULT_TEX;
  setStatus("Template loaded");
  setLog("Loaded built-in template.");
}

compileBtn.addEventListener("click", compileCurrentTex);
downloadBtn.addEventListener("click", downloadPdf);
loadExampleBtn.addEventListener("click", loadExample);
window.addEventListener("beforeunload", revokePdfUrl);

initEngine();
