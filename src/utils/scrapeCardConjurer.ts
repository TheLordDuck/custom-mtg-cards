import { Browser, Page } from "playwright";
import ScryfallCard from "../types/ScryfallCard";
import { RenderJob } from "../frames";

export interface ArtBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TextLayer {
    // Text, symbols and frame decorations rendered by Card Conjurer, without frame or art
    image: Buffer;
    width: number;
    height: number;
    // Where the art goes, as fractions of the card size
    artBounds: ArtBounds;
}

const scrapeCardConjurer = async (browser: Browser, card: ScryfallCard, job: RenderJob): Promise<TextLayer> => {
    const page = await browser.newPage();
    try {
        await openCardConjurer(page);
        await loadFramePack(page, job.pack);
        await importCard(page, card, job.importIndex);
        await placeSetSymbols(page, job.pack);

        // Text is drawn asynchronously, so wait for the preview to finish rendering
        await waitForCanvasToSettle(page);

        return await downloadTextLayer(page);
    } finally {
        await page.close();
    }
};

export const openCardConjurer = async (page: Page) => {
    await page.goto("https://cardconjurer.app/", { waitUntil: "domcontentloaded" });

    // Wait until the editor has set up its default frame
    await page.waitForFunction(() => {
        const w = window as any;
        return typeof w.importCard === "function" && w.card?.text?.title !== undefined;
    }, null, { timeout: 30000 });

    // Card Conjurer loads its fonts on demand and skips drawing text until they are ready
    await page.evaluate(() =>
        Promise.all(Array.from(document.fonts).map(font => font.load().catch(() => null)))
    );

    // The art is composited later from our processed image, so Card Conjurer must not draw it
    await page.evaluate(() => { (window as any).uploadArt = () => { }; });
};

// Packs that only work after another one has been loaded (Card Conjurer assumes the user came from it)
const PREREQUISITES: Record<string, string[]> = {
    SagaCreature: ["SagaRegular"],
};

