import path from "path";
import sharp from "sharp";
import CardAssemble from "../types/CardAssemble";

const assembleCard = async (name: string, outputDir: string, buffers: CardAssemble) => {
    const { template, text, image, artBounds, rotateArt } = buffers;

    // Get template dimensions
    const templateMeta = await sharp(template).metadata();
    if (!templateMeta.width || !templateMeta.height) {
        throw new Error("Invalid template image dimensions");
    }
    const width = templateMeta.width;
    const height = templateMeta.height;

    // Resize text layer to match template
    const resizedText = await sharp(text)
        .resize(width, height, { fit: "fill" })
        .toBuffer();

    // Fill the template's art window(s), cropping the art instead of distorting it.
    // Frames with several windows (split cards, rooms...) get one art spread across all of them.
    const { left: artLeft, top: artTop, width: artWidth, height: artHeight } =
        await transparentArea(template) ?? {
            left: Math.round(artBounds.x * width),
            top: Math.round(artBounds.y * height),
            width: Math.min(Math.round(artBounds.width * width), width - Math.round(artBounds.x * width)),
            height: Math.min(Math.round(artBounds.height * height), height - Math.round(artBounds.y * height)),
        };
    // Rotating counterclockwise puts the left art in the bottom half, as on printed split cards
    const orientedImage = rotateArt ? await sharp(image).rotate(-90).toBuffer() : image;
    const resizedImage = await sharp(orientedImage)
        .resize(artWidth, artHeight, { fit: "cover" })
        .toBuffer();

    const outputPath = path.join(outputDir, cardFileName(name));

    // Composite: art at the bottom (it shows through the template's transparent window), then template, then text
    await sharp({ create: { width, height, channels: 4, background: "#ffffff" } })
        .composite([
            { input: resizedImage, top: artTop, left: artLeft },
            { input: template, top: 0, left: 0 },
            { input: resizedText, top: 0, left: 0 }
        ])
        .png()
        .toFile(outputPath);

    console.log(`✅ Assembled card saved to ${outputPath}`);
    return outputPath;
};

// Bounding box of the template's transparent pixels, where the art shows through
const transparentArea = async (template: Buffer) => {
    const { data, info } = await sharp(template).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * info.channels + 3] === 0) {
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            }
        }
    }
    if (right < 0) return undefined;
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
};

// Replace characters that are not allowed in Windows file names (e.g. "Fire // Ice")
export const cardFileName = (name: string) =>
    name.replace(/\s*\/\/\s*/g, ' - ').replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim() + '.png';

export default assembleCard;
