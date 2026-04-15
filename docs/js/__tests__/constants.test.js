import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CL_FORK_ORDER, EL_FORK_ORDER, ALL_FORK_ORDER,
  HIDDEN_FORKS, SPEC_COLORS, KIND_BADGES, METHOD_BADGES
} from "../constants.js";

Deno.test("CL_FORK_ORDER contains expected forks in order", () => {
  assertEquals(CL_FORK_ORDER[0], "phase0");
  assertEquals(CL_FORK_ORDER[CL_FORK_ORDER.length - 1], "heze");
  // deneb comes before electra
  const denebIdx = CL_FORK_ORDER.indexOf("deneb");
  const electraIdx = CL_FORK_ORDER.indexOf("electra");
  assertEquals(denebIdx < electraIdx, true);
});

Deno.test("EL_FORK_ORDER contains expected forks in order", () => {
  assertEquals(EL_FORK_ORDER[0], "frontier");
  const shanghaiIdx = EL_FORK_ORDER.indexOf("shanghai");
  const cancunIdx = EL_FORK_ORDER.indexOf("cancun");
  assertEquals(shanghaiIdx < cancunIdx, true);
});

Deno.test("ALL_FORK_ORDER is CL + EL combined", () => {
  assertEquals(ALL_FORK_ORDER.length, CL_FORK_ORDER.length + EL_FORK_ORDER.length);
  assertEquals(ALL_FORK_ORDER[0], CL_FORK_ORDER[0]);
  assertEquals(ALL_FORK_ORDER[CL_FORK_ORDER.length], EL_FORK_ORDER[0]);
});

Deno.test("HIDDEN_FORKS is a Set containing internal forks", () => {
  assertEquals(HIDDEN_FORKS.has("dao_fork"), true);
  assertEquals(HIDDEN_FORKS.has("unversioned"), true);
  // Real forks should NOT be hidden
  assertEquals(HIDDEN_FORKS.has("deneb"), false);
  assertEquals(HIDDEN_FORKS.has("electra"), false);
  assertEquals(HIDDEN_FORKS.has("cancun"), false);
});

Deno.test("SPEC_COLORS covers all 7 specs", () => {
  const specs = ["consensus-specs", "beacon-apis", "execution-specs", "execution-apis",
                 "builder-specs", "relay-specs", "remote-signing-api"];
  for (const spec of specs) {
    assertExists(SPEC_COLORS[spec], `Missing color for ${spec}`);
  }
});

Deno.test("KIND_BADGES covers expected kinds", () => {
  for (const kind of ["class", "def", "function", "dataclass", "enum", "constant", "alias"]) {
    assertExists(KIND_BADGES[kind], `Missing badge for ${kind}`);
  }
});

Deno.test("METHOD_BADGES covers HTTP methods", () => {
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    assertExists(METHOD_BADGES[method], `Missing badge for ${method}`);
  }
});
