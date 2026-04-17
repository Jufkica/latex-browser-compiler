# LaTeX Browser Compiler

In-browser LaTeX to PDF compiler and editor, fully static and GitHub Pages compatible.

Live page: [https://jufkica.github.io/latex-browser-compiler/](https://jufkica.github.io/latex-browser-compiler/)

No backend server is required for web mode. Compilation runs directly in the browser using WebAssembly.

## Features

- Compile `.tex` to PDF in the browser
- Live PDF preview
- Download generated PDF
- Load a built-in starter template
- Uses BusyTeX (`texlyre-busytex`) instead of SwiftLaTeX
- Deployable on GitHub Pages (static hosting only)

## Project Structure

```text
.
├── index.html                # Web UI entry point
├── styles.css                # UI styles
├── app.js                    # Compile/preview/download logic
├── .github/workflows/pages.yml  # Pages deploy workflow
├── tex_compiler.py           # Optional desktop Python app
├── setup_and_run.bat         # Optional desktop launcher
└── README.md
```

## GitHub Pages Deployment

1. Create a GitHub repository and push this project.
2. Open repo **Settings -> Pages**.
3. Under **Build and deployment**:
   - Source: `GitHub Actions`
4. Save and wait for deployment.
5. Open the generated Pages URL.

## Usage

1. Open the web app.
2. Click **Load template** (optional).
3. Edit LaTeX in the text area.
4. Click **Compile**.
5. View PDF preview and click **Download PDF**.

## Notes

- First compile can be slower due to runtime/package initialization.
- Browser mode is fully client-side.
- Keep the tab open to benefit from in-session cache behavior.
- BusyTeX runtime assets are vendored in this repository under:
  `vendor/busytex`

## Optional Desktop Mode

This repo also includes a local desktop workflow:

- `tex_compiler.py` (Python app, GUI if `tkinter` is available)
- `setup_and_run.bat` (Windows helper script)

Use this only if you want an offline desktop app flow in addition to the web app.

## License

This repository includes third-party engine/runtime files for browser compilation.
Review upstream license terms before redistributing commercially.
