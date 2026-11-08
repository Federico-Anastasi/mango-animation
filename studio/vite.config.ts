import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const SERVER = process.env.MANGO_ANIMATION_SERVER ?? "http://127.0.0.1:47431"

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: { "/api": SERVER, "/media": SERVER, "/font": SERVER },
  },
})
