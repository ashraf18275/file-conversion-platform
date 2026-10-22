import { expect, test } from "@playwright/test";

const activeConverterSlugs = new Set(["webp-to-jpg", "webp-to-png", "png-to-jpg", "jpg-to-png", "png-to-webp", "jpg-to-webp"]);

const toolSlugs = [
  "heic-to-jpg", "webp-to-jpg", "webp-to-png", "png-to-jpg", "jpg-to-png",
  "png-to-webp", "jpg-to-webp", "avif-to-jpg", "png-to-ico", "svg-to-png",
  "gif-to-png", "compress-image", "resize-image", "crop-image", "rotate-flip-image",
  "remove-background", "watermark-image", "remove-exif", "jpg-to-pdf", "pdf-to-jpg",
  "merge-pdf", "split-pdf", "compress-pdf", "rotate-pdf", "reorder-pdf-pages", "image-to-text"
];

test("publishes each requested task route without a nonfunctional upload control", async ({ page }) => {
  for (const slug of toolSlugs) {
    const response = await page.goto(`/${slug}/`);
    expect(response?.ok(), `${slug} should return a successful page`).toBeTruthy();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("h1")).toHaveCount(1);
    if (activeConverterSlugs.has(slug)) {
      await expect(page.locator('input[type="file"]')).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "حوّل ملفاتك داخل المتصفح" })).toBeVisible();
    } else {
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      await expect(page.getByRole("note")).toContainText("لا ترفع ملفات هنا");
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://ashraf18275.github.io/${slug}/`);
  }
});

test("provides both collection pages and labels PDF processing as unavailable", async ({ page }) => {
  const images = await page.goto("/image-converter/");
  expect(images?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "تحويل الصور وتحريرها" })).toBeVisible();
  await expect(page.getByRole("link", { name: /افتح مساحة الصور/ })).toHaveAttribute("href", "/convert/");

  const pdf = await page.goto("/pdf-tools/");
  expect(pdf?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "أدوات ملفات PDF" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("لا توجد أداة PDF مفعّلة للاستخدام حتى الآن");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("keeps the home directory limited to current tools and links to collections", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tool-card")).toHaveCount(5);
  await expect(page.getByText("قريبًا", { exact: true })).toHaveCount(0);
  await expect(page.getByText("نسخة تجريبية", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link", { name: "تحويل الصور" })).toHaveAttribute("href", "/image-converter/");
  await expect(page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link", { name: "أدوات PDF" })).toHaveAttribute("href", "/pdf-tools/");
});

test("lists the published routes in the sitemap", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  expect(xml.match(/<url>/g)).toHaveLength(32);
  for (const slug of toolSlugs) expect(xml).toContain(`https://ashraf18275.github.io/${slug}/`);
  expect(xml).toContain("https://ashraf18275.github.io/image-converter/");
  expect(xml).toContain("https://ashraf18275.github.io/pdf-tools/");
});

test("lets users reorder selected images before conversion", async ({ page }) => {
  await page.goto("/png-to-webp/");
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#2674d9";
    context.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create PNG fixture")), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator("#tool-files").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: Buffer.from(png) },
    { name: "second.png", mimeType: "image/png", buffer: Buffer.from(png) }
  ]);
  const items = page.locator("#converter-file-list li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("first.png");
  await expect(items.nth(1)).toContainText("second.png");
  await page.getByRole("button", { name: "نقل first.png إلى أسفل" }).click();
  await expect(items.nth(0)).toContainText("second.png");
  await expect(items.nth(1)).toContainText("first.png");
  await expect(page.getByRole("button", { name: "نقل second.png إلى أعلى" })).toBeDisabled();
});

test("converts a PNG locally and downloads the result in a valid ZIP archive", async ({ page }) => {
  await page.goto("/png-to-webp/");
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#2674d9";
    context.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create PNG fixture")), "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return Array.from(bytes);
  });
  await page.locator("#tool-files").setInputFiles({
    name: "sample-image.png",
    mimeType: "image/png",
    buffer: Buffer.from(png)
  });
  await page.getByRole("button", { name: "تحويل الصور المحددة" }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
  const zipButton = page.getByRole("button", { name: "تنزيل النتائج كملف ZIP" });
  await expect(zipButton).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await zipButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("converted-images.zip");
  const stream = await download.createReadStream();
  if (!stream) throw new Error("ZIP download stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const archive = Buffer.concat(chunks);
  expect(archive.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(archive.toString("utf8")).toContain("sample-image.webp");
});


test("lets users remove selected files and rejects files with a mismatched format", async ({ page }) => {
  await page.goto("/png-to-webp/");
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#2674d9";
    context.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create PNG fixture")), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator("#tool-files").setInputFiles([
    { name: "keep.png", mimeType: "image/png", buffer: Buffer.from(png) },
    { name: "remove.png", mimeType: "image/png", buffer: Buffer.from(png) },
    { name: "wrong-format.jpg", mimeType: "image/jpeg", buffer: Buffer.from(png) }
  ]);
  const items = page.locator("#converter-file-list li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("keep.png");
  await expect(items.nth(1)).toContainText("remove.png");
  await expect(page.locator("#converter-status")).toContainText("تم تجاهل 1 ملف");
  await page.getByRole("button", { name: "حذف remove.png" }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("keep.png");
  await page.getByRole("button", { name: "حذف keep.png" }).click();
  await expect(items).toHaveCount(0);
  await expect(page.getByRole("button", { name: "تحويل الصور المحددة" })).toBeDisabled();
});


test("browser image conversion does not upload selected image contents", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  await page.goto("/png-to-webp/");
  externalRequests.length = 0;
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3; canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#d97706";
    context.fillRect(0, 0, 3, 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create PNG fixture")), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator("#tool-files").setInputFiles({
    name: "private-image.png",
    mimeType: "image/png",
    buffer: Buffer.from(png)
  });
  await page.getByRole("button", { name: "تحويل الصور المحددة" }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
  expect(externalRequests, "Conversion should stay in the browser and not upload image data").toHaveLength(0);
});


test("removing a selected file clears outdated conversion results and ZIP download", async ({ page }) => {
  await page.goto("/png-to-webp/");
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#2674d9";
    context.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create test image")), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator("#tool-files").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: Buffer.from(png) },
    { name: "second.png", mimeType: "image/png", buffer: Buffer.from(png) }
  ]);
  await page.getByRole("button", { name: "تحويل الصور المحددة" }).click();
  await expect(page.locator("#converter-results .result-card")).toHaveCount(2);
  await expect(page.locator("#download-zip")).toBeVisible();
  await page.getByRole("button", { name: "حذف first.png" }).click();
  await expect(page.locator("#converter-file-list li")).toHaveCount(1);
  await expect(page.locator("#converter-results .result-card")).toHaveCount(0);
  await expect(page.locator("#download-zip")).toBeHidden();
});
