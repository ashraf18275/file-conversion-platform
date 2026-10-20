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
