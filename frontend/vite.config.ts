import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      host: "192.168.1.6",
      port: 5173,
    },
    proxy: Object.fromEntries(
      ["/auth", "/folders", "/notes", "/tags", "/shares", "/settings"].map((p) => [
        p,
        { target: "http://127.0.0.1:4000", changeOrigin: false },
      ]),
    ),
  },

  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
});