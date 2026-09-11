/**
 * The paying client, tested against the challenges strangers actually sent.
 *
 * Each fixture is a 402 captured from a live agent on 11 September 2026. The
 * signatures are recovered back to the signer with the same domain and types
 * a seller would use, so an envelope that passes here is one a spec-following
 * seller can verify.
 */

import { describe, expect, it } from "vitest";
import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PERMIT2,
  PERMIT2_WITNESS_TYPES,
  X402_PERMIT2_PROXY,
  fromBase64,
  readCapped,
  readRequirements,
  signPayment,
  toBase64,
  whyUnpayable,
} from "../x402/pay";
import { TRANSFER_TYPES, challenge } from "../x402";
import { parseChallenge } from "../x402/quote";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const noDomainCheck = async () => undefined;

const MUSTER = {
  x402Version: 2,
  accepts: [
    {
      scheme: "eip3009",
      network: "eip155:56",
      asset: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
      maxAmountRequired: "20000000000000000",
      amount: "20000000000000000",
      payTo: "0xcd10D44703D6989290E0A8219f345fA0a5BF4c64",
      resource: "https://muster.zkasuran.dev/api/agent/health-factor",
      description: "Reads a borrower position on Venus and returns the health factor.",
      mimeType: "application/json",
      maxTimeoutSeconds: 300,
      extra: { name: "World Liberty Financial USD", version: "1", decimals: 18 },
    },
  ],
  error: "PAYMENT-SIGNATURE header is required",
};

const AGRIPINAA = {
  x402Version: 2,
  error: "payment required",
  description: "Agripinaa grid agent: live status",
  accepts: [
    {
      scheme: "exact",
      network: "eip155:56",
      asset: "0x55d398326f99059fF775485246999027B3197955",
      payTo: "0xD6Db7AdE6ED34d1CF0836d7A1aac5ba3B860c82A",
      amount: "50000000000000000",
      maxTimeoutSeconds: 300,
      extra: {
        name: "Tether USD",
        version: "1",
        assetTransferMethod: "permit2-exact",
        spenderAddress: "0x7f922FB740E2036477346f559e5660fA38A2C9E5",
      },
    },
  ],
};

const VAULT = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:56",
      amount: "10000000000000000",
      asset: "0xcE24439F2D9C6a2289F741120FE202248B666666",
      payTo: "0xA06Db692d7e28356f80199Ff77E22a0Ef02A3518",
      maxTimeoutSeconds: 600,
      extra: { assetTransferMethod: "eip3009", decimals: 18, name: "United Stables", symbol: "U", version: "1" },
    },
  ],
  resource: { url: "https://hyperliquidvault.space/x402", description: "Hyperliquid Vault Strategy Intelligence", mimeType: "application/json" },
};

const decode = (b64: string) => JSON.parse(fromBase64(b64)) as Record<string, any>;

/** EIP-712 encodeType, written out so the witness type can be compared with the proxy's. */
function encodeType(primary: string, types: Record<string, readonly { name: string; type: string }[]>): string {
  const deps = new Set<string>();
  const walk = (t: string) => {
    for (const f of types[t] ?? []) if (types[f.type] && !deps.has(f.type) && f.type !== primary) (deps.add(f.type), walk(f.type));
  };
  walk(primary);
  const one = (t: string) => `${t}(${types[t].map((f) => `${f.type} ${f.name}`).join(",")})`;
  return [primary, ...[...deps].sort()].map(one).join("");
}

describe("reading 402s", () => {
  it("reads Muster's v2 terms, header or body, as payable EIP-3009 in USD1", () => {
    const fromHeader = readRequirements(null, toBase64(JSON.stringify(MUSTER)));
    const fromBody = readRequirements(MUSTER, null);
    for (const [r] of [fromHeader, fromBody]) {
      expect(r.x402Version).toBe(2);
      expect(r.header).toBe("PAYMENT-SIGNATURE");
      expect(r.method).toBe("eip3009");
      expect(r.domain).toEqual({ name: "World Liberty Financial USD", version: "1" });
      expect(r.amount).toBe(20000000000000000n);
      expect(r.resource?.url).toBe("https://muster.zkasuran.dev/api/agent/health-factor");
      expect(whyUnpayable(r)).toBeNull();
    }
  });

  it("reads Agripinaa's USDT terms as payable by Permit2 through its named spender, on the b402 wire", () => {
    const [r] = readRequirements(AGRIPINAA);
    expect(r.method).toBe("permit2");
    expect(r.spender).toBe("0x7f922FB740E2036477346f559e5660fA38A2C9E5");
    expect(r.dialect).toBe("b402");
    // Their server reads X-PAYMENT only (agripinaa apps/agents/src/x402-server.ts).
    expect(r.header).toBe("X-PAYMENT");
    expect(whyUnpayable(r)).toBeNull();
  });

  it("keeps Muster on the x402 wire, because its error demands PAYMENT-SIGNATURE", () => {
    const [r] = readRequirements(MUSTER);
    expect(r.dialect).toBe("x402");
    expect(r.header).toBe("PAYMENT-SIGNATURE");
  });

  it("falls back to the spec's proxy when a Permit2 seller names no spender", () => {
    const bare = structuredClone(AGRIPINAA);
    delete (bare.accepts[0].extra as Record<string, unknown>).spenderAddress;
    const [r] = readRequirements(bare);
    expect(r.spender).toBe(X402_PERMIT2_PROXY);
    // No named settler means the spec's envelope, not the b402 one.
    expect(r.dialect).toBe("x402");
  });

  it("refuses USDT by EIP-3009, and other chains, with the reason", () => {
    const usdt3009 = structuredClone(AGRIPINAA);
    usdt3009.accepts[0].extra.assetTransferMethod = "eip3009";
    expect(whyUnpayable(readRequirements(usdt3009)[0])).toMatch(/no transferWithAuthorization/);
    const base = structuredClone(MUSTER);
    base.accepts[0].network = "eip155:8453";
    expect(whyUnpayable(readRequirements(base)[0])).toMatch(/not BNB Smart Chain/);
  });

  it("reads the vault's terms with a top-level resource object, and infers v2 when the version is omitted", () => {
    const [r] = readRequirements(VAULT);
    expect(r.domain).toEqual({ name: "United Stables", version: "1" });
    expect(r.resource?.url).toBe("https://hyperliquidvault.space/x402");
    const unstated = structuredClone(VAULT) as Record<string, unknown>;
    delete unstated.x402Version;
    const [u] = readRequirements(unstated);
    expect(u.x402Version).toBe(2);
    expect(u.header).toBe("PAYMENT-SIGNATURE");
  });

  it("keeps our own v1 house challenge on X-PAYMENT", () => {
    const body = challenge({ resource: "/api/x402/house/grid-1", description: "Grid-1", priceAtomic: 50000000000000000n });
    const [r] = readRequirements(body);
    expect(r.x402Version).toBe(1);
    expect(r.header).toBe("X-PAYMENT");
    expect(r.method).toBe("eip3009");
  });

  it("gives the quote parser the same verdicts", () => {
    expect(parseChallenge("u", MUSTER)?.payable).toBe(true);
    expect(parseChallenge("u", AGRIPINAA)?.transferMethod).toBe("permit2");
    expect(parseChallenge("u", AGRIPINAA)?.payable).toBe(true);
  });
});

