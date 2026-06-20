const GRADIENTS = [
  ["#0a2a1a", "#0d3d22"],  // deep green
  ["#1a140a", "#2a200d"],  // warm amber
  ["#0a1a2a", "#0d2a3d"],  // deep blue
  ["#1a0a1a", "#2a0d2a"],  // deep purple
  ["#1a1a0a", "#2a2a0d"],  // olive
  ["#0a1a1a", "#0d2a2a"],  // teal
]

export function projectGradient(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  const [from, to] = GRADIENTS[hash % GRADIENTS.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}
