# Architecture

```mermaid
flowchart LR
  subgraph Browser["A judge or a buyer"]
    J["/judges /desk /diagnose /agents /status"]
    X["x402 client or MCP client"]
  end

  subgraph Vercel["Next.js on Vercel"]
    P["Server-rendered pages<br/>(work with scripting off)"]
    API["/api/v1, /api/status,<br/>/api/x402/house/:agent, /api/mcp"]
    CRON["/api/cron/daily<br/>+ refresh after each response"]
  end

  subgraph PG["Postgres"]
    SNAP["snapshots<br/>census, grid window, grid state"]
    SESS["sessions<br/>public half + sealed signer"]
    LEASE["leases"]
  end

  subgraph BSC["BNB Smart Chain"]
    RPC["six providers,<br/>rotating with a penalty box"]
    MKT["MandateMarketV2"]
    RB["RecipientBound"]
    SB["SwapBound"]
    KS["Altana KeyStore"]
    REG["ERC-8004 registry"]
    C8183["ERC-8183 commerce"]
    PCS["PancakeSwap V3"]
    VEN["Venus"]
  end

  RELAY["Altana relay"]
  OPS["Operator scripts<br/>grid-window, range-recenter,<br/>prove-passkey, hire-strangers"]

  J --> P
  X --> API
  P --> SNAP
  P --> SESS
  P --> RPC
  API --> RPC
  CRON --> SNAP
  CRON --> LEASE
  RPC --> MKT & RB & SB & KS & REG & C8183 & PCS & VEN
  OPS --> SESS
  OPS --> RELAY
  RELAY -->|session calls| RB & SB & VEN
  RB --> PCS
  SB --> PCS
```

**Reads** go through one rotating transport over six BSC providers
(`src/lib/chain/rpc.ts`). A provider that fails is skipped for a minute; `/status`
prints each one's latency.

**Numbers** come from snapshots. The committed JSON in `src/data` is the floor;
newer readings live in Postgres and are loaded at the top of each render.
Judge-facing pages refresh the census after the response when it is older than
fifteen minutes, one instance at a time by a lease row.

**Authority** is Altana sessions on the demo account. The public half of each
session (key, allowlist, caps, expiry) is plain columns; the signer is sealed
with AES-256-GCM. `/desk` compares what we granted with what the KeyStore holds.

**Value** only moves through calls with no recipient argument: RecipientBound
for positions, SwapBound for swaps, Venus markets that act for the caller.
