import * as fs from "fs/promises"
import * as path from "path"

const STORAGE_ROOT = process.env.STORAGE_BASE_PATH
  ? path.join(process.env.STORAGE_BASE_PATH, "projects")
  : path.join(process.cwd(), "storage", "projects")

function datePrefix(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
  return base.length >= 2 ? base : Buffer.from(title).toString("base64url").slice(0, 16)
}

export function projectFolderPath(slug: string): string {
  return path.join(STORAGE_ROOT, `${datePrefix()}_${slug}`)
}

export async function ensureProjectFolder(slug: string): Promise<string> {
  const folderPath = projectFolderPath(slug)

  const dirs = [
    folderPath,
    path.join(folderPath, "lyrics"),
    path.join(folderPath, "prompts"),
    path.join(folderPath, "outputs", "audio"),
    path.join(folderPath, "outputs", "covers"),
    path.join(folderPath, "publish"),
  ]

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true })
  }

  return folderPath
}

export async function writeFile(folderPath: string, relativePath: string, content: string | Buffer): Promise<string> {
  const fullPath = path.join(folderPath, relativePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content)
  return fullPath
}

export async function readFile(folderPath: string, relativePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(folderPath, relativePath)
    const content = await fs.readFile(fullPath, "utf-8")
    return content
  } catch {
    return null
  }
}

export async function fileExists(folderPath: string, relativePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(folderPath, relativePath)
    await fs.access(fullPath)
    return true
  } catch {
    return false
  }
}

export async function saveProjectJson(folderPath: string, data: object): Promise<void> {
  await writeFile(folderPath, "project.json", JSON.stringify(data, null, 2))
}
