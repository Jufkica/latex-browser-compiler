"""
tex_compiler.py — LaTeX → PDF compiler using Tectonic (no LaTeX install needed)
Tectonic is a self-contained engine that auto-downloads only the packages your
document uses, from the CTAN mirror network.
"""

import sys
import os
import subprocess
import threading
import shutil
import argparse
import urllib.request
import zipfile
import tarfile
import platform
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import ttk, filedialog, scrolledtext, messagebox
    TK_AVAILABLE = True
    TK_IMPORT_ERROR = None
except ModuleNotFoundError as exc:
    tk = None
    ttk = filedialog = scrolledtext = messagebox = None
    TK_AVAILABLE = False
    TK_IMPORT_ERROR = exc

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR   = Path(__file__).resolve().parent
TECTONIC_DIR = SCRIPT_DIR / "tectonic_bin"
TECTONIC_EXE = TECTONIC_DIR / ("tectonic.exe" if platform.system() == "Windows" else "tectonic")

# ---------------------------------------------------------------------------
# Tectonic release URL (Windows x86-64 pre-built binary from GitHub)
# ---------------------------------------------------------------------------
TECTONIC_VERSION = "0.15.0"
TECTONIC_URLS = {
    "Windows": (
        f"https://github.com/tectonic-typesetting/tectonic/releases/download/"
        f"tectonic%40{TECTONIC_VERSION}/"
        f"tectonic-{TECTONIC_VERSION}-x86_64-pc-windows-msvc.zip"
    ),
    "Linux": (
        f"https://github.com/tectonic-typesetting/tectonic/releases/download/"
        f"tectonic%40{TECTONIC_VERSION}/"
        f"tectonic-{TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz"
    ),
    "Darwin": (
        f"https://github.com/tectonic-typesetting/tectonic/releases/download/"
        f"tectonic%40{TECTONIC_VERSION}/"
        f"tectonic-{TECTONIC_VERSION}-x86_64-apple-darwin.tar.gz"
    ),
}


# ---------------------------------------------------------------------------
# Tectonic download / extraction helpers
# ---------------------------------------------------------------------------

def _download_with_progress(url: str, dest: Path, progress_cb=None):
    """Stream-download url → dest, calling progress_cb(bytes_done, total) each chunk."""
    with urllib.request.urlopen(url) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        done  = 0
        with open(dest, "wb") as fh:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                fh.write(chunk)
                done += len(chunk)
                if progress_cb:
                    progress_cb(done, total)


def ensure_tectonic(log_cb=None, progress_cb=None) -> bool:
    """
    Make sure tectonic binary exists in TECTONIC_DIR.
    Downloads and extracts it on first run.
    Returns True on success.
    """
    if TECTONIC_EXE.exists():
        return True

    system = platform.system()
    url = TECTONIC_URLS.get(system)
    if not url:
        if log_cb:
            log_cb(f"[ERROR] Unsupported OS: {system}\n")
        return False

    TECTONIC_DIR.mkdir(parents=True, exist_ok=True)
    archive_name = url.split("/")[-1]
    archive_path  = TECTONIC_DIR / archive_name

    if log_cb:
        log_cb(f"[INFO] Downloading Tectonic {TECTONIC_VERSION} for {system}…\n")

    try:
        _download_with_progress(url, archive_path, progress_cb)
    except Exception as exc:
        if log_cb:
            log_cb(f"[ERROR] Download failed: {exc}\n")
        return False

    # Extract
    try:
        if archive_name.endswith(".zip"):
            with zipfile.ZipFile(archive_path) as zf:
                zf.extractall(TECTONIC_DIR)
        else:
            with tarfile.open(archive_path) as tf:
                tf.extractall(TECTONIC_DIR)
    except Exception as exc:
        if log_cb:
            log_cb(f"[ERROR] Extraction failed: {exc}\n")
        return False
    finally:
        archive_path.unlink(missing_ok=True)

    if not TECTONIC_EXE.exists():
        # Archives can include nested directories. Locate binary recursively.
        exe_name = "tectonic.exe" if system == "Windows" else "tectonic"
        candidates = [p for p in TECTONIC_DIR.rglob(exe_name) if p.is_file()]
        if not candidates:
            candidates = [
                p for p in TECTONIC_DIR.rglob("tectonic*")
                if p.is_file() and not p.suffix
            ]
        if candidates:
            TECTONIC_EXE.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(candidates[0]), str(TECTONIC_EXE))

    # Make executable on Unix
    if system != "Windows" and TECTONIC_EXE.exists():
        TECTONIC_EXE.chmod(0o755)

    if log_cb:
        log_cb("[INFO] Tectonic ready.\n")
    return TECTONIC_EXE.exists()


