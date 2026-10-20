import { defineConfig } from "astro/config";

const isBrowserTest = process.env.PLAYWRIGHT_TEST === "1";

export default defineConfig({
  site: "https://ashraf18275.github.io",
  // GitHub Pages serves the deployed site under the repository subpath.
  // Playwright's local server uses the domain root because tests navigate to /convert/.
  base: isBrowserTest ? "/" : "/file-conversion-platform",
  output: "static",
  trailingSlash: "always",
});
