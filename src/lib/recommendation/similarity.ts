export function cosineSimilarity(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(1, score));
}
