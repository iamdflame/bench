# MANDATE — Brand & Frontend System

**A complete identity and interface redesign, built to be adopted.**

---

# PART 0 — THE BRIEF, RESTATED

You are not designing a hackathon submission. You are designing **a product BNB Chain will put its name behind, staff, and run.** Their words: *"we back it as a standalone product with its own brand and team."*

That single sentence sets every constraint below:

1. **It must have its own brand, not BNB's.** A yellow-and-black site with #F0B90B everywhere reads as a fan project. You are being acquired as a *brand*, so you must arrive with one that already stands on its own feet.
2. **It must be harmonious beside BNB yellow, not imitative of it.** It will sit next to their logo in a blog post. It must not clash and must not copy.
3. **It must look like infrastructure, not a dapp.** BscScan, not a launchpad.
4. **It must survive a screenshot.** Judges will paste one image into a deck. That image has to win.

## Two hard constraints from their brand guidelines

I read the actual guidelines. Two things bind you:

> *"Projects must not use wording like 'Official,' 'Partnering,' 'Collaborating' with BNB Chain unless cleared by management."*
> *"Projects must not use the BNB Chain logo in a way that implies endorsement or sponsorship."*

**Do not call yourself "The Official BNB Agent Studio Marketplace."** Much of the field will, because it's the prize description. It violates the guidelines and it reads as presumption to the people deciding.

The permitted construction is *"Powered by," "Available on," "Building on."* Use **"Built on BNB Chain"** in the footer, small, once. Nowhere else. Confidence is quieter than a logo lockup.

## Their official colours, for reference only

| | Hex | Use |
|---|---|---|
| BNB Yellow | `#F0B90B` (Pantone 116C) | **Theirs. Never your primary.** |
| BNB Black | `#0B0E11` | Safe to share — it's effectively neutral |
| White | `#FFFFFF` | — |

---

# PART I — THE BRAND PLATFORM: HALLMARKING

## The insight

You are already inside the right metaphor and have not committed to it. Your codebase uses **millesimal fineness**, **hallmarked**, **base metal**, **375**, **999**, and an **assay office**. That vocabulary is not decoration. It is a complete, 700-year-old, legally-codified trust system — and it maps onto your product structure with almost no friction.

**British hallmarking has been compulsory since 1300 under Edward I. It is the oldest consumer protection system in the world.** Under the Hallmarking Act 1973, a complete hallmark is a row of separate punches, each struck individually into the metal.

## The mapping

| Hallmark element | What it does | MANDATE equivalent |
|---|---|---|
| **Sponsor's mark** | Who submitted the item, registered with the office | The agent's ERC-8004 identity |
| **Fineness mark** | Millesimal purity: 375, 585, 750, 925, 999 | **Your assayed fineness. Already built.** |
| **Assay office mark** | Which office tested it (London leopard, Birmingham anchor, Sheffield rose, Edinburgh castle) | **Your four categories.** Four marks, four offices. |
| **Standard mark** | Lion passant = sterling standard met | The bond — posted, or not |
| **Date letter** | Year of assay; typeface and shield shape change annually | **Freshness.** The block the assay was taken at. |

Four compulsory marks. Four categories. A purity scale you already use. This is not a metaphor you're applying — it's one you're already standing in.

## Why this wins

- **The narrative is unanswerable.** *"We did not invent a trust system for agents. We ported the one that has worked for seven hundred years."* Every competitor is asserting a novel scoring algorithm. You are invoking precedent.
- **It solves your hardest UX problem.** How do you show trust without a five-star rating you've proven is fake? A struck mark. Present or absent. Not a score to be gamed.
- **Gold is already your colour, and it's already BNB's.** The precious-metal ladder *is* the trust ladder *is* the palette. Rung 6 is gold; rung 0 is base metal. Total coherence, and it lands adjacent to #F0B90B without copying it.
- **Nobody in crypto is anywhere near this.** The category default is glassmorphism, neon gradients, and floating 3D orbs. A struck punch mark in an antiquarian register will not be mistaken for anything else in the field.
- **It scales to a system, not just a logo.** See Part III.

## The line

> **MANDATE**
> *Assay Office for Autonomous Agents*

And the positioning statement, which replaces "Agents bid for your capital with their own" as the primary:

> **301,784 agents are registered on BSC. Five answer when called.**
> **We test them, strike what passes, and let the rest go unmarked.**

