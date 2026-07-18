# Marketplace research

Competitor analysis and pain-point catalogue for a planned Ukrainian marketplace for goods
and services. This is product research, not Movar code — it lives here because the
investigation was run on this branch and the findings need somewhere durable to sit.

## Files

| File                                 | What it is                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| [pain-points.md](pain-points.md)     | **The primary artefact.** 54 pains with stable IDs, status, evidence.          |
| [pain-points.yaml](pain-points.yaml) | Machine-readable mirror, for mapping solutions to pains and checking coverage. |
| [competitors.md](competitors.md)     | Market map, per-platform profiles, capability gap matrix, benchmarks.          |
| [evidence.md](evidence.md)           | Sources, what survived fact-checking, what to re-verify, corrections.          |

## Start here

Read [pain-points.md](pain-points.md) top to bottom once. The grouping matters more than the
individual entries: most of the surface reduces to **four missing primitives**, and the whole
argument for this product rests on them.

1. **No product identity.** Ukrainian classifieds have no catalogue — a listing is free text
   plus photos, never "an instance of a known product." This one absence causes five separate
   symptoms (`IDENT-01`…`IDENT-05`) and undermines two more.
2. **No public conversation.** Everything is 1:1 private chat, so answers are never reused,
   service requests never converge on a spec before offers arrive, and fraud operates in a
   channel nobody can observe.
3. **No relationship memory.** The platforms model listings and, weakly, identities — never
   the relationship between two people. You cannot see you have dealt with someone before,
   carry standing between venues, refuse someone, or set how they may reach you
   (`TRUST-02`, `TRUST-06`, `TRUST-07`, `COMM-03`).
4. **Services are matched but never managed.** Platforms broker the introduction and then
   withdraw. Escrow is shaped for a parcel, so any job needing staged payment, a change order
   or a warranty has to leave the platform to happen at all (`SVC-01`…`SVC-06`).

None of the four is retrofittable cheaply by an incumbent, which is what makes them worth
building first. The third has a telling symptom worth remembering in any pitch: Facebook and
Telegram beat every Ukrainian marketplace at relationship memory, because a chat app gets it
for free. The fourth is the least evidenced — see the note on tiers below.

## Two evidence tiers

The catalogue was built in passes, and about a third of it is now **`reasoned`** — derived from
analysis rather than checked against any platform or user complaint. That covers the whole `SVC`
group, `DISC-01`, `OPS-03`, `TRUST-10` and `TRUST-11`. Everything else is either from the
fact-checked research run or marked `verified` from a later documentation pass.

This matters because the reasoned entries are the newest and most confident-sounding part of the
document. Checking three assumptions against live platforms in one pass showed why: saved-search
alerts and identity verification both turned out to **already exist**, and would have been
written up as white space otherwise.

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
