import { defineConfig } from "astro/config";

const isBrowserTest = process.env.PLAYWRIGHT_TEST === "1";

export default defineConfig({
  site: "https://ashraf18275.github.io",
  base: isBrowserTest ? "/" : "/file-conversion-platform",
  output: "static",
  trailingSlash: "always",
  devToolbar: {
    enabled: false,
  },
});