The bond line survives as the rung-6 subtitle. It's too good to lose. It's just not the front door.

---

# PART II — COLOUR

## Principle

Three metals and a void. Nothing else carries meaning. Colour is **earned by data**, never applied for decoration.

## The palette

### Ground

| Token | Hex | Use |
|---|---|---|
| `--void` | `#08090B` | Page ground. Deeper than BNB black — this is the anvil, not the brand. |
| `--iron` | `#111316` | Raised surfaces, cards |
| `--iron-hi` | `#1A1D21` | Hover, active |
| `--score` | `#24282D` | Hairlines, rules, table borders |

### The metals — these carry all meaning

| Token | Hex | Meaning |
|---|---|---|
| `--gold-999` | `#E8A317` | **Primary.** Fine gold. Hallmarked, top rung, settled track record. |
| `--gold-750` | `#C98B14` | 18ct. Assayed and passing. |
| `--silver-925` | `#B8BEC6` | Sterling. Live, capable, unbonded. |
| `--pewter-500` | `#6B7280` | Resolvable but unproven. |
| `--base` | `#3A4048` | **Base metal.** Registered and nothing more. 301,779 of them. |

`--gold-999` at `#E8A317` is deliberately deeper and warmer than BNB's `#F0B90B`. Side by side they harmonise; they are never confused. This is the single most important colour decision in the system.

### Signals — used almost never

| Token | Hex | Use |
|---|---|---|
| `--struck` | `#E8E4DC` | Fresh strike, the instant a mark lands |
| `--cancelled` | `#8B3A3A` | Dismissal, defaced mark. **Deep oxblood, not red.** |
| `--verify` | `#4A9D7F` | Verification passed. Muted, never neon. |

### The rule on red

Your existing instinct — *"trailing is rendered as absence of light, never red"* — is correct and rare. Keep it absolutely. Underperformance is **dimming**, never alarm. Red appears once in the entire product: a defaced mark on dismissal. Because it appears once, it lands.

---

# PART III — THE MARK SYSTEM

## The core idea

**The logo is not a logo. It is a punch, and a system for striking them.**

Every assayed agent receives its own hallmark, deterministically derived from its ERC-8004 token ID. Reproducible, verifiable, unique. MANDATE's own mark is the **assay office mark** — the office that struck them all.

No competitor has a generative identity system tied to on-chain state. This alone will be remembered.

## III.1 — The office mark (the primary logo)

A single punch. Silhouette-first, legible at 16px.

**Form:** a vertical shield — a rectangle with a chamfered lower edge and a flat top, the shape of a struck punch surround. Inside, a **balance beam** reduced to its absolute minimum: one horizontal stroke, one vertical, two short terminals.

Why the balance: the Vienna Convention's international Common Control Mark is a set of scales. It is the universal sign for *assayed*, it means judgement, and it reads at any size.

**Construction:** built on a 24-unit grid. Stroke weight 2.5 units. Chamfer at 45°, one-third of the width. Nothing rounded — a punch is cut, not drawn.

**Lockups:**
- Mark alone (favicon, avatar, ≥16px)
- Mark + `MANDATE` horizontal, left-aligned, mark height = cap height
- Stacked with `ASSAY OFFICE FOR AUTONOMOUS AGENTS` in 8px tracked caps beneath

## III.2 — Agent hallmarks (the system)

Each assayed agent gets a struck row of four punches, exactly as on British silver:

```
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  ⚖   │ │ 405  │ │  ◈   │ │  R   │
└──────┘ └──────┘ └──────┘ └──────┘
 office   fineness  category  epoch
```

**1. Office mark** — MANDATE's punch. Constant. Means: this was tested here.

**2. Fineness** — the millesimal figure in a shield whose *shape encodes the grade*, exactly as real hallmarking uses different frames for different metals:
- **999–900:** octagonal shield, `--gold-999`
- **899–750:** hexagonal, `--gold-750`
- **749–500:** rectangular, `--silver-925`
- **499–375:** rectangle with clipped corners, `--pewter-500`
- **Below 375:** *no shield is struck at all.* Base metal receives no mark.

That last rule is the whole philosophy in one design decision. **Absence is the strongest signal in the system.** An agent with nothing is shown with nothing. You never render a bad score — you render an unmarked object. It is honest, it is unforgeable, and it is visually devastating at scale when a grid of 301,784 agents sits almost entirely unmarked.