# ---------------------------------------------------------------------------
# Compilation
# ---------------------------------------------------------------------------

def compile_tex(tex_path: Path, out_dir: Path, log_cb=None, done_cb=None,
                keep_intermediates: bool = False, synctex: bool = False,
                extra_args: list[str] | None = None):
    """
    Run tectonic on *tex_path*, write PDF to *out_dir*.
    All callbacks are called from the worker thread — the GUI must use .after().
    """
    if not TECTONIC_EXE.exists():
        if log_cb:
            log_cb("[ERROR] Tectonic binary not found. Download it first.\n")
        if done_cb:
            done_cb(False)
        return

    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(TECTONIC_EXE),
        "--outdir", str(out_dir),
        "--print",                      # stream log to stdout
    ]
    if keep_intermediates:
        cmd += ["--keep-intermediates", "--keep-logs"]
    if synctex:
        cmd += ["--synctex"]
    if extra_args:
        cmd += extra_args
    cmd.append(str(tex_path))

    if log_cb:
        log_cb(f"[CMD] {' '.join(cmd)}\n\n")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        for line in proc.stdout:
            if log_cb:
                log_cb(line)
        proc.wait()
        success = proc.returncode == 0
    except Exception as exc:
        if log_cb:
            log_cb(f"[ERROR] {exc}\n")
        success = False

    if done_cb:
        done_cb(success)


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