describe("signing payments", () => {
  it("builds a v2 EIP-3009 envelope that recovers to the payer and echoes the terms", async () => {
    const [r] = readRequirements(MUSTER);
    const signed = await signPayment(account, r, { now: 1_757_600_000, verifyDomain: noDomainCheck });
    expect(signed.header).toBe("PAYMENT-SIGNATURE");
    const env = decode(signed.value);
    expect(env.x402Version).toBe(2);
    expect(env.accepted).toEqual(MUSTER.accepts[0]);
    const a = env.payload.authorization;
    expect(a.to).toBe(MUSTER.accepts[0].payTo);
    expect(a.value).toBe("20000000000000000");
    expect(Number(a.validAfter)).toBe(1_757_600_000 - 60);
    const who = await recoverTypedDataAddress({
      domain: { name: "World Liberty Financial USD", version: "1", chainId: 56, verifyingContract: r.asset },
      types: TRANSFER_TYPES,
      primaryType: "TransferWithAuthorization",
      message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) },
      signature: env.payload.signature as Hex,
    });
    expect(who).toBe(account.address);
  });

  it("builds a Permit2 witness envelope that recovers to the payer, pays payTo, and names the seller's spender", async () => {
    const [r] = readRequirements(AGRIPINAA);
    const signed = await signPayment(account, r, { now: 1_757_600_000, verifyDomain: noDomainCheck });
    const env = decode(signed.value);
    expect(signed.header).toBe("X-PAYMENT");
    expect(env).toMatchObject({ x402Version: 2, scheme: "exact", network: "eip155:56" });
    expect(env.accepted).toEqual(AGRIPINAA.accepts[0]);
    const p = env.payload;
    // Altana's merchant decodes `permit` with its witness; b402 facilitators read `permit2Authorization`.
    expect(p.from).toBe(account.address);
    expect(p.permit.witness.to).toBe(AGRIPINAA.accepts[0].payTo);
    const auth = p.permit2Authorization;
    expect(auth.spender).toBe("0x7f922FB740E2036477346f559e5660fA38A2C9E5");
    expect(auth.witness.to).toBe(AGRIPINAA.accepts[0].payTo);
    expect(auth.permitted).toEqual({ token: AGRIPINAA.accepts[0].asset, amount: "50000000000000000" });
    const who = await recoverTypedDataAddress({
      domain: { name: "Permit2", chainId: 56, verifyingContract: PERMIT2 },
      types: PERMIT2_WITNESS_TYPES,
      primaryType: "PermitWitnessTransferFrom",
      message: {
        permitted: { token: auth.permitted.token, amount: BigInt(auth.permitted.amount) },
        spender: auth.spender,
        nonce: BigInt(auth.nonce),
        deadline: BigInt(auth.deadline),
        witness: { to: auth.witness.to, validAfter: BigInt(auth.witness.validAfter) },
      },
      signature: p.signature as Hex,
    });
    expect(who).toBe(account.address);
  });

  it("signs the witness type the x402 proxy verifies, byte for byte", () => {
    // x402ExactPermit2Proxy.WITNESS_TYPE_STRING, prefixed the way Permit2 prefixes it.
    const proxy =
      "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline," +
      "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter)";
    expect(encodeType("PermitWitnessTransferFrom", PERMIT2_WITNESS_TYPES)).toBe(proxy);
  });

  it("will not sign for terms it cannot pay", async () => {
    const base = structuredClone(MUSTER);
    base.accepts[0].network = "eip155:8453";
    await expect(signPayment(account, readRequirements(base)[0], { verifyDomain: noDomainCheck })).rejects.toThrow(/cannot pay/);
  });
});

describe("reading bodies", () => {
  it("stops at 256 KB and says so", async () => {
    const big = new Response(new Uint8Array(300 * 1024).fill(97));
    const { text, truncated } = await readCapped(big);
    expect(truncated).toBe(true);
    expect(text.length).toBe(256 * 1024);
  });
});
