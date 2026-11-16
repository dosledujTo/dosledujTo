import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dva buildy z jedného zdroja: klientský balík do `dist/client` a serverový
// (SSR) do `dist/server`. Express si serverový balík naimportuje a vykreslí
// ním stránku; klientský sa potom pripojí a preberie navigáciu.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  root: import.meta.dirname,
  build: {
    outDir: isSsrBuild ? "dist/server" : "dist/client",
    emptyOutDir: true,
    manifest: !isSsrBuild,
    rollupOptions: isSsrBuild ? { input: "src/entry-server.jsx" } : undefined,
  },
  ssr: { noExternal: true },
}));