if TK_AVAILABLE:
    class App(tk.Tk):
        def __init__(self):
            super().__init__()
            self.title("TeX → PDF  (Tectonic, no LaTeX install)")
            self.resizable(True, True)
            self.minsize(700, 520)
            self._busy = False

            self._build_ui()
            self._check_tectonic_status()

        # ------------------------------------------------------------------
        def _build_ui(self):
            pad = dict(padx=8, pady=4)

            # ── Top bar: tectonic status ────────────────────────────────────
            status_frame = ttk.Frame(self)
            status_frame.pack(fill="x", **pad)

            ttk.Label(status_frame, text="Tectonic engine:").pack(side="left")
            self._status_lbl = ttk.Label(status_frame, text="checking…", foreground="gray")
            self._status_lbl.pack(side="left", padx=6)

            self._dl_btn = ttk.Button(status_frame, text="Download engine",
                                      command=self._download_tectonic)
            self._dl_btn.pack(side="right")

            # ── File selection ──────────────────────────────────────────────
            file_frame = ttk.LabelFrame(self, text="Input / Output")
            file_frame.pack(fill="x", **pad)

            ttk.Label(file_frame, text=".tex file:").grid(row=0, column=0, sticky="w", **pad)
            self._tex_var = tk.StringVar()
            ttk.Entry(file_frame, textvariable=self._tex_var, width=55).grid(
                row=0, column=1, sticky="ew", **pad)
            ttk.Button(file_frame, text="Browse…", command=self._browse_tex).grid(
                row=0, column=2, **pad)

            ttk.Label(file_frame, text="Output dir:").grid(row=1, column=0, sticky="w", **pad)
            self._out_var = tk.StringVar()
            ttk.Entry(file_frame, textvariable=self._out_var, width=55).grid(
                row=1, column=1, sticky="ew", **pad)
            ttk.Button(file_frame, text="Browse…", command=self._browse_out).grid(
                row=1, column=2, **pad)
            file_frame.columnconfigure(1, weight=1)

            # ── Options ─────────────────────────────────────────────────────
            opt_frame = ttk.LabelFrame(self, text="Options")
            opt_frame.pack(fill="x", **pad)

            self._keep_var   = tk.BooleanVar(value=False)
            self._synctex_var = tk.BooleanVar(value=False)
            self._open_var   = tk.BooleanVar(value=True)

            ttk.Checkbutton(opt_frame, text="Keep intermediates (.aux, .log …)",
                            variable=self._keep_var).pack(side="left", **pad)
            ttk.Checkbutton(opt_frame, text="SyncTeX",
                            variable=self._synctex_var).pack(side="left", **pad)
            ttk.Checkbutton(opt_frame, text="Open PDF when done",
                            variable=self._open_var).pack(side="left", **pad)

            # ── Progress bar ────────────────────────────────────────────────
            self._progress = ttk.Progressbar(self, mode="indeterminate")
            self._progress.pack(fill="x", padx=8, pady=2)

            # ── Log ─────────────────────────────────────────────────────────
            log_frame = ttk.LabelFrame(self, text="Compiler output")
            log_frame.pack(fill="both", expand=True, **pad)

            self._log = scrolledtext.ScrolledText(log_frame, height=16, state="disabled",
                                                  font=("Consolas", 9), wrap="none")
            self._log.pack(fill="both", expand=True)

            # colour tags
            self._log.tag_config("ok",    foreground="#00aa00")
            self._log.tag_config("err",   foreground="#cc0000")
            self._log.tag_config("info",  foreground="#0055cc")
            self._log.tag_config("plain", foreground="black")

            # ── Bottom buttons ───────────────────────────────────────────────
            btn_frame = ttk.Frame(self)
            btn_frame.pack(fill="x", **pad)

            self._compile_btn = ttk.Button(btn_frame, text="▶  Compile", width=14,
                                           command=self._start_compile)
            self._compile_btn.pack(side="left", padx=4)

            ttk.Button(btn_frame, text="Clear log", command=self._clear_log).pack(side="left")
            ttk.Button(btn_frame, text="Open output folder",
                       command=self._open_outdir).pack(side="right")

        # ------------------------------------------------------------------
        # Tectonic status helpers
        # ------------------------------------------------------------------

        def _check_tectonic_status(self):
            if TECTONIC_EXE.exists():
                self._status_lbl.config(text=f"✓  found  ({TECTONIC_EXE})", foreground="green")
                self._dl_btn.config(state="disabled")
            else:
                self._status_lbl.config(text="✗  not found — click Download", foreground="red")
                self._dl_btn.config(state="normal")

        def _download_tectonic(self):
            if self._busy:
                return
            self._busy = True
            self._dl_btn.config(state="disabled")
            self._progress.start(10)
            self._log_write("[INFO] Starting Tectonic download…\n", "info")

            def _progress_cb(done, total):
                if total:
                    pct = done / total * 100
                    self.after(0, lambda: self._log_write(
                        f"\r  {done//1024} / {total//1024} KB  ({pct:.0f}%)", "info"))

            def _worker():
                ok = ensure_tectonic(
                    log_cb=lambda msg: self.after(0, lambda m=msg: self._log_write(m, "info")),
                    progress_cb=_progress_cb,
                )
                self.after(0, lambda: self._dl_done(ok))

            threading.Thread(target=_worker, daemon=True).start()

        def _dl_done(self, ok: bool):
            self._progress.stop()
            self._busy = False
            self._check_tectonic_status()
            if ok:
                self._log_write("\n[OK] Tectonic downloaded successfully.\n", "ok")
            else:
                self._log_write("\n[ERROR] Download failed — check your connection.\n", "err")

        # ------------------------------------------------------------------
        # File browsing
        # ------------------------------------------------------------------

        def _browse_tex(self):
            path = filedialog.askopenfilename(
                title="Select .tex file",
                filetypes=[("LaTeX files", "*.tex"), ("All files", "*.*")]
            )
            if path:
                self._tex_var.set(path)
                if not self._out_var.get():
                    self._out_var.set(str(Path(path).parent / "out"))

        def _browse_out(self):
            path = filedialog.askdirectory(title="Select output directory")
            if path:
                self._out_var.set(path)

        # ------------------------------------------------------------------
        # Compilation
        # ------------------------------------------------------------------

        def _start_compile(self):
            if self._busy:
                return

            tex_path = self._tex_var.get().strip()
            out_dir  = self._out_var.get().strip()

            if not tex_path:
                messagebox.showwarning("No file", "Please select a .tex file first.")
                return
            if not Path(tex_path).exists():
                messagebox.showerror("Not found", f"File not found:\n{tex_path}")
                return
            if not TECTONIC_EXE.exists():
                messagebox.showerror("No engine",
                                     "Tectonic not found.\nClick 'Download engine' first.")
                return

            out_dir = out_dir or str(Path(tex_path).parent / "out")
            self._out_var.set(out_dir)

            self._busy = True
            self._compile_btn.config(state="disabled")
            self._progress.start(10)
            self._log_write(f"[INFO] Compiling: {tex_path}\n", "info")

            tex_p = Path(tex_path)
            out_p = Path(out_dir)

            def _done_cb(success: bool):
                self.after(0, lambda: self._compile_done(success, tex_p, out_p))

            def _log_cb(msg: str):
                tag = "err" if ("error" in msg.lower() or "fatal" in msg.lower()) else "plain"
                self.after(0, lambda m=msg, t=tag: self._log_write(m, t))

            threading.Thread(
                target=compile_tex,
                kwargs=dict(
                    tex_path=tex_p,
                    out_dir=out_p,
                    log_cb=_log_cb,
                    done_cb=_done_cb,
                    keep_intermediates=self._keep_var.get(),
                    synctex=self._synctex_var.get(),
                ),
                daemon=True,
            ).start()

        def _compile_done(self, success: bool, tex_p: Path, out_p: Path):
            self._progress.stop()
            self._busy = False
            self._compile_btn.config(state="normal")

            if success:
                pdf = out_p / (tex_p.stem + ".pdf")
                self._log_write(f"\n✓  Done!  PDF → {pdf}\n", "ok")
                if self._open_var.get() and pdf.exists():
                    self._open_file(pdf)
            else:
                self._log_write("\n✗  Compilation failed — see log above.\n", "err")

        # ------------------------------------------------------------------
        # Log helpers
        # ------------------------------------------------------------------

        def _log_write(self, msg: str, tag: str = "plain"):
            self._log.config(state="normal")
            self._log.insert("end", msg, tag)
            self._log.see("end")
            self._log.config(state="disabled")

        def _clear_log(self):
            self._log.config(state="normal")
            self._log.delete("1.0", "end")
            self._log.config(state="disabled")

        # ------------------------------------------------------------------
        # Misc
        # ------------------------------------------------------------------

        def _open_outdir(self):
            out = self._out_var.get().strip()
            if out and Path(out).exists():
                self._open_file(Path(out))
            else:
                messagebox.showinfo("Nothing to open", "Output directory does not exist yet.")

        @staticmethod
        def _open_file(path: Path):
            if platform.system() == "Windows":
                os.startfile(path)
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", str(path)])
            else:
                subprocess.Popen(["xdg-open", str(path)])


