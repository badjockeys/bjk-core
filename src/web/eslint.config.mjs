import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Photos and videos come from our own media storage, already resized and converted to WebP by the media
      // worker, so next/image's optimiser would only add a second copy. Plain <img> with width/height is enough.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/lib/generated/**",
  ]),
]);
