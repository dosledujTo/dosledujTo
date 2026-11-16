import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./test/setup.js"],
    // The integration tests talk to a real CouchDB with Clouseau. They create
    // and remove their own documents, but they share one database, so running
    // them in parallel would have them stepping on each other's search results.
    fileParallelism: false,
    testTimeout: 20000,
    // `afterAll` maže dokumenty, ktoré test vytvoril, aj s ich revíziami —
    // trvá to úmerne k počtu dokumentov, nie k dĺžke testu.
    hookTimeout: 30000,
    include: ["test/**/*.test.js", "test/**/*.test.jsx"],
  },
});