def _run_cli(args: argparse.Namespace) -> int:
    """CLI fallback for environments without tkinter."""
    def _prompt(text: str) -> str:
        try:
            return input(text)
        except EOFError:
            return ""

    if args.download_engine:
        ok = ensure_tectonic(log_cb=lambda msg: print(msg, end=""))
        return 0 if ok else 1

    if args.tex:
        tex_path = Path(args.tex).expanduser().resolve()
        out_dir = Path(args.outdir).expanduser().resolve() if args.outdir else tex_path.parent / "out"
        success_box = {"ok": False}
        compile_tex(
            tex_path=tex_path,
            out_dir=out_dir,
            log_cb=lambda msg: print(msg, end=""),
            done_cb=lambda ok: success_box.__setitem__("ok", ok),
            keep_intermediates=args.keep_intermediates,
            synctex=args.synctex,
        )
        return 0 if success_box["ok"] else 1

    if not TK_AVAILABLE:
        print("[WARN] tkinter is not available in this Python environment.")
        print(f"[DETAIL] {TK_IMPORT_ERROR}")
        print("[INFO] Starting interactive CLI mode.")
        print("[INFO] Press Enter on .tex path to cancel.")
        print()

        if not TECTONIC_EXE.exists():
            answer = _prompt("Download Tectonic engine now? [Y/n]: ").strip().lower()
            if answer in ("", "y", "yes"):
                ok = ensure_tectonic(log_cb=lambda msg: print(msg, end=""))
                if not ok:
                    print("[ERROR] Could not prepare Tectonic engine.")
                    return 1
            else:
                print("[INFO] Engine download skipped.")

        tex_raw = _prompt("Path to .tex file: ").strip().strip('"')
        if not tex_raw:
            print("[INFO] Cancelled.")
            return 0

        tex_path = Path(tex_raw).expanduser().resolve()
        if not tex_path.exists():
            print(f"[ERROR] File not found: {tex_path}")
            return 1

        out_raw = _prompt("Output directory (blank = <tex dir>\\out): ").strip().strip('"')
        out_dir = Path(out_raw).expanduser().resolve() if out_raw else tex_path.parent / "out"

        success_box = {"ok": False}
        compile_tex(
            tex_path=tex_path,
            out_dir=out_dir,
            log_cb=lambda msg: print(msg, end=""),
            done_cb=lambda ok: success_box.__setitem__("ok", ok),
            keep_intermediates=False,
            synctex=False,
        )
        if success_box["ok"]:
            print(f"[OK] PDF generated in: {out_dir}")
            return 0
        return 1

    app = App()
    app.mainloop()
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compile TeX files to PDF using Tectonic."
    )
    parser.add_argument("--download-engine", action="store_true",
                        help="Download/extract tectonic engine and exit.")
    parser.add_argument("--tex", type=str,
                        help="Path to .tex file to compile (CLI mode).")
    parser.add_argument("--outdir", type=str,
                        help="Output directory for generated PDF.")
    parser.add_argument("--keep-intermediates", action="store_true",
                        help="Keep .aux/.log and other intermediates.")
    parser.add_argument("--synctex", action="store_true",
                        help="Enable SyncTeX output.")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    sys.exit(_run_cli(_parse_args()))
