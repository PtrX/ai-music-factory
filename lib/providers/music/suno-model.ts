import { z } from "zod"

export const SUNO_SCHEMA_URL = "https://docs.sunoapi.org/suno-api/suno-api.json"

const generationSchema = z.object({
  paths: z.object({
    "/api/v1/generate": z.object({
      post: z.object({
        requestBody: z.object({
          content: z.object({
            "application/json": z.object({
              schema: z.object({ properties: z.object({ model: z.object({ enum: z.array(z.string()) }) }) }),
            }),
          }),
        }),
      }),
    }),
  }),
})

export function latestSunoModel(schema: unknown): string {
  const models = generationSchema.parse(schema).paths["/api/v1/generate"].post
    .requestBody.content["application/json"].schema.properties.model.enum
  // Standard releases only: MINI/WILD/PLUS are distinct variants, not newer versions.
  const versions = models.filter((model) => /^V\d+(?:_\d+)*$/.test(model))
  versions.sort((a, b) => {
    const left = a.slice(1).split("_").map(Number)
    const right = b.slice(1).split("_").map(Number)
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const difference = (right[i] ?? 0) - (left[i] ?? 0)
      if (difference) return difference
    }
    return 0
  })
  if (!versions[0] || Number(versions[0].slice(1).split("_")[0]) < 6) {
    throw new Error("Suno API schema contains no current standard model (V6 or newer)")
  }
  return versions[0]
}

export async function resolveLatestSunoModel(): Promise<string> {
  // Refresh for every new generation; never silently fall back to an obsolete model.
  const response = await fetch(SUNO_SCHEMA_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Cannot determine latest Suno model: schema HTTP ${response.status}`)
  return latestSunoModel(await response.json())
}
