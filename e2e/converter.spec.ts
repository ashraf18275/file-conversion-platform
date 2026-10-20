import { test, expect } from "@playwright/test";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZioAAAAASUVORK5CYII=",
  "base64"
);

for (const format of [
  { value: "image/png", extension: ".png", label: "PNG" },
  { value: "image/jpeg", extension: ".jpg", label: "JPEG" },
  { value: "image/webp", extension: ".webp", label: "WebP" }
]) {
  test(`converts a local image to ${format.label} and downloads it`, async ({ page }) => {
    const networkRequests: Array<{ url: string; method: string; postData?: string | null }> = [];
    page.on("request", request => networkRequests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData()
    }));
    await page.goto("/convert/");
    networkRequests.length = 0; // Ignore normal page assets; observe only actions after the user chooses a file.
    await page.locator("#image-file").setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: pixel
    });
    await expect(page.locator("#convert")).toBeEnabled();
    await page.locator("#format").selectOption(format.value);
    await page.locator("#convert").click();
    await expect(page.locator("#result")).toBeVisible();
    await expect(page.locator("#result-info")).toContainText(`التنسيق: ${format.label}`);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(format.extension.replace(".", "\\.") + "$"));
    const actualNetworkRequests = networkRequests.filter(request => /^https?:/i.test(request.url));
    expect(actualNetworkRequests, "Image conversion should not make HTTP(S) requests; blob: URLs are local browser resources").toHaveLength(0);
  });
}

test("shows a clear error for a corrupt image without sending file contents", async ({ page }) => {
  const outbound: string[] = [];
  await page.route("**/*", route => {
    outbound.push(route.request().url());
    return route.continue();
  });
  await page.goto("/convert/");
  outbound.length = 0;
  await page.locator("#image-file").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image")
  });
  await page.locator("#convert").click();
  await expect(page.locator("#status")).not.toHaveText("جارٍ تحويل الصورة داخل المتصفح…");
  await expect(page.locator("#status")).not.toHaveText("اكتمل التحويل. راجع المعاينة قبل التنزيل.");
  expect(outbound.filter(url => /^https?:/i.test(url))).toHaveLength(0);
});


test("rejects SVG input to keep the source allowlist raster-only", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({
    name: "vector.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')
  });
  await expect(page.locator("#convert")).toBeDisabled();
  await expect(page.locator("#source-info")).toContainText("نوع الصورة غير مدعوم");
});


test("fills transparent pixels white when converting to JPEG", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 1;
    source.height = 1;
    const blob = await new Promise<Blob>((resolve, reject) => {
      source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create test PNG")), "image/png");
    });
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "transparent.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#format").selectOption("image/jpeg");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  const rgba = await page.locator("#result-preview").evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  expect(rgba[0]).toBeGreaterThanOrEqual(240);
  expect(rgba[1]).toBeGreaterThanOrEqual(240);
  expect(rgba[2]).toBeGreaterThanOrEqual(240);
});


test("converts a 6-megapixel image and preserves its dimensions", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 3000;
    source.height = 2000;
    const context = source.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#d3d3d3";
    context.fillRect(0, 0, source.width, source.height);
    context.fillStyle = "#2468ac";
    context.fillRect(0, 0, 1500, 1000);
    const blob = await new Promise<Blob>((resolve, reject) => {
      source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create large test PNG")), "image/png");
    });
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "six-megapixel.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#format").selectOption("image/webp");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#result-info")).toContainText("3000 × 2000");
});


test("converts a 12-megapixel image in Chromium", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 4000;
    source.height = 3000;
    const context = source.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#e2e8f0";
    context.fillRect(0, 0, source.width, source.height);
    context.fillStyle = "#2563eb";
    context.fillRect(0, 0, 2000, 1500);
    const blob = await new Promise<Blob>((resolve, reject) => {
      source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create 12-megapixel test PNG")), "image/png");
    });
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "twelve-megapixel.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#format").selectOption("image/jpeg");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#result-info")).toContainText("4000 × 3000");
});