**3. Category (the office mark proper)** — four glyphs, one per category, each derived from what the strategy physically does:

| Category | Glyph | Rationale |
|---|---|---|
| **Rebalancing** | A band with a centre notch | A concentrated liquidity range and its midpoint |
| **Grid Trading** | Four stacked rungs | The ladder |
| **Yield Optimisation** | A spiral of three turns | Compounding |
| **Health Factor** | A plumb line and bob | The measure of whether a thing is about to fall |

Cut in the same punch language: flat terminals, no curves except the spiral, 2.5-unit stroke.

**4. Date letter** — a single letter in a shield, cycling by assay epoch, with the **shield shape and typeface changing each cycle** exactly as the real system does. This gives you freshness *as a visual object*: a judge can see at a glance that one agent was assayed this cycle and another three cycles ago, without reading a timestamp.

## III.3 — The sponsor's mark (the generative half)

Derived deterministically from the agent's ERC-8004 token ID:

```
seed = keccak256(chainId, tokenId)
→ shield outline (1 of 8 historical surround shapes)
→ 2-3 letterforms or a device
→ punch depth / bevel angle
```

Same agent, same mark, forever. Anyone can regenerate it. Publish the algorithm.

This gives every one of 301,784 agents a unique, verifiable visual identity **without you drawing anything** — and it means the marketplace grid is visually rich while being 100% data-derived. Nothing decorative. Every pixel is a fact.

## III.4 — Defacement

Historically, an item that failed assay was **defaced** — the mark struck through, the piece broken.

On dismissal, the agent's hallmark is struck through with a single diagonal cut in `--cancelled`. The mark stays visible. **The record is not deleted; it is cancelled.** That's a stronger statement about accountability than any success state, and it's a genuinely novel UI object.

---

# PART IV — TYPOGRAPHY

Your current stack — IBM Plex Sans, IBM Plex Mono, Instrument Serif — is already good. One substitution and a strict role system make it excellent.

| Role | Face | Use |
|---|---|---|
| **Display** | **Instrument Serif** (keep) | Headlines only. Its high contrast and sharp serifs read as engraved. Never below 28px. |
| **Punch / numerals** | **Instrument Serif**, tight tracking | Fineness figures inside shields. Struck numerals were serifed. |
| **Interface** | **IBM Plex Sans** (keep) | All UI. Neutral, engineered, has a mono sibling. |
| **Data** | **IBM Plex Mono** (keep) | Every number, address, hash, block, alpha figure. **No exceptions.** |

## The typographic rule that carries the whole product

**Every number is monospaced. Every number is tabular. Numbers never reflow.**

In a product about measurement, digits that jitter destroy credibility instantly. `font-variant-numeric: tabular-nums` everywhere, no exceptions.

## Scale

Musical fourths, tightened at display sizes:

```
--t-display  : 76px / 0.92 / -0.03em   Instrument Serif
--t-h1       : 48px / 1.00 / -0.02em   Instrument Serif
--t-h2       : 32px / 1.10 / -0.01em   Instrument Serif
--t-h3       : 21px / 1.25 / -0.005em  Plex Sans Medium
--t-body     : 16px / 1.55 / 0         Plex Sans
--t-small    : 13px / 1.45 / 0         Plex Sans
--t-data     : 14px / 1.30 / 0         Plex Mono, tabular
--t-data-lg  : 28px / 1.10 / -0.01em   Plex Mono, tabular
--t-mark     : 10px / 1.00 / 0.14em    Plex Mono, uppercase — punch labels
```

## Voice

BNB Agent Studio's own copy voice is staccato and declarative:

> *"Prompt in. Agent out."*
> *"No approvals. No top-ups. Just execution."*
> *"YOUR AGENT WORKED 24/7. YOU DIDN'T."*

Yours is already close. Tighten toward it:

- Two- to five-word sentences at display size
- All-caps section labels, heavily tracked, small
- **Never** an exclamation mark
- **Never** an emoji
- Numbers before adjectives, always
- State the unflattering fact first

---

# PART V — MOTION DOCTRINE

You said no fidgeting. Agreed, and here is the principle that enforces it:

> **Nothing moves unless the chain moved. Every animation is a physical event with mass.**

## The strike — the signature interaction

When an assay completes, the mark does not fade in. **It is struck.**

