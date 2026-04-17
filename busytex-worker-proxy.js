/*
  Local same-origin worker wrapper for BusyTeX.
  Pipeline and runtime assets are vendored under /vendor/busytex.
*/
self.importScripts("./vendor/busytex/busytex_pipeline.js");

self.pipeline = null;

self.onmessage = async ({ data }) => {
  const {
    files,
    main_tex_path,
    bibtex,
    busytex_wasm,
    busytex_js,
    preload_data_packages_js,
    data_packages_js,
    texmf_local,
    preload,
    verbose,
    driver,
  } = data;

  if (busytex_wasm && busytex_js && preload_data_packages_js) {
    try {
      self.pipeline = new BusytexPipeline(
        busytex_js,
        busytex_wasm,
        data_packages_js,
        preload_data_packages_js,
        texmf_local,
        (msg) => postMessage({ print: msg }),
        (initialized) => postMessage({ initialized }),
        preload,
        BusytexPipeline.ScriptLoaderWorker
      );
    } catch (error) {
      postMessage({
        exception:
          "Exception during initialization: " +
          error.toString() +
          "\nStack:\n" +
          error.stack,
      });
    }
    return;
  }

  if (files && self.pipeline) {
    try {
      const result = await self.pipeline.compile(
        files,
        main_tex_path,
        bibtex,
        verbose,
        driver,
        data_packages_js
      );
      postMessage(result);
    } catch (error) {
      postMessage({
        exception:
          "Exception during compilation: " +
          error.toString() +
          "\nStack:\n" +
          error.stack,
      });
    }
  }
};
