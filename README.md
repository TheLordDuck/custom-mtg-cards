# Custom MTG Cards

A Node.js/TypeScript tool that generates custom Magic: The Gathering card images automatically. List card names in a text file, and the tool fetches their data from Scryfall, scrapes rendered text from Card Conjurer, and composites everything onto a card template — no manual image editing required.

## How it works

For each card name in `src/entry.txt`, the pipeline:

1. **Fetches card data** from the [Scryfall API](https://scryfall.com/docs/api) (`fetchScryfall`).
2. **Downloads and processes the card art** from the Scryfall image URI (`downloadProcessImage`).
3. **Scrapes a rendered text layer** (name, mana cost, type line, rules text) from [Card Conjurer](https://cardconjurer.com/) (`scrapeCardConjurer`).
4. **Selects a template** based on the card's type line — creature or general (`selectTemplateCard`).
5. **Assembles the final card** by compositing the art, text, and template with [`sharp`](https://sharp.pixelplumbing.com/) (`assembleCard`).

The finished PNG is saved to `src/output/<card name>.png`.

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

```bash
npm i
```

### Usage

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
   npm run dev
   ```

3. Find the generated card images in `src/output/`.

## Scripts

| Command         | Description                                |
| --------------- | ------------------------------------------- |
| `npm run dev`   | Runs the app with `nodemon` + `ts-node`.     |
| `npm run build` | Compiles the TypeScript source with `tsc`.   |

## Project Structure

```
src/
├── entry.txt          # Card names to generate (one per line)
├── index.ts            # Entry point — orchestrates the pipeline
├── enums/               # Shared enums (e.g. text tab layout)
├── templates/           # Base card template images (creature, general)
├── types/                # TypeScript types for card + assembly data
├── utils/                # Pipeline steps (fetch, scrape, assemble, etc.)
└── output/               # Generated card images (created at runtime)
```

## Notes

- Only the **Creature** and **General** templates are supported for now — other card types (Planeswalker, Land, etc.) will fall back to the general template.
- Card art and text layers depend on Scryfall and Card Conjurer being reachable; network issues there will cause generation to fail for that card.
