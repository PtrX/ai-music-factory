export function musicModelLabel(model: string | null | undefined): string {
  // Internal chirp names are not unique to a public model version.
  if (!model?.trim() || !/^V\d+(?:[_.]\d+)*(?:_[A-Z]+)?$/i.test(model.trim())) return "Modell unbekannt"
  const value = model.trim()
  return value.replace(/^v(\d+(?:_\d+)*)/i, (_, version: string) => `V${version.replaceAll("_", ".")}`)
}
