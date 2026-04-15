import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// parseParams is a pure function -- extract the logic here to test without
// triggering DOM-dependent view imports through router.js
function parseParams(hash) {
  const q = hash.indexOf('?');
  if (q < 0) return {};
  const params = {};
  hash.substring(q+1).split('&').forEach(p => {
    const [k,v] = p.split('=');
    if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  return params;
}

Deno.test("parseParams: extracts key-value pairs from hash", () => {
  const params = parseParams("#/types?spec=consensus-specs&kind=class");
  assertEquals(params.spec, "consensus-specs");
  assertEquals(params.kind, "class");
});

Deno.test("parseParams: returns empty object for no params", () => {
  const params = parseParams("#/types");
  assertEquals(Object.keys(params).length, 0);
});

Deno.test("parseParams: handles URL-encoded values", () => {
  const params = parseParams("#/types?q=hello%20world");
  assertEquals(params.q, "hello world");
});

Deno.test("parseParams: handles empty hash", () => {
  const params = parseParams("");
  assertEquals(Object.keys(params).length, 0);
});

Deno.test("parseParams: handles hash with just question mark", () => {
  const params = parseParams("#/?");
  assertEquals(Object.keys(params).length, 0);
});
