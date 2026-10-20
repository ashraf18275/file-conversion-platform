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
    const requestsBefore: string[] = [];
    const requestsAfter: string[] = [];
    await page.goto("/convert/");
    await page.locator("#image-file").setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: pixel
    });
    await expect(page.locator("#convert")).toBeEnabled();
    await page.locator("#format").selectOption(format.value);
    page.on("request", request => requestsAfter.push(request.url()));
    const before = requestsAfter.length;
    await page.locator("#convert").click();
    await expect(page.locator("#result")).toBeVisible();
    await expect(page.locator("#result-info")).toContainText(`التنسيق: ${format.label}`);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(format.extension.replace(".", "\\.") + "$"));
    expect(requestsAfter.length).toBe(before);
  });
}

test("shows a clear error for a corrupt image without sending file contents", async ({ page }) => {
  const outbound: string[] = [];
  await page.route("**/*", route => {
    outbound.push(route.request().url());
    return route.continue();
  });
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image")
  });
  await page.locator("#convert").click();
  await expect(page.locator("#status")).not.toHaveText("جارٍ تحويل الصورة داخل المتصفح…");
  await expect(page.locator("#status")).not.toHaveText("اكتمل التحويل. راجع المعاينة قبل التنزيل.");
  expect(outbound.every(url => url.startsWith("http://127.0.0.1:4321/"))).toBeTruthy();
});
