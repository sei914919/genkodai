// 目的は1つ：Promise の reject を握りつぶす無症状故障（watch不動作・openPath無反応）の
// 再発防止。ignoreVoid: false により `void somePromise()` も違反にする。
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "src-tauri/**", "node_modules/**", "*.js"] },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
    },
  },
];
