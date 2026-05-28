# ============================================================================
# Movar demo video — output derivations.
#
# Reads Playwright-captured WebM from `../../demo-results/` and produces the
# three publish formats described in `playwright.demo.config.ts`:
#
#   master-1080p.mp4  →  YouTube (linked from Chrome Web Store listing)
#   hero.gif          →  README + marketing hero
#   social-square.mp4 →  Bluesky/X/Mastodon (1080×1080, captioned)
#   social-vertical.mp4 → Mastodon/Bluesky vertical (1080×1920, captioned)
#
# All targets land under `out/`. Caption sources live at
# `captions/{uk,en}.srt`; pass LOCALE=en to build the English variants
# (defaults to UK).
#
# Usage:
#   make record          # convenience wrapper: runs the spec, then `make all`
#   make all             # derive every output from the latest WebM
#   make hero            # just the README GIF
#   make youtube         # just the 1080p MP4
#   make social          # both square + vertical
#   make clean           # rm -rf out/
#
# Requires: ffmpeg (with libx264, libvpx-vp9, palettegen, palette-use).
# brew: `brew install ffmpeg`.
# ============================================================================

LOCALE         ?= uk
DEMO_RESULTS   := ../../demo-results
OUT            := ./out
# Playwright names per-test output directories with a hash of the test
# title, and records one WebM per Page (an MV3 context spawns a tiny
# service-worker page alongside the main one). Auto-discover the largest
# WebM under demo-results/ — the main page video is always the largest by
# at least 10× over the service-worker capture.
RAW            := $(shell ls -S $(DEMO_RESULTS)/*/*.webm 2>/dev/null | head -1)
CAPTIONS       := captions/$(LOCALE).srt

# `master.webm` is the canonical re-mux of the raw capture — H.264 in MP4
# at native 1280×800. Every other derivation works from this so a single
# slow encode doesn't run four times.
MASTER_MP4     := $(OUT)/master.mp4

# ffmpeg flags worth flagging:
#   -an                       no audio (Playwright doesn't capture audio anyway)
#   -movflags +faststart      moov atom up front, lets browsers/YouTube
#                             start playback before the file fully loads
#   -pix_fmt yuv420p          mandatory for broad codec support (Twitter etc.)
FFMPEG_BASE    := ffmpeg -y -hide_banner -loglevel warning

.PHONY: all record clean youtube hero social check

# ----------------------------------------------------------------------------
# default
# ----------------------------------------------------------------------------
all: $(MASTER_MP4) youtube hero social

check:
	@command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not installed. brew install ffmpeg"; exit 1; }
	@test -f "$(RAW)" || { echo "raw capture missing: $(RAW)"; echo "Run \`make record\` first."; exit 1; }

# ----------------------------------------------------------------------------
# record: run the demo spec, then derive all outputs
# ----------------------------------------------------------------------------
record:
	cd ../.. && RUN_DEMO=1 pnpm exec playwright test --config playwright.demo.config.ts
	$(MAKE) all

# ----------------------------------------------------------------------------
# master: H.264 mux at native viewport size. All other targets fan out
# from this — keeps the encode count down.
# ----------------------------------------------------------------------------
$(MASTER_MP4): $(RAW) | $(OUT) check
	$(FFMPEG_BASE) -i "$(RAW)" \
		-c:v libx264 -preset slow -crf 18 \
		-pix_fmt yuv420p -movflags +faststart -an \
		"$@"

# ----------------------------------------------------------------------------
# youtube: upscale 1280×800 → 1920×1080 with letterbox bars (no crop).
# YouTube auto-detects the 16:10 source and frames it; the explicit pad
# lets us control the bar colour (true black) for a clean look.
# ----------------------------------------------------------------------------
youtube: $(OUT)/master-1080p.mp4

# 1280×800 source is 16:10. Scale to height 1080 (→ 1728×1080) and
# pillarbox left+right to reach 1920×1080. Source aspect is locked by
# `playwright.demo.config.ts` so the math is safe to hard-code.
$(OUT)/master-1080p.mp4: $(MASTER_MP4) | $(OUT)
	$(FFMPEG_BASE) -i "$<" \
		-vf "scale=1728:1080:flags=lanczos,pad=1920:1080:96:0:color=black" \
		-c:v libx264 -preset slow -crf 18 \
		-pix_fmt yuv420p -movflags +faststart -an \
		"$@"

# ----------------------------------------------------------------------------
# hero gif: 10-second trim, palette-optimised, ~800px wide. Two-pass
# palettegen + paletteuse produces a 5–10× smaller file than ffmpeg's
# default global palette.
# ----------------------------------------------------------------------------
hero: $(OUT)/hero.gif

$(OUT)/hero.gif: $(MASTER_MP4) | $(OUT)
	$(FFMPEG_BASE) -ss 0 -t 10 -i "$<" \
		-vf "fps=20,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff" \
		"$(OUT)/.palette.png"
	$(FFMPEG_BASE) -ss 0 -t 10 -i "$<" -i "$(OUT)/.palette.png" \
		-lavfi "fps=20,scale=800:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4" \
		"$@"
	rm -f "$(OUT)/.palette.png"

# ----------------------------------------------------------------------------
# social: square (1080×1080) + vertical (1080×1920), both captioned.
# Center-crop preserves the popup region; vertical adds black bars top
# and bottom rather than zoom-cropping (which would amputate site chrome).
# `subtitles=` burns the SRT in — softsub doesn't survive Twitter/X.
# ----------------------------------------------------------------------------
social: $(OUT)/social-square.mp4 $(OUT)/social-vertical.mp4

$(OUT)/social-square.mp4: $(MASTER_MP4) $(CAPTIONS) | $(OUT)
	$(FFMPEG_BASE) -i "$<" \
		-vf "crop=800:800:240:0,scale=1080:1080:flags=lanczos,subtitles=$(CAPTIONS):force_style='Fontname=Inter,Fontsize=42,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=10,MarginV=80'" \
		-c:v libx264 -preset slow -crf 19 \
		-pix_fmt yuv420p -movflags +faststart -an \
		"$@"

$(OUT)/social-vertical.mp4: $(MASTER_MP4) $(CAPTIONS) | $(OUT)
	$(FFMPEG_BASE) -i "$<" \
		-vf "scale=1080:675:flags=lanczos,pad=1080:1920:0:622:color=#0a0a0f,subtitles=$(CAPTIONS):force_style='Fontname=Inter,Fontsize=46,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=10,MarginV=240'" \
		-c:v libx264 -preset slow -crf 19 \
		-pix_fmt yuv420p -movflags +faststart -an \
		"$@"

# ----------------------------------------------------------------------------
# housekeeping
# ----------------------------------------------------------------------------
$(OUT):
	mkdir -p "$@"

clean:
	rm -rf "$(OUT)"
