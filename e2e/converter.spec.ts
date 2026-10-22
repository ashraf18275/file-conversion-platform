import { test, expect } from "@playwright/test";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZioAAAAASUVORK5CYII=",
  "base64"
);

for (const format of [
  { value: "image/png", extension: ".png", label: "PNG", signature: [137, 80, 78, 71, 13, 10, 26, 10] },
  { value: "image/jpeg", extension: ".jpg", label: "JPEG", signature: [255, 216, 255] },
  { value: "image/webp", extension: ".webp", label: "WebP", signature: [82, 73, 70, 70] },
  { value: "image/bmp", extension: ".bmp", label: "BMP", signature: [66, 77] }
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
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
    await page.locator("#format").selectOption(format.value);
    await page.locator("#convert").click();
    await expect(page.locator("#result")).toBeVisible();
    await expect(page.locator("#result-info")).toContainText(`التنسيق: ${format.label}`);
    const actualOutput = await page.locator("#download").evaluate(async (link: HTMLAnchorElement) => {
      const response = await fetch(link.href);
      const blob = await response.blob();
      const bytes = Array.from(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
      return { mime: blob.type, bytes };
    });
    expect(actualOutput.mime).toBe(format.value);
    expect(actualOutput.bytes.slice(0, format.signature.length)).toEqual(format.signature);
    if (format.value === "image/webp") {
      expect(actualOutput.bytes.slice(8, 12)).toEqual([87, 69, 66, 80]);
    }
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(format.extension.replace(".", "\\.") + "$"));
    const actualNetworkRequests = networkRequests.filter(request => /^https?:/i.test(request.url));
    expect(actualNetworkRequests, "Image conversion should not make HTTP(S) requests; blob: URLs are local browser resources").toHaveLength(0);
  });
}

test("locks file and conversion options while a conversion is in progress", async ({ page }) => {
  await page.addInitScript(() => {
    const originalDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await new Promise(resolve => setTimeout(resolve, 350));
      return originalDecode.call(this);
    };
  });
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: pixel
  });
  await page.locator("#convert").click();
  await expect(page.locator("#image-file")).toBeDisabled();
  await expect(page.locator("#format")).toBeDisabled();
  await expect(page.locator("#quality")).toBeDisabled();
  await expect(page.locator("#status")).toContainText("اكتمل التعديل", { timeout: 10_000 });
  await expect(page.locator("#image-file")).toBeEnabled();
  await expect(page.locator("#format")).toBeEnabled();
  await expect(page.locator("#quality")).toBeEnabled();
});

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
  await expect(page.locator("#convert")).toBeDisabled();
  await expect(page.locator("#source-info")).toContainText("تعذرت قراءة الصورة");
  await expect(page.locator("#result")).toBeHidden();
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
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
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
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
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
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#format").selectOption("image/jpeg");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#result-info")).toContainText("4000 × 3000");
});


test("converts a large PNG file without uploading it", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 2048;
    source.height = 2048;
    const context = source.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    const pixels = context.createImageData(source.width, source.height);
    let seed = 123456789;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create large test PNG")), "image/png");
    });
    if (blob.size < 8 * 1024 * 1024) throw new Error("Test image was not large enough to exercise file-size handling");
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "large-noise.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#format").selectOption("image/webp");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#result-info")).toContainText("2048 × 2048");
});


for (const route of ["/", "/guide/", "/privacy/"]) {
  test(`loads ${route} with Arabic RTL document semantics`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main h1")).toBeVisible();
  });
}

test("mobile conversion page has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/convert/");
  await expect(page.locator("h1")).toBeVisible();
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(hasNoOverflow).toBeTruthy();
});

test("keyboard users can skip directly to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeInViewport();
});


