# YouTube posting

Three things: the title, the description, and the thumbnail. Copy them.

Upload as **Unlisted**, not Private. Private means a judge cannot open it
without being added to your account, which is the single easiest way to lose a
submission.

---

## Title

Paste this:

```
Mandate: 311,300 AI agents on BNB Chain. Six answer the phone.
```

62 characters, so it survives without being cut off in a search listing. It
names the product first, which is what a judge scanning a list of submissions
needs, and then gives them the one fact worth remembering.

If you would rather it read plainly:

```
Mandate: a marketplace for AI agents on BNB Smart Chain
```

---

## Description

Paste all of this. Fix the timestamps in the Chapters block to match your
finished edit before you publish, or delete that block entirely. Wrong
timestamps are worse than none.

```
Mandate is a marketplace that hires an agent it does not operate.

311,300 AI agents are registered on BNB Smart Chain. Six of them have an endpoint the registry has ever verified. We called every agent that publishes one and put the answer on its page, including when nothing came back.

Live: https://mandate-coral.vercel.app
Judge walk: https://mandate-coral.vercel.app/judges
Check a position: https://mandate-coral.vercel.app/diagnose
Code: https://github.com/iamdflame/mandate-bnb

Chapters
0:00 300,000 agents, six that answer
0:45 Check a real PancakeSwap position
0:57 It is out of range and earning nothing
1:24 The agents that answered, fastest first
1:44 Six checks, already settled
2:32 Four live books on mainnet
2:52 A receipt you can re-derive yourself
3:12 What we do and do not claim

WHAT IT DOES
Paste a wallet or a PancakeSwap V3 position and Mandate reads it off the chain, tells you whether it is out of range or close to liquidation, and lists the agents in that category that answered when we called them, with the price each one actually charges. Hire one per call, or open a bonded mandate where the agent's own capital is at risk against a benchmark, settled hourly on chain.

Every agent carries six checks, run against BNB Smart Chain and settled before the page loads: does its endpoint answer, is its wallet separate from its owner's, has it ever touched the contracts its job needs, do its reviews come from wallets that review anything else. Most agents fail most of them. Inconclusive is never shown as zero.

WHAT IS NOT TRUE YET
One hire has completed with real money. The agents holding the four books are wallets we operate, not registry agents. All four are measured against a Hold benchmark, which is the wrong yardstick for yield and loan health and the only one the settlement engine derives. The contract owner is a single EOA. All of that is on https://mandate-coral.vercel.app/evidence

Built for The Smart Money Era, BNB Agent Studio marketplace track.
Contract: 0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2 on BNB Smart Chain mainnet.

#BNBChain #AIAgents #ERC8004 #DeFi #PancakeSwap
```

### About the chapters

YouTube only turns these into real chapters if the first one is exactly `0:00`,
there are at least three, and each is at least ten seconds long. The times
above are estimates for the **Core** length from `voiceover.md`. Scrub your
finished video, write down where each screen actually starts, and replace them.

---

## Thumbnail

Upload **`thumbnail/USE-THIS-thumbnail.png`**. It is 1280 by 720, which is what
YouTube wants, and 74 KB, well under the 2 MB limit.

It was checked at 210 pixels wide, the size a thumbnail is shown at in search
results, and the headline is still readable there. That is the only test a
thumbnail has to pass.

Two alternates are in the same folder if you want them:

| File | What it is | Why not the default |
|---|---|---|
| `thumbnail-a.png` | **the one to use.** Headline only | |
| `thumbnail-b.png` | headline plus a real screenshot of the out-of-range verdict | the screenshot turns into an illegible grey band at search size |
| `thumbnail-c.png` | bigger headline, four category marks down the side | the marks shrink to specks, and "Six answer." on its own is weaker than the full line |

### To change the wording

The thumbnails are HTML. Edit `thumbnail/thumb.html`, then:

```bash
node tools/shot-thumb.mjs "$PWD/docs/video/thumbnail/thumb.html" "$PWD/docs/video/thumbnail/thumbnail-a.png"
```

The number in the headline is the live registry count on the day it was made.
If it has moved a lot by the time you upload, change it in the HTML and
re-render, so the thumbnail and the video agree.

---

## After you publish

Send me the URL. It goes in two places: the README, where the table currently
says `<paste the YouTube URL here>`, and the homepage, which is currently
showing a silent screen recording that yours should replace.
