const assert = require("node:assert/strict");
const { sourceReference } = require("./source_identity_guard");

assert.deepEqual(sourceReference("pk-123", "x-456", {
  sourceId: "x-456", img: "https://images.example/img_snk/x-456.webp",
}, "https://images.example/img_snk/pk-123.webp"), {
  sourceId: "x-456", image: "https://images.example/img_snk/x-456.webp",
});
assert.deepEqual(sourceReference("pk-123", "x-456", {
  sourceId: "pk-999", img: "https://images.example/img_snk/x-456.webp",
}, "https://images.example/img_snk/pk-123.webp"), {
  sourceId: "pk-123", image: "https://images.example/img_snk/pk-123.webp",
});
console.log("Stable source image references survive the next incremental update");
