/** Allocate a target score without fractions or exceeding any component's maximum. */
export function allocateIntegerScores(maxima: number[], target: number): number[] {
  const caps = maxima.map(n => Math.max(0, Math.floor(n)));
  const capacity = caps.reduce((a,b) => a+b,0);
  const total = Math.max(0, Math.min(capacity, Math.round(target)));
  if (!capacity) return caps.map(() => 0);
  const exact = caps.map(n => n * total / capacity);
  const result = exact.map(Math.floor);
  let remaining = total - result.reduce((a,b) => a+b,0);
  const order = caps.map((_,i) => i).sort((a,b) => (exact[b]-result[b])-(exact[a]-result[a]));
  for (const i of order) if (remaining && result[i] < caps[i]) { result[i]++; remaining--; }
  return result;
}
