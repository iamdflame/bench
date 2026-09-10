# The 90-second video: everything you need

Three files live here.

| File | What it is |
|---|---|
| `SCRIPT.md` | this: the words, the voice settings, and what to click |
| `voiceover.txt` | **the exact text to paste into ElevenLabs.** Nothing else in it |
| `SHOTLIST.md` | second-by-second: what is on screen while each line is read |

Read this page once, then work from `SHOTLIST.md`.

---

## Part 1 — Make the voice (ElevenLabs)

### Which voice

Go to **elevenlabs.io** → sign in → **Text to Speech**.

In the voice dropdown, pick one of these three. They are all in the free
library. First choice first.

| Order | Voice | Why |
|---|---|---|
| 1st | **Adam** | Male, low, unhurried. Sounds like a documentary, not an advert. Best match for this script. |
| 2nd | **Charlotte** | Female, English, calm and slightly cool. Use if you want it less American. |
| 3rd | **Daniel** | Male, English, news-reader. Use if Adam sounds too soft on your speakers. |

**Do not** pick a voice described as *energetic*, *excited*, *upbeat*, or
*conversational promo*. The script is a plain statement of fact and an excited
voice reading it sounds like a scam.

### The model

Set **Model** to **Eleven Multilingual v2**.
(If you only see "Eleven v3", that is fine too. Avoid "Turbo" — it is faster
and flatter.)

### The four sliders

Click **Settings** (or the little slider icon) under the voice. Set exactly:

| Slider | Set it to | In plain words |
|---|---|---|
| **Stability** | **50%** | Halfway. Lower and it gets dramatic, higher and it gets robotic. |
| **Similarity** | **75%** | Three-quarters. Keeps it sounding like the real voice. |
| **Style exaggeration** | **0%** | All the way left. This is the important one. Any style at all makes it sound like an advert. |
| **Speaker boost** | **On** | Just makes it clearer. |

**Speed**: leave at **1.0**. If your finished audio is longer than 95 seconds,
come back and set it to **1.05**. Do not go past 1.1 — it starts to sound rushed.

### Generate it

1. Open `voiceover.txt` in this folder.
2. Select all of it and copy it.
3. Paste it into the big text box on ElevenLabs.
4. Press **Generate**.
5. Listen to the whole thing once.
6. Press **Download**. You get an `.mp3`.
7. Rename it to `voice.mp3` and put it in this folder (`docs/video/`).

### If a word sounds wrong

Some words trip it up. Fix them by respelling them in the text box only — do
not change `voiceover.txt` itself:

| If it says | Replace that word with |
|---|---|
| "B-N-B" as one mumble | `B N B` (spaces between the letters) |
| "eight thousand and four" | `eight-oh-oh-four` |
| "USD-one" oddly | `U S D one` |
| A number read wrong | write it in words: `three hundred and eleven thousand` |

Then press Generate again.

---

## Part 2 — Record the screen

You do **not** need to record by hand. There is a script that drives the real
site in a real browser and records it.

```bash
cd /path/to/this/repo
npm run tape
```

That writes `docs/tape/judge-walk.mp4`, about 75 seconds, no sound, no cursor
jitter, no mistakes. **Use this.** It is already timed to the voiceover.

### If you want to record it yourself instead

Only do this if you want a human cursor in the shot.

**On a Mac:** press `Shift` + `Command` + `5`, choose **Record Entire Screen**,
press Record. Press the stop button in the menu bar when done.

**On Windows:** press `Windows` + `G`, click the record button (a circle).

**Before you press record:**

1. Close every other tab. One window, one tab.
2. Make the browser window **1280 by 800** if you can. Full screen is fine too.
3. Set the browser zoom to **100%** (`Ctrl`/`Cmd` + `0`).
4. Turn off notifications (Mac: Focus. Windows: Focus assist).
5. Have `SHOTLIST.md` open on your phone so you can follow it.

Then follow `SHOTLIST.md` exactly. Move slowly. Slower than feels right.

---

## Part 3 — Put the voice and the picture together

You need one free tool. Pick whichever you already have.

### The easiest way: CapCut (free, Mac/Windows/phone)

1. Open **CapCut** → **New project**.
2. Click **Import** → choose `docs/tape/judge-walk.mp4`.
3. Drag it onto the timeline at the bottom.
4. Click **Import** again → choose `voice.mp3`.
5. Drag `voice.mp3` onto the timeline, on the row **underneath** the video.
6. Line them both up so they both start at the very left edge (time zero).
7. Press play. Watch it once all the way through.
8. **If the voice finishes before the video:** click the video, find **Speed**,
   set it to `1.1`. Check again.
   **If the voice is longer than the video:** click the video clip, drag its
   right edge to stretch, or go back to ElevenLabs and set Speed to 1.05.
9. Click **Export** → **1080p** → **30fps** → Export.

### If you prefer a command instead

If the repo is on your machine and you have `ffmpeg`, this does it in one line
with no editing at all:

```bash
cd docs/video
ffmpeg -i ../tape/judge-walk.mp4 -i voice.mp3 \
  -c:v copy -c:a aac -b:a 192k -shortest mandate-90s.mp4
```

`-shortest` makes it stop when whichever is shorter runs out. If the voice is
slightly longer than the picture, drop `-shortest` and the last second will
hold on the final frame, which is fine.

---

## Part 4 — Where it goes

1. **YouTube** → Upload → set to **Unlisted** (not Private — judges must be
   able to open it without an account).
   Title: `Mandate — hire an agent on BNB Smart Chain (90s)`
   Description: paste the first two lines of `voiceover.txt` and the link
   `https://mandate-coral.vercel.app`.
2. Copy the YouTube link.
3. Put it in the README where it says `<paste video URL>`.
4. Tell me the URL and I will put it on the site.

---

## What not to do

- **No music.** The script has numbers in it. Music makes them harder to hear
  and makes the whole thing feel like a pitch.
- **No captions burned in.** YouTube will make them.
- **No intro card, no logo animation.** Ninety seconds is short. Spend it on
  the product.
- **Do not re-record the site by hand if `npm run tape` worked.** The scripted
  take has no mistakes in it.
