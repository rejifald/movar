# Competitive landscape — Ukrainian marketplaces

Who occupies the market today, what they actually ship, and where the gaps are. Pain IDs
referenced here are defined in [pain-points.md](pain-points.md); source quality and
confidence are in [evidence.md](evidence.md).

Ukrainian platform names are kept in their original form throughout.

## Market map

Ukrainians sell through six distinct layers and no single player spans them. That
fragmentation is an opportunity, but it also means "a marketplace for everything" competes
with six incumbents at once, each strong in its own lane.

| Layer                  | Players                               | What they own                                                     | Structural weakness                                           |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Horizontal classifieds | OLX.ua, IZI.ua, OBYAVA/Besplatka      | Default destination for used goods; enormous liquidity            | Free-text listings, private chat only, industrialised fraud   |
| Bank-embedded resale   | monobazar (monobank)                  | Payment rails and verified identity; huge install base            | Walled garden; no catalogue or public conversation            |
| Verticals              | AUTO.RIA, DOM.RIA                     | Deep trust tooling in one category                                | Category-locked; the trust model never generalised            |
| Curated C2C            | Shafa.ua, Kidstaff, Violity           | Fashion, kids, collectibles; Violity holds real auctions          | Narrow catalogue; poor public sentiment                       |
| Retail marketplaces    | Rozetka, Prom.ua                      | #1 and #2 by traffic; catalogue, stock, multi-quantity done right | Built for merchants, not for a person selling one sofa        |
| Services               | Kabanchik.ua, Rabotniki.ua            | Task and master matching                                          | Blind bidding, no clarification round, punishing commissions  |
| Informal               | Facebook Marketplace, Telegram groups | Zero fee, zero friction, real social proof                        | No structure, no protection — and where scammers drag victims |
| Rails (not rivals)     | Nova Poshta, monobank, UAPAY          | Inspection-before-payment delivery; escrow processing             | Available to us too — this is buildable infrastructure        |

## Profiles

### OLX.ua — the incumbent

- **Scale** ~23M monthly users / 54.3M visits (unverified; the source was rated unreliable).
- **Model** Free listings plus paid promotion; commission on OLX Dostavka sales only.
- **Fees** Seller 1% + 10 UAH on success. Buyer pays 25 UAH (under 500), 35 UAH (500–2,000),
  or 2.5% above — waived for Nova Poshta COD, charged for Ukrposhta and Meest; PrivatBank
  adds a non-refundable 0.5%. None of these figures appear on the page explaining the service
  (`ECON-03`).
- **Escrow** Funds reserved on the buyer's card, released only after inspection at the branch;
  full refund on refusal, free return leg (`TRUST-04`).
- **Liability** Shipments auto-insured at listed price, but loss and damage is the carrier's
  responsibility — claims go to Nova Poshta, not OLX (`TRUST-05`).
- **Fraud** Organised phishing impersonates OLX Dostavka itself; fake buyers hit new listings
  within 5–10 minutes (`TRUST-01`).
- **Recent** Added bargaining with discounts up to 40%, reportedly answering monobazar
  (unverified) (`TXN-01`).

**Read:** owns liquidity and has real escrow, but the escrow brand is now the scammers'
costume, and the listing path is cluttered with paid-service upsells (`ECON-05`).

### monobazar — the newest and most serious threat

- **Launched** Beta 8 Dec 2025, inside Monomarket.
- **Traction** 30M UAH of sales in the first two weeks; ~850k registered users and 340k+
  active listings within the first month.
- **Fees** 0.1% during beta to 8 Jan 2026, then a minimum of 1.9%; the buyer pays only delivery.
- **Escrow** monobank holds the money and releases it after the buyer collects at the post office.
- **Identity** Every user is a KYC'd bank customer — the strongest anti-fraud position in the market.
- **AI** Generates the listing description from a photo and a few words — the only shipped AI
  listing feature found anywhere in this market (`EXP-02`).
- **Bargaining** Structured offer flow: buyer proposes, seller accepts or declines. Also
  supports instalments with the seller paid in full immediately (`TXN-01`).
- **Gaps** No public Q&A, no catalogue, no analytics, no auctions, rental or consignment.

**Read:** do not model this as a thin storefront. It launched with escrow, bank identity,
structured bargaining, instalments and AI copy, then took 850k users in a month. It is the
pace-setter on exactly the features that look like easy wins. Its limits are structural —
no catalogue, no public conversation, no services — which is where our two primitives sit.

