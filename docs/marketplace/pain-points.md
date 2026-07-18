# Marketplace pain points

The complete, evidence-backed problem surface for the planned Ukrainian goods-and-services
marketplace. This is the input to solution design: every feature we build should trace back
to at least one ID here, and every ID here should eventually name the thing that solves it.

Companion files: [competitors.md](competitors.md) for who does what today,
[evidence.md](evidence.md) for sources and confidence,
[pain-points.yaml](pain-points.yaml) for the machine-readable mirror.

## How to read this

Each pain has a stable ID (`TRUST-01`, `ECON-02`, …). **IDs are permanent** — if a pain turns
out to be wrong, mark it withdrawn rather than reusing the number, because solution docs and
commits will reference them.

**Status** says how much of the problem the market has already solved:

| Status       | Meaning                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| `open`       | Nobody in the market solves it. Genuine white space.                          |
| `partial`    | Solved thinly, in one flow only, or by one player who just shipped it.        |
| `siloed`     | Solved properly, but only inside one vertical or one walled garden.           |
| `constraint` | Not a competitor gap — an external legal or logistics limit to design around. |

**Severity** is how strongly the pain drives real behaviour (leaving the platform, not
listing at all, getting defrauded), not how annoying it feels.

**Source** is `seed` for pains the founder raised directly, `research` for ones this
investigation surfaced.

A caution learned the hard way while compiling this: two pains (`EXP-02`, `TXN-01`) moved
from `open` to `partial` **during** the research, because monobazar and then OLX shipped
them. Anything cheap to copy will not still be white space by the time we launch. Status is
a snapshot, not a moat.

---

## TRUST — fraud, reputation, and who decides

### TRUST-01 · Fraud that impersonates the platform's own rails

