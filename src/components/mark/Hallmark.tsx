import type { Category } from "@/lib/config";
import { gradeOf } from "./geometry";
import CategoryMark from "./CategoryMark";
import DateLetter from "./DateLetter";
import Fineness from "./Fineness";
import OfficeMark from "./OfficeMark";
import SponsorMark from "./SponsorMark";

/**
 * The record a hallmark is struck from.
 *
 * Every field is something the chain settled. Nothing here is claimed by the
 * agent, which is why the mark can be trusted at a glance.
 */
export interface HallmarkRecord {
  chainId: number;
  tokenId: string;
  fineness: number | null | undefined;
  category?: Category | string | null;
  /** When the assay was taken. Drives the date letter. */
  assayedAt?: string | number | Date | null;
  /** A dismissed agent keeps its mark, defaced. */
  dismissed?: boolean;
}

/**
 * The struck row — the system's core primitive.
 *
 *   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
 *   │  ⚖   │ │ 405  │ │  ◈   │ │  R   │
 *   └──────┘ └──────┘ └──────┘ └──────┘
 *    office   fineness  category  epoch
 *
 * Four separate punches, exactly as on British silver, because a hallmark is
 * not one stamp — it is a row of independent assertions, each struck by
 * someone answerable for it.
 *
 * **Below 375 nothing is struck at all.** The row renders as reserved blank
 * space of the same width, so a column of them lines up. That is not an
 * omission: an agent with nothing to show is shown with nothing, which is
 * honest, unforgeable, and — across 301,000 rows — the strongest argument in
 * the product.
 */
export default function Hallmark({
  record,
  size = 24,
  labels = false,
  sponsor = false,
  cutting = false,
  className,
}: {
  record: HallmarkRecord;
  /** 16 register · 24 inline · 40 header · 96 certificate. */
  size?: 16 | 24 | 40 | 96 | number;
  /** Punch names beneath the row. Certificate sizes only. */
  labels?: boolean;
  /** Lead with the sponsor's mark — who submitted the item. */
  sponsor?: boolean;
  /** Draw the defacing cut rather than showing it already made. */
  cutting?: boolean;
  className?: string;
}) {
  const fineness = Math.max(0, Math.round(record.fineness ?? 0));
  const struck = gradeOf(fineness).shape !== null;
  const gap = Math.max(2, Math.round(size * 0.16));
  const count = (sponsor ? 1 : 0) + 4;
  const width = count * size + (count - 1) * gap;

  if (!struck) {
    /*
      Nothing is struck.

      In a register that means reserved blank space and nothing else, because
      the blanks lining up in a column is the argument. On a certificate, where
      `sponsor` is set, the sponsor's mark still appears — it records who
      submitted the item and exists whether or not the item passed — followed
      by four empty positions where the office, the fineness, the category and
      the date letter would have been struck. The absence is not hidden; it is
      given its exact shape.
    */
    const blank = (
      <span
        className={sponsor ? undefined : className ? `mark-absent ${className}` : "mark-absent"}
        style={{ width: sponsor ? width - size - gap : width, height: size }}
        role="img"
        aria-label="No hallmark struck"
        title="No hallmark struck — below 375 fineness"
      />
    );

    if (!sponsor) return blank;

    /*
      On a certificate the four unstruck positions are drawn as empty punch
      outlines rather than as nothing at all.

      A real assay document lays out where the marks go and simply leaves them
      unstruck; a page that merely omitted them would read as a layout that had
      failed. In the register the same absence stays pure blank, because there
      the blanks lining up down a column is the argument and an outline would
      be four hundred thousand pieces of ornament.
    */
    const empties = (
      <>
        <span className="punch-empty" style={{ width: size, height: size }} />
        <span className="punch-empty" style={{ width: size, height: size }} />
        <span className="punch-empty" style={{ width: size, height: size }} />
        <span className="punch-empty" style={{ width: size, height: size }} />
      </>
    );

    const unstruckRow = (
      <span
        className={className ? `hallmark ${className}` : "hallmark"}
        style={{ ["--hm-gap" as string]: `${gap}px` }}
        role="img"
        aria-label="Sponsor's mark only — no hallmark struck"
        title="No hallmark struck — below 375 fineness"
      >
        <SponsorMark chainId={record.chainId} tokenId={record.tokenId} size={size} />
        {empties}
      </span>
    );

    if (!labels) return unstruckRow;

    return (
      <span className="hallmark-block" style={{ ["--hm-gap" as string]: `${gap}px` }}>
        {unstruckRow}
        <span className="hallmark__labels" aria-hidden>
          <span style={{ width: size }}>sponsor</span>
          <span style={{ width: size }}>office</span>
          <span style={{ width: size }}>fineness</span>
          <span style={{ width: size }}>category</span>
          <span style={{ width: size }}>epoch</span>
        </span>
      </span>
    );
  }

  const category = (record.category ?? null) as Category | null;

  const row = (
    <span
      className={[
        "hallmark",
        record.dismissed ? "hallmark--defaced" : "",
        record.dismissed && cutting ? "hallmark--cutting" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--hm-gap" as string]: `${gap}px` }}
    >
      {sponsor ? (
        <SponsorMark chainId={record.chainId} tokenId={record.tokenId} size={size} />
      ) : null}
      <OfficeMark size={size} title="Struck by MANDATE Assay Office" />
      <Fineness fineness={fineness} size={size} />
      <CategoryMark category={category} size={size} />
      <DateLetter assayedAt={record.assayedAt ?? null} size={size} />

      {record.dismissed ? (
        <svg
          className="hallmark__cut"
          viewBox={`0 0 ${width} ${size}`}
          width={width}
          height={size}
          role="img"
          aria-label="Dismissed — hallmark defaced"
        >
          <title>Dismissed on chain. The record is cancelled, not deleted.</title>
          {/* pathLength normalises the dash so the draw reads the same at 16px
              and at 96px. */}
          <line x1="0" y1={size} x2={width} y2="0" pathLength={1} />
        </svg>
      ) : null}

    </span>
  );

  if (!labels) return row;

  // Named punches. The row has to become a column to carry them, so the
  // labels live outside the strike itself rather than as a fifth punch.
  return (
    <span className="hallmark-block" style={{ ["--hm-gap" as string]: `${gap}px` }}>
      {row}
      <span className="hallmark__labels" aria-hidden>
        {sponsor ? <span style={{ width: size }}>sponsor</span> : null}
        <span style={{ width: size }}>office</span>
        <span style={{ width: size }}>fineness</span>
        <span style={{ width: size }}>category</span>
        <span style={{ width: size }}>epoch</span>
      </span>
    </span>
  );
}