test("converts a 24-megapixel image in Chromium", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 6000;
    source.height = 4000;
    const context = source.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#e2e8f0";
    context.fillRect(0, 0, source.width, source.height);
    context.fillStyle = "#2563eb";
    context.fillRect(0, 0, 3000, 2000);
    const blob = await new Promise<Blob>((resolve, reject) => {
      source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create 24-megapixel test PNG")), "image/png");
    });
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "twenty-four-megapixel.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#format").selectOption("image/webp");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#result-info")).toContainText("6000 × 4000");
});

test("handles an empty image file without creating a result", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({
    name: "empty.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(0)
  });
  await expect(page.locator("#convert")).toBeDisabled();
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#source-info")).toContainText("تعذرت قراءة الصورة");
});

test("uses the selected output format even when the source filename extension is misleading", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({
    name: "misleading.jpg",
    mimeType: "image/png",
    buffer: pixel
  });
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#format").selectOption("image/webp");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename().endsWith(".webp")).toBeTruthy();
  expect(download.suggestedFilename().endsWith(".jpg")).toBeFalsy();
});



test("resizes into exact dimensions without cropping the source", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 2; source.height = 1;
    const context = source.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#ff0000"; context.fillRect(0, 0, 1, 1);
    context.fillStyle = "#0000ff"; context.fillRect(1, 0, 1, 1);
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create test image")), "image/png"));
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "two-colors.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await page.locator("#keep-ratio").uncheck();
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await page.locator("#width").fill("100");
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await page.locator("#height").fill("100");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  const details = await page.locator("#result-preview").evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, left: Array.from(context.getImageData(0, 50, 1, 1).data), center: Array.from(context.getImageData(50, 50, 1, 1).data) };
  });
  expect(details.width).toBe(100);
  expect(details.height).toBe(100);
  expect(details.left[0]).toBeGreaterThan(200);
  expect(details.center[2]).toBeGreaterThan(100);
});

test("crop controls apply the requested source rectangle", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 2; source.height = 1;
    const context = source.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#ff0000"; context.fillRect(0, 0, 1, 1);
    context.fillStyle = "#0000ff"; context.fillRect(1, 0, 1, 1);
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create test image")), "image/png"));
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "two-colors.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await page.locator(".advanced-fields summary").click();
  await page.locator("#crop-x").fill("1");
  await page.locator("#crop-y").fill("0");
  await page.locator("#crop-width").fill("1");
  await page.locator("#crop-height").fill("1");
  await page.locator("#use-crop").click();
  await expect(page.locator("#crop-preview-wrap")).toBeVisible();
  await page.locator("#fit-mode").selectOption("actual");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result-info")).toContainText("الأبعاد النهائية: 1 × 1");
  const pixelColor = await page.locator("#result-preview").evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  expect(pixelColor[2]).toBeGreaterThan(150);
});

test("target-size compression reports the achieved output size", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: pixel });
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#format").selectOption("image/webp");
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#target-enabled").check();
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#target-kb").fill("200");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#target-warning")).toBeVisible();
  await expect(page.locator("#result-info")).toContainText("الجودة المستخدمة");
});

test("rotate controls swap output dimensions when keeping original pixel size", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 2; source.height = 1;
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create test image")), "image/png"));
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "landscape.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await page.locator("#fit-mode").selectOption("actual");
  await page.getByRole("tab", { name: "التدوير والقلب" }).click();
  await expect(page.locator("#panel-transform #rotate-left")).toBeVisible();
  await page.locator("#rotate-right").click();
  await expect(page.locator("#width")).toHaveValue("1");
  await expect(page.locator("#height")).toHaveValue("2");
  await expect(page.locator("#preview")).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result-info")).toContainText("الأبعاد النهائية: 1 × 2");
});


test("preserves transparency in PNG output by default", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 2; source.height = 2;
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create transparent test PNG")), "image/png"));
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "transparent.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#format").selectOption("image/png");
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await page.locator("#fit-mode").selectOption("actual");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  const alpha = await page.locator("#result-preview").evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  });
  expect(alpha).toBe(0);
});


