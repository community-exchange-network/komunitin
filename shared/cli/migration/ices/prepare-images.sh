#!/usr/bin/env bash
# Resize oversized ICES uploads in place. No Drupal/database access is needed.
set -euo pipefail

usage() {
  echo "Usage: $0 [--apply] DIRECTORY"
  echo 'Preview by default. Requires Bash, ImageMagick 6/7, file and GNU coreutils/findutils.'
  echo 'Recurses into DIRECTORY, including styles. Pause uploads and back up originals before --apply.'
}

apply=false
if [[ ${1:-} == --help || ${1:-} == -h ]]; then usage; exit 0; fi
if [[ ${1:-} == --apply ]]; then apply=true; shift; fi
if [[ $# != 1 || ! -d $1 ]]; then usage >&2; exit 2; fi
root=$(realpath -- "$1")
limit=1000000
work=
manifest=$(mktemp)
cleanup() {
  if [[ -n $work ]]; then rm -rf -- "$work"; fi
  rm -f -- "$manifest"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for tool in file find stat timeout mktemp cp mv grep; do
  command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 2; }
done
if command -v magick >/dev/null; then
  convert=(magick)
  identify=(magick identify)
else
  command -v convert >/dev/null && command -v identify >/dev/null || {
    echo 'Install ImageMagick (magick, or convert and identify).' >&2; exit 2;
  }
  convert=(convert)
  identify=(identify)
fi
export MAGICK_THREAD_LIMIT=2 MAGICK_MEMORY_LIMIT=256MiB MAGICK_MAP_LIMIT=512MiB MAGICK_DISK_LIMIT=1GiB

fingerprint() { stat -c '%d:%i:%s:%y:%z' -- "$1"; }

prepare() {
  local source=$1 mime format before frames output_frames edge=2560 size
  local -a options
  [[ $(stat -c %h -- "$source") == 1 ]] || { echo 'Hard-linked file; left intact.' >&2; return 1; }
  before=$(fingerprint "$source") || return 1
  mime=$(file -b --mime-type -- "$source") || return 1
  case $mime in
    image/jpeg) format=JPEG ;;
    image/png) format=PNG ;;
    image/gif) format=GIF ;;
    image/webp) format=WEBP ;;
    *) echo "Unsupported format or non-image ($mime); left intact." >&2; return 1 ;;
  esac
  # Older ImageMagick can silently flatten APNG/WebP animations. Conservatively
  # leave files containing their animation markers intact, even if identify sees one frame.
  if { [[ $format == PNG ]] && LC_ALL=C grep -aq acTL -- "$source"; } ||
     { [[ $format == WEBP ]] && LC_ALL=C grep -aq ANIM -- "$source"; }; then
    echo 'Possible animated PNG/WebP; unsupported and left intact.' >&2
    return 1
  fi
  if $apply; then
    work=$(mktemp -d --tmpdir="$(dirname -- "$source")" .ices-images.XXXXXX) || return 1
  else
    work=$(mktemp -d) || return 1
  fi
  export MAGICK_TEMPORARY_PATH=$work
  # Read stdin so uploaded filenames cannot become ImageMagick options/selectors.
  frames=$(timeout 180s "${identify[@]}" -regard-warnings -format '%m %T\n' "$format:-" < "$source") || return 1
  if [[ -z $frames || $format != GIF && $frames == *$'\n'* ]]; then
    echo 'Empty image or unsupported frame sequence; left intact.' >&2
    return 1
  fi
  while (( edge > 0 )); do
    options=()
    if [[ $format == GIF ]]; then options+=(-coalesce); fi
    options+=(-auto-orient +profile '!icc,*' +set comment -resize "${edge}x${edge}>")
    case $format in
      JPEG|WEBP) options+=(-quality 85) ;;
      PNG) options+=(-define png:compression-level=9) ;;
      GIF) options+=(-layers OptimizeFrame) ;;
    esac
    # Always re-encode the original, never a previous lossy candidate.
    timeout 180s "${convert[@]}" -regard-warnings "$format:-" "${options[@]}" "$format:$work/image" < "$source" || return 1
    size=$(stat -c %s -- "$work/image") || return 1
    if (( size > 0 && size <= limit )); then break; fi
    edge=$((edge * 80 / 100))
  done
  (( edge > 0 )) || { echo 'Could not meet the byte limit; left intact.' >&2; return 1; }
  output_frames=$(timeout 180s "${identify[@]}" -regard-warnings -format '%m %T\n' "$format:-" < "$work/image") || return 1
  [[ $frames == "$output_frames" ]] || { echo 'Format, frame count or timing changed; left intact.' >&2; return 1; }
  if $apply; then
    # Retain ownership, permissions/ACLs and extended attributes, but use a new
    # modification time so HTTP caches can detect that the bytes changed.
    cp --attributes-only --preserve=mode,ownership,xattr -- "$source" "$work/image" || return 1
    [[ $(fingerprint "$source") == "$before" ]] || { echo 'Source changed during processing; left intact.' >&2; return 1; }
    mv -fT -- "$work/image" "$source" || return 1
  fi
  after_bytes=$size
}

# Never follow symlinks; only regular files strictly larger than the decimal MB limit.
find "$root" -type f -size +1000000c -print0 > "$manifest"
ready=0
unprocessed=0
saved=0
echo "$(if $apply; then echo APPLY; else echo PREVIEW; fi): $root (limit $limit bytes)"
while IFS= read -r -d '' source; do
  printf 'FILE %q\n' "${source#"$root"/}"
  before_bytes=$(stat -c %s -- "$source")
  if prepare "$source"; then
    ready=$((ready + 1))
    saved=$((saved + before_bytes - after_bytes))
    echo "$(if $apply; then echo REPLACED; else echo 'WOULD REPLACE'; fi): $before_bytes -> $after_bytes bytes"
  else
    unprocessed=$((unprocessed + 1))
    echo 'UNPROCESSED: remains oversized; original retained.'
  fi
  if [[ -n $work ]]; then rm -rf -- "$work"; work=; fi
done < "$manifest"
echo "Summary: ready=$ready, unprocessed_oversized=$unprocessed, saved_bytes=$saved"
if ! $apply; then echo 'Preview only: totals describe validated candidates; originals are unchanged.'; fi
(( unprocessed == 0 ))
