import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeLineDiff } from "../diff.js";

Deno.test("computeLineDiff: identical input", () => {
  const lines = ["a", "b", "c"];
  const ops = computeLineDiff(lines, lines);
  assertEquals(ops.length, 3);
  assertEquals(ops.every(op => op.type === "equal"), true);
});

Deno.test("computeLineDiff: empty to non-empty", () => {
  const ops = computeLineDiff([], ["a", "b"]);
  assertEquals(ops.length, 2);
  assertEquals(ops.every(op => op.type === "add"), true);
});

Deno.test("computeLineDiff: non-empty to empty", () => {
  const ops = computeLineDiff(["a", "b"], []);
  assertEquals(ops.length, 2);
  assertEquals(ops.every(op => op.type === "remove"), true);
});

Deno.test("computeLineDiff: single line change", () => {
  const ops = computeLineDiff(["a", "b", "c"], ["a", "B", "c"]);
  // a=equal, b->B=change, c=equal
  assertEquals(ops.length, 3);
  assertEquals(ops[0].type, "equal");
  assertEquals(ops[1].type, "change");
  assertEquals(ops[2].type, "equal");
});

Deno.test("computeLineDiff: addition in middle", () => {
  const ops = computeLineDiff(["a", "c"], ["a", "b", "c"]);
  // a=equal, b=add, c=equal
  assertEquals(ops.length, 3);
  assertEquals(ops[0].type, "equal");
  assertEquals(ops[1].type, "add");
  assertEquals(ops[2].type, "equal");
});

Deno.test("computeLineDiff: removal in middle", () => {
  const ops = computeLineDiff(["a", "b", "c"], ["a", "c"]);
  assertEquals(ops.length, 3);
  assertEquals(ops[0].type, "equal");
  assertEquals(ops[1].type, "remove");
  assertEquals(ops[2].type, "equal");
});

Deno.test("computeLineDiff: whitespace-only differences treated as equal", () => {
  const ops = computeLineDiff(["  hello  "], ["hello"]);
  // trim comparison makes them equal
  assertEquals(ops[0].type, "equal");
});

Deno.test("computeLineDiff: both empty", () => {
  const ops = computeLineDiff([], []);
  assertEquals(ops.length, 0);
});

Deno.test("computeLineDiff: complete replacement", () => {
  const ops = computeLineDiff(["a", "b"], ["c", "d"]);
  // All changes (paired)
  assertEquals(ops.length, 2);
  assertEquals(ops.every(op => op.type === "change"), true);
});