### AUTO.RIA — the vertical that proves public Q&A works

- **Scale** 74M monthly visits self-reported, but Similarweb shows ~14.9M web visits — treat
  the corporate figure as stale. Independently confirmed #1 in Ukraine's Vehicles category.
- **Trust** Free VIN and plate checks against police registries, plus offline technical
  inspection at partner stations in 70+ cities; a paid extended VIN report (~250 UAH) covers
  accidents, theft and liens.
- **Public Q&A** Yes — comments post publicly on the listing, are emailed to the seller, and
  can be reported by other visitors (`COMM-01`).

**Read:** the best evidence that public listing conversation works with Ukrainian users. It
just never spread beyond cars.

### DOM.RIA — what verification actually costs

- **Scale** 258,000+ verified listings on the corporate page; a fresher Dec 2025 figure says
  185,000+, or 91% of all listings.
- **Trust** Inspector visits, BankID/Дія identity checks, 360° panoramas.
- **Cost of it** ~100 inspectors plus a 20-person moderation team; about 85% of verifications
  are now digital — video call plus registry check rather than a site visit.

**Read:** the most useful operational benchmark in this research. Verified listings are
affordable only if most checks are digitised.

### Kabanchik.ua — the clearest wedge

- **Scale** 320,000+ specialists and 1,000,000 customers, self-reported (unverified).
- **Commission** 6%–51% of order value by category and region; above 15,000 UAH it is fixed at
  900–7,650 UAH plus VAT. A forum thread alleges a 50%-of-order cap since July 2020 (`ECON-01`).
- **Flow** Specialists subscribe to a task and pitch by chat or phone. No clarification round.
  A calculator suggests an approximate price (`COMM-02`, `IDENT-04`).
- **Sentiment** Executor app 3.2★ (~8,970 reviews) against the customer app's 4.2★ and sibling
  apps Prom.ua 4.8★ and Shafa.ua 4.6★ — dissatisfaction concentrates on the supply side.
- **Complaints** Commission charged on customer-cancelled orders; 12% configured but 15%
  deducted; arbitrary blocking; disputes routed to email (`EXP-06`).

**Read:** a take-rate that can reach half the job, no clarification stage, and a supply side
that openly resents the platform.

### Rabotniki.ua — the tender that isn't

