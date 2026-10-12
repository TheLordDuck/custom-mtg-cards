# Custom MTG Cards

A Node.js/TypeScript tool that generates custom Magic: The Gathering card images automatically. List card names in a text file, and the tool fetches their data from Scryfall, scrapes rendered text from Card Conjurer, and composites everything onto a card template — no manual image editing required.

## How it works

For each card name in `src/entry.txt`, the pipeline:

1. **Fetches card data** from the [Scryfall API](https://scryfall.com/docs/api) (`fetchScryfall`).
2. **Downloads and processes the card art** from the Scryfall image URI (`downloadProcessImage`).
3. **Picks a frame** for the card's layout — regular, planeswalker, saga, split, transform, etc. (`planRenders` in `src/frames.ts`).
4. **Renders the text layer** with that frame in [Card Conjurer](https://cardconjurer.app/), using its own Scryfall importer (`scrapeCardConjurer`).
5. **Selects the matching line-art template** (`selectTemplateCard`).
6. **Assembles the final card** by compositing the art, template, and text with [`sharp`](https://sharp.pixelplumbing.com/) (`assembleCard`).

The finished PNG is saved to `src/output/<card name>.png`. Double-faced cards (transform, modal DFC, battles) produce one image per face, named after each face.

## Supported frames

| Frame | Scryfall cards |
| ----- | -------------- |
| Regular | Normal cards (creature and non-creature templates) |
| Planeswalker | Planeswalkers |
| Saga / Saga creature | Sagas |
| Class, Case | Classes, Cases |
| Transform (front/back), Modal DFC | `transform`, `modal_dfc` |
| Battle | Battles (landscape) |
| Adventure, Omen | `adventure` |
| Split, Fuse, Aftermath, Room | `split` |
| Flip | `flip` |
| Leveler, Prototype, Mutate | `leveler`, `prototype`, `mutate` |
| Station, Spree, Prepare | Spacecraft/Planets with Station, Spree spells, `prepare` |
| Token | `token`, `double_faced_token` |

## Getting Started

### Prerequisites

- Node.js
- [pnpm](https://pnpm.io/)

### Installation

```bash
pnpm install
```

### Web portal

```bash
pnpm web
```

Open http://localhost:3000, paste a card list (decklist counts like `4 Lightning Bolt` or `4x Lightning Bolt` are supported) and generate. Each image can be downloaded on its own, and **Descargar PDF** lays them out for printing at real size (63 × 88 mm) with options for paper (A4, A3, A5, Letter, Legal, Tabloid), orientation, zoom, margins, gap, cut guides and resolution; the number of copies comes from the list and can be changed per card. Cards already in `src/output/` are reused unless *Regenerar aunque ya existan* is checked.

### Command line

1. Add the card names you want to generate to `src/entry.txt`, one per line:

   ```
   Steel Wrecking Ball
   Iron Spider, Stark Upgrade
   Dissection Tools
   Nexus of Becoming
   Scrawling Crawler
   Demolition Field
   Weaponized Scrap
   ```

2. Run the app:

   ```bash
   pnpm dev
   ```

   `pnpm dev` restarts whenever a source file changes. For a single run, or to use another card list:

   ```bash
   pnpm exec ts-node src/index.ts path/to/cards.txt
   ```

3. Find the generated card images in `src/output/`.

## Scripts

| Command         | Description                                |
| --------------- | ------------------------------------------- |
| `pnpm dev`       | Runs the app with `nodemon` + `ts-node`.     |
| `pnpm web`       | Starts the web portal on port 3000 (`PORT` to change it). |
| `pnpm build`     | Compiles the TypeScript source with `tsc`.   |
| `pnpm templates` | Regenerates the frame templates (see below). |

## Templates

All templates are generated: `scripts/templates/renderFrames.ts` renders each Card Conjurer frame pack without text or art, and `scripts/templates/trace.py` traces it into line art in the same style, with a `_pt` variant that adds the power/toughness box. Regenerating them needs Python with `numpy` and `Pillow`; `pnpm exec ts-node scripts/templates/renderFrames.ts .templates-work <pack>` followed by `python scripts/templates/trace.py .templates-work src/templates` regenerates only the given packs. Any template can be replaced by hand as long as it keeps the same size and a transparent art window.

## Project Structure

```
src/
├── entry.txt          # Card names to generate (one per line)
├── index.ts            # Entry point — orchestrates the pipeline
├── frames.ts           # Frame selection per card layout
├── pipeline.ts         # Card generation shared by the CLI and the portal
├── cardList.ts         # Card list parsing (with counts)
├── server/             # Web portal (Express API + PDF builder)
├── templates/           # Line-art templates, one per frame (and P/T variant)
├── types/                # TypeScript types for Scryfall + assembly data
├── utils/                # Pipeline steps (fetch, scrape, assemble, etc.)
└── output/               # Generated card images (created at runtime)
public/
└── index.html            # Web portal page
scripts/
└── templates/            # Template generator (render frames + trace)
```

## Notes

- Card art and text layers depend on Scryfall and Card Conjurer being reachable; network issues there will cause generation to fail for that card.
