import { PDFDocument, PDFImage, rgb } from "pdf-lib";
import sharp from "sharp";

// Paper sizes in millimetres (portrait)
export const PAPER_SIZES = {
    a5: [148, 210],
    a4: [210, 297],
    a3: [297, 420],
    letter: [215.9, 279.4],
    legal: [215.9, 355.6],
    tabloid: [279.4, 431.8],
} as const;

export type Paper = keyof typeof PAPER_SIZES;

export interface PdfOptions {
    paper: Paper;
    orientation: "portrait" | "landscape";
    // 100 = real card size (63 × 88 mm)
    scale: number;
    marginMm: number;
    gapMm: number;
    cutGuides: "none" | "outline" | "corners";
    dpi: number;
}

export interface PdfCard {
    file: string;
    copies: number;
}

const CARD_MM = { width: 63, height: 88 };
const POINTS_PER_MM = 72 / 25.4;

export const layoutFor = (options: PdfOptions) => {
    const [paperWidth, paperHeight] = PAPER_SIZES[options.paper];
    const [pageWidth, pageHeight] = options.orientation === "landscape" ? [paperHeight, paperWidth] : [paperWidth, paperHeight];
    const cardWidth = CARD_MM.width * options.scale / 100;
    const cardHeight = CARD_MM.height * options.scale / 100;
    const columns = Math.floor((pageWidth - 2 * options.marginMm + options.gapMm) / (cardWidth + options.gapMm));
    const rows = Math.floor((pageHeight - 2 * options.marginMm + options.gapMm) / (cardHeight + options.gapMm));
    return { pageWidth, pageHeight, cardWidth, cardHeight, columns: Math.max(columns, 0), rows: Math.max(rows, 0) };
};

export const buildPdf = async (cards: PdfCard[], options: PdfOptions) => {
    const layout = layoutFor(options);
    const { pageWidth, pageHeight, cardWidth, cardHeight, columns, rows } = layout;
    if (columns === 0 || rows === 0) {
        throw new Error("Las cartas no caben en la página con este zoom y márgenes");
    }

    const pdf = await PDFDocument.create();
    pdf.setTitle("Custom MTG Cards");

    // Embed each image once at the requested resolution; copies reuse it
    const pixelWidth = Math.round(cardWidth / 25.4 * options.dpi);
    const pixelHeight = Math.round(cardHeight / 25.4 * options.dpi);
    const embedded = new Map<string, PDFImage>();
    const embed = async (file: string) => {
        let image = embedded.get(file);
        if (!image) {
            const metadata = await sharp(file).metadata();
            // Landscape cards (battles) are turned to fit the portrait slot
            const landscape = (metadata.width ?? 0) > (metadata.height ?? 0);
            const jpeg = await sharp(file)
                .rotate(landscape ? 90 : 0)
                .resize(pixelWidth, pixelHeight, { fit: "fill" })
                .flatten({ background: "#ffffff" })
                .jpeg({ quality: 92 })
                .toBuffer();
            image = await pdf.embedJpg(jpeg);
            embedded.set(file, image);
        }
        return image;
    };

    const slots = cards.flatMap(card => Array.from({ length: Math.max(0, card.copies) }, () => card.file));
    const perPage = columns * rows;

    // Centre the grid on the page
    const gridWidth = columns * cardWidth + (columns - 1) * options.gapMm;
    const gridHeight = rows * cardHeight + (rows - 1) * options.gapMm;
    const originX = (pageWidth - gridWidth) / 2;
    const originY = (pageHeight - gridHeight) / 2;
    const pt = (mm: number) => mm * POINTS_PER_MM;
    const guideColor = rgb(0.6, 0.6, 0.6);
    const guideWidth = 0.4;
    const markLength = 3;

    for (let start = 0; start < slots.length; start += perPage) {
        const page = pdf.addPage([pt(pageWidth), pt(pageHeight)]);
        const pageSlots = slots.slice(start, start + perPage);
        for (const [index, file] of pageSlots.entries()) {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = originX + column * (cardWidth + options.gapMm);
            // PDF coordinates start at the bottom of the page
            const y = pageHeight - originY - (row + 1) * cardHeight - row * options.gapMm;
            page.drawImage(await embed(file), { x: pt(x), y: pt(y), width: pt(cardWidth), height: pt(cardHeight) });

            if (options.cutGuides === "outline") {
                page.drawRectangle({
                    x: pt(x), y: pt(y), width: pt(cardWidth), height: pt(cardHeight),
                    borderColor: guideColor, borderWidth: guideWidth,
                });
            } else if (options.cutGuides === "corners") {
                // Short marks pointing outwards from each corner
                for (const [cx, cy, dx, dy] of [
                    [x, y, -1, -1], [x + cardWidth, y, 1, -1],
                    [x, y + cardHeight, -1, 1], [x + cardWidth, y + cardHeight, 1, 1],
                ]) {
                    page.drawLine({ start: { x: pt(cx), y: pt(cy) }, end: { x: pt(cx + dx * markLength), y: pt(cy) }, color: guideColor, thickness: guideWidth });
                    page.drawLine({ start: { x: pt(cx), y: pt(cy) }, end: { x: pt(cx), y: pt(cy + dy * markLength) }, color: guideColor, thickness: guideWidth });
                }
            }
        }
    }

    return Buffer.from(await pdf.save());
};
