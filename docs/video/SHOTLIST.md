# Editing guide

You have your recording. You have the thirteen clips from
[`voiceover.md`](voiceover.md). This is how to put them together.

The rule for the whole edit: **the picture leads, the voice follows.** Find the
moment on your footage, drop the clip there. Never cut a screen short to keep up
with the voice.

---

## The nine screens you recorded

This is the sequence the recording guide asked for, and the clips below are
mapped onto it. If your recording went in a different order, re-map the last
column rather than re-cutting anything.

| # | Screen |
|---|---|
| 1 | Homepage, held, then scrolled to the four tiles |
| 2 | **Check a position** opened |
| 3 | `7331221` typed in, **Check it** clicked |
| 4 | The verdict, then scrolled down to the agent cards |
| 5 | **Agents** tab, **Answered when we called it** filter on |
| 6 | An agent with a green dot, scrolled through the six checks |
| 7 | **Activity**, scrolled a little |
| 8 | A **Receipt**, scrolled through the marks |
| 9 | **How we check** |

---

## Where each clip goes

The time columns are how long each clip runs in each of the three lengths from
`voiceover.md`.

**What matters is where a clip starts, not where it ends.** A clip that begins
on the Activity page and finishes a few seconds into the receipt is fine, and
that is how voiceover normally works: the voice carries across the cut and ties
the two screens together. What you are avoiding is a clip that starts before its
screen has appeared, or one that is still going two screens later.

Clips **11** and **12** are the long ones. If your Activity screen is brief, let
clip 11 run on into the receipt. Do not trim it.

| Clip | Screen | Drop it when… | Short | Core | Long |
|---|:---:|---|---:|---:|---:|
| **01** | 1 | homepage, as it loads | 9s | 9s | 16s |
| **02** | 1 | homepage, holding on the numbers | 9s | 15s | 21s |
| **03** | 1 | homepage, over the four category tiles | 14s | 14s | 14s |
| **04** | 2+3 | opening Check a position, cursor in the box | 11s | 11s | 14s |
| **05** | 4 | the moment the verdict appears | 10s | 10s | 22s |
| **06** | 4 | scrolling to the agent cards underneath | 13s | 13s | 13s |
| **07** | 5 | the Agents tab, filtered to the ones that answered | 12s | 18s | 25s |
| **08** | 6 | an agent profile opening, six checks in view | 13s | 13s | 13s |
| **09** | 6 | scrolling slowly down the six checks | 13s | 18s | 25s |
| **10** | 6 | while the crosses are on screen | 5s | 12s | 16s |
| **11** | 7 | the Activity page, over the capital and bond columns | 18s | 24s | 35s |
| **12** | 8 | a receipt, scrolling down the marks | 11s | 15s | 22s |
| **13** | 9 | closing, on the last screen | 11s | 14s | 14s |
| | | **total speech** | **2:29** | **3:06** | **4:09** |

Screen 1 carries three clips and screen 6 carries three. That is deliberate:
those are the two places a viewer needs the longest to take in what they are
looking at.

---

## Doing it in CapCut

1. **New project**. **Import** your recording, drag it to the timeline.
2. **Import** all thirteen mp3s at once.
3. Drag `01.mp3` onto the row **underneath** the video, starting where the
   homepage has settled and stopped moving.
4. Place `02` through `13` using the table above.
5. Play it through once without touching anything.

### The two things that will be wrong

**A clip starts before you can see what it describes.** Drag it right by half a
second.

**A clip is still talking two screens later.** One screen over is fine. Two is
too far. Click the **video**, open **Speed**, set it to **0.9**, then **0.8** if
you need to. The picture lasts longer everywhere and nothing is cut.

Never fix it by chopping the end off a clip.

6. **Export** → **1080p** → **30fps**.

---

## Doing it with one command instead

`mix.sh` lays all thirteen clips over your recording. Open it, put your own
start times into `OFFSETS` at the top, then:

```bash
cd docs/video
./mix.sh /path/to/your-recording.mp4
```

It writes `mandate-demo.mp4` beside it, and tells you the exact speed factor to
use if the voice runs past the end of your footage.

---

## If you re-record

Same nine screens, same order. Wait longer than feels natural on every one:
three full seconds after a page settles before you scroll. It will feel slow.
It is not.

1. `https://mandate-coral.vercel.app`, wait 4 seconds, scroll slowly to the four
   tiles, stop.
2. Click **Check a position** in the top bar. Wait 2 seconds.
3. Type `7331221`. Type it, do not paste. Click **Check it**.
4. Wait 4 seconds on the verdict, then scroll slowly to the agent cards. Stop.
5. Click **Agents**, then the **Answered when we called it** filter. Wait 3
   seconds.
6. Click any agent showing a green dot. Wait 4 seconds, then scroll slowly
   through the six checks.
7. Click **Activity**. Wait 3 seconds, scroll a little.
8. Click any **Receipt**. Wait 4 seconds, scroll through the marks.
9. Click **How we check**. Wait 3 seconds. Stop.

---

## Two things that will spoil it

**Music.** The script is full of numbers. Music makes them harder to hear and
makes a factual walkthrough sound like an advert.

**Speeding the footage up to fit.** If the voice is longer than the picture, the
answer is a slower picture. Nobody has complained that a demo gave them too long
to read.
