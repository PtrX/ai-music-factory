import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { StatusBar } from "@/components/status-bar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AI Music Factory",
  description: "Turn song ideas into ready-to-generate music variants",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav
          className="border-b"
          style={{ borderColor: "var(--border-hex)", background: "var(--surface)" }}
        >
          <div className="container mx-auto flex items-center gap-6 h-14 px-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: "var(--accent-green)",
                  boxShadow: "0 0 8px var(--accent-green)",
                }}
              />
              <a
                href="/"
                className="font-bold text-sm"
                style={{ letterSpacing: "0.05em", color: "var(--text-primary)" }}
              >
                AI MUSIC FACTORY
              </a>
            </div>
            <a href="/presets" className="text-sm transition-colors text-[var(--text-nav)] hover:text-[var(--text-primary)]">
              Presets
            </a>
            <a href="/settings" className="text-sm transition-colors text-[var(--text-nav)] hover:text-[var(--text-primary)]">
              Settings
            </a>
            <StatusBar />
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
