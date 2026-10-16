# Religions Timeline

An interactive, open-source timeline showing how the world's major religious traditions
**arose in parallel** — their earliest texts, the ideas they share, and honest,
scholarly dating (uncertainty included, not hidden).

**Live:** https://zanyaziz.github.io/religions-timeline/

v2 covers **ten traditions across c. 2600 BCE – 2000 CE**: Sumerian religion, Ancient
Egyptian religion, Zoroastrianism, Judaism, the Vedic tradition and Hinduism, Buddhism,
Jainism, Chinese traditions, Christianity, and Islam.

(v1 covered five traditions across c. 2600–500 BCE.)

## What you can do

- **Slide the timeline** — drag to pan across 4,600 years, scroll or use the +/−
  buttons to zoom, double-click to zoom in, or jump with the **era tabs**:
  Full span · Ancient world · Axial age · Common era · Medieval · Modern.
- **Time-window scroller** — a full-span overview under the chart: drag the
  window to travel through time, drag its edges to resize (zoom), or tap
  outside it to jump. Events inside the window light up and outside it they
  dim; tracks with nothing in the window fade back, and idea chips/filter
  options only light up for ideas actually present in the visible slice.
- **Idea Map tab** — pick an idea and scrub through time on a schematic world
  map: each region lights up when the idea is *first attested* there in the
  data. See the accuracy note below.
- **Mobile-friendly** — responsive layout with touch drag on the chart and
  the scroller, swipeable era tabs, and large tap targets throughout; the
  detail panel stacks under the chart on narrow screens.
- **Texts view** — each sacred text or event is a bar spanning its scholarly date
  range. The shading *is* the uncertainty: wide bar = wide date range.
- **Ideas view** — idea tags (e.g. *cosmic order*, *judgment*, *liberation*) connect
  across traditions with colored lines, so you can see the same concept surface
  independently in different places and times.
- **Both** — bars plus idea connections.
- **Search** any text, description, or idea. **Filter** by a single idea via the
  dropdown or by clicking a tag. Click any bar for a detail panel with a
  description, dating notes, and a link to a credible source.

## Run it locally

No build step — it's plain HTML/CSS/JS with D3 via CDN.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` via `file://` won't work: browsers block `fetch()` of the
JSON data files from local files.)

## Data model

Designed so contributors can add traditions, texts, and ideas **without touching code**:

```
data/
  index.json        # tradition list, colors, timespan, registry path
  texts.json        # TEXTS REGISTRY: every text by ID — title, date range,
                    #   scholarly source, and either an imported file or external link
  sumerian.json     # one file per tradition, loaded individually
  egyptian.json
  zoroastrian.json
  judaism.json
  vedic.json        # the Vedic track, extended forward into Hinduism
  buddhism.json
  jainism.json
  chinese.json      # extended forward: Confucianism, Daoism, modern China
  christianity.json
  islam.json
  texts/            # optional imported public-domain texts (data/texts/<id>.txt)
  _template.json    # copy this to add a tradition
```

- `data/index.json` lists traditions with `{id, name, region, color, file}` plus a
  `map: {x, y, label, lx, ly, anchor}` entry — the tradition's node position and
  label placement on the Idea Map's schematic world map (viewBox 1000×460).
- Each tradition file holds `events[]`; each event references a `text_id` from the
  registry and carries its own `year_from`/`year_to`, `certainty`
  (`well-attested` | `approximate` | `disputed`), a description, and free-form
  `ideas[]` tags.
- **Years are signed: negative = BCE, positive = CE** (e.g. `-1500` = 1500 BCE,
  `70` = 70 CE), and `year_from < year_to`. (v1 used unsigned BCE years; v2
  migrated the data so tracks can cross the BCE/CE boundary.)
- The registry entry holds the canonical `{id, title, date_range: {from, to, era,
  certainty, note}, what, source_label, source_url}` plus
  `content: {kind: "import", path: "data/texts/<id>.txt"}` for short public-domain
  texts kept in the repo, or `{kind: "link", url, label}` for large/external texts.
  Texts are referenced and linked, never reproduced wholesale.

### Add a tradition

1. Copy `data/_template.json` → `data/<your-id>.json` and fill it in.
2. Register its texts in `data/texts.json`.
3. Add one line to the `traditions` array in `data/index.json`.
4. Open a PR. That's it — the app picks it up automatically.

## Scholarly standards

- Every text links to a credible source: university projects (Oxford ETCSL, UCL
  Digital Egypt, Indiana University, Yale's Avalon Project), the Internet Sacred
  Text Archive's public-domain scholarly translations, Sefaria, Access to Insight,
  Smarthistory, or peer-reviewed work.
- Dating honesty is a feature: `approximate` and `disputed` dates are labeled in
  the UI, with notes explaining *why* they're uncertain.
- Never present a disputed date as settled. If new scholarship moves a date,
  update the registry — the UI follows automatically.

## Notes on the v2 expansion

- **Hinduism** is not a separate track: the *Vedic tradition & Hinduism* track
  (`data/vedic.json`) continues the same file forward — Upanishads, the Sanskrit
  epics and the Bhagavad Gita, Puranic/temple Hinduism, bhakti movements, Shankara,
  and modern reform — because historically it is one continuous tradition.
- **Chinese traditions** (`data/chinese.json`) likewise continues the Shang/Zhou
  track forward through Confucius and the Analects, the Tao Te Ching, Mencius,
  Han state Confucianism, Zhu Xi's Neo-Confucian synthesis, and the modern period.
- **Zoroastrianism** gains two forward events: the Sasanian codification of the
  Avesta and the Parsi migration to India.
- **Idea Map accuracy rule:** the map shows *attestation* — where and when an
  idea is documented in the timeline data — never asserted borrowing or
  influence. A region lights at the start year of the earliest event carrying
  the tag in that tradition. Dashed lines join lit regions in chronological
  order of first attestation to convey sequence only; there are deliberately
  **no directional arrows**, because the data does not by itself prove
  transmission. Node positions come from the `map` entry per tradition in
  `data/index.json`; landmasses are schematic.
- New tracks were populated with standard scholarly reference points: for Judaism,
  the exile and Second Temple period, the Mishnah (c. 200 CE) and Babylonian
  Talmud (c. 450–600 CE); for Christianity, the councils, the Great Schism (1054),
  and the Reformation (1517); for Islam, the Uthmanic recension of the Quran, the
  hadith collections (c. 870), and the Ottoman period; for Buddhism, Ashoka, the
  writing-down of the Pali Canon, and the spread to China, Tibet, Japan, and the
  West; for Jainism, Parshvanatha and Mahavira (both honestly marked *disputed*),
  the Digambara–Shvetambara split, and the Valabhi canon. Contested dates —
  the Exodus, the life of the Buddha, the dates of Zarathustra and Mahavira —
  are shown as wide ranges with explanatory notes, not single years.

## Roadmap

- A political-order overlay: the empires and kingdoms contemporary with each text.
- Per-idea deep pages and richer text excerpts where public-domain translations exist.
- More tracks and denser coverage within tracks (v2 has ~8–13 anchor events per
  new tradition — a skeleton, not a census).

## License

MIT — see [LICENSE](LICENSE). Contributions welcome.
