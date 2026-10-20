// @ts-nocheck -- runtime adapter uses a browser global initialized on demand.
let pipelinePromise = null;

window.loadLocalBackgroundPipeline = async function () {
  if (!pipelinePromise) {
    pipelinePromise = import("@huggingface/transformers")
      .then(({ pipeline }) => pipeline)
      .catch((error) => {
        pipelinePromise = null;
        throw error;
      });
  }
  return pipelinePromise;
};
