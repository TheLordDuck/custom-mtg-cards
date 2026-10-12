import fs from 'fs';
import path from 'path';
import { chromium } from "playwright";
import downloadProcessImage from './utils/downloadProcessImage';
import scrapeCardConjurer from "./utils/scrapeCardConjurer";
import fetchScryfall from "./utils/fetchScryfall";
import selectTemplateCard from './utils/selectTemplateCard';
import assembleCard, { cardFileName } from './utils/assembleCard';
import { planRenders } from './frames';
import { CardEntry } from './cardList';

export interface GeneratedCard {
    entry: CardEntry;
    // One image per face; empty if generation failed
    images: { name: string, file: string }[];
    error?: string;
}

export type PipelineEvent =
    | { type: "start", index: number, total: number, entry: CardEntry }
    | { type: "image", index: number, name: string, file: string, cached: boolean }
    | { type: "error", index: number, entry: CardEntry, message: string }
    | { type: "done", results: GeneratedCard[] };

export interface PipelineOptions {
    outputDir: string;
    headless?: boolean;
    // Render again even if the image already exists in outputDir
    force?: boolean;
    onEvent?: (event: PipelineEvent) => void;
}

export const generateCards = async (entries: CardEntry[], options: PipelineOptions): Promise<GeneratedCard[]> => {
    const { outputDir, headless = true, force = false, onEvent = () => { } } = options;
    fs.mkdirSync(outputDir, { recursive: true });

    // One browser for the whole run, a fresh page per card; only started if something needs rendering
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    const results: GeneratedCard[] = [];

    try {
        // Process cards one at a time so a single browser can handle them all
        for (const [index, entry] of entries.entries()) {
            onEvent({ type: "start", index, total: entries.length, entry });
            const result: GeneratedCard = { entry, images: [] };
            results.push(result);
            try {
                // Fetch scryfall data of card
                const card = await fetchScryfall(entry.name);

                // Double-faced cards produce one image per face
                for (const job of planRenders(card)) {
                    const file = path.join(outputDir, cardFileName(job.name));
                    if (!force && fs.existsSync(file)) {
                        result.images.push({ name: job.name, file });
                        onEvent({ type: "image", index, name: job.name, file, cached: true });
                        continue;
                    }

                    // Fetch and process the image of the uri from scryfall
                    const imageArt = await downloadProcessImage(job.artUrl);

                    // Render the text layer with the matching Card Conjurer frame
                    browser ??= await chromium.launch({ headless });
                    const textLayer = await scrapeCardConjurer(browser, card, job);

                    // Select template based on the frame
                    const cardImage = await selectTemplateCard(job);

                    // Assemble card
                    const saved = await assembleCard(
                        job.name,
                        outputDir,
                        {
                            template: cardImage,
                            text: textLayer.image,
                            image: imageArt,
                            artBounds: textLayer.artBounds,
                            rotateArt: job.rotateArt
                        });
                    result.images.push({ name: job.name, file: saved });
                    onEvent({ type: "image", index, name: job.name, file: saved, cached: false });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`❌ Failed to generate "${entry.name}":`, error);
                result.error = message;
                onEvent({ type: "error", index, entry, message });
            }
        }
    } finally {
        await browser?.close();
    }

    onEvent({ type: "done", results });
    return results;
};
