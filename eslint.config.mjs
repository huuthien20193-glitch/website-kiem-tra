import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // public/ chứa file pdf.worker.mjs được script copy vào (code thư viện bên thứ 3),
    // không phải code của dự án nên không cần kiểm tra lint.
    "public/**",
  ]),
]);

export default eslintConfig;
