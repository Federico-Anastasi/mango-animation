// Il linter ha una sola cosa da dire: le regole degli hook di React (`rules-of-hooks`, `exhaustive-deps`). Il resto lo controlla `tsc`.
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

export default [
  { ignores: ["dist/**"] },
  {
    files: ["src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "error" },
  },
]