```
0ms     nothing
0-90ms  punch descends, scale 1.15 → 1.00, ease-in (accelerating, gaining weight)
90ms    IMPACT — 1px downward displacement of the surrounding row
90-140  surround settles, overshoot 0.98 → 1.00
140-260 --struck highlight bleeds off into the metal's true colour
```

Total: 260ms. It must feel like *weight landing*, not a UI element appearing. This is the moment of the entire product and it should be the only thing on screen when it happens.

## The full motion set

| Event | Motion | Duration |
|---|---|---|
| Mark struck | The strike, above | 260ms |
| Value updated from chain | Digit rolls vertically, single character only | 180ms |
| Dismissal | Defacing cut draws across the mark, left to right | 340ms |
| Row hover | Hairline brightens `--score` → `--pewter` | 120ms |
| Route change | Content shifts 8px up + opacity. No page transition. | 200ms |
| Data loading | **Hairline pulse on the row.** No spinners. No skeletons. | 900ms loop |
| Fineness reveal | Numeral counts up from 0, tabular so nothing reflows | 400ms |

## Forbidden

Parallax. Scroll-jacking. Floating 3D objects. Gradient meshes in motion. Text that types itself. Counters that run on page load without a data event. Anything on an infinite loop that isn't chain-driven. Hover states that scale cards. Glassmorphism blur.

**`prefers-reduced-motion: reduce` → all durations to 0ms, all states final.** Non-negotiable.

---

# PART VI — LAYOUT

## The grid

12 columns, 72px max gutter, 1440px content max. But the governing decision is different:

**Tables, not cards.**

Card grids are the default for marketplaces and they are wrong here. A card is a marketing object — it implies each item deserves attention. You have 301,784 items and about five that deserve attention. **A dense, monospaced table with struck marks in the leading column tells that truth structurally**, before a single word is read.

It also looks like BscScan, Bloomberg, and an assay register — infrastructure, not a storefront. That is exactly the impression you want on a judge who is about to decide whether to run this.

## Density

Row height 44px. Hairline separators at `--score`, 1px, never a gap. The fineness mark sits in the leading 40px column. This means **the eye scans a column of marks and instantly sees how few there are.** The data structure carries the argument.

## The unmarked ledger

On `/agents`, showing all 301,784: the vast majority of rows have an **empty mark column**. Do not hide them, do not paginate them away, do not grey them out apologetically.

A judge scrolling a register where the mark column is almost entirely blank, punctuated rarely by a struck gold octagon, will understand your entire thesis in four seconds without reading anything.

**That is the single strongest screenshot in this hackathon.**

---

# PART VII — PAGE BY PAGE

## `/` — The Register

**Above the fold, and nothing else:**

```
                    ⚖

              MANDATE
    ASSAY OFFICE FOR AUTONOMOUS AGENTS


    301,784  registered on BNB Smart Chain
          5  answer when called
        473  carry any feedback
         34  survive de-duplication
          2  hold a hallmark


         [ Open the register → ]      [ Assay an agent → ]
```

Instrument Serif at 76px for the numerals. Plex Mono for the labels. `--void` ground. The office mark struck at the top, once.

No hero image. No gradient. No animation on load except the strike of the office mark. **The funnel is the hero** — it is your best asset and it is currently buried in a markdown file most judges will never open.

Each number is a live link into the filtered register.

Below the fold: the four category offices, each with its mark and live counts. Then the mechanism in three sentences. Then the floor, embedded at 400px as a live window, with a "See the market floor →" link.

## `/start` — The Judge Path

Steal from SMEAI, execute better. One column, no wallet required, under 90 seconds.

```
1. What we measured, and how you can too      [ npm run sybil ]
2. One agent, fully assayed                   [ live, no wallet ]
3. One mandate, settled on mainnet            [ tx → BscScan ]
4. One agent, dismissed on-chain              [ tx → BscScan ]
5. Verify all of it yourself                  [ npx mandate-verify ]
```

Every step: a claim, an artifact, a command. No prose paragraphs. This page is a receipt.

## `/agents` — The Register proper

The dense table. Columns: **Mark · Token ID · Name · Category · Fineness · Endpoint · Last assayed · Bond · Alpha**.

Filters as a left rail, not a dropdown row: rung, category, freshness, endpoint status. Filter state in the URL so a judge can share a filtered view.

Default sort: fineness descending. **The first screen is the two hallmarked agents, then a cliff.**

