# Listing grounds

The only AI-generated pixels in the App Store listing. Everything drawn on top of them (phone,
screen, logo, headline) comes from the renderer and real captures.

| File                 | Use         | Prop (bottom corner)       |
| -------------------- | ----------- | -------------------------- |
| `concrete-light.jpg` | light shots | kalyna sprig, bottom-left  |
| `concrete-dark.jpg`  | dark shots  | kalyna sprig, bottom-right |

- **Picked** by the owner on 2026-11-15 from six options (concrete, paper, linen × light/dark).
- **Generated** with Figma AI `generate_image`, model `gpt-image-2.5-flare`, at 768×1792. The
  Figma scratch file is "Movar listing backgrounds" in the owner's drafts.
- **Upscaled** with sharp (`lanczos3`) to the 1320×2868 canvas, cover-fit anchored to the bottom
  so the prop survives the crop, then saved as JPEG q90 (mozjpeg) to keep the repo light.
- **Prompt (light)**: top-down flat-lay of a plain smooth light warm-grey polished concrete
  surface, soft even daylight, very subtle texture, almost empty; in the bottom-left corner only a
  single small sprig of red viburnum berries (kalyna) with two leaves, partly cut off by the frame
  edge; no text, nothing in the centre or top. The dark prompt is the same with dark charcoal
  concrete, low-key light and the sprig bottom-right.

The phone covers most of the width, so only a sliver of the prop shows in the side gap. That is
intentional: the prop must never compete with the headline or the UI.
