---
'@movar/marketing': minor
'@movar/fonts': patch
---

Add the studio band — a credit strip rendered right after the footer on every page, crediting Oleks Crane (the studio that built Movar) and linking to its other projects. Data is a committed, build-time-validated JSON file per locale (`src/data/studio-band.{en,uk}.json`); `ask` is `null` on movar.fyi, since Movar is non-commercial and runs no ads. `@movar/fonts` gains Fixel Display 400 (`fixel-display-400.css`), the band's title weight.
