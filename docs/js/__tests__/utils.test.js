import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { esc, safeId } from "../utils.js";

Deno.test("esc: escapes HTML entities", () => {
  assertEquals(esc("<script>alert('xss')</script>"), "&lt;script&gt;alert('xss')&lt;/script&gt;");
});

Deno.test("esc: handles empty/null input", () => {
  assertEquals(esc(""), "");
  assertEquals(esc(null), "");
  assertEquals(esc(undefined), "");
});

Deno.test("esc: passes through safe strings", () => {
  assertEquals(esc("hello world"), "hello world");
});

Deno.test("esc: escapes ampersands", () => {
  assertEquals(esc("a & b"), "a &amp; b");
});

Deno.test("esc: escapes quotes", () => {
  const result = esc('say "hello"');
  assertEquals(result.includes("&quot;"), true);
});

Deno.test("safeId: replaces non-alphanumeric with underscore", () => {
  assertEquals(safeId("hello-world"), "hello_world");
  assertEquals(safeId("foo.bar[0]"), "foo_bar_0_");
  assertEquals(safeId("simple"), "simple");
});

Deno.test("safeId: handles empty string", () => {
  assertEquals(safeId(""), "");
});
