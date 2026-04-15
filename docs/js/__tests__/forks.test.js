import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sortForks, sortForksRaw, getCodeForFork } from "../forks.js";
import { state } from "../state.js";

Deno.test("sortForksRaw sorts by canonical order", () => {
  const input = ["electra", "phase0", "deneb", "capella"];
  const result = sortForksRaw(input);
  assertEquals(result, ["phase0", "capella", "deneb", "electra"]);
});

Deno.test("sortForksRaw: all-known forks sort correctly", () => {
  const input = ["electra", "deneb", "phase0", "capella"];
  const result = sortForksRaw(input);
  assertEquals(result, ["phase0", "capella", "deneb", "electra"]);
});

Deno.test("sortForksRaw: unknown forks sort after known (among themselves alphabetical)", () => {
  const input = ["unknown_b", "unknown_a"];
  const result = sortForksRaw(input);
  assertEquals(result, ["unknown_a", "unknown_b"]);
});

Deno.test("sortForksRaw handles EL forks", () => {
  const input = ["cancun", "shanghai", "prague"];
  const result = sortForksRaw(input);
  assertEquals(result, ["shanghai", "cancun", "prague"]);
});

Deno.test("sortForksRaw handles mixed CL and EL forks", () => {
  const input = ["cancun", "deneb", "shanghai", "capella"];
  const result = sortForksRaw(input);
  assertEquals(result, ["capella", "deneb", "shanghai", "cancun"]);
});

Deno.test("sortForks filters hidden forks", () => {
  const input = ["deneb", "dao_fork", "electra", "unversioned"];
  const result = sortForks(input);
  assertEquals(result, ["deneb", "electra"]);
});

Deno.test("sortForks returns empty for all-hidden input", () => {
  const input = ["dao_fork", "muir_glacier"];
  const result = sortForks(input);
  assertEquals(result, []);
});

Deno.test("sortForksRaw does not mutate input", () => {
  const input = ["electra", "phase0"];
  const copy = [...input];
  sortForksRaw(input);
  assertEquals(input, copy);
});

Deno.test("getCodeForFork walks backward for carry-forward", () => {
  const item = {
    name: "TestType",
    forks: {
      phase0: { code: "class TestType:" },
      altair: {},
      bellatrix: { code: "class TestType(v2):" },
    }
  };
  const catalog = {};
  // altair has no code, should carry forward from phase0
  assertEquals(getCodeForFork(item, "altair"), "class TestType:");
  // bellatrix has its own code
  assertEquals(getCodeForFork(item, "bellatrix"), "class TestType(v2):");
});

Deno.test("getCodeForFork returns empty string for unknown fork", () => {
  const item = { name: "X", forks: { phase0: { code: "x" } } };
  assertEquals(getCodeForFork(item, "unknown"), "");
});

Deno.test("getCodeForFork resolves PR overlay", () => {
  const item = { name: "BeaconState", forks: {} };
  state.catalog = {
    pr_overlays: {
      "consensus-specs": {
        "1234": {
          items_changed: {
            "BeaconState": { code: "class BeaconState(modified):" }
          }
        }
      }
    }
  };
  assertEquals(getCodeForFork(item, "pr-1234"), "class BeaconState(modified):");
  state.catalog = null; // cleanup
});
