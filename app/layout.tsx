import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { StatusBar } from "@/components/status-bar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AI Music Factory",
  description: "Turn song ideas into ready-to-generate music variants",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="border-b">
          <div className="container mx-auto flex items-center gap-6 h-14 px-4">
            <a href="/" className="font-bold text-lg">AI Music Factory</a>
            <a href="/presets" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Presets</a>
            <a href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Settings</a>
            <StatusBar />
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