test("organizes tools into accessible tabs without resetting editor values", async ({ page }) => {
  await page.goto("/convert/");
  await expect(page.getByRole("tab", { name: "تحويل الصيغ" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await expect(page.getByRole("tab", { name: "الأبعاد والاقتصاص" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-size #width")).toBeVisible();
  await page.locator("#panel-size #width").fill("900");
  await page.getByRole("tab", { name: "إزالة الخلفية" }).click();
  await expect(page.locator("#panel-background")).toBeVisible();
  await expect(page.locator("#panel-background")).toContainText("صور الأشخاص");
  await expect(page.locator("#remove-background")).toBeDisabled();
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await expect(page.locator("#panel-export #format")).toBeVisible();
  await page.getByRole("tab", { name: "التدوير والقلب" }).click();
  await expect(page.locator("#panel-transform #rotate-left")).toBeVisible();
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await expect(page.locator("#panel-size #width")).toHaveValue("900");
  await page.locator(".advanced-fields summary").click();
  await expect(page.locator("#panel-size #crop-width")).toBeVisible();
});


test("keeps background model downloads lazy until the user starts removal", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", request => {
    if (/huggingface\.co|cdn\.jsdelivr\.net|unpkg\.com/i.test(request.url())) externalRequests.push(request.url());
  });
  await page.goto("/convert/");
  await page.getByRole("tab", { name: "إزالة الخلفية" }).click();
  await expect(page.locator("#remove-background")).toBeDisabled();
  expect(externalRequests).toHaveLength(0);
});


test("applies a mocked local background-removal result and can restore the original", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({
    name: "portrait-test.png",
    mimeType: "image/png",
    buffer: pixel
  });
  await expect(page.locator("#remove-background")).toBeEnabled();
  await page.evaluate(() => {
    Object.assign(window, {
      loadLocalBackgroundPipeline: async () => async (_task: string, _model: string, _options: Record<string, unknown>) => async () => [{
        toBlob: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 2;
          canvas.height = 2;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas context unavailable");
          context.fillStyle = "#ff0000";
          context.fillRect(0, 0, 1, 1);
          return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create mock cutout")), "image/png");
          });
        }
      }]
    });
  });
  externalRequests.length = 0;
  await page.getByRole("tab", { name: "إزالة الخلفية" }).click();
  await page.locator("#remove-background").click();
  await expect(page.locator("#background-status")).toContainText("اكتملت إزالة الخلفية", { timeout: 10_000 });
  await expect(page.locator("#restore-original")).toBeVisible();
  await expect(page.locator("#format")).toHaveValue("image/png");
  await expect(page.locator("#matte-strength")).toBeEnabled();
  await expect(page.locator("#preview-wrap")).toHaveCSS("background-image", /linear-gradient/);
  expect(externalRequests, "The selected image must not be uploaded during local background processing").toHaveLength(0);
  await page.locator("#matte-strength").evaluate(element => {
    const slider = element as HTMLInputElement;
    slider.value = "1.10";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#background-status")).toContainText("تم تحديث الحواف", { timeout: 10_000 });
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  const outputAlpha = await page.locator("#result-preview").evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 2, 2).data;
    return { subjectAlpha: pixels[3], transparentAlpha: pixels[7] };
  });
  expect(outputAlpha.subjectAlpha).toBeGreaterThan(0);
  expect(outputAlpha.transparentAlpha).toBe(0);
  await page.getByRole("tab", { name: "إزالة الخلفية" }).click();
  await page.locator("#restore-original").click();
  await expect(page.locator("#restore-original")).toBeHidden();
  await expect(page.locator("#background-status")).toContainText("تمت استعادة الصورة الأصلية");
});

// Drag creation and resize behavior are covered together in the crop-handle regression test below.

