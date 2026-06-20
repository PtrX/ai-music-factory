import { prisma } from "@/lib/db"

const MAX_ATTEMPTS = 3

export async function enqueue(type: string, variantId: string | null, payload: object) {
  let payloadStr: string
  try {
    payloadStr = JSON.stringify(payload)
  } catch (e) {
    throw new Error(`Failed to serialize job payload: ${e instanceof Error ? e.message : "Unknown error"}`)
  }
  const job = await prisma.job.create({
    data: {
      type,
      variantId,
      status: "pending",
      payload: payloadStr,
    },
  })
  return job
}

export async function dequeue() {
  // Use a raw atomic UPDATE to claim a job, avoiding the read-then-write race condition.
  // SQLite serialises writes by default (WAL mode), so the UPDATE is atomic.
  // We find the oldest pending job id first, then atomically claim it.
  // Only pick up jobs whose nextRetryAt has passed (or is not set) for backoff support.
  const now = new Date()
  const pending = await prisma.job.findFirst({
    where: {
      status: "pending",
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  if (!pending) return null

  // Atomic conditional update: only succeeds if the row is still "pending"
  const updated = await prisma.job.updateMany({
    where: { id: pending.id, status: "pending" },
    data: { status: "processing" },
  })

  // If another worker claimed it first (count === 0), skip this job
  if (updated.count === 0) return null

  return prisma.job.findUnique({ where: { id: pending.id } })
}

export async function markDone(jobId: string, result: object) {
  let resultStr: string
  try {
    resultStr = JSON.stringify(result)
  } catch {
    resultStr = "{}"
  }
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "completed",
      result: resultStr,
      processedAt: new Date(),
    },
  })
}

export async function markFailed(jobId: string, error: string) {
  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } })
    if (!job) return

    const newAttempts = job.attempts + 1
    const shouldFail = newAttempts >= MAX_ATTEMPTS

    const backoffMs = shouldFail ? 0 : 10_000 * Math.pow(4, newAttempts - 1)
    const nextRetryAt = shouldFail ? null : new Date(Date.now() + backoffMs)

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: shouldFail ? "failed" : "pending",
        attempts: newAttempts,
        lastError: error,
        nextRetryAt,
      },
    })
  } catch (e) {
    console.error("[Queue] markFailed error:", e)
  }
}

export async function resetStaleJobs() {
  await prisma.job.updateMany({
    where: { status: "processing" },
    data: { status: "pending" },
  })
}
