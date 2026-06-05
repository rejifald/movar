# Movar — source build instructions (Firefox AMO)

The canonical source-bundle README lives at the repo root:
**[`../../SOURCE.md`](../../SOURCE.md)**.

That document covers the OS/Node/pnpm requirements, install instructions,
and the exact `pnpm install && pnpm --filter @movar/extension build:firefox
&& pnpm --filter @movar/extension zip:firefox` repro from a clean checkout
of the full monorepo.

## Which archive to submit to AMO

Use the **monorepo bundle** produced by `pnpm pack:amo-source` at the repo
root — it is the only archive that contains everything needed to
reproduce the build:

```bash
pnpm pack:amo-source
# → apps/extension/.output/movar-extension-<version>-amo-source.zip
```

WXT also writes `apps/extension/.output/movarextension-<version>-sources.zip`
as a side-effect of `pnpm zip:firefox`. **Do not submit that one** — it only
contains `apps/extension/` and would not build on a reviewer's machine
because the workspace packages under `packages/` and the root
`pnpm-lock.yaml` are missing.