**Status** `partial` · **Severity** high · **Source** seed (#9, extended)

Organised phishing targets sellers by impersonating the safety feature itself. Fake buyers
using stolen photos and Ukrainian mobile numbers contact sellers within 5–10 minutes of a
listing going live, claim payment was already sent, and steer the seller to an OLX-lookalike
page — complete with fake support chat — that harvests full card details including CVV.

The move that makes it work is always the same: **pull the conversation off-platform** into
Telegram or Viber, where no moderator and no other user can see it.

> Evidence: KR-Labs investigation (verified 2–0), corroborated by Suspilne. Ukraine's
> cyberpolice rank non-delivery after prepayment as the country's most common fraud scheme;
> 30,000+ fraud cases were opened in the first five months of 2024, 1.6× all of 2021.
> Group-IB's "Classiscam" scam-as-a-service — $64.5M stolen across 79 countries — began in
> February 2020 specifically targeting Ukrainian OLX.

**A solution must:** make off-platform migration unattractive rather than merely forbidden
(see `ECON-02`), and keep the negotiation surface observable.

### TRUST-02 · Reputation is neither portable nor transaction-bound

**Status** `open` · **Severity** high · **Source** seed (#7)

Ratings reset per platform and are rarely tied to a verified transaction. A seller who
accumulates complaints starts again for free, and a buyer has no way to carry earned standing
to a new venue.

> Evidence: no Ukrainian platform in the set ties reviews to verified transactions in a
> portable way. Kabanchik ties reviews to the order-closing action, which is gameable in both
> directions — see `TRUST-03`.

**A solution must:** bind reputation to completed, paid transactions, and make the identity
that carries it expensive to discard.

### TRUST-03 · Reputation burying is built into the infrastructure

**Status** `open` · **Severity** high · **Source** seed (#8)

The founder's instinct that people deliberately bury reputation is correct, and it is worse
than a user tactic — it is a property of the tools.

> Evidence: vidhuk.ua, Ukraine's largest independent review site, computes displayed ratings
> from **only the 100 most recent reviews** and excludes those marked "problem solved."
> Reported gaming patterns (all unverified user allegations, but consistent): an OLX reviewer
> says a negative review was silently unpublished while formulaic 5-star reviews inflate the
> score; Kabanchik reviewers claim "90% of reviews are paid-for"; Kidstaff sellers holding
> 9+/10 over two years still reportedly take prepayment without shipping.
>
> The sharpest example: a Kabanchik customer closed an order with a courtesy positive review
> despite no work being done — which still triggered a real commission charge against the
> executor. Tying reputation to a gameable action corrupts the rating **and** the billing.

**A solution must:** make history append-only and complete, resist recency-window gaming, and
never tie a money event to an action one party can fake alone.

### TRUST-04 · Escrow exists; adjudication does not

**Status** `partial` · **Severity** high · **Source** seed (#6, reframed)

This is the seed pain most in need of correction. A middleman that **holds** money already
exists — OLX Dostavka reserves the buyer's funds and releases them only after inspection at
the branch, refunding in full on refusal and returning the parcel free; monobazar does the
same through monobank; Nova Poshta's післяплата provides the rail. What does not exist is
anyone who **decides who was right** when the item is not as described but already collected.

> Evidence: OLX help centre and UAPAY escrow description (both verified 3–0).

**A solution must:** own the ruling, not just the wallet — evidence capture at dispatch and
receipt, a stated decision standard, and a funded refund path.

### TRUST-05 · Liability is disclaimed onto the carrier

**Status** `open` · **Severity** medium · **Source** research

OLX auto-insures shipments at the listed price but places loss and damage liability on the
logistics company. Claims go to the Nova Poshta branch, not to OLX. The buyer experiences a
protected purchase right up until something goes wrong, at which point they are alone with a
courier's claims desk.

**A solution must:** absorb first-line liability and pursue the carrier ourselves.

### TRUST-06 · No counterparty history

**Status** `open` · **Severity** medium · **Source** seed

There is no way to see whether you have dealt with this person before. A buyer cannot tell that
they already bought from this seller a year ago and it went well; a seller cannot tell that this
is a returning customer. Every transaction starts from zero, which throws away the cheapest and
most reliable trust signal that exists — your own direct experience.

This is a different primitive from reputation. `TRUST-02` is what strangers think of someone;
this is what **you** already know about them. Personal history is more trustworthy than any
aggregate score precisely because it cannot be bought or brigaded.

> Evidence: no per-counterparty history, repeat-buyer indicator, or saved-seller list found on
> OLX, Shafa, Kabanchik, monobazar or AUTO.RIA. OLX has a generic "Мої покупки" purchase list
> and "Обрані" listing favourites; neither is counterparty-specific. Benchmarks: eBay tags
> repeat buyers for sellers and tells buyers when they have bought from a seller before;
> Allegro's "Historia zakupów" filters full purchase history by seller login.

**A solution must:** treat the counterparty as a first-class entity — every interaction with a
person visible in one place, for both sides.

### TRUST-07 · No user-initiated blocking

**Status** `open` · **Severity** medium · **Source** seed

You cannot decide never to deal with someone again. Note the trap in the terminology: blocking
_does_ exist on Ukrainian platforms, but it means something else entirely — it is punishment
imposed by administrators for rule violations, not a boundary a user can set.

The distinction matters for design. **Reporting asks a moderator to judge someone; blocking is a
personal boundary that needs no justification.** Ukrainian platforms offer only the first, which
means a user who simply finds someone unpleasant, time-wasting or untrustworthy has no recourse
short of accusing them of a violation they may not have committed.

> Evidence: Shafa's "Блокування" is admin-imposed for rule violations; Kabanchik's blocking is
> automatic or complaint-triggered; OLX documents only "Як поскаржитися на користувача" (report
> to admin). No peer-to-peer block found on any platform in the set. Benchmarks: eBay's "Blocked
> Buyer List" holds up to 5,000 names and blocks bidding, Buy-It-Now and messaging; Vinted's
> block hides listings in both directions; Allegro's "czarna lista" works only for buyers you
> have already sold to; Etsy's is weak — it hides favourites but does not stop purchases.

**A solution must:** let either side permanently decline a counterparty without having to prove
wrongdoing first, and make the block mutual in effect (listings hidden, contact impossible).

This is the per-person form of `COMM-03`: one sets the channel, the other sets the person.

---

## ECON — money design and platform gravity

### ECON-01 · Take-rates that force disintermediation

**Status** `open` · **Severity** high · **Source** research

Kabanchik's published commission runs from 6% to **51%** of order value by category and
region, fixed at 900–7,650 UAH (plus VAT) above 15,000 UAH. At that level both sides have an
overwhelming incentive to complete first contact and then transact privately. Every trust
feature is void the moment they leave.

> Evidence: Kabanchik's official commission page; a forum thread alleges a 50%-of-order cap
> since July 2020. Executors additionally report being charged when the _customer_ cancels,
> and a 12% setting deducting 15%.

**A solution must:** price so that staying is cheaper than the hassle of leaving.

### ECON-02 · Nothing makes staying on-platform strictly better

**Status** `open` · **Severity** high · **Source** seed

The positive form of `ECON-01`, and arguably the organising principle for the whole product:
today, going off-platform costs a user nothing and saves them a fee. Payments, protection,
reputation, dispute rights and convenience must all be things you **lose** by leaving — so
that fleeing is not a clever move but a downgrade.

**A solution must:** bind escrow, reputation accrual, dispute rights, delivery convenience,
and purchase history to on-platform settlement, so leaving forfeits all of them at once.
Enforcement (banning contact details) is not the mechanism — value asymmetry is.

### ECON-03 · Fee fragmentation and no take-home preview

**Status** `partial` · **Severity** medium · **Source** research

Rates are published but scattered, and never presented as one number the seller can act on.
OLX's own page explaining OLX Dostavka states that the buyer pays a service fee and the seller
pays a success commission **without stating either rate**; the figures live on a separate
rate-change page, and the total varies by carrier and by bank.

> Evidence: seller 1% + 10 UAH (effective 26 Feb 2025); buyer 25 UAH under 500, 35 UAH from
> 500–2,000, 2.5% above; waived for Nova Poshta COD, charged for Ukrposhta and Meest;
> PrivatBank adds a non-refundable 0.5% (min 5 UAH).

**A solution must:** show a single "you will receive X" figure at listing time, before commitment.

### ECON-04 · Refund and delivery-cost asymmetry

**Status** `open` · **Severity** low · **Source** research

In OLX Dostavka the buyer pays delivery; if they inspect and refuse, the item price is refunded
but the delivery fee is not, while the return leg is free for the seller. An honest buyer who
was misled still loses money — a quiet disincentive to use the protected flow at all.

**A solution must:** make the party at fault bear the cost, which requires `TRUST-04`.

### ECON-05 · The publishing gauntlet

**Status** `open` · **Severity** medium · **Source** seed

Creating a listing on OLX means walking through repeated paid-promotion offers before the
thing can be published at all. Monetisation is placed _in the path_ of the core action rather
than alongside it, which taxes the exact moment we most want to feel effortless — and it
punishes casual sellers hardest, who are precisely the supply the market is short of.

**A solution must:** keep the publish path free of interstitials and sell promotion after the
listing is live, from evidence of how it is performing.

### ECON-06 · Pay-to-stay-visible and listing quotas

**Status** `partial` · **Severity** medium · **Source** research

Visibility decays unless bought, and quotas bite in ways sellers do not expect. Declining paid
services can itself demote a seller.

> Evidence: an OLX seller paid 251 UAH for a 10-listing package and could publish only 5 with
> no support response; another reports zero sales in a year after clothing categories became
> paid-only. Shafa sellers report that declining the paid subscription or safe-payment option
> costs "супер продавець" status and buries their listings (unverified).

**A solution must:** rank on relevance and seller conduct, never on payment status.

---

## IDENT — product identity, the missing primitive

The five pains in this group are one absence with five symptoms. Ukrainian classifieds have no
catalogue: a listing is free text plus photos, never "an instance of a known product." Rozetka
and Prom — the country's #1 and #2 marketplaces — run full catalogues, so the primitive is
completely normal in Ukrainian e-commerce; it has simply never reached C2C.

### IDENT-01 · No product catalogue

**Status** `open` · **Severity** high · **Source** research (root cause of seed #3, #11, #14, #18, #19)

Without a canonical product entity, nothing downstream in this group is buildable.

> Benchmarks: Swappa refuses listings for products absent from its catalogue; eBay groups
> new/used/refurbished under one catalogue product via UPC/EAN.

**A solution must:** attach listings to a product entity, with a path for genuinely
one-off items that does not degrade the rest.

### IDENT-02 · No new-vs-used price anchor

**Status** `open` · **Severity** high · **Source** seed (#17)

Buyers cannot see what an item costs new, so they cannot see what they save — the single most
persuasive number in resale.

> Benchmarks: StockX shows a "Retail Price" field; Back Market strikes through the new price
> and frames savings as up to 70% off.

### IDENT-03 · No canonical spec/marketing page to point at

**Status** `open` · **Severity** medium · **Source** seed (#18)

A seller cannot attach the manufacturer or retailer page so a curious buyer can read full specs.
Note the fix is **not** "allow links": OLX's rules bar listings from linking to competing
classifieds, and open outbound links are a spam and phishing vector. The fix is a native
canonical-product attachment that renders specs and retail price inside the listing.

### IDENT-04 · No pricing guidance

**Status** `open` · **Severity** high · **Source** seed (#3)

Sellers face an empty field and guess, which produces badly-priced listings that sit unsold.

> The only partial answers in the market are both in services: Kabanchik's approximate-price
> calculator, and Rabotniki's claimed daily construction price averages computed from its
> masters' price lists (unverified). For goods there is nothing.

**A solution must:** price from comparable _completed sales_, which requires `IDENT-01`.

### IDENT-05 · No cost basis or receipt tracking

**Status** `open` · **Severity** medium · **Source** seed (#14)

Nobody lets a seller attach the original receipt and see what they paid against what they
recovered. Two distinct values hide here: the seller's private ledger, and the buyer-facing
proof of purchase — which is also the strongest authenticity signal a private seller can offer.

---

## COMM — the private-chat bottleneck

The second missing primitive. Everything happens in 1:1 private chat, which is why sellers
re-answer the same questions forever, service requests never converge on a spec, and fraud
lives where nobody can see it.

### COMM-01 · No public Q&A on listings

**Status** `open` · **Severity** high · **Source** seed (#16)

Every buyer question arrives privately and individually, so no answer is ever reused.

> Evidence: confirmed absent on OLX (checked on a live listing), Shafa and monobazar. **Present
> on AUTO.RIA** (comments post publicly, are emailed to the seller, and are reportable by other
> visitors) and **Violity** (public per-lot comments the seller is expected to answer) — so the
> pattern is proven with Ukrainian users, just never generalised. eBay runs up to 25 public
> Q&As per listing; Allegro, Vinted and Mercari are private-only.

**A solution must:** make answers public and reusable by default, with private chat as the
exception rather than the channel.

### COMM-02 · No tender flow with a clarification round

**Status** `open` · **Severity** high · **Source** seed (#15)

For services like renovation: post the need, run a public deduped clarification round, freeze
the spec, then collect comparable offers. Nobody offers this — in Ukraine or abroad.

> Evidence: Rabotniki.ua literally brands its flow "Створити тендер" and then runs blind
> bidding with manual moderation. Kabanchik has no clarification stage at all. Western
> benchmarks (Thumbtack, Bark, MyBuilder, Werkspot) qualify 1:1 per professional, never
> publicly. Meanwhile **Prozorro has trained the entire country on this mechanic** — a
> mandatory clarification period of at least 3 working days, answers due within 1 working day,
> bidding opens only after it closes.

**A solution must:** dedupe questions across bidders, publish answers to all, and version the
requirements so offers are genuinely comparable.

### COMM-03 · No contact-channel preference

**Status** `open` · **Severity** medium · **Source** seed

A seller cannot say "chat only — no calls, no in-person meetings" and have the platform enforce
it. Phone contact is effectively mandatory once a number is attached, which pushes people who
prefer asynchronous, written, auditable contact either into unwanted calls or out of selling
altogether.

Worth noting this compounds `TRUST-01`: a phone call is off-platform by definition, so every
call is an unobservable channel where the fraud playbook runs.

**A solution must:** treat contact channel as a per-listing seller preference the platform
enforces, defaulting to written and on-platform.

### COMM-04 · Spam and low-quality contact volume

**Status** `partial` · **Severity** medium · **Source** seed (#9)

Dead listings that stay up, mass identical enquiries, promotional spam in chat, and endless
"чи актуально?". Platforms fight this with moderation and paid bumps, which improves the feed
for whoever pays rather than whoever browses.

**A solution must:** remove the _reason_ for repetitive contact (`COMM-01`) before adding
filters against it.

---

## TXN — transaction mechanics

### TXN-01 · Bargaining is unstructured

**Status** `partial` · **Severity** medium · **Source** seed (#4)

Haggling is cultural and universal here, yet on most platforms it is free text: no formal offer,
no counter, no expiry, no auto-accept threshold, no record of what the item has been offered at.

> Evidence: monobazar launched with a structured offer flow (propose / accept / decline, no
> free-form chat) plus instalments with the seller paid in full immediately. **OLX has since
> added bargaining with discounts up to 40%**, reportedly answering monobazar (unverified).
> Violity has bidding via auctions. Shafa and Kidstaff remain free-text only.

This is now a live feature race, not a gap.

### TXN-02 · Auctions exist only for collectors

**Status** `siloed` · **Severity** medium · **Source** seed (#12)

Violity runs genuine auctions for collectibles; nothing else does. For price-uncertain items —
one-off, vintage, damaged, hard to compare — a fixed asking price is the wrong instrument, and
its absence produces stale listings with repeated manual price cuts.

### TXN-03 · No rental or lease for goods

**Status** `open` · **Severity** medium · **Source** seed (#5)

Renting out a drill, a camera, a costume or equipment has no flow anywhere: no availability
calendar, no deposit handling, no condition-on-return check, no damage dispute path. Property
rental is served by DOM.RIA; **goods** rental is untouched — largely because deposit-and-damage
is genuinely hard, which is also why it would be defensible.

### TXN-04 · No multi-quantity support

**Status** `open` · **Severity** medium · **Source** seed (#11)

Selling twelve identical chairs means twelve listings and manual bookkeeping. Stock levels and
variants exist on Rozetka and Prom and are absent from the C2C tier where ordinary people sell.

### TXN-05 · No bulk selling

**Status** `open` · **Severity** medium · **Source** seed (#13)

No bulk upload, batch edit, or batch repricing. Clearing forty items is forty manual flows,
which is why people give away or bin things instead of selling them.

### TXN-06 · No consignment or commission resale

**Status** `open` · **Severity** high · **Source** seed (#10)

There is no way to hand items to someone who sells them for you and takes a cut. This is the
largest untapped supply pool in resale: everyone owns sellable items they will never list,
because listing is work. It is operationally heavy — inventory, custody, condition disputes —
which is precisely why nobody has done it, and why doing it well would be defensible.

Composes with `IDENT-01` and `IDENT-05`: consignment needs per-item identity and cost tracking.

---

## EXP — the experience of using the thing

### EXP-01 · No guidance through listing creation

**Status** `open` · **Severity** high · **Source** seed (#3)

What to photograph, which attributes matter, what condition wording means, what to charge —
none of it is guided. Thin, badly-priced listings are the output, and they make browsing tiring
for everyone.

### EXP-02 · AI listing help is already half-taken

**Status** `partial` · **Severity** medium · **Source** seed (#2)

**monobazar ships AI description generation today** — the seller supplies a photo and a few
words and the model writes the copy. The wording half of this pain is claimed, at launch, by the
fastest-moving competitor in the market.

> Evidence: «наша ШІ-шка заповнює за вас довгий опис товару». No AI features found on OLX,
> Shafa, Kabanchik or the RIA verticals.

Still genuinely absent everywhere: AI **photo** improvement, condition assessment from images,
category auto-detection, and price suggestion. Treat all of it as an adoption accelerant, never
as the moat — this category demonstrably empties within a quarter.

### EXP-03 · The product forgets who you are

**Status** `open` · **Severity** medium · **Source** seed

Basic profile state does not persist. Location and account type (business vs personal) must be
re-selected on every listing, re-asking the user for facts the platform already knows. Small in
isolation, but it lands on the same publish path as `ECON-05`, and together they make the core
action — putting something up for sale — feel like an obstacle course.

**A solution must:** derive defaults from the profile and prior listings, and ask only for what
genuinely varies per item.

### EXP-04 · Thin seller analytics

**Status** `partial` · **Severity** low · **Source** seed (#3, extended)

Sellers get view counts and little else — no sense of how their price compares, why an item is
not selling, what similar items actually sold for, or whether a paid bump earned its money. The
analytics that exist mainly sell promotion rather than inform decisions.

### EXP-05 · Interface quality

**Status** `partial` · **Severity** medium · **Source** seed (#1)

Worth sharpening to stay actionable: broad "bad UX" is not a wedge, because incumbents ship
redesigns. The _structural_ failures — the empty listing form, the private-chat bottleneck, the
absent catalogue, the publish gauntlet — are defensible. Generic polish is not.

> Evidence (directional; complaint corpora self-select and skew negative): vidhuk.ua aggregates
> — Shafa 1.3/5 (5,268 reviews), Kidstaff 1.8/5 (181), IZI 1.6/5 (780), OBYAVA 1.7/5 (218),
> OLX 2.9/5 (15,130). Shafa sellers report an edit form that opens empty so the whole listing
> must be retyped, app hangs, and late or missing chat messages.

### EXP-06 · Support quality and dispute latency

**Status** `partial` · **Severity** medium · **Source** research

Support is bot-first with long waits for a human, and disputes route to email rather than any
in-app resolution flow — so the moment a user most needs the platform is the moment it stops
being a product.

> Evidence: Shafa sellers report 24h+ waits for a human. Kabanchik's published reply to an
> executor charged 200 UAH on a customer cancellation routes the dispute to email support.

### EXP-07 · Cross-posting burden

**Status** `open` · **Severity** medium · **Source** seed

Sellers submit the same listing across multiple platforms by hand — OLX, Shafa, Facebook,
Telegram groups — retyping the same description and re-uploading the same photos each time,
then having to remember to take every copy down when the item sells. Nobody helps with this.

Two costs, not one. The seller pays in repeated effort; the whole market pays in stale
duplicate listings that stay up after the item is gone, which is a meaningful share of the
"is it still available?" traffic in `COMM-04`.

There is also a strategic read here worth stating plainly: whoever solves cross-posting sits
**above** the platforms rather than beside them, and sees the supply before anyone else does.
That is a strong wedge for a new entrant with no liquidity, because it is useful on day one
when we have no buyers of our own.

---

## OPS — external constraints to design around

Not competitor gaps; limits that exist regardless of who builds the product. Listed because
they shape what any solution to `TRUST-04` and `ECON-02` can promise.

### OPS-01 · Cash-on-delivery rail limits

**Status** `constraint` · **Severity** high · **Source** research

Nova Poshta's inspect-before-pay works at branches and with couriers but **not at поштомат
lockers**, where payment is required before the cell opens. Since June 2025, individuals
without ФОП status are capped at roughly **5 COD shipments per month and 30,000 UAH**.

That ceiling quietly limits how far a private seller can scale on the standard rail, and it
means the growth path from casual seller to small business crosses a legal boundary the product
has to help people cross.

### OPS-02 · Legal provability of informal sales

**Status** `constraint` · **Severity** medium · **Source** research

Sellers on social channels are not registered entities, so purchases cannot be legally proven.

> Evidence: the Consumers Union of Ukraine estimates over half of social-shop sellers are
> fraudsters; Lviv police describe such cases as numbering "in the thousands," rarely proven or
> refunded.

This is the strongest argument for the whole product: the informal market is enormous, and its
users have no recourse at all.

---

## Coverage summary

| Group | Pains | `open` | `partial` | `siloed` | `constraint` |
| ----- | ----- | ------ | --------- | -------- | ------------ |
| TRUST | 7     | 5      | 2         | 0        | 0            |
| ECON  | 6     | 4      | 2         | 0        | 0            |
| IDENT | 5     | 5      | 0         | 0        | 0            |
| COMM  | 4     | 3      | 1         | 0        | 0            |
| TXN   | 6     | 4      | 1         | 1        | 0            |
| EXP   | 7     | 3      | 4         | 0        | 0            |
| OPS   | 2     | 0      | 0         | 0        | 2            |
| Total | 37    | 24     | 10        | 1        | 2            |

Of the 37 entries, 28 trace back to the founder's seed list and 9 were surfaced by research.
The count exceeds the 24 raw seed items because several were split where the halves are
separately solvable — seed #3 ("no guidance for listing creation, as well as for putting a
price") becomes `EXP-01` and `IDENT-04`, and the counterparty bullet becomes `TRUST-06` and
`TRUST-07`, because remembering someone and refusing them are different machinery.

## The three structural findings

Most of the surface reduces to three missing primitives, and naming them is what turns this
list into a strategy:

1. **No product identity.** `IDENT-01` through `IDENT-05` are one absence with five symptoms,
   and it also underlies `EXP-04` and much of `EXP-01`. A listing is free text plus photos,
   never an instance of a known product.
2. **No public conversation.** `COMM-01`, `COMM-02` and `COMM-04` are one absence with three
   symptoms, and it is also the channel where `TRUST-01` fraud operates. Everything is 1:1
   private chat, so no answer is ever reused and nothing is observable.
3. **No relationship memory.** `TRUST-02`, `TRUST-06`, `TRUST-07` and `COMM-03` are one
   absence with four symptoms: the platforms model listings and, weakly, identities — but not
   the **relationship between two people**. You cannot see that you have dealt with someone
   before, cannot carry standing between venues, cannot refuse someone, and cannot set how
   they may reach you.

The third one has a telling symptom: **Facebook and Telegram beat every Ukrainian marketplace
at this**, because a chat app gets relationship memory for free — full history with a person,
and a block button. Marketplaces optimised the listing and forgot the people, so the informal
channel that offers no protection at all is nonetheless better at remembering who you dealt
with.

None of the three can be retrofitted cheaply by an incumbent. A catalogue invalidates existing
listing data and moderation models; public conversation changes the shape of every seller
interaction; and relationship memory requires identity to be durable, which is exactly what
platforms avoid because it suppresses signups. That is what makes them worth building first,
while `EXP-02`-style features are worth shipping but never worth betting on.
