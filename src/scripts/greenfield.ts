/**
 * Publishes attestation preimages to BNB Greenfield.
 *
 *   npm run greenfield -- fund [bnb]     bridge BNB from BSC to Greenfield
 *   npm run greenfield -- status         balances, bucket, objects
 *   npm run greenfield -- bucket         create the bucket
 *   npm run greenfield -- publish        upload every attestation's breakdown
 *   npm run greenfield -- check          fetch each object back and re-hash it
 *
 * `check` is the one that matters: it reads the objects back over the public
 * gateway, hashes them, and compares against what the chain records. Uploading
 * evidence nobody re-reads is filing, not proof.
 */

import { formatEther, parseEther, type Address, type Hex } from "viem";
import {
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketChain,
  marketClient,
  readMandate,
  walletFor,
} from "@/lib/chain/market";
import {
  breakdownRef,
  bucketName,
  canonicalBreakdown,
  CROSS_CHAIN,
  CROSS_CHAIN_ABI,
  greenfieldClient,
  jsonBody,
  sdk,
  objectName,
  objectUrl,
  TOKEN_HUB,
  TOKEN_HUB_ABI,
  type Breakdown,
} from "@/lib/chain/greenfield";

/* eslint-disable @typescript-eslint/no-explicit-any */

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const owner = walletFor(norm(process.env.PRIVATE_KEY));
const ME = owner.account!.address;
const cmd = process.argv[2] ?? "status";
const BUCKET = bucketName();

const log = (...a: unknown[]) => console.log(...a);

async function greenfieldBalance(): Promise<bigint> {
  const client = await greenfieldClient();
  const r = await client.account.getAccountBalance({ address: ME, denom: "BNB" });
  return BigInt(r?.balance?.amount ?? "0");
}

async function status() {
  const [bsc, gf] = await Promise.all([
    marketClient.getBalance({ address: ME }),
    greenfieldBalance().catch(() => 0n),
  ]);
  log(`\n  account   ${ME}`);
  log(`  on BSC    ${formatEther(bsc)} BNB`);
  log(`  Greenfield ${formatEther(gf)} BNB`);
  log(`  bucket    ${BUCKET}`);

  const client = await greenfieldClient();
  try {
    const info = await client.bucket.headBucket(BUCKET);
    log(`  exists    yes · owner ${info?.bucketInfo?.owner ?? "?"}`);
  } catch {
    log(`  exists    no`);
  }
  log("");
}

/** Bridges BNB from BSC to Greenfield through the TokenHub. */
async function fund(amountBnb: string) {
  const amount = parseEther(amountBnb);
  const [relayFee, ackRelayFee] = (await marketClient.readContract({
    address: CROSS_CHAIN,
    abi: CROSS_CHAIN_ABI,
    functionName: "getRelayFees",
  })) as readonly [bigint, bigint];

  const value = amount + relayFee + ackRelayFee;
  const balance = await marketClient.getBalance({ address: ME });

  log(`\n  bridging ${formatEther(amount)} BNB to Greenfield`);
  log(`    relay fee     ${formatEther(relayFee)}`);
  log(`    ack relay fee ${formatEther(ackRelayFee)}`);
  log(`    total sent    ${formatEther(value)}`);
  log(`    balance       ${formatEther(balance)}\n`);

  if (balance < value + parseEther("0.0005")) {
    console.error("  refusing: that would leave nothing for gas.\n");
    process.exit(1);
  }

  const hash = await owner.writeContract({
    address: TOKEN_HUB,
    abi: TOKEN_HUB_ABI,
    functionName: "transferOut",
    args: [ME, amount],
    value,
    chain: marketChain,
    account: owner.account!,
  } as never);
  const r = await marketClient.waitForTransactionReceipt({ hash });
  log(`  ${r.status === "success" ? "sent" : "REVERTED"}  https://bscscan.com/tx/${hash}`);
  if (r.status !== "success") process.exit(1);

  // The relayer moves it; it does not arrive in the same block.
  log(`\n  waiting for the relayer…`);
  for (let i = 0; i < 40; i++) {
    await new Promise((s) => setTimeout(s, 6_000));
    const gf = await greenfieldBalance().catch(() => 0n);
    if (gf > 0n) {
      log(`  arrived: ${formatEther(gf)} BNB on Greenfield\n`);
      return;
    }
    process.stdout.write(`\r    ${(i + 1) * 6}s`);
  }
  log(`\n  not arrived yet. Re-check with: npm run greenfield -- status\n`);
}

async function makeBucket() {
  const client = await greenfieldClient();
  const sps = await client.sp.getStorageProviders();
  const sp = sps.find((s: any) => Number(s.status) === 0) ?? sps[0];
  if (!sp) throw new Error("no storage provider available");
  log(`\n  storage provider ${sp.operatorAddress}\n  ${sp.endpoint}\n`);

  // chargedReadQuota is a protobuf uint64: the encoder calls .isZero() on it,
  // so a string throws. It wants the SDK's own Long.
  const { Long, VisibilityType } = await sdk();
  const tx = await client.bucket.createBucket({
    bucketName: BUCKET,
    creator: ME,
    // Numeric enums on the wire; the string form encodes as "unspecified"
    // and the chain rejects it.
    visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
    chargedReadQuota: Long.fromString("0"),
    primarySpAddress: sp.operatorAddress,
    paymentAddress: ME,
  });
  const sim = await tx.simulate({ denom: "BNB" });
  const res = await tx.broadcast({
    denom: "BNB",
    gasLimit: Number(sim.gasLimit),
    gasPrice: sim.gasPrice,
    payer: ME,
    granter: "",
    privateKey: norm(process.env.PRIVATE_KEY),
  });
  log(`  bucket ${BUCKET} created · ${res.transactionHash}\n`);
}

