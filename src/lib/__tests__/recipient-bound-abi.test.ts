/**
 * The interface assertion, from the compiled artifact.
 *
 * RecipientBound exists so that `mint` and `collect` have no recipient
 * argument. The Forge suite proves the binding by execution; this reads the
 * ABI the contract actually exposes and fails if a recipient, or any address
 * at all, ever appears on a call that moves value.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const artifact = () =>
  JSON.parse(readFileSync(join(process.cwd(), "contracts/out/RecipientBound.sol/RecipientBound.json"), "utf8")) as {
    abi: { type: string; name?: string; inputs?: { name: string; type: string; components?: { name: string; type: string }[] }[] }[];
  };

const flat = (inputs: { name: string; type: string; components?: { name: string; type: string }[] }[] = []) =>
  inputs.flatMap((i) => (i.components ? i.components.map((c) => ({ ...c, name: `${i.name}.${c.name}` })) : [i]));

describe("RecipientBound ABI", () => {
  const abi = artifact().abi;
  const fn = (name: string) => abi.find((f) => f.type === "function" && f.name === name);

  it("exposes the four position calls", () => {
    for (const n of ["mint", "increaseLiquidity", "decreaseLiquidity", "collect"]) expect(fn(n), n).toBeTruthy();
  });

  it("has no input named recipient anywhere", () => {
    for (const f of abi.filter((x) => x.type === "function")) {
      for (const i of flat(f.inputs)) expect(i.name.toLowerCase(), `${f.name}.${i.name}`).not.toMatch(/recipient|to$|dest/);
    }
  });

  it("takes no address at all on any value-moving call", () => {
    for (const n of ["mint", "increaseLiquidity", "decreaseLiquidity", "collect"]) {
      for (const i of flat(fn(n)!.inputs)) expect(i.type, `${n}.${i.name}`).not.toBe("address");
    }
  });

  it("has no owner, upgrade or rotation surface", () => {
    const names = abi.filter((x) => x.type === "function").map((x) => x.name!);
    for (const bad of ["setPrincipal", "setAgent", "upgradeTo", "upgradeToAndCall", "transferOwnership", "setCap", "setExpiry"]) {
      expect(names, bad).not.toContain(bad);
    }
  });
});