- **Positioning** Free master-finding for construction; claims 50,000 specialists.
- **Flow** The customer clicks "Створити тендер" with a budget; workers post bids ("5
  відповідей"); orders are manually moderated. **No Q&A or clarification mechanic** — it is
  branded as a tender but runs as blind bidding (`COMM-02`).
- **Pricing** Claims daily average construction prices computed from its masters' price lists
  (unverified).
- **Health** The iOS app has too few ratings to display a score and has had one update since
  its October 2020 release.

**Read:** validates demand for tenders and leaves the hard part undone. The word is taken;
the mechanic is available.

### Rozetka and Prom.ua — proof the catalogue is normal here

- **Rank** #1 and #2 most-visited marketplaces in Ukraine, June 2026 (Similarweb).
- **Strength** Real catalogue, stock levels, multi-quantity, merchant analytics.
- **Gap** Built for businesses. A private person selling one used sofa is not the customer.

**Read:** every `IDENT-*` and `TXN-04`/`TXN-05` capability already exists one tier above the
people who need it.

### Shafa, Kidstaff, Violity — the cautionary tales and the existence proofs

- **Shafa** Fashion C2C, private chat only; 1.3/5 from 5,268 reviews. Sellers allege withheld
  payouts, an edit form that opens empty so listings must be retyped, and bot-first support
  with 24h+ waits. Buyers can refuse parcels free — sellers call it the "free fitting room"
  and absorb shipping both ways. Declining the paid subscription reportedly costs "супер
  продавець" status and buries listings (unverified) (`ECON-06`, `EXP-05`).
- **Kidstaff** 1.8/5 from 181 reviews; described as "almost a dead platform" despite zero
  commission — one seller got no views in a month even with paid promotion.
- **Violity** Collectibles auctions with public per-lot comments the seller is expected to
  answer (`TXN-02`, `COMM-01`).

**Read:** Violity is the existence proof for two supposedly impossible features. Shafa shows
how a marketplace earns a 1.3 — by penalising sellers who decline paid services. Kidstaff
proves zero commission does not buy liquidity.

## Capability gap matrix

`●` shipped · `◐` partial, vertical-only or informal · `·` absent

| Platform       | Escrow | Dispute ruling | Public Q&A | Tender + clarify | Bargain | Auctions | Catalogue | New-price anchor | Price guidance | AI listing help | Multi-qty | Bulk sell | Rental | Consignment | Cost basis | Portable rep. |
| -------------- | :----: | :------------: | :--------: | :--------------: | :-----: | :------: | :-------: | :--------------: | :------------: | :-------------: | :-------: | :-------: | :----: | :---------: | :--------: | :-----------: |
| OLX.ua         |   ◐    |       ·        |     ·      |        ·         |    ◐    |    ·     |     ·     |        ·         |       ·        |        ·        |     ·     |     ·     |   ◐    |      ·      |     ·      |       ·       |
| monobazar      |   ●    |       ·        |     ·      |        ·         |    ●    |    ·     |     ·     |        ·         |       ·        |        ●        |     ·     |     ·     |   ·    |      ·      |     ·      |       ·       |
| AUTO.RIA       |   ·    |       ·        |     ●      |        ·         |    ·    |    ·     |     ◐     |        ·         |       ◐        |        ·        |     ·     |     ·     |   ·    |      ·      |     ·      |       ·       |
| DOM.RIA        |   ·    |       ·        |     ◐      |        ·         |    ·    |    ·     |     ·     |        ·         |       ·        |        ·        |     ·     |     ·     |   ●    |      ·      |     ·      |       ·       |
| Kabanchik      |   ◐    |       ◐        |     ·      |        ·         |    ·    |    ·     |     ·     |        ·         |       ◐        |        ·        |     ·     |     ·     |   ·    |      ·      |     ·      |       ·       |
| Rabotniki.ua   |   ·    |       ·        |     ·      |        ◐         |    ·    |    ·     |     ·     |        ·         |       ◐        |        ·        |     ·     |     ·     |   ·    |      ·      |     ·      |       ·       |
| Shafa.ua       |   ◐    |       ·        |     ·      |        ·         |    ·    |    ·     |     ·     |        ·         |       ·        |        ·        |     ◐     |     ·     |   ·    |      ·      |     ·      |       ·       |
| Violity        |   ◐    |       ·        |     ●      |        ·         |    ◐    |    ●     |     ·     |        ·         |       ·        |        ·        |     ·     |     ·     |   ·    |      ·      |     ·      |       ·       |
| Rozetka / Prom |   ●    |       ◐        |     ◐      |        ·         |    ·    |    ·     |     ●     |        ·         |       ·        |        ·        |     ●     |     ●     |   ·    |      ·      |     ·      |       ·       |
| FB / Telegram  |   ·    |       ·        |     ◐      |        ·         |    ◐    |    ·     |     ·     |        ·         |       ·        |        ·        |     ·     |     ·     |   ·    |      ·      |     ·      |       ·       |

**Four columns are empty top to bottom:** new-price anchoring, consignment, cost-basis
tracking, and portable reputation.

**Three have exactly one occupant,** which is the more interesting signal: tenders with
clarification exist only as Rabotniki's partial, auctions only on Violity, bulk selling only
on the merchant tier. A capability one player proves and nobody copies is either genuinely
hard or genuinely unwanted — deciding which is the job of the pain ranking.

**AI listing help left the empty list during this research**, claimed by monobazar. Rental is
not empty either: DOM.RIA serves property well; it is _goods_ rental that has no home.

## Feature benchmarks worth copying

Non-Ukrainian platforms that already solve something on our list:

| Pattern                                     | Who does it                                         |
| ------------------------------------------- | --------------------------------------------------- |
| Catalogue-gated listings                    | Swappa (refuses products absent from catalogue)     |
| Retail price on the product page            | StockX ("Retail Price" in product details)          |
| Struck-through new price, savings framing   | Back Market (up to 70% off, framed vs new)          |
| One catalogue product across conditions     | eBay ("About This Product", via UPC/EAN)            |
| Public listing Q&A                          | eBay (up to 25 public Q&As per listing)             |
| Structured request → quotes                 | Bark (intake form to ≤5 pros), Thumbtack, MyBuilder |
| **Public clarification period before bids** | **Prozorro** — ≥3 working days, answers due in 1    |

Prozorro matters most: it has trained the entire country on exactly the tender mechanic
`COMM-02` describes, so the concept needs no explaining to Ukrainian users.