/** Builds the breakdown for one attestation from what the chain recorded. */
async function buildBreakdown(mandateId: number, epoch: number | "open"): Promise<Breakdown | null> {
  const att = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: epoch === "open" ? "openAttestation" : "epochAttestation",
    args: epoch === "open" ? [BigInt(mandateId)] : [BigInt(mandateId), epoch],
  })) as readonly [string, bigint, bigint, bigint];
  if (att[1] === 0n) return null;

  const m = await readMandate(mandateId);
  return {
    schema: "mandate.observation.breakdown/1",
    mandateId,
    epoch,
    wallet: m.agent as Address,
    blockNumber: att[2].toString(),
    valuationWei: att[1].toString(),
    gasSpentWei: "0",
    parts: [{ asset: "BNB", amount: formatEther(att[1]), wei: att[1].toString() }],
    pool: {
      address: "0x36696169C63e42cd08ce11f5deeBbCeBae652050",
      sqrtPriceX96: "0",
      priceUsdtPerBnb: "0",
    },
    observationHash: att[0],
    takenAt: att[3].toString(),
  };
}

async function publish() {
  const client = await greenfieldClient();
  const { VisibilityType } = await sdk();
  const count = Number(
    await marketClient.readContract({
      address: MARKET_ADDRESS,
      abi: MANDATE_MARKET_ABI,
      functionName: "mandateCount",
    }),
  );

  for (let id = 0; id < count; id++) {
    const m = await readMandate(id);
    const epochs: (number | "open")[] = ["open"];
    for (let e = 0; e < m.epochsSettled; e++) epochs.push(e);

    for (const epoch of epochs) {
      const b = await buildBreakdown(id, epoch);
      if (!b) continue;
      const body = canonicalBreakdown(b);
      const name = objectName(id, epoch);
      const ref = breakdownRef(b);

      // The delegated path: the storage provider performs the on-chain
      // create. The direct path needs erasure-coded checksums computed
      // client-side, which the SDK does not do in Node — createObject
      // failed on undefined checksums.
      //
      // Retried because the SP rejects a second request signed within the same
      // second as "request repeated", which is a replay guard rather than a
      // problem with the upload.
      let done = false;
      for (let attempt = 0; attempt < 5 && !done; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2_500 * attempt));
        try {
          const res = await client.object.delegateUploadObject(
            {
              bucketName: BUCKET,
              objectName: name,
              body: jsonBody(body) as any,
              delegatedOpts: { visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ },
            },
            { type: "ECDSA", privateKey: norm(process.env.PRIVATE_KEY) },
          );
          if (res?.code === 0 || res?.code === undefined) {
            log(`  ${name}  ${body.length}B  ref ${ref.slice(0, 18)}…`);
            done = true;
          } else if (res.code === 110010 || /exist/i.test(String(res.message))) {
            log(`  ${name}  already published`);
            done = true;
          } else if (attempt === 4) {
            log(`  ${name}  FAILED: code ${res.code} ${String(res.message ?? "").slice(0, 80)}`);
          }
        } catch (e) {
          if (attempt === 4) log(`  ${name}  FAILED: ${String(e).slice(0, 120)}`);
        }
      }
      // The replay guard is time-based, so the next upload waits it out.
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  log("");
}

/** Reads every object back over the public gateway and re-hashes it. */
async function check() {
  // The gateway is the bucket's own primary storage provider, not a fixed
  // host: buckets are assigned an SP at creation and served from there.
  const client = await greenfieldClient();
  const sp: string = await client.sp.getSPUrlByBucket(BUCKET);
  log(`\n  reading back from ${sp}\n`);

  const count = Number(
    await marketClient.readContract({
      address: MARKET_ADDRESS,
      abi: MANDATE_MARKET_ABI,
      functionName: "mandateCount",
    }),
  );
  let ok = 0;
  let bad = 0;
  let missing = 0;

  for (let id = 0; id < count; id++) {
    const m = await readMandate(id);
    const epochs: (number | "open")[] = ["open"];
    for (let e = 0; e < m.epochsSettled; e++) epochs.push(e);

    for (const epoch of epochs) {
      const expected = await buildBreakdown(id, epoch);
      if (!expected) continue;
      const name = objectName(id, epoch);
      const url = `${sp.replace(/\/$/, "")}/view/${BUCKET}/${name}`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!r.ok) {
          log(`  ✗ ${name}  gateway ${r.status}`);
          missing++;
          continue;
        }
        const body = await r.text();
        const fetchedRef = breakdownRef(JSON.parse(body) as Breakdown);
        const localRef = breakdownRef(expected);
        if (fetchedRef === localRef) {
          log(`  ✓ ${name}  ${fetchedRef.slice(0, 18)}… matches the chain`);
          ok++;
        } else {
          log(`  ✗ ${name}  stored ${fetchedRef.slice(0, 18)}… vs chain ${localRef.slice(0, 18)}…`);
          bad++;
        }
      } catch (e) {
        log(`  ✗ ${name}  ${String(e).slice(0, 90)}`);
        missing++;
      }
    }
  }
  log(`\n  ${ok} verified · ${bad} mismatched · ${missing} unreachable\n`);
  process.exit(bad > 0 ? 1 : missing > 0 ? 3 : 0);
}

if (cmd === "status") await status();
else if (cmd === "fund") await fund(process.argv[3] ?? "0.002");
else if (cmd === "bucket") await makeBucket();
else if (cmd === "publish") await publish();
else if (cmd === "check") await check();
else {
  console.error("usage: greenfield.ts <status|fund [bnb]|bucket|publish|check>");
  process.exit(1);
}
