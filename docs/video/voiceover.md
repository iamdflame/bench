# The voiceover

Thirteen pieces, one per screen, written to talk continuously so there is never
a silent gap for the viewer to sit through.

**Three lengths are built in.** Time your recording first, then pick one.

| Length | What to include | Speech |
|---|---|---|
| **Short** | skip every `[cut]` and `[extra]` line | **2:29** |
| **Core** | skip only the `[extra]` lines | **3:06** |
| **Long** | everything, tags deleted | **4:09** |

Match the one closest to your recording, going *under* rather than over. A few
seconds of quiet at the very end is fine. Running out of voice in the middle is
not.

Those times are measured from the words below at 130 a minute, which is what
Adam reads at on speed 1.0. Real output lands within a few seconds of them.

Delete the tags themselves (`[cut]`, `[extra]`) before generating. They are
markers for you, not words to be read out.

---

## Settings

| | |
|---|---|
| Voice | **Adam** |
| Model | **Eleven Multilingual v2** |
| Stability | **50%** |
| Similarity | **75%** |
| Style exaggeration | **0%** |
| Speaker boost | On |
| **Speed** | **1.0** |

## How to make them

For each block: copy it, paste into ElevenLabs, **Generate**, **Download**,
rename to its number (`01.mp3` through `13.mp3`), put it in
`docs/video/clips/`.

Do not paste the whole page at once. Thirteen separate files is what lets you
line each one up with the right screen.

Delete any `[cut]` or `[extra]` marker before generating. Keep the sentence
after it if your tier includes it.

---

## 01 · Homepage, as it loads

```
Three hundred thousand AI agents are registered on BNB Chain. Six of them have ever proved they answer the phone.
[extra] Everything else is a claim somebody typed into a form, that nobody has checked since.
```

## 02 · Homepage, holding on the numbers

```
Mandate is the marketplace that checks first. Three hundred and fifteen agents, and every endpoint they publish gets called.
[cut] Filed by what they say they do, then tested against what they actually do.
[extra] Whatever comes back is what goes on the page, including the silence.
```

## 03 · Homepage, over the four category tiles

```
Rebalancing. Grid trading. Yield. Loan health. Four doors, the same depth behind each one. The number underneath is not how many exist, it is how many answered when we rang them.
```

## 04 · Opening Check a position, cursor in the box

```
So start with something you actually own. Paste a wallet, or a PancakeSwap position number, and we read it straight off the chain.
[extra] No account, nothing to install, nothing signed.
```

## 05 · The moment the verdict appears

```
This one is real, and it has drifted outside its range. The money in it is sitting there earning nothing at all.
[extra] When we measured the whole pool, about a quarter of live positions were in the same state, and most of their owners have no idea.
```

## 06 · Scrolling to the agent cards underneath

```
And these are the agents that can fix it. Not everyone who claims to do the job. Only the ones that picked up when we called, fastest first.
```

## 07 · The Agents tab, filtered to the ones that answered

```
Each carries what it actually charges.
[cut] Read from its own response, rather than a badge on its profile.
Some of these were built by other teams in this hackathon, and on the day we checked, theirs answered fastest.
[extra] They are listed anyway. A marketplace that only recommended its own inventory would be a shop.
```

## 08 · An agent profile opening, six checks in view

```
Open one and the evidence is already there. No spinner. Six checks against the chain, settled before the page arrived, each with the block it was read at.
```

## 09 · Scrolling slowly down the six checks

```
Does the endpoint it published actually answer. Is the agent's wallet its own, or the same address as its owner's, so one person can move everything it holds.
[cut] Has it ever touched the kind of contract this job needs.
[extra] A liquidity manager that has never called a position manager has not managed a position.
```

## 10 · While the crosses are on screen

```
Most agents fail most of these, and we show that too.
[cut] Where we could not tell, it says so, instead of quietly showing a zero.
[extra] An assay that only ever passes is not an assay.
```

## 11 · The Activity page, over the capital and bond columns

```
Four categories, four live books, real money on BNB Chain mainnet. Hire an agent here and it has to put its own money behind the claim, and that bond is at risk every hour it trails the benchmark you chose.
[cut] Your capital goes into escrow, where the agent can never reach it.
[extra] Fall behind too often and the job ends, and the bond is what pays for it. You can close it whenever you like.
```

## 12 · A receipt, scrolling down the marks

```
Every job opens into a receipt like this one. Every valuation it settled against, and the block each of them was read at.
[cut] Plus the command that re-derives the whole thing, without us.
[extra] One hire has completed so far. We are not going to round that up.
```

## 13 · Closing, on the last screen

```
We did not build these agents. We check them, we publish what we found, and we let you hire the ones that hold up.
[cut] Including the parts that flatter nobody.
```

---

## Which length you need

| Your recording | Use | Speech |
|---|---|---|
| under **2:30** | **Short**, and slow the video to **0.85** in CapCut | 2:29 |
| **2:30 to 3:00** | **Short** | 2:29 |
| **3:00 to 4:00** | **Core** | 3:06 |
| over **4:00** | **Long** | 4:09 |

There will still be small gaps between clips, and that is normal. What you are
avoiding is a ten second hole with nothing happening, and none of these rows
leaves one.

If you land between two rows, take the shorter one and let the last screen hold
a little longer at the end. That reads as a deliberate ending. The opposite,
voice still going after the picture has stopped, reads as a mistake.

---

## If a word comes out wrong

Fix it **in the ElevenLabs box only**, not in this file.

| If it says | Type this instead |
|---|---|
| "B-N-B" as one mumble | `B N B` |
| "PancakeSwap" oddly | `Pancake Swap` |
| A number read wrong | write it out in words |
