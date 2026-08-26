---
'@movar/audit-engine': patch
'@movar/extension': patch
---

Stop the Safari collector throwing away a redirect chain that outruns its hop ceiling, so the app and the CLI adjudicate the same site the same way.

#482 fixed this in the Node collector: falling out of `walk`'s hop loop used to answer no response at all, which `resolveOutcome` read as `error` and `adjudicableProbes` dropped before anything — capability derivation included — saw it. Eleven requests spent against a live third-party site, the whole chain sitting in `redirectChain`, and `core/switch-bounces` — the rule the walk exists for — handed nothing. `AuditProbe.swift` is a conformer to the same wire contract and still did the old thing, so the same site audited from the app and from the CLI produced different verdicts on the most pathological chain there is, and neither report said which collector's ceiling was responsible.

What made it plainly a bug rather than a policy is unchanged from #482 and holds identically in Swift: a **cyclic** chain exits through the `seen` check with a live response and stays fully adjudicable, so a 2-hop loop was evidence and an 11-hop chain was discarded.

The ceiling now keeps the last 3xx the walk actually got — `status` is that 3xx rather than a `0` claiming no response at all, which is false of eleven of them — sets `outcome: "ok"`, and emits `redirectChainTruncated`. A challenge asserted by that last redirect still wins and yields `blocked`, matching what `resolveOutcome` does with the same headers. The flag is written only when true, as `omittableFields` writes it: absent is already the wire's "this chain reached its own end", and a `false` on every other probe would say the same thing at the cost of a field on every bundle ever stored.

**Budget exhaustion deliberately stays `error` / `status: 0`.** It is the other stopping condition in the same walk and it is tempting to make the two match, but `probe.ts` raises `RequestBudgetExhaustedError` out of the whole probe rather than returning an observation for it — there is nothing on that side to conform to. A run that ran out of room is a fact about the audit; a chain that outran the hop ceiling is a fact about the site.

**The kernel needed no change, but the bridge did.** `core/switch-bounces` already keys on the flag rather than on the schema version, so it publishes a truncated chain as an `observed` `warn` naming the hops it did see — never saying where the chain lands, never grading it a bounce, never letting it settle into `pass`. But `@movar/audit-engine`'s `collect.ts` narrows every field off the native reply before it reaches `Evidence`, and an unlisted field is dropped: a probe emitting the flag natively and a bridge silently discarding it is the same silence one layer further out. It is narrowed on `=== true` rather than on truthiness, because the reply is untrusted and a host sending `"false"` has not said the chain was cut short.

This closes the last capability divergence behind `EVIDENCE_SCHEMA_VERSION` 5: Safari stamps 5 and can now carry every field 5 promises. Safari's old behaviour degraded in the SAFE direction — the chain was dropped, never misread — which is why this was not urgent the way #482 was.

Verified by compiling `AuditProbe.swift` against the Command Line Tools SDK and driving the real `URLSession` walk at a loopback server: an endless chain records 11 hops with `status` 302, `outcome` `ok` and the flag set, pointing at the URL nobody fetched; a chain that closes its own loop and one that reaches a real page both leave the flag absent; and an endless chain behind a `cf-mitigated` header comes back `blocked` and truncated.
