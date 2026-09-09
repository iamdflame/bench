/**
 * Template clustering: how many of these agents are the same registration?
 *
 * `origins.ts` clusters by the host an endpoint resolves to, which is the
 * right question when you have endpoints. The registry index does not hand
 * them over in a list response, and waiting to resolve 29,000 `tokenURI`
 * reads before saying anything about concentration would mean saying nothing
 * for hours.
 *
 * There is a cheaper signal sitting in the data already. A bulk registration
 * writes the same sentence into every row it creates, so identical
 * descriptions cluster the batch without a single chain read. Measured on
 * chain 56:
 *
 *     969 agents  "Gasless stablecoin payment agent on BNB Chain."
 *     587 agents  "Autonomous Market & Protocol Research agent registered through Termix."
 *     577 agents  "Autonomous Automation & Ops agent registered through Termix."
 *     568 agents  "Autonomous Code & Smart Contracts agent registered through Termix."
 *
 * Roughly a fifth of everything that declares an endpoint shares its
 * description with at least one other agent, and 84% of the rows that do not
 * classify into one of the four jobs mention a single platform by name.
 *
 * The point is not that any of this is illegitimate. Registering a thousand
 * agents is allowed and may be useful. The point is that a marketplace which
 * renders the registry count as inventory is lying by aggregation, and a
 * buyer told there are 310,000 agents deserves to know that a template with
 * one sentence in it accounts for a thousand of them.
 *
 * Names are stripped before comparison because the commonest template varies
 * only by the name it embeds — "CrazyBoy373.agent on Termix Platform" and
 * "phamttran.agent on Termix Platform" are one template, and a comparison
 * that missed that would report the batch as a thousand distinct agents.
 */

/** At or above this many rows, a shared description is a batch worth naming. */
export const TEMPLATE_REPORT_AT = 25;

export interface TemplateGroup {
  /** The description, as the first member of the group wrote it. */
  sample: string;
  count: number;
  /** Share of the rows this clustering was run over. */
  share: number;
  /** Distinct owners inside the group — a batch is not always one account. */
  owners: number;
  /** Enough members to follow the finding into the register. */
  tokenIds: string[];
}

export interface TemplateReport {
  rows: number;
  /** Rows carrying no description at all. Counted, never silently grouped. */
  empty: number;
  distinct: number;
  /** Rows sharing a description with at least one other row. */
  clustered: number;
  groups: TemplateGroup[];
}

export interface TemplateInput {
  tokenId: string;
  name?: string | null;
  description?: string | null;
  owner?: string | null;
}

/**
 * The comparable form of a description.
 *
 * Lowercased, whitespace collapsed, and the agent's own name removed — the
 * last of which is what makes this find batches rather than count them one by
 * one. Returns null for a description with nothing in it, so empty rows are
 * reported as empty instead of forming the largest cluster on the board.
 */
export function templateKey(input: TemplateInput): string | null {
  const raw = (input.description ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!raw) return null;

  let key = raw;
  const name = (input.name ?? "").toLowerCase().trim();
  if (name) {
    // The name, and the bare handle in front of a suffix like ".agent", both
    // appear inside these templates.
    for (const variant of [name, name.replace(/\.agent$/, "")]) {
      if (variant.length >= 3) key = key.split(variant).join("«name»");
    }
  }

  // Addresses and long digit runs are per-row noise inside an otherwise
  // identical sentence.
  key = key.replace(/0x[0-9a-f]{6,}/g, "«addr»").replace(/\d{4,}/g, "«num»");

  return key.trim() || null;
}

/**
 * Group rows by the sentence they share.
 *
 * Groups are returned largest first and only above `reportAt`, because the
 * long tail of two agents sharing a sentence is noise; a thousand sharing one
 * is the finding.
 */
export function clusterTemplates(
  rows: TemplateInput[],
  opts: { reportAt?: number; sampleSize?: number } = {},
): TemplateReport {
  const reportAt = opts.reportAt ?? TEMPLATE_REPORT_AT;
  const sampleSize = opts.sampleSize ?? 8;

  const byKey = new Map<string, { sample: string; ids: string[]; owners: Set<string> }>();
  let empty = 0;

  for (const row of rows) {
    const key = templateKey(row);
    if (key === null) {
      empty += 1;
      continue;
    }
    let g = byKey.get(key);
    if (!g) {
      g = { sample: (row.description ?? "").replace(/\s+/g, " ").trim(), ids: [], owners: new Set() };
      byKey.set(key, g);
    }
    g.ids.push(row.tokenId);
    if (row.owner) g.owners.add(row.owner.toLowerCase());
  }

  const described = rows.length - empty;
  let clustered = 0;
  const groups: TemplateGroup[] = [];

  for (const g of byKey.values()) {
    if (g.ids.length > 1) clustered += g.ids.length;
    if (g.ids.length >= reportAt) {
      groups.push({
        sample: g.sample,
        count: g.ids.length,
        share: described === 0 ? 0 : g.ids.length / described,
        owners: g.owners.size,
        tokenIds: g.ids.slice(0, sampleSize),
      });
    }
  }

  groups.sort((a, b) => b.count - a.count);

  return { rows: rows.length, empty, distinct: byKey.size, clustered, groups };
}
