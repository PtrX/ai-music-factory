"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus } from "lucide-react"

interface VariantSummary {
  id: string
  label: string
  status: string
  scoreTotal: number | null
}

interface Project {
  id: string
  title: string
  genre: string
  createdAt: string
  status: string
  variantCount: number
  variants: VariantSummary[]
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/projects")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load projects")
        const data = await res.json()
        const list = Array.isArray(data?.projects) ? data.projects : []
        setProjects(list)
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  const bestScore = (variants: VariantSummary[]): number | null => {
    const scores = variants.map((v) => v.scoreTotal).filter((s): s is number => s !== null)
    return scores.length > 0 ? Math.max(...scores) : null
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">AI Music Factory</h1>
        <Link href="/projects/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" /> New Project
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground py-8 text-center">Loading...</div>
          ) : projects.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              No projects yet. Create your first one!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Title</th>
                    <th className="text-left py-3 px-2 font-medium">Genre</th>
                    <th className="text-left py-3 px-2 font-medium">Date</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-center py-3 px-2 font-medium">Variants</th>
                    <th className="text-center py-3 px-2 font-medium">Best Score</th>
                    <th className="py-3 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{p.title}</td>
                      <td className="py-3 px-2 text-muted-foreground">{p.genre}</td>
                      <td className="py-3 px-2 text-muted-foreground">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={p.status === "draft" ? "secondary" : "default"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center">{(p.variants ?? []).length}</td>
                      <td className="py-3 px-2 text-center font-mono">
                        {bestScore(p.variants ?? []) ?? "—"}
                      </td>
                      <td className="py-3 px-2">
                        <Link href={`/projects/${p.id}`}>
                          <Button variant="ghost" size="sm">Open</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
