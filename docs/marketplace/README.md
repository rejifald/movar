# Marketplace research

Competitor analysis and pain-point catalogue for a planned Ukrainian marketplace for goods
and services. This is product research, not Movar code — it lives here because the
investigation was run on this branch and the findings need somewhere durable to sit.

## Files

| File                                 | What it is                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| [pain-points.md](pain-points.md)     | **The primary artefact.** 35 pains with stable IDs, status, evidence.          |
| [pain-points.yaml](pain-points.yaml) | Machine-readable mirror, for mapping solutions to pains and checking coverage. |
| [competitors.md](competitors.md)     | Market map, per-platform profiles, capability gap matrix, benchmarks.          |
| [evidence.md](evidence.md)           | Sources, what survived fact-checking, what to re-verify, corrections.          |

## Start here

Read [pain-points.md](pain-points.md) top to bottom once. The grouping matters more than the
individual entries: most of the surface reduces to **two missing primitives**, and the whole
argument for this product rests on them.

1. **No product identity.** Ukrainian classifieds have no catalogue — a listing is free text
   plus photos, never "an instance of a known product." This one absence causes five separate
   symptoms (`IDENT-01`…`IDENT-05`) and undermines two more.
2. **No public conversation.** Everything is 1:1 private chat, so answers are never reused,
   service requests never converge on a spec before offers arrive, and fraud operates in a
   channel nobody can observe.

Neither is retrofittable cheaply by an incumbent, which is what makes them worth building
first.

## Conventions

**Pain IDs are permanent.** `TRUST-04` means the same thing forever. If a pain turns out to be
wrong or duplicated, mark it withdrawn — never reuse the number, because solution docs,
tickets and commit messages will reference it.

**Status is a snapshot, not a moat.** Two pains moved from `open` to `partial` during the
research itself, because monobazar and then OLX shipped them. When something is cheap to copy,
assume it will not still be white space at launch. Re-check `partial` entries before planning
around them.

**Keep the two pain files in sync.** `pain-points.md` carries the evidence and the argument;
`pain-points.yaml` carries the structure. Change one, change the other.

**Confidence is marked, not assumed.** Roughly a third of the underlying claims are unverified
— the research run's fact-checking was cut short by a usage limit. `evidence.md` says exactly
which. Check there before repeating any number outside this repo.

## Status

Research complete; solution design not started. The next step before any of this becomes a
roadmap is talking to real sellers — this research establishes what the platforms do and don't
do, not which absence people actually feel strongly enough to switch over.