// Load a frame pack and apply its layout (text boxes, art and set symbol positions)
export const loadFramePack = async (page: Page, pack: string) => {
    for (const prerequisite of PREREQUISITES[pack] ?? []) {
        await loadFramePack(page, prerequisite);
    }

    const version = await page.evaluate(async (pack: string) => {
        const w = window as any;

        // Packs load helper scripts (e.g. versionPlaneswalker.js) without awaiting them, so track every load
        const pending: Promise<unknown>[] = [];
        const loadScript = w.loadScript;
        w.loadScript = (src: string) => {
            const promise = loadScript(src);
            pending.push(promise);
            return promise;
        };
        try {
            await w.loadScript(`/js/frames/pack${pack}.js`);
            const button = document.querySelector<HTMLButtonElement>("#loadFrameVersion");
            if (button && !button.disabled && button.onclick) {
                await (button.onclick as any)();
            }
            // Helper scripts can load further scripts, so wait until no new loads appear
            for (let seen = 0; seen < pending.length;) {
                seen = pending.length;
                await Promise.all(pending);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } finally {
            w.loadScript = loadScript;
        }
        return w.card.version as string;
    }, pack);
    console.log(`✅ Loaded frame pack "${pack}" (${version})`);
};

const importCard = async (page: Page, card: ScryfallCard, importIndex: number) => {
    await page.evaluate(({ card, importIndex }) => {
        const w = window as any;

        // Dark frames (e.g. transform back faces) use white text, which would vanish on the white templates.
        // Planeswalkers keep it: their loyalty is drawn on a dark shield.
        if (!w.card.version.toLowerCase().includes("planeswalker")) {
            Object.values<any>(w.card.text).forEach(text => {
                if (text.color === "white") text.color = "black";
            });
        }

        // Same steps Card Conjurer runs after fetching a card: faces become separate entries
        const entries: unknown[] = [];
        w.processScryfallCard(card, entries);
        w.importCard(entries);
        if (importIndex > 0) {
            document.querySelector<HTMLSelectElement>("#import-index")!.value = String(importIndex);
            w.changeCardIndex();
        }

        // Modal DFCs show what is on the other face: Card Conjurer puts its whole rules text there, which gets
        // squeezed unreadable. Printed cards show its mana cost, or a land's mana ability.
        const otherFace = card.card_faces?.[1 - importIndex];
        if (w.card.text.flipSideReminder && otherFace) {
            const manaAbility = (otherFace.oracle_text ?? "").split("\n").find(line => /\bAdd \{/.test(line));
            w.card.text.flipSideReminder.text = otherFace.mana_cost || manaAbility || "";
            w.textEdited();
        }

        // Prototype cost and size have their own boxes, so the rules line keeps only the keyword and reminder
        const prototype = w.card.text.prototype;
        if (prototype?.text) {
            prototype.text = prototype.text.replace(/Prototype\s*(\{[^}]+\})+\s*—\s*\S+\/\S+\s*/, "Prototype ");
            w.textEdited();
        }

        // Keep the set symbol black (common rarity) so it matches the line-art frames
        document.querySelector<HTMLInputElement>("#set-symbol-rarity")!.value = "c";
        w.fetchSetSymbol();
    }, { card, importIndex });

    console.log(`✅ Imported "${card.name}"`);
};

// Card Conjurer draws a single set symbol, and for these frames it ends up in the bottom corner (or off the card).
// Printed cards put one at the end of each listed type line instead, rotated like the line.
const SET_SYMBOL_TYPE_LINES: Record<string, string[]> = {
    Split: ["type", "type2"],
    Fuse: ["type", "type2"],
    Flip: ["type"],
    Room: ["type"],
};

const placeSetSymbols = async (page: Page, pack: string) => {
    const typeLines = SET_SYMBOL_TYPE_LINES[pack];
    if (!typeLines) return;

    await page.evaluate((typeLines: string[]) => {
        const w = window as any;
        w.drawSetSymbol = (context: CanvasRenderingContext2D, symbol: HTMLImageElement) => {
            if (!symbol.width || !symbol.height) return;
            const { width: cardWidth, height: cardHeight } = w.card;
            for (const key of typeLines) {
                const line = w.card.text[key];
                if (!line) continue;
                // Text boxes rotate around their top-left corner; the symbol sits at the far end of the line
                const angle = (line.rotation || 0) * Math.PI / 180;
                const lineLength = line.width * cardWidth;
                const lineThickness = line.height * cardHeight;
                const height = Math.min(0.041 * cardHeight, 0.85 * lineThickness);
                const width = Math.min(height * symbol.width / symbol.height, 0.12 * cardWidth);
                const margin = 0.012 * cardWidth;
                context.save();
                context.translate(line.x * cardWidth, line.y * cardHeight);
                context.rotate(angle);
                context.drawImage(symbol, lineLength - margin - width, (lineThickness - height) / 2, width, height);
                context.restore();
            }
        };
        w.drawCard();
    }, typeLines);
};

const waitForCanvasToSettle = async (page: Page, timeout = 15000) => {
    const snapshot = () => page.evaluate(() => (window as any).cardCanvas.toDataURL("image/png") as string);

    // Give the first redraw time to start, then wait until two snapshots match
    await page.waitForTimeout(1000);
    const deadline = Date.now() + timeout;
    let previous = await snapshot();
    while (Date.now() < deadline) {
        await page.waitForTimeout(500);
        const current = await snapshot();
        if (current === previous) return;
        previous = current;
    }
    console.warn(`⚠️ Canvas still changing after ${timeout}ms, capturing anyway`);
};

const downloadTextLayer = async (page: Page): Promise<TextLayer> => {
    const { base64, width, height, artBounds } = await page.evaluate(() => {
        const w = window as any;
        const canvas: HTMLCanvasElement = w.cardCanvas;
        return {
            base64: canvas.toDataURL("image/png").split(",")[1],
            width: canvas.width,
            height: canvas.height,
            artBounds: w.card.artBounds as ArtBounds,
        };
    });

    return { image: Buffer.from(base64, "base64"), width, height, artBounds };
};

export default scrapeCardConjurer