## `/agent/[id]` — The Certificate

The strongest single page in the product. Structure it as an **assay certificate**, because that is what it is:

```
┌─────────────────────────────────────────────┐
│  ⚖   405   ◈   R                            │  ← the struck hallmark, large
│                                              │
│  BORT Governance Lens #10923                 │
│  ERC-8004 · 56:153776                        │
├─────────────────────────────────────────────┤
│  ASSAY                    405 / 999          │
│  identity      ████████░░  passed            │
│  custody       ░░░░░░░░░░  FAILED            │
│                agent_wallet == owner_address │
│  activity      ░░░░░░░░░░  FAILED            │
│                nonce 1 · balance 0           │
│  capability    ██░░░░░░░░  partial           │
│  reputation    ░░░░░░░░░░  FAILED            │
│  performance   ░░░░░░░░░░  no record         │
├─────────────────────────────────────────────┤
│  REPUTATION AUTOPSY                          │
│  Official explorer score        12.09        │
│  After de-duplication            0.00        │
│  47 of 49 feedbacks from 3 wallets           │
│  [ graph ]        [ npm run sybil -- 153776 ]│
├─────────────────────────────────────────────┤
│  CAREER                                      │
│  mandates held · epochs settled · slashes    │
│  · dismissals · every tx hash                │
└─────────────────────────────────────────────┘
```

The **reputation autopsy** — official score beside the de-duplicated score, with the reproduction command — is the highest-value single component in this entire design. It shows a number, shows the official number, and shows why the official number is false, with a command to check. No competitor has anything like it.

## `/mandate/[id]` — The Ledger

Steal BNB Agent Studio's own timeline pattern — they narrate an agent's overnight work with timestamps and running cost, ending in *"Net result: $0.31 spent overnight."* Mirror that structure exactly for a mandate's life:

```
02:00  Mandate opened      0.0025 BNB escrowed        [tx]
02:00  Bid accepted        0.0008 BNB bonded          [tx]
06:00  Epoch 1 settled     +2.1% alpha    fee paid    [tx]
10:00  Epoch 2 settled     −6.0%          SLASHED 25% [tx]
14:00  Epoch 3 settled     −15.0%         DISMISSED   [tx]
14:00  Successor promoted  bond now at risk           [tx]
```

Plus: attestation hashes, Greenfield preimage links, succession queue, and the `npx mandate-verify --mandate N` command.

## `/floor` — The Market Floor

**Every pixel of the existing WebGL work survives, relocated.** It is the best-looking thing in the hackathon and it is currently the worst front door.

Add: a persistent legend in the corner (radius = capital, ring = bond, tint = alpha, tremor = strikes, rupture = dismissal), and a toggle to a plain table of the same state. The legend converts it from art into an instrument.

## `/assay` and `/bench` — The Public Assay

Keep. This is your "try it" surface. Paste any token ID, get a live assay, no wallet. Frame it as a public service: *"Assay any agent on BSC, including one you are being asked to trust somewhere else."*

## `/evidence` — The Record

Advantage Report, Sybil research, session scope proofs, the indexer footgun, exclusion reasons — and a section titled **"What is not true yet."**

Steal this from Docket, who publish *"The agent did not beat the human here."* For a product whose thesis is distrust of self-reporting, publishing your own adverse results is the only tonally coherent position. It is also a moat, because competitors won't copy it.

## `/list-your-agent` — Supply

Connect wallet → claim ERC-8004 identity → request assay → **see your fineness and exactly what would raise it.** The last part is the product: it tells an operator how to climb, which is how the ladder fills.

---

# PART VIII — COMPONENTS

| Component | Notes |
|---|---|
| `<Hallmark>` | Renders the full struck row from an agent record. Sizes: 16 / 24 / 40 / 96px. The system's core primitive. |
| `<Fineness>` | Numeral in a grade-shaped shield. Renders **nothing** below 375. |
| `<OfficeMark>` | Category glyph. |
| `<DateLetter>` | Cycling letter+shield. Freshness as an object. |
| `<Register>` | The dense table. Virtualised — it must hold 301,784 rows without stutter. |
| `<AssayBar>` | Six-dimension breakdown with failure reasons inline. |
| `<Autopsy>` | Official vs de-duplicated, with graph and repro command. |
| `<Ledger>` | Timestamped event list with tx links. |
| `<Attestation>` | Hash, block, Greenfield link, verify command. |
| `<Observation>` | **Every figure carries the block it was read at.** Steal from Docket and PositionCrew. `14.2%` becomes `14.2% · block 119,901,707 · 4m ago`. |
| `<Command>` | Copyable command block. Used constantly — every claim ships with its check. |
| `<SessionScope>` | Allowlist, remaining cap, expiry countdown, **Revoke** button. Required for Altana. |
| `<Strike>` | The animation wrapper. |

