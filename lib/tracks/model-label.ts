// Verified against sunoapi.org record-info param.model on 2026-09-25.
const MODEL_LABELS: Record<string, string> = {
  "chirp-hawk": "V6",
  "chirp-fenix": "V5.5",
}

export function musicModelLabel(model: string | null | undefined): string {
  if (!model?.trim()) return "Modell unbekannt"
  const value = model.trim()
  return MODEL_LABELS[value.toLowerCase()] ?? value.replace(/^v(\d+(?:_\d+)*)/i, (_, version: string) => `V${version.replaceAll("_", ".")}`)
}
