import { loadLiteRt, loadAndCompile, Tensor, type CompiledModel } from "@litertjs/core";
import { broadGroup, generalName, type Group, type Guess } from "./species-ranking";

const root = "/identification/assets/";
const coral = "coral-104342d/";
const extra = { mammals: "mammals-22b0311", herps: "herps-a3aedbc", arachnids: "arachnids-09b1934", fungus: "fungi-e0e8c0f" } as const;
type Specialist = Exclude<Group, "animal">;
type Model = Specialist | "general";
type Sample = { full: Uint8Array; crop: Uint8Array };
const initialized = loadLiteRt(new URL(root + "litert-2.6.0/", self.location.origin).href, { threads: false, jspi: false });
const labelLists = new Map<Model, string[]>();
let model: CompiledModel | undefined;
let active: Model | undefined;

function files(key: Model) {
  if (key === "general") return [coral + "mobilenet_v2_1.0_224_quant.tflite", coral + "imagenet_labels.txt"];
  if (key === "plant" || key === "bird" || key === "insect")
    return [coral + "mobilenet_v2_1.0_224_inat_" + key + "_quant.tflite", coral + "inat_" + key + "_labels.txt"];
  const folder = extra[key], kind = key === "fungus" ? "fungi" : key;
  return [folder + "/" + kind + "_int8.tflite", folder + "/labels.txt"];
}
async function select(key: Model) {
  await initialized;
  if (key === active && model) return model;
  model?.delete(); model = undefined; active = undefined;
  const [weights, labels] = files(key);
  if (!labelLists.has(key)) {
    const response = await fetch(root + labels);
    if (!response.ok) throw new Error("Tür etiketleri alınamadı.");
    labelLists.set(key, (await response.text()).trimEnd().split(/\r?\n/));
  }
  model = await loadAndCompile(new URL(root + weights, self.location.origin), { accelerator: "wasm" });
  active = key;
  return model;
}
async function classify(key: Model, sample: Sample) {
  const classifier = await select(key);
  const { shape, dtype } = classifier.getInputDetails()[0];
  const pixels = shape[1] === 160 ? sample.crop : sample.full;
  if (dtype !== "uint8" || shape[1] * shape[2] * shape[3] !== pixels.length) throw new Error("Modelin görüntü biçimi uyuşmuyor.");
  const input = new Tensor(pixels, [...shape]);
  const labels = labelLists.get(key)!;
  try {
    const outputs = await classifier.run(input);
    try {
      const values = await outputs[0].data();
      if (values.length !== labels.length) throw new Error("Model ve etiket sayıları uyuşmuyor.");
      return Array.from({length: values.length}, (_, index) => ({
        index, label: labels[index], score: Number(values[index]) / 256,
      })).filter(x => x.score >= 0.01).sort((a,b) => b.score - a.score).slice(0, 20);
    } finally { outputs.forEach(value => value.delete()); }
  } finally { input.delete(); }
}
async function analyze(samples: Sample[]) {
  const results: Guess[][] = samples.map(() => []);
  const requests = new Map<Specialist, {index: number; weight: number}[]>();
  for (const [index, sample] of samples.entries()) {
    const mass = new Map<Specialist, number>();
    for (const cat of await classify("general", sample)) {
      const group = broadGroup(cat.index);
      if (!group || group === "other") continue;
      const name = generalName(cat.index, cat.label);
      if (name) results[index].push({name, group, score: cat.score});
      if (group !== "animal") mass.set(group, (mass.get(group) || 0) + cat.score);
    }
    const ranked = [...mass].sort((a,b) => b[1] - a[1]);
    for (const [group, weight] of ranked.slice(0, 2)) {
      if (weight < .12 || weight < ranked[0][1] * .35) continue;
      const matches = requests.get(group) || [];
      matches.push({ index, weight: Math.min(1, weight) }); requests.set(group, matches);
    }
  }
  for (const [group, matches] of requests) {
    for (const {index, weight} of matches) {
      for (const cat of await classify(group, samples[index])) {
        const name = cat.label.split(" (")[0];
        if (/^[A-Z][a-z-]+ [a-z][a-z-]+/.test(name)) results[index].push({name, group, score: cat.score * weight});
      }
    }
  }
  return results;
}
self.onmessage = async (event: MessageEvent<Sample[]>) => {
  try { self.postMessage({ results: await analyze(event.data) }); }
  catch (err) { self.postMessage({ error: err instanceof Error ? err.message : String(err) }); }
};