test("converts multiple selected images locally and provides one download per result", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles([
    { name: ".trashed-1754500255-first.png", mimeType: "image/png", buffer: pixel },
    { name: "second.png", mimeType: "image/png", buffer: pixel }
  ]);
  await expect(page.locator("#batch-panel")).toBeVisible();
  await expect(page.locator("#batch-file-list li")).toHaveCount(2);
  await page.locator("#batch-convert").click();
  await expect(page.locator("#batch-status")).toContainText("اكتمل تحويل 2 ملفات", { timeout: 30000 });
  await expect(page.locator("#batch-results a")).toHaveCount(2);
  const links = await page.locator("#batch-results a").allTextContents();
  expect(links.some(label => label.includes("first"))).toBeTruthy();
  expect(links.some(label => label.includes("second"))).toBeTruthy();
});


test("tool directory supports Arabic search and category filtering", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#tool-search")).toBeVisible();
  await expect(page.locator("#tool-grid .tool-card:visible")).toHaveCount(27);
  await expect(page.locator("#tool-results")).toHaveText("27 أداة في الدليل");
  await page.getByRole("button", { name: "ضغط الصور" }).click();
  await expect(page.locator("#tool-grid .tool-card:visible")).toHaveCount(1);
  await expect(page.locator("#tool-results")).toHaveText("أداة واحدة في الدليل");
  await expect(page.locator("#tool-grid .tool-card:visible")).toContainText("ضغط الصور");
  await page.locator("#tool-search").fill("BMP");
  await expect(page.locator("#tool-grid .tool-card:visible")).toHaveCount(0);
  await expect(page.locator("#tool-results")).toHaveText("لا توجد أدوات مطابقة");
  await page.locator("#tool-search").fill("تحويل");
  await expect(page.locator("#tool-grid .tool-card:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "الكل" }).click();
  await expect(page.locator("#tool-grid .tool-card:visible")).toHaveCount(9);
  await expect(page.locator("#tool-results")).toHaveText("9 أدوات في الدليل");
  await expect(page.locator("#tool-grid .planned-tool-card")).toHaveCount(21);
  await expect(page.locator("#tool-grid .planned-tool-card .tag-coming-soon")).toHaveCount(21);
});

test("planned tools have stable routes and do not pretend to process files", async ({ page }) => {
  await page.goto("/tools/pdf-merge/");
  await expect(page.getByRole("heading", { name: "دمج ملفات PDF" })).toBeVisible();
  await expect(page.getByText("قريبًا")).toBeVisible();
  await expect(page.getByText("هذه الأداة لم تُنفّذ بعد.")).toBeVisible();
  await expect(page.locator("#image-file")).toHaveCount(0);
  await expect(page.locator("#convert")).toHaveCount(0);
  await page.getByRole("link", { name: /العودة إلى دليل الأدوات/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("every planned tool has a working route and honest coming-soon state", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator("#tool-grid .planned-tool-card").evaluateAll(links =>
    links.map(link => (link as HTMLAnchorElement).getAttribute("href")).filter((href): href is string => Boolean(href))
  );
  expect(hrefs).toHaveLength(21);
  expect(new Set(hrefs).size).toBe(21);
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".coming-badge")).toContainText("قريبًا");
    await expect(page.locator(".planned-note")).toContainText("هذه الأداة لم تُنفّذ بعد");
    await expect(page.locator("#image-file")).toHaveCount(0);
    await expect(page.locator("#convert")).toHaveCount(0);
  }
});

test("home tool directory fits a narrow phone viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#tool-search")).toBeVisible();
  await expect(page.locator("#tool-grid .tool-card:visible")).toHaveCount(27);
  const hasHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("batch queue provides thumbnails, reorder, removal, and status per file", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles([
    { name: ".trashed-1754500255-first.png", mimeType: "image/png", buffer: pixel },
    { name: "second.png", mimeType: "image/png", buffer: pixel },
    { name: "third.png", mimeType: "image/png", buffer: pixel }
  ]);
  await expect(page.locator("#batch-file-list li")).toHaveCount(3);
  await expect(page.locator(".batch-thumb")).toHaveCount(3);
  await expect(page.locator("#batch-file-list li").first()).toContainText("first.png");
  await expect(page.locator("#batch-file-list li").first()).not.toContainText(".trashed-1754500255-");
  await expect(page.locator(".queue-status").first()).toHaveText("بانتظار التحويل");
  await page.getByRole("button", { name: "تحريك third.png إلى أعلى" }).click();
  await page.getByRole("button", { name: "تحريك third.png إلى أعلى" }).click();
  await expect(page.locator("#batch-file-list li").first()).toContainText("third.png");
  await page.getByRole("button", { name: "حذف second.png من القائمة" }).click();
  await expect(page.locator("#batch-file-list li")).toHaveCount(2);
  await expect(page.locator("#batch-file-list")).not.toContainText("second.png");
});

