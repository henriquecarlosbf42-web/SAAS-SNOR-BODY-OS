import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Testes de banco (tests/db/*) sobem um Postgres real via PGlite
    // (WASM) em beforeAll — mais lento que um teste unitário puro, e sob
    // contenção de CPU (vários arquivos de teste rodando em paralelo)
    // pode passar dos 10s default. 30s dá folga sem mascarar uma
    // regressão de performance real.
    hookTimeout: 30_000,
    // Reusa workers entre arquivos em vez de um processo por arquivo —
    // menos instâncias de PGlite subindo ao mesmo tempo, que era a causa
    // raiz da contenção acima (sugestão do próprio Vitest no output).
    isolate: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
