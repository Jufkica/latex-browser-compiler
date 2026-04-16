import { BusyTexRunner, PdfLatex } from "https://unpkg.com/texlyre-busytex@0.1.4-alpha/dist/index.js";

const texInput = document.getElementById("texInput");
const compileBtn = document.getElementById("compileBtn");
const downloadBtn = document.getElementById("downloadBtn");
const loadExampleBtn = document.getElementById("loadExampleBtn");
const logOutput = document.getElementById("logOutput");
const pdfContainer = document.getElementById("pdfContainer");
const statusText = document.getElementById("statusText");

const BUSYTEX_BASE_PATH = "https://texlyre.github.io/texlyre-busytex/core/busytex";
const DEFAULT_TEX = `\\documentclass{article}
\\title{BusyTeX Browser Compile}
\\author{GitHub Pages Static App}
\\date{\\today}
\\begin{document}
\\maketitle
Hello from BusyTeX in your browser.
\\end{document}
`;

let runner = null;
let compiler = null;
let pdfBlobUrl = null;

function setStatus(text) {
  statusText.textContent = text;
}

function setLog(text) {
  logOutput.textContent = text || "";
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
  setStatus("Initializing BusyTeX...");
  setLog("Loading BusyTeX WebAssembly runtime...");
  compileBtn.disabled = true;

  try {
    runner = new BusyTexRunner({
      busytexBasePath: BUSYTEX_BASE_PATH,
      verbose: false,
    });
    await runner.initialize(true);
    compiler = new PdfLatex(runner);

    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
    setStatus("Ready");
    setLog("BusyTeX ready. Click Compile.");
  } catch (error) {
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
  if (!runner || !runner.isInitialized() || !compiler) {
    setLog("Engine is not ready yet.");
    return;
  }

  setButtonsCompiling(true);
  setStatus("Compiling...");
  setLog("Compiling...");

  try {
    const result = await compiler.compile({
      input: texInput.value,
      verbose: "info",
    });
    setLog(result.log || "");

    if (result.success && result.pdf) {
      setPdfPreview(result.pdf);
      setStatus("Success");
    } else {
      setStatus(`Failed (${result.exitCode})`);
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
  if (runner) {
    runner.terminate();
  }
});

initEngine();
