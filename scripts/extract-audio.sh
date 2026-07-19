#!/usr/bin/env bash
# custom/input/movie/*.mp4 → assets/audio/*.mp3
# Drops raw head/tail (default 2s), then fades in/out (default 5s) so loops meet near silence.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/custom/input/movie"
DST="$ROOT/assets/audio"
EDGE="${TRIM_EDGE_SEC:-2}"
FADE="${FADE_SEC:-5}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg が見つかりません。 brew install ffmpeg" >&2
  exit 1
fi
if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe が見つかりません。 brew install ffmpeg" >&2
  exit 1
fi

mkdir -p "$DST"

shopt -s nullglob
files=("$SRC"/*.{mp4,MP4,mov,MOV,m4v,M4V})
if ((${#files[@]} == 0)); then
  echo "入力なし: $SRC に mp4 / mov を置いてから再実行してください"
  exit 0
fi

for src in "${files[@]}"; do
  base="$(basename "$src")"
  name="${base%.*}"
  out="$DST/${name}.mp3"

  dur="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$src")"
  mid_dur="$(awk -v d="$dur" -v e="$EDGE" 'BEGIN { printf "%.4f", d - 2 * e }')"
  # Need room for fade-in + fade-out with a little body in between.
  can_fade="$(awk -v m="$mid_dur" -v f="$FADE" 'BEGIN { print (m > f * 2 + 0.5) ? 1 : 0 }')"

  if [[ "$can_fade" == "1" ]]; then
    fade_out_st="$(awk -v m="$mid_dur" -v f="$FADE" 'BEGIN { printf "%.4f", m - f }')"
    echo "→ $base → assets/audio/${name}.mp3 (trim ±${EDGE}s, fade ${FADE}s)"
    ffmpeg -y -hide_banner -loglevel error \
      -i "$src" \
      -vn \
      -af "atrim=start=${EDGE}:duration=${mid_dur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${FADE},afade=t=out:st=${fade_out_st}:d=${FADE}" \
      -acodec libmp3lame \
      -q:a 2 \
      "$out"
  else
    echo "→ $base → assets/audio/${name}.mp3 (short; plain extract, dur=${dur}s)"
    ffmpeg -y -hide_banner -loglevel error \
      -i "$src" \
      -vn \
      -acodec libmp3lame \
      -q:a 2 \
      "$out"
  fi
done

echo "完了: $DST"
