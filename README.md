# Religions Timeline

An interactive, open-source timeline showing how the world's major religious traditions
**arose in parallel** — their earliest texts, the ideas they share, and honest,
scholarly dating (uncertainty included, not hidden).

**Live:** https://zanyaziz.github.io/religions-timeline/

v1 covers five traditions across c. 2600–500 BCE: Sumerian religion, Ancient Egyptian
religion, the Vedic tradition, ancient Chinese folk religion, and Zoroastrianism.

## What you can do

- **Texts view** — each sacred text is a bar spanning its scholarly date range.
  The shading *is* the uncertainty: wide bar = wide date range.
- **Ideas view** — idea tags (e.g. *cosmic order*, *judgment*, *afterlife*) connect
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
  vedic.json
  chinese.json
  zoroastrian.json
  texts/            # optional imported public-domain texts (data/texts/<id>.txt)
  _template.json    # copy this to add a tradition
```

- `data/index.json` lists traditions with `{id, name, region, color, file}`.
- Each tradition file holds `events[]`; each event references a `text_id` from the
  registry and carries its own `year_from`/`year_to` (BCE, older first),
  `certainty` (`well-attested` | `approximate` | `disputed`), a description,
  and free-form `ideas[]` tags.
- The registry entry holds the canonical `{id, title, date_range: {from, to, era,
  certainty, note}, what, source_label, source_url}` plus
  `content: {kind: "import", path: "data/texts/<id>.txt"}` for short public-domain
  texts kept in the repo, or `{kind: "link", url, label}` for large/external texts.

### Add a tradition

1. Copy `data/_template.json` → `data/<your-id>.json` and fill it in.
2. Register its texts in `data/texts.json`.
3. Add one line to the `traditions` array in `data/index.json`.
4. Open a PR. That's it — the app picks it up automatically.

## Scholarly standards

- Every text links to a credible source: university projects (Oxford ETCSL, UCL
  Digital Egypt, Indiana University), the Internet Sacred Text Archive's
  public-domain scholarly translations, Smarthistory, or peer-reviewed work.
- Dating honesty is a feature: `approximate` and `disputed` dates are labeled in
  the UI, with notes explaining *why* they're uncertain.
- Never present a disputed date as settled. If new scholarship moves a date,
  update the registry — the UI follows automatically.

## Roadmap

- More tracks: Judaism, Christianity, Buddhism, Islam (and their early texts).
- A political-order overlay: the empires and kingdoms contemporary with each text.
- Per-idea deep pages and richer text excerpts where public-domain translations exist.

## License

MIT — see [LICENSE](LICENSE). Contributions welcome.
