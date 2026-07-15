# Social posts

Queue for Movar's Instagram / Threads / Facebook posts. **Add a Markdown file
here, and CI publishes it** — once the platform credentials are configured (see
below). Until then, every post still validates and dry-runs on each PR.

This is marketing ops. Nothing in this directory or its pipeline ships in the
extension — the network-silent product is untouched.

## A post file

`posts/YYYY-MM-DD-slug.md` — frontmatter + caption:

```markdown
---
platforms: [instagram, threads, facebook]
lang: uk
image: social/uk/01-meet-movar.png
status: ready
---

Your caption goes here. This whole body is the caption, verbatim.
#Movar #Українська
```

| Field       | Required | Notes                                                                                   |
| ----------- | -------- | --------------------------------------------------------------------------------------- |
| `platforms` | yes      | Any of `instagram`, `threads`, `facebook`.                                              |
| `lang`      | yes      | `uk` or `en` — the human record, and which locale card to reference.                    |
| `image`     | if IG    | Path under `apps/marketing/public/`. **Required for Instagram** (no text-only IG post). |
| `status`    | yes      | `ready` publishes; `draft` is validated but held back.                                  |

The **caption is the body** after the frontmatter. Per-network limits are
enforced against the tightest network you target (Threads 500, Instagram 2200,
Facebook capped at 5000). See `scripts/social/posts.mts`.

## The card image

Images must be at a public URL — the Graph / Threads APIs fetch them, they don't
accept raw bytes for IG/Threads. Movar hosts them on the marketing site:
`apps/marketing/public/social/<lang>/…` → served at `https://movar.fyi/social/…`.

Cards are generated the same way as the OG images — a React component captured
from Storybook, never hand-authored:

1. Add a story to `apps/marketing/src/social/` titled `Marketing/Social/<Scene>`
   with the next free `parameters.screenshotIndex` and `English` + `Ukrainian`
   exports (copy lives in `src/i18n.ts` under `social`).
2. `pnpm --filter @movar/marketing capture:social` → writes
   `public/social/<lang>/NN-<scene>.png`. Commit the PNGs.
3. Reference it from a post's `image:`.

## Publishing model

- **Idempotent.** Each successful post is recorded in `posts/.published.json`
  (slug → network → id). A network already recorded for a slug is never
  re-posted, so re-running is safe. CI commits this ledger back with `[skip ci]`.
- **Draft vs ready.** Flip `status: draft` to hold a post; `ready` releases it.

### Commands

```bash
pnpm social:check          # validate every post + assert its card exists (CI, every PR)
pnpm social:publish        # dry run: print exactly what WOULD be posted (no network)
pnpm social:publish:live   # actually post (needs credentials; used by CI on main)
```

## Enabling live publishing

Set these repository secrets (a network posts only when _both_ its id and token
are present, so you can enable them one at a time):

| Secret                 | For       |
| ---------------------- | --------- |
| `FB_PAGE_ID`           | Facebook  |
| `FB_PAGE_ACCESS_TOKEN` | Facebook  |
| `IG_USER_ID`           | Instagram |
| `IG_ACCESS_TOKEN`      | Instagram |
| `THREADS_USER_ID`      | Threads   |
| `THREADS_ACCESS_TOKEN` | Threads   |

Account prerequisites (these are hard Meta requirements, not ours):

- **Facebook** must be a **Page** (personal profiles can't be posted to via API).
- **Instagram** must be a **Business/Creator** account linked to that Page.
- **Threads** posts via a Meta app with the Threads use-case enabled.
- Tokens are ~60-day and must be refreshed; store the long-lived ones.

The client request shapes in `scripts/social/platforms.mts` target Graph API
v21.0 / Threads v1.0. **Confirm endpoints, permission names, and rate limits
against the current Meta docs before flipping this on** — Meta rotates them.
