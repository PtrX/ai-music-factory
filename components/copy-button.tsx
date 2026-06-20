"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check, AlertCircle } from "lucide-react"

interface CopyButtonProps {
  text: string
  label?: string
}

export function CopyButton({ text, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for insecure contexts or browsers without clipboard-write permission
      try {
        const textarea = document.createElement("textarea")
        textarea.value = text
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        setCopyError(true)
        setTimeout(() => setCopyError(false), 2000)
      }
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copyError ? (
        <AlertCircle className="h-4 w-4 mr-1" />
      ) : copied ? (
        <Check className="h-4 w-4 mr-1" />
      ) : (
        <Copy className="h-4 w-4 mr-1" />
      )}
      {copyError ? "Failed!" : copied ? "Copied!" : label}
    </Button>
  )
}