## The `<Observation>` component matters most

Attaching the block number and read-age to *every* rendered figure is the single highest-leverage decision for the Data Quality criterion. It converts every number on the site from a claim into a measurement, visibly, without a word of explanation.

---

# PART IX — WHAT TO AVOID

The field's defaults, all of which you must refuse:

- Purple/blue gradient meshes
- Glassmorphism, backdrop blur
- Floating 3D orbs or spline scenes
- Neon green "verified" badges
- Five-star ratings *(you proved they're fake — never render one)*
- Card grids with hover-scale
- Animated counters on page load
- "🚀 Powered by AI"
- Gradient text
- Dark purple `#1a0b2e` crypto-night
- Testimonial sections
- Emoji anywhere
- Slathering #F0B90B everywhere to signal BNB-nativeness — the amateur tell

---

# PART X — PERFORMANCE & ACCESSIBILITY

Not a footnote. Judges will open this on a laptop over hotel wifi during a 14-day window.

- **LCP under 1.2s.** Fonts already self-hosted with no third-party requests — keep that and *state it* as a security property.
- **Register virtualised.** 301,784 rows, 60fps scroll, or the whole thesis collapses on contact.
- **WebGL floor lazy-loaded**, never on the critical path, with a static SVG fallback.
- **No layout shift.** Tabular numerals make this achievable.
- **Contrast:** `--gold-999` on `--void` = 8.1:1. `--base` on `--void` = 3.2:1 — acceptable *because* unmarked agents are deliberately recessive, but never use `--base` for text that must be read.
- **Keyboard:** the register fully navigable. `/` focuses search. `⌘K` command palette across agents, mandates, commands.
- **`prefers-reduced-motion`** fully honoured.
- **Works with no wallet connected.** Everything readable, `/start` fully completable. This is a Functionality-criterion requirement, not a nicety.

---

# PART XI — THE SCREENSHOT TEST

A judge will paste one image into a deck. Design that image deliberately.

**The canonical screenshot:** the `/agents` register, sorted by fineness, showing the first ~20 rows. Two struck gold hallmarks at the top. Then eighteen rows with an empty mark column. Monospaced token IDs, dense hairlines, `--void` ground.

Anyone who sees it understands: *this thing tested everything, and almost nothing passed.*

**The second screenshot:** a single `/agent/[id]` certificate with the reputation autopsy visible — official score 12.09, de-duplicated 0.00, side by side.

Build both of these deliberately. Make sure they render perfectly at 1600×1000 and at 2× for retina decks. Put them at the top of the README.

---

# PART XII — DELIVERABLES

**Identity**
1. Office mark — SVG, 24-unit grid, mono + gold, favicon through 512px
2. Wordmark lockups — horizontal, stacked, mark-only
3. Four category office marks
4. Fineness shield set — five grades, five shapes
5. Date letter cycle — 26 letters × 4 shield variants
6. Sponsor mark generator — published, deterministic, documented
7. Defacement treatment
8. `BRAND.md` — the hallmarking rationale, in full, because the story is itself an asset

**System**
9. Design tokens as CSS custom properties
10. Type scale + tabular numeral enforcement
11. Motion spec with exact curves and durations
12. Component library, all of Part VIII
13. Grid and density spec

**Surfaces**
14. All nine routes at 1440 and 390
15. The two canonical screenshots
16. A 90-second screen recording, real, unnarrated, no mockups

---

# THE SUMMARY

Everyone else will build a card grid in BNB yellow with a gradient hero.

You will build **an assay register**: struck marks, monospaced digits, hairline rules, near-total absence of ornament, and a column of blanks 301,779 rows deep that argues your entire case before anyone reads a word.

You already have the vocabulary. You already have the fineness scale. You already have the WebGL floor that nobody can match. What was missing was the decision to commit to the metaphor completely — and the recognition that the strongest thing you can render is **nothing at all**, in the mark column, over and over, all the way down.