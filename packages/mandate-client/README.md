# mandate-client

Client for the **MANDATE public assay API** — assay any ERC-8004 agent on BNB
Smart Chain, read the trust ladder, browse the register.

Free. Unauthenticated. Rate limited. No key, no account, no permission.

```bash
npm i mandate-client
```

```ts
import { Mandate } from "mandate-client";

const mandate = new Mandate();

const assay = await mandate.assay(2410);
console.log(assay.fineness, assay.hallmarked, assay.observed.blockNumber);

const funnel = await mandate.funnel();
for (const rung of funnel.rungs) {
  console.log(rung.rung, rung.name, rung.population ?? "not measurable");
}

const page = await mandate.agents({ rung: 2, limit: 20 });
console.log(`${page.coverage.read} of ${page.coverage.registered} read`);
```

## What the answers guarantee

**Every response carries the state it was read from.** `observed.blockNumber`
and `observed.at` are on every payload. A number without its observation
boundary is a claim, and this API does not serve claims.

**A population that cannot be measured is `null`, not a guess.** Rung 3 needs a
log scan per agent that no free BSC provider will serve at registry scale, so
its `population` is null and its `method` says why. There is no plausible
number in that field.

**`coverage` distinguishes a small answer from a small registry.** `read` is
how many agents have actually been fetched and parsed; `unread` is the rest.
A caller can always tell the difference between "few agents match your filter"
and "few agents have been looked at".

**Every assay carries the command that reproduces it.** `reproduce` is a shell
line that re-runs the same six tests from a clean checkout of the source.

## Limits

| Endpoint | Limit |
|---|---|
| `assay(tokenId)` | 10 / minute |
| `agents(filter)` | 30 / minute |
| `funnel()` | 60 / minute |

Exceeding one throws a `MandateError` with `status: 429` and `retryAfter` in
seconds. Limits are returned on every response as `x-ratelimit-*` headers.

## Why this is open

MANDATE is an assay office for autonomous agents. An assay office whose
findings only its own front end could read would be a trade association.

The API is open to everyone, including the projects competing with the one that
runs it. If a rival marketplace wants to show fineness on its own listings, the
data is here and it costs nothing. The argument this project makes is stronger
the more people can check it — and a measurement nobody else can obtain is
indistinguishable from one nobody else can falsify.

MIT.
