# Editing guide

You have your recording. You have the thirteen clips from
[`voiceover.md`](voiceover.md). This is how to put them together.

The rule for the whole edit: **the picture leads, the voice follows.** Find the
moment on your footage, drop the clip there. Never cut a screen short to keep up
with the voice. That is what made the first attempt feel rushed.

---

## Where each clip goes, and how long that screen has to stay up

The three time columns are how long each clip actually runs in each of the
lengths from `voiceover.md`. **The screen must still be on show when the clip
ends.** If it is not, slow the video down rather than trimming the voice.

| Clip | Drop it when… | Short | Core | Long |
|---|---|---:|---:|---:|
| **01** | homepage, as it loads | 9s | 9s | 16s |
| **02** | homepage, holding on the numbers | 9s | 15s | 21s |
| **03** | homepage, over the four category tiles | 14s | 14s | 14s |
| **04** | opening Check a position, cursor in the box | 11s | 11s | 14s |
| **05** | the moment the verdict appears | 10s | 10s | 22s |
| **06** | scrolling to the agent cards underneath | 13s | 13s | 13s |
| **07** | on the cards, over the latencies and prices | 12s | 18s | 25s |
| **08** | an agent profile opening, six checks in view | 13s | 13s | 13s |
| **09** | scrolling slowly down the six checks | 13s | 18s | 25s |
| **10** | while the crosses are on screen | 5s | 12s | 16s |
| **11** | over the hire panel | 12s | 18s | 28s |
| **12** | over the activity tape, then a receipt | 8s | 18s | 24s |
| **13** | closing, on the last screen | 11s | 14s | 14s |
| | **total speech** | **2:20** | **3:02** | **4:05** |

---

## Doing it in CapCut

1. **New project**. **Import** your recording, drag it to the timeline.
2. **Import** all thirteen mp3s at once.
3. Drag `01.mp3` onto the row **underneath** the video, starting where the
   homepage has settled and stopped moving.
4. Place `02` through `13` the same way, using the table above.
5. Play the whole thing once, start to finish, without touching anything.

### The two things that will be wrong

**A clip starts before you can see what it is describing.**
Drag it right by half a second.

**A clip is still talking after the screen has moved on.** This is the one that
matters. Click the **video**, open **Speed**, set it to **0.9**, then **0.8** if
you need to. The picture lasts longer everywhere and nothing gets cut.

Never fix it by chopping the end off a clip.

6. **Export** → **1080p** → **30fps**.

---

## Doing it with one command instead

`mix.sh` in this folder lays all thirteen clips over your recording at fixed
times. Open it, put your own start times into `OFFSETS` at the top, then:

```bash
cd docs/video
./mix.sh /path/to/your-recording.mp4
```

It writes `mandate-demo.mp4` beside it.

---

## Two things that will spoil it

**Music.** The script is full of numbers. Music makes them harder to hear and
makes the whole thing sound like an advert.

**Speeding the footage up to fit.** If the voice is longer than the picture, the
answer is a slower picture, not a faster one. Nobody has ever complained that a
demo gave them too long to read.
