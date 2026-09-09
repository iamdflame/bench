/**
 * The materialised index.
 *
 * The web app never calls 8004scan on the request path — the upstream limit is
 * 30 req/min anonymous, 500/min with a key, against 301,160 BSC agents. The
 * indexer writes here; the app only reads.
 *
 * Evidence is stored alongside every verdict so a page can render the proof
 * without recomputing it, and so a judge can check any number we print.
 */

import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const agents = pgTable(
  "agents",
  {
    chainId: integer("chain_id").notNull(),
    tokenId: text("token_id").notNull(),
    agentId: text("agent_id").notNull(),

    name: text("name"),
    description: text("description"),
    imageUrl: text("image_url"),

    ownerAddress: text("owner_address"),
    creatorAddress: text("creator_address"),
    agentWallet: text("agent_wallet"),

    // What the registry claims.
    registryScore: doublePrecision("registry_score"),
    registryFeedbacks: integer("registry_feedbacks").default(0),
    registryAvgScore: doublePrecision("registry_avg_score"),
    isEndpointVerified: boolean("is_endpoint_verified").default(false),
    endpointDomain: text("endpoint_domain"),
    a2aEndpoint: text("a2a_endpoint"),
    mcpServer: text("mcp_server"),
    supportedProtocols: jsonb("supported_protocols").$type<string[]>(),
    x402Supported: boolean("x402_supported").default(false),
    createdBlockNumber: integer("created_block_number"),
    createdTxHash: text("created_tx_hash"),
    registeredAt: timestamp("registered_at", { withTimezone: true }),

    // What the chain proves.
    walletNonce: integer("wallet_nonce"),
    walletBalanceWei: text("wallet_balance_wei"),
    walletIsContract: boolean("wallet_is_contract"),
    /** True when agent_wallet is byte-identical to owner_address. */
    custodyIsShared: boolean("custody_is_shared"),

    // What we concluded.
    category: text("category"),
    categoryConfidence: real("category_confidence"),
    /** 0-1000 millesimal. */
    fineness: integer("fineness"),
    hallmark: text("hallmark"),
    results: jsonb("results").$type<unknown[]>(),

    assayedAt: timestamp("assayed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.tokenId] }),
    index("agents_fineness_idx").on(t.fineness),
    index("agents_category_idx").on(t.category),
    index("agents_wallet_idx").on(t.agentWallet),
    index("agents_owner_idx").on(t.ownerAddress),
    index("agents_verified_idx").on(t.isEndpointVerified),
  ],
);

export const feedbacks = pgTable(
  "feedbacks",
  {
    id: text("id").primaryKey(),
    feedbackId: text("feedback_id"),
    chainId: integer("chain_id").notNull(),
    agentTokenId: text("agent_token_id"),
    reviewerAddress: text("reviewer_address"),
    score: doublePrecision("score"),
    value: doublePrecision("value"),
    tag1: text("tag1"),
    tag2: text("tag2"),
    txHash: text("tx_hash"),
    blockNumber: integer("block_number"),
    isRevoked: boolean("is_revoked").default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [
    index("feedbacks_agent_idx").on(t.chainId, t.agentTokenId),
    index("feedbacks_reviewer_idx").on(t.reviewerAddress),
    index("feedbacks_submitted_idx").on(t.submittedAt),
  ],
);

/** One row per reviewer wallet, with the coordination verdict against it. */
export const reviewers = pgTable(
  "reviewers",
  {
    chainId: integer("chain_id").notNull(),
    address: text("address").notNull(),
    feedbackCount: integer("feedback_count").default(0),
    agentCount: integer("agent_count").default(0),
    maxPerAgent: integer("max_per_agent").default(0),
    medianGapMs: integer("median_gap_ms"),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    isFlagged: boolean("is_flagged").default(false),
    /** Human-readable reasons. Never a black box. */
    flagReasons: jsonb("flag_reasons").$type<string[]>(),
    /** Connected-component id within the coordination graph. */
    ringId: integer("ring_id"),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.address] }),
    index("reviewers_ring_idx").on(t.ringId),
    index("reviewers_flagged_idx").on(t.isFlagged),
  ],
);

/** Edges of the co-review graph, for rendering the ring. */
export const reviewerEdges = pgTable(
  "reviewer_edges",
  {
    chainId: integer("chain_id").notNull(),
    a: text("a").notNull(),
    b: text("b").notNull(),
    /** Jaccard similarity of the two reviewers' agent sets. */
    similarity: real("similarity").notNull(),
    sharedAgents: integer("shared_agents").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.a, t.b] }),
    index("edges_sim_idx").on(t.similarity),
  ],
);

/** Rolling snapshot of the funnel, so the landing page never computes live. */
export const stats = pgTable(
  "stats",
  {
    chainId: integer("chain_id").notNull(),
    key: text("key").notNull(),
    value: doublePrecision("value").notNull(),
    detail: jsonb("detail"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.key] })],
);

/** Indexer bookkeeping so a crawl can resume rather than restart. */
export const cursors = pgTable("cursors", {
  name: text("name").primaryKey(),
  offset: integer("offset").default(0),
  total: integer("total").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  note: text("note"),
});

export const assayRuns = pgTable(
  "assay_runs",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    tokenId: text("token_id").notNull(),
    fineness: integer("fineness"),
    ms: integer("ms"),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow(),
    /** Bench runs are user-triggered; indexer runs are scheduled. */
    source: text("source"),
  },
  (t) => [uniqueIndex("assay_runs_agent_idx").on(t.chainId, t.tokenId, t.ranAt)],
);
