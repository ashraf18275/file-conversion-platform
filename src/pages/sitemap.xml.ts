import { toolPages } from "../data/tool-catalog";

const site = "https://ashraf18275.github.io";

export function GET() {
  const base = import.meta.env.BASE_URL;
  const paths = [
    "",
    "image-converter/",
    "pdf-tools/",
    "convert/",
    "guide/",
    "privacy/",
    ...toolPages.map((tool) => `${tool.slug}/`)
  ];
  const urls = paths.map((path) => {
    const location = new URL(`${base}${path}`, site).toString();
    return `  <url><loc>${location}</loc></url>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
