import { Suspense } from "react"
import { ProjectForm } from "@/components/project-form"

export default function NewProjectPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">Create New Project</h1>
      <Suspense fallback={<div className="text-muted-foreground text-center py-8">Loading...</div>}>
        <ProjectForm />
      </Suspense>
    </div>
  )
}
