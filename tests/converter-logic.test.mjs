import test from "node:test";
import assert from "node:assert/strict";
const supported = new Set(["image/png", "image/jpeg", "image/webp"]);
const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const safeBase = (name) => name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "image";
test("only supported output formats are accepted", () => {
  assert.deepEqual([...supported], ["image/png", "image/jpeg", "image/webp"]);
  assert.equal(supported.has("image/gif"), false);
});
test("extensions match actual MIME types", () => {
  assert.equal(extension["image/png"], "png");
  assert.equal(extension["image/jpeg"], "jpg");
  assert.equal(extension["image/webp"], "webp");
});
test("filename base is safe and preserves Arabic letters", () => {
  assert.equal(safeBase("صورة جميلة.png"), "صورة-جميلة");
  assert.equal(safeBase("../../photo final.jpg"), "photo-final");
  assert.equal(safeBase("..."), "image");
});
test("size delta is signed", () => {
  assert.equal(120 - 100, 20);
  assert.equal(80 - 100, -20);
});