import type { NextConfig } from "next"

/**
 * O Sonora roda 100% no navegador, então exportamos um site estático
 * (pasta "out/"). Dá para hospedar em qualquer servidor interno, Vercel,
 * GitHub Pages ou abrir com `npm run preview`.
 *
 * Para publicar numa subpasta (ex.: https://intranet/sonora), gere o build com
 * SONORA_BASE_PATH=/sonora npm run build
 */
const basePath = process.env.SONORA_BASE_PATH?.replace(/\/+$/, "") || undefined

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