test("crop selection exposes eight resize handles and supports resizing", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width=200; canvas.height=120;
    const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("Canvas context unavailable");
    ctx.fillStyle="#4b83d1";ctx.fillRect(0,0,200,120);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("blob failed")),"image/png"));
    const input=document.querySelector<HTMLInputElement>("#image-file");if(!input)throw new Error("input missing");
    const transfer=new DataTransfer();transfer.items.add(new File([blob],"handles.png",{type:"image/png"}));input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}));
  });
  await expect(page.locator("#convert")).toBeEnabled();
  const overlay=page.locator("#crop-overlay");
  await expect(overlay).toBeVisible();
  await overlay.scrollIntoViewIfNeeded();
  const box=await overlay.evaluate(element=>{const r=element.getBoundingClientRect();return{x:r.left,y:r.top,width:r.width,height:r.height};});
  await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7,{steps:4});await page.mouse.up();
  await expect(page.locator("#crop-width")).not.toHaveValue("200");
  await expect(page.locator("#crop-height")).not.toHaveValue("120");
  await expect(page.locator("#crop-info")).toContainText("تم تحديد مساحة الاقتصاص");
  await expect(page.locator("[data-crop-handle]")).toHaveCount(8);
  const oldWidth=await page.locator("#crop-width").inputValue();
  const handle=await page.locator("[data-crop-handle='se']").evaluate(element=>{const r=element.getBoundingClientRect();return{x:r.left,y:r.top,width:r.width,height:r.height};});
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  await page.mouse.move(handle.x+handle.width+20,handle.y+handle.height+12,{steps:3});await page.mouse.up();
  await expect(page.locator("#crop-info")).toContainText("تم تحديد مساحة الاقتصاص");
  await expect(page.locator("#crop-width")).not.toHaveValue(oldWidth);
});

test("image enhancement controls update preview and are applied to exported pixels", async ({ page }) => {
  await page.goto("/convert/");
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 2; source.height = 2;
    const context = source.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "#646464";
    context.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(value => value ? resolve(value) : reject(new Error("Could not create enhancement test image")), "image/png"));
    const input = document.querySelector<HTMLInputElement>("#image-file");
    if (!input) throw new Error("Image input was not found");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "gray-test.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "تحسين الصور" }).click();
  await page.locator("#enhance-brightness").fill("150");
  await expect(page.locator("#preview")).toHaveAttribute("style", /brightness\(150%\)/);
  await page.getByRole("tab", { name: "الأبعاد والاقتصاص" }).click();
  await page.locator("#fit-mode").selectOption("actual");
  await page.getByRole("tab", { name: "تحويل الصيغ" }).click();
  await page.locator("#format").selectOption("image/png");
  await page.locator("#convert").click();
  await expect(page.locator("#result")).toBeVisible();
  const pixel = await page.locator("#result-preview").evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  expect(pixel[0]).toBeGreaterThan(130);
  expect(pixel[1]).toBeGreaterThan(130);
  expect(pixel[2]).toBeGreaterThan(130);
});

