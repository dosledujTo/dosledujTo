import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin sa servíruje z rovnakej domény ako API pod `/admin/*` — session cookie
// tak zostáva first-party a CORS sa nikde nekonfiguruje (backend-zadanie.md §7).
export default defineConfig({
  plugins: [react()],
  base: "/admin/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Vo vývoji beží Vite zvlášť, ale požiadavky na API idú cez proxy na Express,
    // aby aj tu bola cookie first-party.
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: false },
    },
  },
});
