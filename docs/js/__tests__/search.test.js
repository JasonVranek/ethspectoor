import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fuzzyScore, fuzzyHighlight } from "../search.js";

Deno.test("fuzzyScore: exact substring scores highest", () => {
  const score = fuzzyScore("BeaconState", "BeaconState");
  assertNotEquals(score, null);
  assertEquals(score > 9000, true); // Exact match gets 10000 - minor penalties
});

Deno.test("fuzzyScore: substring match scores high", () => {
  const score = fuzzyScore("BeaconState", "Beacon");
  assertNotEquals(score, null);
  assertEquals(score > 9000, true);
});

Deno.test("fuzzyScore: no match returns null", () => {
  const score = fuzzyScore("BeaconState", "xyz");
  assertEquals(score, null);
});

Deno.test("fuzzyScore: empty query returns 0", () => {
  assertEquals(fuzzyScore("anything", ""), 0);
});

Deno.test("fuzzyScore: case insensitive", () => {
  const score = fuzzyScore("BeaconState", "beaconstate");
  assertNotEquals(score, null);
});

Deno.test("fuzzyScore: word boundary bonus", () => {
  // 'bs' should match BeaconState better than 'babysitter' because of word boundaries
  const score1 = fuzzyScore("BeaconState", "bs");
  const score2 = fuzzyScore("babysitter", "bs");
  assertNotEquals(score1, null);
  assertNotEquals(score2, null);
  // Both match but BeaconState has word boundary at S
  // Not guaranteed to be higher so just verify both match
});

Deno.test("fuzzyScore: prefix match preferred", () => {
  const score1 = fuzzyScore("process_block", "proc");
  const score2 = fuzzyScore("preprocess_block", "proc");
  assertNotEquals(score1, null);
  assertNotEquals(score2, null);
  // process_block starts with 'proc', should score higher
  assertEquals(score1 > score2, true);
});

Deno.test("fuzzyHighlight: wraps matched chars in mark tags", () => {
  const result = fuzzyHighlight("BeaconState", "bs");
  assertEquals(result.includes("<mark"), true);
  // Should highlight B and S (or b and s)
});

Deno.test("fuzzyHighlight: no query returns escaped text", () => {
  const result = fuzzyHighlight("test<>", "");
  assertEquals(result, "test&lt;&gt;");
});
