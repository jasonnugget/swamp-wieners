import * as tf from "./tensorflow";
import "@tensorflow/tfjs-backend-webgpu";
import type { ModelBundle, Network, Sample } from "../shared/types";
import { predict } from "../shared/model";
export interface CalibrationResult {
  backend: string;
  elapsedMs: number;
  trainingCount: number;
  validationCount: number;
  testCount: number;
  beforeMae: number;
  afterMae: number;
  weights: number[][];
  bias: number[];
  mean: number[];
  std: number[];
  modelVersion: string;
  target: "heat" | "soil";
  trainedAt: string;
  siteId: string;
  loss: number[];
}
let ready: Promise<string> | undefined;
export function initialize() {
  ready ??= (async () => {
    for (const name of ["webgpu", "webgl", "cpu"]) {
      try {
        if (await tf.setBackend(name)) {
          await tf.ready();
          return tf.getBackend();
        }
      } catch {
        /* Try the next real backend. */
      }
    }
    throw new Error("No browser ML backend available");
  })();
  return ready;
}
export async function probeTraining() {
  await initialize();
  for (const backend of [tf.getBackend(), "webgl", "cpu"]) {
    let model: tf.Sequential | undefined;
    let x: tf.Tensor2D | undefined;
    let y: tf.Tensor2D | undefined;
    try {
      if (tf.getBackend() !== backend) {
        await tf.setBackend(backend);
        await tf.ready();
      }
      model = tf.sequential();
      model.add(
        tf.layers.dense({
          units: 1,
          inputShape: [3],
          kernelInitializer: "zeros",
        }),
      );
      model.compile({
        optimizer: tf.train.sgd(0.02),
        loss: "meanSquaredError",
      });
      x = tf.tensor2d([
        [1, 0, 1],
        [0, 1, 1],
      ]);
      y = tf.tensor2d([[1], [2]]);
      await model.fit(x, y, { epochs: 1, batchSize: 2, verbose: 0 });
      return tf.getBackend();
    } catch {
      /* A complete update, not backend detection, decides training support. */
    } finally {
      model?.optimizer?.dispose();
      model?.dispose();
      x?.dispose();
      y?.dispose();
    }
  }
  throw new Error("Browser training unavailable");
}
function input(network: Network, x: number[]) {
  return x.map((v, i) => (v - network.mean[i]) / network.std[i]);
}
export async function runBrowserInference(network: Network, rows: Sample[]) {
  await initialize();
  const model = tf.sequential();
  network.layers.forEach((layer, i) =>
    model.add(
      tf.layers.dense({
        units: layer.bias.length,
        ...(i === 0 ? { inputShape: [network.mean.length] } : {}),
        activation: i < network.layers.length - 1 ? "relu" : "linear",
      }),
    ),
  );
  const weights = network.layers.flatMap((layer) => [
    tf.tensor2d(layer.weights),
    tf.tensor1d(layer.bias),
  ]);
  model.setWeights(weights);
  weights.forEach((t) => t.dispose());
  const x = tf.tensor2d(rows.map((r) => input(network, r.x))),
    start = performance.now();
  const out = model.predict(x) as tf.Tensor2D;
  const data = await out.array();
  const elapsed = performance.now() - start;
  out.dispose();
  x.dispose();
  model.dispose();
  const predictions = data.map((r, i) => {
    const p = r
      .map(
        (v) =>
          v * network.targetScale +
          network.targetOffset +
          (network.residual ? rows[i].baselineHeat : 0),
      )
      .sort((a, b) => a - b);
    p[0] -= network.intervalAdjustment;
    p[2] += network.intervalAdjustment;
    return p;
  });
  const maxDifference = Math.max(
    ...predictions.flatMap((p, i) =>
      p.map((v, j) =>
        Math.abs(v - predict(network, rows[i].x, rows[i].baselineHeat)[j]),
      ),
    ),
  );
  return { predictions, elapsed, backend: tf.getBackend(), maxDifference };
}
export async function calibrate(
  bundle: ModelBundle,
  samples: Sample[],
  siteId: string,
  target: "heat" | "soil",
  onEpoch: (epoch: number, loss: number) => void,
): Promise<CalibrationResult> {
  const backend = await probeTraining(),
    start = performance.now(),
    network = bundle[target];
  const train = samples.filter((r) => r.split === "train"),
    validation = samples.filter((r) => r.split === "validation"),
    test = samples.filter((r) => r.split === "test");
  if (train.length < 20 || validation.length < 10 || test.length < 10)
    throw new Error("Insufficient disjoint historical samples");
  const base = (s: Sample) => predict(network, s.x, s.baselineHeat)[1];
  const raw = (s: Sample) => [base(s) / network.targetScale, s.x[7], s.x[8]];
  const tx = train.map(raw),
    mean = tx[0].map((_, j) => tx.reduce((a, r) => a + r[j], 0) / tx.length),
    std = mean.map((m, j) =>
      Math.max(
        0.001,
        Math.sqrt(tx.reduce((a, r) => a + (r[j] - m) ** 2, 0) / tx.length),
      ),
    );
  const xx = (rows: Sample[]) =>
    tf.tensor2d(rows.map((s) => raw(s).map((v, i) => (v - mean[i]) / std[i])));
  const yy = (rows: Sample[]) =>
    tf.tensor2d(rows.map((s) => [(s[target] - base(s)) / network.targetScale]));
  const x = xx(train),
    y = yy(train),
    vx = xx(validation),
    vy = yy(validation);
  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      units: 1,
      inputShape: [3],
      kernelInitializer: "zeros",
      biasInitializer: "zeros",
    }),
  );
  model.compile({ optimizer: tf.train.sgd(0.025), loss: "meanSquaredError" });
  let best = Infinity,
    bestWeights: tf.Tensor[] = [];
  const loss: number[] = [];
  try {
    await model.fit(x, y, {
      epochs: 35,
      batchSize: 32,
      validationData: [vx, vy],
      shuffle: false,
      verbose: 0,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          const l = Number(logs?.loss);
          loss.push(l);
          onEpoch(epoch + 1, l);
          const value = Number(logs?.val_loss);
          if (value < best) {
            best = value;
            bestWeights.forEach((w) => w.dispose());
            bestWeights = model.getWeights().map((w) => w.clone());
          }
          await tf.nextFrame();
        },
      },
    });
    model.setWeights(bestWeights);
    const testX = xx(test),
      out = model.predict(testX) as tf.Tensor2D;
    const residual = await out.array();
    out.dispose();
    testX.dispose();
    const beforeMae =
      test.reduce((a, s) => a + Math.abs(s[target] - base(s)), 0) / test.length;
    const afterMae =
      test.reduce(
        (a, s, i) =>
          a +
          Math.abs(
            s[target] - (base(s) + residual[i][0] * network.targetScale),
          ),
        0,
      ) / test.length;
    const tensors = model.getWeights();
    const weights = (await tensors[0].array()) as number[][],
      bias = (await tensors[1].array()) as number[];
    return {
      backend,
      elapsedMs: performance.now() - start,
      trainingCount: train.length,
      validationCount: validation.length,
      testCount: test.length,
      beforeMae,
      afterMae,
      weights,
      bias,
      mean,
      std,
      modelVersion: bundle.version,
      target,
      trainedAt: new Date().toISOString(),
      siteId,
      loss,
    };
  } finally {
    [x, y, vx, vy, ...bestWeights].forEach((t) => t.dispose());
    model.optimizer.dispose();
    model.dispose();
  }
}
export function correctedPrediction(
  result: CalibrationResult,
  bundle: ModelBundle,
  sample: Sample,
) {
  const n = bundle[result.target],
    base = predict(n, sample.x, sample.baselineHeat)[1],
    raw = [base / n.targetScale, sample.x[7], sample.x[8]];
  return (
    base +
    (result.bias[0] +
      raw.reduce(
        (sum, v, i) =>
          sum + ((v - result.mean[i]) / result.std[i]) * result.weights[i][0],
        0,
      )) *
      n.targetScale
  );
}
export async function saveCalibration(result: CalibrationResult) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("planit-models", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("calibrations");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("calibrations", "readwrite");
    tx.objectStore("calibrations").put(
      result,
      `${result.siteId}:${result.target}`,
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function loadCalibration(
  siteId: string,
  target: string,
): Promise<CalibrationResult | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("planit-models", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("calibrations");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return new Promise((resolve, reject) => {
    const r = db
      .transaction("calibrations")
      .objectStore("calibrations")
      .get(`${siteId}:${target}`);
    r.onsuccess = () => {
      db.close();
      resolve(r.result);
    };
    r.onerror = () => {
      db.close();
      reject(r.error);
    };
  });
}
