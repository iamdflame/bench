# MANDATE — Brand & Design System

**Assay Office for Autonomous Agents**

This document exists because the story is itself an asset. Anyone who has to
extend this product — add a surface, add a category, add a mark — should be
able to derive the right answer from the reasoning here rather than from
copying an existing screen.

---

## 1. The platform: hallmarking

The vocabulary was in the codebase before the brand was: *millesimal fineness*,
*hallmarked*, *base metal*, *375*, *999*, *assay office*. That is not
decoration. It is a complete, 700-year-old, legally-codified trust system, and
it maps onto this product with almost no friction.

British hallmarking has been compulsory since 1300 under Edward I and is the
oldest consumer protection system in the world. Under the Hallmarking Act 1973
a complete hallmark is a row of separate punches, each struck individually into
the metal — separate assertions by separate parties, not one stamp.

| Hallmark element | What it does | MANDATE equivalent |
|---|---|---|
| Sponsor's mark | Who submitted the item, registered with the office | The agent's ERC-8004 identity |
| Fineness mark | Millesimal purity: 375, 585, 750, 925, 999 | The assayed fineness |
| Assay office mark | Which office tested it | The four categories |
| Standard mark | Lion passant — the standard was met | The bond, posted or not |
| Date letter | Year of assay; shield and typeface change annually | Freshness — the block the assay was taken at |

Four compulsory marks. Four categories. A purity scale already in use.

**The line we can say and nobody else can:** *we did not invent a trust system
for agents; we ported the one that has worked for seven hundred years.* Every
competitor is asserting a novel scoring algorithm. We are invoking precedent.

It also solves the hardest UX problem in the product. How do you show trust
without a five-star rating you have proved is fabricated? A struck mark.
Present or absent. Not a score to be gamed.

### The positioning

> **MANDATE**
> *Assay Office for Autonomous Agents*
>
> Agents are registered on BNB Smart Chain. Five answer when called.
> We test them, strike what passes, and let the rest go unmarked.

The bond line — *agents bid for your capital with their own* — survives as the
top rung's subtitle. It is too good to lose. It is just not the front door.

### What we never say

BNB Chain's guidelines forbid *"Official," "Partnering," "Collaborating"*
without clearance, and forbid using their logo in a way that implies
endorsement. Much of this field will use those words anyway, because they are
in the prize description.

**"Built on BNB Chain" appears once, in the footer, small. Nowhere else.**
Confidence is quieter than a logo lockup.

---

## 2. Colour

Three metals and a void. Nothing else carries meaning. Colour is earned by
data, never applied for decoration.

### Ground

| Token | Hex | Use |
|---|---|---|
| `--void` | `#08090B` | Page ground. Deeper than BNB black — this is the anvil, not the brand. |
| `--iron` | `#111316` | Raised surfaces |
| `--iron-hi` | `#1A1D21` | Hover, active |
| `--score` | `#24282D` | Hairlines, rules, table borders |

### The metals — these carry all meaning

| Token | Hex | Meaning |
|---|---|---|
| `--gold-999` | `#E8A317` | Fine gold. Hallmarked, top rung, settled record. |
| `--gold-750` | `#C98B14` | 18ct. Assayed and passing. |
| `--silver-925` | `#B8BEC6` | Sterling. Live, capable, unbonded. |
| `--pewter-500` | `#6B7280` | Resolvable but unproven. |
| `--base` | `#3A4048` | Base metal. Registered and nothing more. |

`--gold-999` at `#E8A317` is deliberately deeper and warmer than BNB's
`#F0B90B`. Side by side they harmonise; they are never confused. **This is the
single most important colour decision in the system** — it is what lets the
mark sit next to their logo in a blog post without reading as either a clash or
a copy.

### Signals — used almost never

| Token | Hex | Use |
|---|---|---|
| `--struck` | `#E8E4DC` | The instant a mark lands |
| `--cancelled` | `#8B3A3A` | Defacement. Deep oxblood, never red. |
| `--verify` | `#4A9D7F` | Verification passed. Muted, never neon. |

### The rule on red

**Trailing is rendered as absence of light, never as red.** Underperformance
dims. Red appears exactly once in the entire product — a defaced mark on
dismissal, and the oxblood rule above the adverse-results section. Because it
appears once, it lands.

---

## 3. The mark system

**The logo is not a logo. It is a punch, and a system for striking them.**

Every assayed agent receives its own hallmark, derived deterministically from
its ERC-8004 token id. Reproducible, verifiable, unique. MANDATE's own mark is
the assay office mark — the office that struck them all.

### 3.1 The office mark

A vertical shield: flat top, vertical sides, 45° chamfered base — the shape of
a struck punch surround. Inside, a balance beam reduced to its minimum: one
horizontal stroke, one vertical, two terminals.

The balance is the Vienna Convention's Common Control Mark. It is the universal
sign for *assayed*, it means judgement, and it reads at any size.

Built on a 24-unit grid. Nothing rounded — a punch is cut, not drawn.

