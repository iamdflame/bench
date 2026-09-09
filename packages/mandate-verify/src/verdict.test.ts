import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, expect, test } from "vitest";
import { decodeFunctionData, encodeFunctionResult, zeroAddress } from "viem";
import { MARKET_ABI, verifyMandate } from "./verify.js";

/**
 * The verdict, tested where it actually lives.
 *
 * The shipped v0.2.0 reported FAILED on two of the four live mandates on BNB
 * Smart Chain. Both were simply unawarded — no agent had bid, so no agent
 * could have committed an opening mark — and the verifier read that absence as
 * the gravest finding it has. The cost is not the wrong word on a terminal: a
 * CI job that greps for a non-zero exit learns to ignore this one the first
 * time it fires on a healthy mandate, and then it will not be read on the day
 * it is right.
 *
 * The distinction is worth a test rather than a careful reading, so these run
 * `verifyMandate` unchanged against a local node that answers with a canned
 * mandate. No seam was added to the verifier to make this possible — `--rpc`
 * is the same public option anyone pointing it at their own node would use,
 * which means the path under test is exactly the shipped one.
 */

type Mandate = { agent: `0x${string}`; epochsSettled: number; attested?: boolean };

/** A node that serves one mandate and no logs. */
function nodeServing(m: Mandate) {
  const mandate = {
    principal: "0x1111111111111111111111111111111111111111",
    capital: 50_000_000_000_000n,
    agent: m.agent,
    bond: 0n,
    category: 0,
    state: 1,
    toleranceBps: 0,
    feeBps: 0,
    slashBps: 0,
    epochLength: 3600,
    epochsTotal: 6,
    epochsSettled: m.epochsSettled,
    lastSettledAt: 0n,
    cumulativeAlphaBps: 0n,
    strikes: 0,
  };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const rpc = JSON.parse(body);
      const reply = (result: unknown) =>
        res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
      res.setHeader("content-type", "application/json");

      if (rpc.method === "eth_chainId") return reply("0x38");
      if (rpc.method === "eth_blockNumber") return reply("0x7000000");
      if (rpc.method === "eth_getLogs") return reply([]);
      if (rpc.method === "eth_call") {
        const { functionName } = decodeFunctionData({
          abi: MARKET_ABI,
          data: rpc.params[0].data,
        });
        if (functionName === "mandateCount")
          return reply(encodeFunctionResult({ abi: MARKET_ABI, functionName, result: 4n }));
        if (functionName === "getMandate")
          return reply(
            encodeFunctionResult({ abi: MARKET_ABI, functionName, result: mandate as never }),
          );
        const empty = [`0x${"00".repeat(32)}`, 0n, 0n, 0n];
        const stored = [`0x${"ab".repeat(32)}`, 1_000_000_000_000_000n, 120_000_000n, 1_760_000_000n];
        return reply(
          encodeFunctionResult({
            abi: MARKET_ABI,
            functionName: functionName as "openAttestation",
            result: (m.attested ? stored : empty) as never,
          }),
        );
      }
      return reply(null);
    });
  });
  return server;
}

const servers: ReturnType<typeof createServer>[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function verifyAgainst(m: Mandate) {
  const server = nodeServing(m);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return verifyMandate({
    mandateId: 1,
    chainId: 56,
    rpc: `http://127.0.0.1:${port}`,
  });
}

test("a mandate nobody has been awarded is open, not failed", async () => {
  const r = await verifyAgainst({ agent: zeroAddress, epochsSettled: 0 });

  expect(r.awarded).toBe(false);
  expect(r.failures).toEqual([]);
  expect(r.notes.some((n) => n.includes("has not been awarded"))).toBe(true);
});

test("an awarded mandate with nothing committed still fails", async () => {
  const r = await verifyAgainst({
    agent: "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
    epochsSettled: 0,
  });

  expect(r.awarded).toBe(true);
  expect(r.failures).toContain(
    "no opening attestation: nothing was committed for this mandate to be judged against",
  );
});


/**
 * The other half of the same principle, and the more dangerous half.
 *
 * This node stores attestations and serves no logs, which is exactly what BNB
 * Smart Chain looks like from a public provider today: contract storage answers
 * every time, and of the three allowed log providers one refuses `eth_getLogs`
 * over any range, one rejects the parameters, and one returns an empty array
 * for windows that demonstrably contain events.
 *
 * Read as a finding, that absence convicts a mandate of having no preimage
 * behind a commitment it does hold. Read correctly, it says nobody would show
 * us the logs. The verifier now separates the two by what a check had to read:
 * contract state can convict, a missing event cannot.
 *
 * This must not be mistaken for the verifier going quiet. Tampering is caught
 * by comparing values that are present — the hash against its commitment, the
 * settled alpha against what the marks imply — and those still fail loudly.
 * `--tamper` rejects 8 of 8 perturbations on mandate 0 with this change in.
 */
test("a log nobody will serve is unresolved, never a failure", async () => {
  const r = await verifyAgainst({
    agent: "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
    epochsSettled: 2,
    attested: true,
  });

  expect(r.awarded).toBe(true);
  // The attestations are in storage, so nothing here is a finding against it.
  expect(r.failures).toEqual([]);
  expect(r.unresolved.length).toBeGreaterThan(0);
  expect(r.unresolved.some((u) => u.includes("preimage"))).toBe(true);
});

test("state the chain does answer still convicts", async () => {
  // No attestation in storage on an awarded mandate. Storage is served by every
  // node, so this absence is the chain speaking rather than a provider
  // declining, and it remains the gravest finding the verifier has.
  const r = await verifyAgainst({
    agent: "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
    epochsSettled: 0,
    attested: false,
  });

  expect(r.failures).toContain(
    "no opening attestation: nothing was committed for this mandate to be judged against",
  );
});
