import type { Metadata, Viewport } from "next"
import { GeistMono } from "geist/font/mono"
import { GeistPixelSquare } from "geist/font/pixel/square"
import { GeistSans } from "geist/font/sans"
import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "Sonora · Estúdio de sons por receita",
  description:
    "Gere efeitos sonoros e trilhas curtas a partir de receitas JSON, 100% no navegador. Copie o prompt, peça para a IA, cole a receita e exporte em WAV, FLAC, MP3 e mais.",
  applicationName: "Sonora",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d14" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
