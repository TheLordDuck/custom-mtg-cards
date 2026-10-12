// Renders each frame pack in Card Conjurer (frame only, no text or art) together with its masks.
// The output is turned into line-art templates by trace.py.
//
// Usage: pnpm exec ts-node scripts/templates/renderFrames.ts <outDir> [pack...]
import fs from "fs";
import path from "path";
import { chromium, Page } from "playwright";
import { FRAME_PACKS } from "../../src/frames";
import { loadFramePack, openCardConjurer } from "../../src/utils/scrapeCardConjurer";

const PACKS = Object.keys(FRAME_PACKS);

// Frame elements drawn on top of the base frame, for packs whose layout is split across several frames,
// keyed by template variant ("" is the default template). "@pt" stands for the pack's power/toughness box,
// added for the P/T template variants.
const PT_FRAME = "@pt";
const EXTRA_FRAMES: Record<string, Record<string, string[]>> = {
    Prototype: {
        "": ["Blue Prototype Rules", "Blue Prototype Mana Cost (Short)", "Blue Prototype P/T"],
        Long: ["Blue Prototype Rules", "Blue Prototype Mana Cost (Long)", "Blue Prototype P/T"],
    },
};

const renderFrame = (page: Page, extras: string[]) => page.evaluate(async (extras) => {
    const w = window as any;
    w.card.frames = [];
    document.querySelector("#frame-list")!.innerHTML = "";

    // Prefer a neutral (artifact/colorless) frame without add-ons
    const names: string[] = w.availableFrames.map((f: any) => f.name);
    const isPT = (n: string) => /power|toughness|defense|loyalty/i.test(n);
    const isExtra = (n: string) => /crown|stamp|nickname|inner|border|pip|holo|fill|midnight|eldrazi|vehicle|land|snow|nyx/i.test(n);
    const indexes = (pred: (n: string) => boolean) => names.flatMap((n, i) => pred(n) ? [i] : []);
    const candidates = [...new Set([
        ...indexes(n => /artifact/i.test(n) && !isPT(n) && !isExtra(n)),
        ...indexes(n => /colorless|gray|grey/i.test(n) && !isPT(n) && !isExtra(n)),
        ...indexes(n => !isPT(n) && !isExtra(n)),
    ])];

    // Some frame images are missing on the server, so fall back to the next candidate
    for (const index of candidates) {
        w.selectedFrameIndex = index;
        w.selectedMaskIndex = 0;
        await w.addFrame();
        const added = w.card.frames[0];
        const images = [added.image, ...added.masks.map((m: any) => m.image)];
        await new Promise(r => setTimeout(r, 300));
        for (let i = 0; i < 100 && !images.every(im => im.complete); i++) await new Promise(r => setTimeout(r, 100));
        if (images.every(im => im.complete && im.naturalWidth > 1)) break;
        w.card.frames.shift();
    }
    if (w.card.frames.length === 0) throw new Error("No frame image could be loaded");
    const frame = w.card.frames[0];

    const ptIndex = [
        ...indexes(n => /artifact/i.test(n) && /power|toughness/i.test(n)),
        ...indexes(n => /colorless/i.test(n) && /power|toughness/i.test(n)),
        ...indexes(n => /power|toughness/i.test(n)),
    ][0];
    for (const extra of extras) {
        if (extra === "@pt" && ptIndex === undefined) throw new Error("This pack has no power/toughness frame");
        const name = extra === "@pt" ? names[ptIndex] : extra;
        const index = names.indexOf(name);
        if (index < 0) throw new Error(`Frame "${name}" not found`);
        w.selectedFrameIndex = index;
        w.selectedMaskIndex = 0;
        await w.addFrame();
        const image = w.card.frames[0].image;
        await new Promise(r => setTimeout(r, 300));
        for (let i = 0; i < 100 && !image.complete; i++) await new Promise(r => setTimeout(r, 100));
        if (!image.naturalWidth) throw new Error(`Frame "${name}" could not be loaded`);
    }
    w.drawFrames();

    // Masks of the base frame, scaled to the card
    const definition = w.availableFrames.find((f: any) => f.name === frame.name);
    const masks: { name: string, png: string }[] = [];
    for (const mask of definition?.masks ?? []) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = w.fixUri(mask.src);
        await new Promise(r => { image.onload = r; image.onerror = r; });
        if (!image.naturalWidth) continue;
        const canvas = document.createElement("canvas");
        canvas.width = w.card.width;
        canvas.height = w.card.height;
        canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
        masks.push({ name: mask.name, png: canvas.toDataURL("image/png").split(",")[1] });
    }

    // Extra elements are outlined too, their colors alone trace too faintly
    for (const extra of w.card.frames.slice(0, extras.length)) {
        const bounds = extra.bounds ?? {};
        const canvas = document.createElement("canvas");
        canvas.width = w.card.width;
        canvas.height = w.card.height;
        canvas.getContext("2d")!.drawImage(extra.image,
            (bounds.x ?? 0) * canvas.width, (bounds.y ?? 0) * canvas.height,
            (bounds.width ?? 1) * canvas.width, (bounds.height ?? 1) * canvas.height);
        masks.push({ name: `Extra ${extra.name}`, png: canvas.toDataURL("image/png").split(",")[1] });
    }

    return {
        frame: w.card.frames.map((f: any) => f.name).reverse().join(" + "),
        png: w.frameCanvas.toDataURL("image/png").split(",")[1] as string,
        masks,
    };
}, extras);

const main = async () => {
    const [outDir, ...only] = process.argv.slice(2);
    if (!outDir) throw new Error("Usage: renderFrames.ts <outDir> [pack...]");
    fs.mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await openCardConjurer(page);

    // One entry per template: the frame, plus a variant with the P/T box where the pack has one
    const manifest: Record<string, { pack: string, masks: string[] }> = {};
    for (const pack of only.length > 0 ? only : PACKS) {
        await loadFramePack(page, pack);
        const variants: { name: string, extras: string[] }[] = [];
        for (const [variant, extras] of Object.entries(EXTRA_FRAMES[pack] ?? { "": [] })) {
            variants.push({ name: `${pack}${variant}`, extras });
            if (FRAME_PACKS[pack].pt) {
                variants.push({ name: `${pack}${variant}_pt`, extras: [...extras, PT_FRAME] });
            }
        }
        for (const variant of variants) {
            const { frame, png, masks } = await renderFrame(page, variant.extras);
            fs.writeFileSync(path.join(outDir, `${variant.name}.png`), Buffer.from(png, "base64"));
            const maskFiles = masks.map(mask => {
                const file = `${variant.name}__mask_${mask.name.replace(/\W+/g, "_")}.png`;
                fs.writeFileSync(path.join(outDir, file), Buffer.from(mask.png, "base64"));
                return file;
            });
            manifest[variant.name] = { pack, masks: maskFiles };
            console.log(`Rendered ${variant.name} (${frame}, ${masks.length} masks)`);
        }
    }
    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    await browser.close();
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
