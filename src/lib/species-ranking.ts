export type Group = "plant" | "bird" | "insect" | "animal" | "fungus" | "mammals" | "herps" | "arachnids";
export type Guess = { name: string; group: Group; score: number; automatic?: boolean };

export function broadGroup(index: number): Group | "other" | undefined {
  if ((index >= 8 && index <= 25) || (index >= 81 && index <= 101) || (index >= 128 && index <= 147)) return "bird";
  if (index >= 26 && index <= 69) return "herps";
  if (index >= 71 && index <= 79) return "arachnids";
  if (index >= 301 && index <= 327) return "insect";
  if ((index >= 102 && index <= 107) || (index >= 148 && index <= 300) || (index >= 331 && index <= 389)) return "mammals";
  if (index >= 1 && index <= 398) return "animal";
  if ((index >= 992 && index <= 998) || index === 948) return "fungus";
  if ((index >= 937 && index <= 947) || (index >= 949 && index <= 959) || (index >= 985 && index <= 991) || index === 999) return "plant";
  return index > 0 ? "other" : undefined;
}

export function specialistsFor(categories: {index: number; score: number}[]) {
  const mass = new Map<Group, number>();
  for (const category of categories) {
    const group = broadGroup(category.index);
    if (group && group !== "other") mass.set(group, (mass.get(group) || 0) + category.score);
  }
  const ranked = [...mass].filter(([group]) => group !== "animal").sort((a, b) => b[1] - a[1]);
  const selected = ranked.filter(([, score]) => score >= .12 && score >= (ranked[0]?.[1] || 0) * .35)
    .slice(0, 2).map(([group, score]) => ({group: group as Exclude<Group, "animal">, automatic: score >= .35}));
  // ImageNet has few plant classes. A leaf or garden plant may be labelled as a pot or landscape.
  const animalMass = [...mass].filter(([group]) => group !== "plant" && group !== "fungus").reduce((sum, [, score]) => sum + score, 0);
  if (!selected.some(item => item.group === "plant") && animalMass < .65) {
    selected.push({group: "plant", automatic: false});
  }
  return selected;
}

export function generalName(index: number, label: string) {
  if (index >= 282 && index <= 286) return "Felis catus";
  if (index >= 152 && index <= 269) return "Canis familiaris";
  if (index === 333) return "Oryctolagus cuniculus";
  return label.split(", ").find(part => /^[A-Z][a-z-]+ [a-z][a-z-]+$/.test(part));
}

export function rankPhotos(observations: Guess[][]): Guess[] {
  const totals = new Map<string, Guess>();
  for (const row of observations) {
    const best = new Map<string, Guess>();
    for (const item of row) if (item.score > (best.get(item.name)?.score ?? 0)) best.set(item.name, item);
    for (const item of best.values()) {
      const previous = totals.get(item.name);
      totals.set(item.name, { ...item, score: (previous?.score ?? 0) + item.score });
    }
  }
  return [...totals.values()].map(item => ({ ...item, score: item.score / observations.length }))
    .sort((a,b) => b.score - a.score).slice(0, 5);
}

export function confident(guesses: Guess[]): boolean {
  return !!guesses[0] && guesses[0].automatic !== false && guesses[0].score >= 0.8 && guesses[0].score - (guesses[1]?.score ?? 0) >= 0.18;
}
