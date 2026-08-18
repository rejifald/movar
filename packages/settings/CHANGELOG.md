# @movar/settings

## 0.0.2

### Patch Changes

- 0150a77: settings: derive the block list from the priority list instead of storing it as a user-editable set. Closes #89.

  Which language is imposed over which is product policy, not a preference — and it could not be exposed safely. Detection distinctiveness is candidate-set-relative: `ы` cleanly separates Russian from Ukrainian, and goes inert the moment Belarusian joins the candidate set. A user adding a language to a free-form block list therefore weakened rung-1 Russian detection, and the failure mode was under-concealing Russian with no visible signal.

  `blocked` is now `deriveBlocked(priority)` — `((⋃ IMPOSED_OVER[priority].imposed) ∪ ['ru']) \ priority` — recomputed at every settings read and before every write, so a value synced from an older build or hand-edited in storage converges on its own. Russian stays unconditionally locked and can never enter the priority list; every other imposer is overridable by putting it in `priority`. The four runtime consumers (redirect trigger, picker stripping, conceal candidates, popup hero) keep reading `settings.blocked` unchanged — only its provenance moved. Behaviour for the shipped default profile is identical.

  The unmounted `BlockedSection` component and its now-unused copy are deleted rather than restored.

## 0.0.1

### Patch Changes

- Updated dependencies [c4689b0]
- Updated dependencies [3a5ca20]
  - @movar/lang-detect@0.0.1