**Construction note, and it matters:** the marks are drawn as *filled
silhouettes with the device knocked out in `--void`*, not as nested strokes. At
16px a 2.5-unit stroke inside a 16-unit shield closes up into a blob. A filled
surround with a void-coloured device stays legible at favicon size, which is
the size the mark has to survive. See `src/components/mark/geometry.ts`.

### 3.2 Agent hallmarks

A struck row of four punches, exactly as on British silver:

```
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  ⚖   │ │ 405  │ │  ◈   │ │  R   │
└──────┘ └──────┘ └──────┘ └──────┘
 office   fineness  category  epoch
```

Sizes: **16** (register) · **24** (inline) · **40** (header) · **96**
(certificate).

**Fineness shields encode the grade by shape**, as real hallmarking uses
different frames for different metals:

| Fineness | Shield | Metal |
|---|---|---|
| 999–900 | octagon | `--gold-999` |
| 899–750 | hexagon | `--gold-750` |
| 749–500 | rectangle | `--silver-925` |
| 499–375 | rectangle, clipped corners | `--pewter-500` |
| **below 375** | **none is struck** | — |

That last row is the whole philosophy in one design decision. **Absence is the
strongest signal in the system.** An agent with nothing is shown with nothing.
We never render a bad score; we render an unmarked object. It is honest,
unforgeable, and visually devastating at scale when a register sits almost
entirely unmarked.

`<Hallmark>` returns reserved blank space of the same width below the bar, so
the blanks line up in a column. The alignment is what makes the emptiness
readable.

### 3.3 Category devices

Each derived from what the strategy physically does, not from an icon set:

| Category | Device | Why |
|---|---|---|
| Rebalancing | A band with a centre notch | A concentrated range and its midpoint |
| Grid Trading | Four stacked rungs | The ladder |
| Yield Optimisation | A spiral of three turns | Compounding — the one curve in the system, and it earns it |
| Health Factor | A plumb line and bob | The measure of whether a thing is about to fall |

### 3.4 The date letter

A single letter in a shield, cycling by assay epoch, with the shield shape
changing each cycle exactly as the real system does. Older strikes are dimmed
rather than greyed out apologetically.

Real date letters change annually; a market settling epochs in minutes needs a
shorter cycle to be informative, so ours is weekly. Long enough that the letter
means something, short enough that staleness is visible.

The cycle runs on 23 letters, not 26: **I, O and U are omitted**, as they are in
the real system, because at punch size they are too easily confused with 1, 0
and V. The same alphabet drives the sponsor's mark.

### 3.5 The sponsor's mark

```
seed = fnv1a(chainId + ":" + tokenId)
  → shield outline (1 of 8 historical surrounds)
  → 2 letterforms
```

Same agent, same mark, forever. Anyone can regenerate it; the algorithm is
published in `geometry.ts`. FNV-1a rather than keccak because it must run in a
browser with no dependencies and no async — the property that matters is
determinism, not collision resistance, and two agents sharing a surround is not
a security failure when the token id is printed beside the mark.

This gives every agent a unique, verifiable visual identity without anyone
drawing anything, and it means the register is visually rich while being 100%
data-derived. Nothing is decorative. Every pixel is a fact.

### 3.6 Defacement

Historically, an item that failed assay was defaced — the mark struck through,
the piece broken.

On dismissal, the agent's hallmark takes a single diagonal cut in
`--cancelled`, drawn left to right over 340ms. **The mark stays visible. The
record is not deleted; it is cancelled.**

---

## 4. Typography

| Role | Face | Use |
|---|---|---|
| Display | Instrument Serif | Headlines and struck numerals. Never below 28px. |
| Punch numerals | Instrument Serif, tight tracking | Fineness figures inside shields — struck numerals were serifed |
| Interface | IBM Plex Sans | All UI |
| Data | IBM Plex Mono | Every number, address, hash, block, alpha figure. **No exceptions.** |

### The rule that carries the product

**Every number is monospaced. Every number is tabular. Numbers never reflow.**

In a product about measurement, digits that jitter destroy credibility
instantly. `font-variant-numeric: tabular-nums` everywhere.

Fonts are self-hosted with no third-party request. That is a security property
as well as a performance one, and it is stated as both.

### Voice

- Two- to five-word sentences at display size
- All-caps section labels, heavily tracked, small
- Never an exclamation mark; never an emoji
- Numbers before adjectives, always
- **State the unflattering fact first**

---

## 5. Motion

> **Nothing moves unless the chain moved. Every animation is a physical event
> with mass.**

### The strike — the signature interaction

When an assay completes the mark is not faded in. It is struck.

```
0–90ms    the punch descends, scale 1.15 → 1.00, ease-in (gaining weight)
90ms      IMPACT — 1px downward displacement of the surrounding row
90–140ms  the surround settles, 0.98 → 1.00
140–260ms the --struck highlight bleeds off into the metal's true colour
```

Total 260ms. It must feel like weight landing, not like a UI element
appearing.

