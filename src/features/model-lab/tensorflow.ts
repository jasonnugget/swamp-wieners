// Import only the runtime and layers used here; the umbrella package also ships
// unrelated converter/data tooling and its command-line parser dependencies.
import "@tensorflow/tfjs-core/dist/register_all_gradients";
import "@tensorflow/tfjs-core/dist/public/chained_ops/register_all_chained_ops";
import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-backend-webgl";
export * from "@tensorflow/tfjs-core";
export * from "@tensorflow/tfjs-layers";
