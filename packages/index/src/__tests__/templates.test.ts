/**
 * The clustering has one job that matters: find a batch that varies only by
 * the name embedded in it. A comparison that missed that would report a
 * thousand copies of one sentence as a thousand distinct agents, which is the
 * exact overcount this module exists to prevent.
 */

import { describe, expect, it } from "vitest";
import { clusterTemplates, templateKey } from "../templates";

const row = (tokenId: string, description: string | null, name?: string, owner?: string) => ({
  tokenId,
  name: name ?? null,
  description,
  owner: owner ?? null,
});

describe("templateKey", () => {
  it("treats a template that embeds the agent's own name as one template", () => {
    const a = templateKey(row("1", "CrazyBoy373.agent on Termix Platform", "CrazyBoy373.agent"));
    const b = templateKey(row("2", "phamttran.agent on Termix Platform", "phamttran.agent"));
    expect(a).toBe(b);
  });

  it("ignores case and irregular whitespace", () => {
    expect(templateKey(row("1", "Gasless   stablecoin\nagent."))).toBe(
      templateKey(row("2", "gasless stablecoin agent.")),
    );
  });

  it("folds addresses and long digit runs, which vary per row", () => {
    expect(templateKey(row("1", "Serves 0xAbCdEf123456 with 998877 units"))).toBe(
      templateKey(row("2", "Serves 0x9911223344ff with 112233 units")),
    );
  });

  it("keeps genuinely different sentences apart", () => {
    expect(templateKey(row("1", "Rebalances PancakeSwap V3 ranges."))).not.toBe(
      templateKey(row("2", "Monitors Venus health factors.")),
    );
  });

  it("returns null for an absent description rather than grouping the blanks", () => {
    expect(templateKey(row("1", null))).toBeNull();
    expect(templateKey(row("2", "   "))).toBeNull();
  });
});

describe("clusterTemplates", () => {
  it("reports a batch, its size and how many owners are behind it", () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => row(`b${i}`, "Autonomous agent registered through a platform.", undefined, i < 10 ? "0xaaa" : "0xbbb")),
      row("x1", "Rebalances PancakeSwap V3 ranges."),
      row("x2", "Monitors Venus health factors."),
    ];

    const report = clusterTemplates(rows, { reportAt: 25 });

    expect(report.rows).toBe(32);
    expect(report.distinct).toBe(3);
    expect(report.clustered).toBe(30);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]!.count).toBe(30);
    expect(report.groups[0]!.owners).toBe(2);
    expect(report.groups[0]!.share).toBeCloseTo(30 / 32, 5);
  });

  it("counts rows with no description instead of clustering them together", () => {
    const rows = [row("1", null), row("2", ""), row("3", "A real description.")];

    const report = clusterTemplates(rows);

    expect(report.empty).toBe(2);
    expect(report.distinct).toBe(1);
    expect(report.clustered).toBe(0);
  });

  it("leaves the long tail out of the report but still counts it as clustered", () => {
    const rows = [row("1", "Shared sentence."), row("2", "Shared sentence."), row("3", "Alone.")];

    const report = clusterTemplates(rows, { reportAt: 25 });

    expect(report.clustered).toBe(2);
    expect(report.groups).toHaveLength(0);
  });
});