`<Strike>` takes a `when` key — the block, tx hash or assay timestamp that
caused it. The animation runs when that key *changes*, never on a route render,
and never on first paint unless the caller explicitly asks. A page full of
punches landing on load is exactly the counter-driven ornament this doctrine
refuses.

### The full set

| Event | Motion | Duration |
|---|---|---|
| Mark struck | The strike | 260ms |
| Value updated from chain | Digit rolls vertically, one character | 180ms |
| Dismissal | Defacing cut draws across, left to right | 340ms |
| Row hover | Hairline brightens `--score` → `--pewter-500` | 120ms |
| Route change | Content shifts 8px up + opacity | 200ms |
| Data loading | **Hairline pulse on the row.** No spinners, no skeletons. | 900ms loop |

### Forbidden

Parallax. Scroll-jacking. Floating 3D objects. Gradient meshes in motion. Text
that types itself. Counters that run on page load without a data event.
Anything on an infinite loop that is not chain-driven. Hover states that scale
cards. Glassmorphism blur.

**`prefers-reduced-motion: reduce` → all durations to 0ms, all states final.**
Non-negotiable. A punch landing is a delight for one visitor and a symptom for
another.

---

## 6. Layout

12 columns, 1440px content max. But the governing decision is different:

### Tables, not cards

A card is a marketing object — it implies each item deserves attention. There
are three hundred thousand items here and about five that deserve attention. A
dense monospaced register with struck marks in the leading column tells that
truth structurally, before a word is read.

It also looks like BscScan, Bloomberg and an assay register — infrastructure,
not a storefront. That is exactly the impression the product needs on someone
deciding whether to run it.

### Density

Row height **44px**. Hairline separators at `--score`, 1px, never a gap. The
fineness mark sits in the leading 40px column, so the eye scans a column of
marks and instantly sees how few there are. **The data structure carries the
argument.**

### The unmarked register

On `/agents` the vast majority of rows have an empty mark column. They are not
hidden, not paginated away, not greyed out apologetically. A reader scrolling a
register whose mark column is almost entirely blank, punctuated rarely by a
struck octagon, understands the entire thesis in four seconds without reading
anything.

---

## 7. Components

| Component | Notes |
|---|---|
| `<Hallmark>` | The full struck row. Renders reserved blank space below 375. The core primitive. |
| `<Fineness>` | Numeral in a grade-shaped shield. Renders nothing below 375. |
| `<OfficeMark>` | MANDATE's own punch, plus the wordmark lockups. |
| `<CategoryMark>` | The four office devices. |
| `<DateLetter>` | Cycling letter and shield. Freshness as an object. |
| `<SponsorMark>` | Deterministic from `chainId:tokenId`. |
| `<Strike>` | The animation wrapper. |
| `<Register>` | The dense table, virtualised at a fixed 44px row. |
| `<AssayBar>` | Six dimensions, with the failure reason and evidence inline — never behind a hover. |
| `<Autopsy>` | Official score beside the de-duplicated score, with the graph and the repro command. |
| `<Ledger>` | Timestamped event list with tx links. |
| `<Attestation>` | Hash, block, Greenfield preimage, verify command. |
| `<Observation>` | **Every figure carries the block it was read at.** |
| `<Command>` | Copyable command block. Every claim ships with its check. |
| `<SessionScope>` | Allowlist, withheld calls, cap, expiry countdown, revoke. |

### `<Observation>` matters most

Attaching the block number and read-age to *every* rendered figure is the
single highest-leverage decision in the system. `14.2%` is a claim.
`14.2% · block 119,901,707 · 4m ago` is a measurement. It converts every number
on the site from an assertion into a reading, visibly, without a word of
explanation.

---

## 8. What we refuse

The field's defaults, all of them:

purple/blue gradient meshes · glassmorphism · backdrop blur · floating 3D orbs
· neon "verified" badges · **five-star ratings** (we proved they are
fabricated; we never render one) · card grids with hover-scale · animated
counters on page load · gradient text · dark purple crypto-night · testimonials
· emoji · slathering `#F0B90B` everywhere to signal BNB-nativeness, which is
the amateur tell.

---

## 9. Performance and accessibility

- **LCP under 1.2s.** Fonts self-hosted, no third-party requests.
- **Register virtualised.** Fixed 44px rows, windowed, so the scrollbar tells
  the truth about how far down the blanks go.
- **WebGL floor lazy-loaded**, never on the critical path, mounted on
  intersection, with a hairline frame as the fallback where WebGL is absent.
- **No layout shift.** Tabular numerals make this achievable.
- **Contrast:** `--gold-999` on `--void` is 8.1:1. `--base` on `--void` is
  3.2:1 — acceptable *because* unmarked agents are deliberately recessive, but
  `--base` is never used for text that must be read.
- **Keyboard:** `/` focuses the register search. `⌘K` opens the palette across
  agents, mandates, routes and commands.
- **Works with no wallet connected.** Everything is readable and `/start` is
  fully completable without one.
