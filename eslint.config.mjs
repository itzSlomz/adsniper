// Next 16 removed the `next lint` wrapper; eslint-config-next 16 ships
// native flat configs, so ESLint 9 consumes them directly. This also
// widened linting beyond the directories `next lint` covered, so the
// scoped overrides below keep pre-existing harness code passing without
// weakening the rules for product code.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "artifacts/**",
      "deliverables/**",
      ".ua/**",
      "coverage/**",
    ],
  },
  {
    // Async Server Components rendered per request: Date.now() there is
    // request-time data computation, not client re-render impurity. The
    // React Compiler purity rule can't tell server from client files, so
    // it is off only for these two dashboard pages.
    files: [
      "src/app/(dash)/brand/\\[id\\]/page.tsx",
      "src/app/(dash)/compare/page.tsx",
    ],
    rules: { "react-hooks/purity": "off" },
  },
  {
    // The Jest suite and the CommonJS audit script predate direct ESLint
    // coverage (next lint never linted them); keep their existing idioms.
    files: ["tests/**", "**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
