# Evidence, sources and confidence

What this research is built on, how much of it survived checking, and what must be
re-verified before anyone quotes it externally — in a pitch, a deck, or to an investor.

## Method

A fan-out research run over five angles: market map and scale; platform mechanics (fees,
escrow, delivery rails); user pain evidence from reviews and complaint boards; the services
vertical; and informal channels and fraud. 23 sources were fetched and 109 claims extracted,
of which the top 25 went through three-vote adversarial fact-checking — each claim given to
three independent checkers instructed to refute it, with two refutals needed to kill it.

**Fifteen claims were confirmed, three were killed, and seven could not be resolved** because
the verification agents hit a usage limit partway through. Two supplementary agents then
verified the tender/Q&A and price-anchoring questions separately, and a third mined the run
journal for detail the failed synthesis step had dropped.

Anything below marked unverified is exactly that: plausible, sourced, but not adversarially
checked. It is kept because it is useful and consistent, not because it is proven.

## Corrections made after the first draft

Recorded because the pattern matters more than the individual facts — the cheap-to-copy
features moved _during_ the two hours this research took.

- **AI listing help is not white space.** monobazar generates descriptions from a photo and a
  few words. The first draft called the category empty. `EXP-02` is now `partial`.
- **OLX's fees are published**, just not on the page that explains the service. "Fee opacity"
  was softened to fee fragmentation (`ECON-03`).
- **OLX has added bargaining** with discounts up to 40%, reportedly answering monobazar.
  `TXN-01` moved to `partial`.

## Killed by fact-checking — do not repeat these

- **RIA.com does not offer in-platform escrow.** The old escrow landing page 404s and its
  February 2026 buyer-safety guidance recommends only generic Nova Poshta cash-on-delivery.
  The corporate marketing claim is stale.
- **ria.com did not rise to #4** among Ukrainian marketplaces in June 2026. The rank is right;
  the direction is wrong — it fell from #3.
- **Nova Poshta's COD fees are not a seller-side cost.** The rates (1% + 10 UAH via NovaPay,
  2% + 20 UAH otherwise) are real, but the _buyer_ pays them at pickup, and the tiers key off
  payment method rather than payout destination.

## Verified — safe to rely on

| Claim                                                                     | Source                       |
| ------------------------------------------------------------------------- | ---------------------------- |
| OLX Dostavka mechanics: reserve, inspect, release or refund, free return  | OLX help centre (3–0)        |
| OLX escrow ran through UAPAY on a transit account                         | UAPAY (3–0)                  |
| OLX insures at listed price but liability rests with the carrier          | OLX help centre (3–0)        |
| Safe Deal fee waived for Nova Poshta COD, charged for Ukrposhta and Meest | OLX help centre (3–0)        |
| Nova Poshta післяплата = inspect before paying                            | Nova Poshta (3–0)            |
| Rozetka #1 and Prom.ua #2 in Ukraine's Marketplace category, June 2026    | Similarweb (3–0)             |
| AUTO.RIA offers VIN checks, police-blacklist checks, offline inspection   | ria.company (3–0)            |
| DOM.RIA verifies via 360° panorama and agent visits                       | ria.company (3–0)            |
| Phishing impersonating OLX Dostavka, contact within 5–10 min of listing   | KR-Labs (2–0)                |
| Kabanchik commission 6%–51%, fixed 900–7,650 UAH above 15,000 UAH         | Kabanchik official fees page |
| Public Q&A present on AUTO.RIA and Violity, absent on OLX/Shafa/monobazar | Live pages, checked directly |
| Prozorro's clarification period: ≥3 working days, answers due within 1    | Prozorro documentation       |
| Retail-price anchoring on StockX, Back Market, Swappa, eBay catalogue     | Vendor help centres          |

## Unverified — re-check before external use

- Kabanchik's scale (320k specialists / 1M customers) and its 3.2★ executor app rating.
- Rabotniki's 50,000 specialists and its daily construction price index.
- OLX's ~23M users / 54.3M visits — the source was rated unreliable by the pipeline.
- KR-Labs' specific allegations about OLX's design weaknesses and support quality. Plausible
  and consistent with other sources, but unproven here and legally sensitive.
- All seller allegations quoted from review sites (withheld payouts, buried listings,
  paid reviews, silently unpublished reviews). Individually anecdotal; collectively a pattern.
- OLX's newly added bargaining feature (single tech-press source).
- monobazar's traction figures, which come from launch-period press rather than audited data.

## A caution about review-site aggregates

The vidhuk.ua scores quoted throughout (OLX 2.9, Shafa 1.3, Kidstaff 1.8, IZI 1.6, OBYAVA 1.7,
Kabanchik 4.6) are **directional only**, for two compounding reasons:

1. Complaint corpora self-select — people who had an ordinary experience do not post.
2. The site computes the displayed rating from **only the 100 most recent reviews** and
   excludes those marked "problem solved."

The second point is itself a finding rather than only a caveat: it is the infrastructure-level
reputation burying described in `TRUST-03`. Use these numbers to compare platforms against
each other, never as absolute satisfaction measures.

## Primary sources

Platform documentation and official pages:

- `help.olx.ua` — OLX Dostavka mechanics, fees, liability, carrier rules
- `kabanchik.ua/ua/help/komissiya-servisu` — commission schedule
- `kabanchik.ua/ua/help/kak-zakazat-uslugu` — task posting flow
- `rabotniki.ua/uk/tenders` — tender/bid flow
- `ria.company/our-projects/` — AUTO.RIA and DOM.RIA positioning and scale
- `auto.ria.com/uk/check-car/`, `/technicalcheck/` — verification services
- `novaposhta.ua`, `novapay.ua` — COD flow and tariffs
- `uapay.ua` — the escrow mechanism behind OLX Safe Deal
- `similarweb.com/top-websites/ukraine/…/marketplace/` — traffic ranking

Investigations and reporting:

- `research.kr-labs.com.ua/olx-phishing-investigation/` — the seller-targeted phishing scheme
- `suspilne.media` — clone-site investigation
- `cyberpolice.gov.ua` — national fraud scheme ranking and case volumes
- `group-ib.com/blog/classiscam/` — Classiscam origin and scale
- `minfin.com.ua` — earlier phishing coverage; Nova Poshta COD limits
- `dev.ua`, `ain.ua` — monobazar launch, fees, AI feature, traction
- `pravda.com.ua` — DOM.RIA verification operations

Review and complaint corpora:

- `vidhuk.ua` — OLX, Shafa, Kidstaff, Kabanchik, IZI, OBYAVA
- `play.google.com`, `apps.apple.com` — app ratings for Kabanchik and Rabotniki
- `trustpilot.com/review/kabanchik.ua` — 2.3/5 from 6 reviews, unclaimed profile, statistically weak
- `kabanchik.info/uk/forum/post/executor` — executor forum

Benchmarks:

- Swappa, StockX, Back Market, eBay, Grailed, Vinted, Mercari, Allegro — catalogue and Q&A patterns
- Thumbtack, Bark, MyBuilder, Werkspot — service request flows
- Prozorro (`infobox.prozorro.org`, `izi.trade`) — the clarification-period mechanic

## What this research cannot tell us

It establishes what the platforms do and do not do. It does not establish **which absence
people actually feel**, and those are different questions — a gap can be real and still not
be worth paying to close.

The obvious next step before any of this becomes a roadmap: talk to roughly fifteen people
who sell regularly on OLX and five Kabanchik executors. The executor side is where this
research found the sharpest, most specific anger, which usually means it is where the
recruitable users are.
