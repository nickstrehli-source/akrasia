import next from "eslint-config-next";
import prettier from "eslint-config-prettier";

const config = [
  ...next,
  prettier,
  {
    ignores: [".next/**", "out/**", "build/**", "coverage/**", "node_modules/**"],
  },
];

export default config;