test("clears the selected image and resets the preview safely", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles({
    name: "selected.png",
    mimeType: "image/png",
    buffer: pixel
  });
  await expect(page.locator("#preview-wrap")).toBeVisible();
  await expect(page.locator("#remove-selected")).toBeEnabled();
  await page.locator("#remove-selected").click();
  await expect(page.locator("#image-file")).toHaveValue("");
  await expect(page.locator("#preview-wrap")).toBeHidden();
  await expect(page.locator("#convert")).toBeDisabled();
  await expect(page.locator("#remove-selected")).toBeDisabled();
  await expect(page.locator("#source-info")).toContainText("لم يتم اختيار صورة");
});

test("shows all selected files in the multi-image queue", async ({ page }) => {
  await page.goto("/convert/");
  await page.locator("#image-file").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: pixel },
    { name: "second.png", mimeType: "image/png", buffer: pixel }
  ]);
  await expect(page.locator("#batch-panel")).toBeVisible();
  await expect(page.locator("#batch-count")).toContainText("2 ملفات محددة");
  await expect(page.locator("#batch-file-list li")).toHaveCount(2);
  await expect(page.locator("#batch-convert")).toBeEnabled();
});

test("keeps the image editor usable on a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/convert/");
  await expect(page.getByRole("tab", { name: "تحويل الصيغ" })).toBeVisible();
  await expect(page.locator("#image-file")).toBeAttached();
  const layout = await page.evaluate(() => {
    const previewWrap = document.querySelector<HTMLElement>("#preview-wrap");
    const upload = document.querySelector<HTMLElement>("#upload-zone");
    const remove = document.querySelector<HTMLElement>("#remove-selected");
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      previewWidth: previewWrap?.getBoundingClientRect().width ?? 0,
      uploadWidth: upload?.getBoundingClientRect().width ?? 0,
      removeHeight: remove?.getBoundingClientRect().height ?? 0
    };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.previewWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.uploadWidth).toBeGreaterThan(280);
  expect(layout.removeHeight).toBeGreaterThanOrEqual(40);
});

test("mobile navigation stays compact, scrollable, and free of page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const nav = page.locator("header nav.links");
  await expect(nav).toBeVisible();
  const measurements = await nav.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    links: Array.from(element.querySelectorAll("a")).map(link => ({
      text: link.textContent?.trim(),
      left: link.getBoundingClientRect().left,
      right: link.getBoundingClientRect().right
    }))
  }));
  expect(measurements.links).toHaveLength(4);
  expect(measurements.scrollWidth).toBeGreaterThanOrEqual(measurements.clientWidth);
  expect(measurements.pageWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
  await nav.evaluate(element => { element.scrollLeft = -element.scrollWidth; });
  await expect(nav.getByRole("link", { name: "الخصوصية" })).toBeInViewport();
});


test("marks the current page in the primary navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header nav a[aria-current='page']")).toHaveText("جميع الأدوات");
  await page.goto("/convert/");
  await expect(page.locator("header nav a[aria-current='page']")).toHaveText("محرر الصور");
  await page.goto("/guide/");
  await expect(page.locator("header nav a[aria-current='page']")).toHaveText("دليل الاستخدام");
  await page.goto("/privacy/");
  await expect(page.locator("header nav a[aria-current='page']")).toHaveText("الخصوصية");
});


test("image guide renders format cards without visible escape characters", async ({ page }) => {
  await page.goto("/guide/");
  await expect(page.getByRole("heading", { name: "دليل تحويل الصور" })).toBeVisible();
  await expect(page.locator("article.card h2")).toHaveText(["PNG", "JPEG", "WebP", "BMP"]);
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("\\n");
});


test("loads the site without requesting remote web fonts", async ({ page }) => {
  const remoteFontRequests: string[] = [];
  page.on("request", request => {
    if (/fonts\.(googleapis|gstatic)\.com/i.test(request.url())) remoteFontRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("main h1")).toBeVisible();
  expect(remoteFontRequests).toHaveLength(0);
  await page.goto("/privacy/");
  await expect(page.getByRole("heading", { name: "الاتصالات الخارجية" })).toBeVisible();
  await expect(page.locator("body")).toContainText("خطوط النظام");
});
