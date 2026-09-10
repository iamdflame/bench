#!/usr/bin/env bash
#
# Lay the thirteen voice clips over a screen recording at fixed times.
#
#   ./mix.sh /path/to/your-recording.mp4
#
# Edit OFFSETS below first: one number per clip, in seconds, taken from the
# table in SHOTLIST.md against your own recording. The clips are placed, not
# stretched, so if one overruns its screen the fix is to slow the video down
# rather than to move the clip.
set -euo pipefail

VIDEO="${1:?pass the path to your recording}"
CLIPS="$(cd "$(dirname "$0")" && pwd)/clips"
OUT="$(cd "$(dirname "$0")" && pwd)/mandate-demo.mp4"

# Second at which each clip starts. Thirteen numbers, in order.
# Defaults are the Core tier read back to back with two seconds of air
# between clips. Replace them with your own times from SHOTLIST.md.
OFFSETS=(0 11 28 45 57 70 84 104 119 139 152 172 192)

for i in $(seq -w 1 13); do
  [ -f "$CLIPS/$i.mp3" ] || { echo "missing $CLIPS/$i.mp3"; exit 1; }
done

inputs=(-i "$VIDEO")
for i in $(seq -w 1 13); do inputs+=(-i "$CLIPS/$i.mp3"); done

# Delay each clip to its offset, then mix them all into one track.
filter=""
for n in $(seq 1 13); do
  ms=$(( OFFSETS[n-1] * 1000 ))
  filter+="[${n}:a]adelay=${ms}|${ms}[a${n}];"
done
mix=""
for n in $(seq 1 13); do mix+="[a${n}]"; done
filter+="${mix}amix=inputs=13:dropout_transition=0:normalize=0[out]"

ffmpeg -y "${inputs[@]}" \
  -filter_complex "$filter" \
  -map 0:v -map "[out]" \
  -c:v copy -c:a aac -b:a 192k \
  "$OUT"

echo "wrote $OUT"

# If the voice outruns the picture, say so rather than letting it be discovered
# on playback. The fix is a slower video, never a shorter clip.
vid=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO" | cut -d. -f1)
out=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)
if [ "$out" -gt "$((vid + 1))" ]; then
  over=$((out - vid))
  factor=$(awk -v v="$vid" -v o="$out" 'BEGIN{printf "%.2f", v/o}')
  echo
  echo "The voice runs ${over}s past the end of your footage."
  echo "Either use a shorter tier from voiceover.md, or slow the video:"
  echo "  in CapCut set Speed to ${factor}"
  echo "  or: ffmpeg -i \"$VIDEO\" -filter:v \"setpts=PTS/${factor}\" -an slower.mp4"
fi
