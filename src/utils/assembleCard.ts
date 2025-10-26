import sharp from "sharp";
import CardAssemble from "../types/CardAssemble";

const assembleCard = async (name: string, buffers: CardAssemble) => {
    const { template, text, image } = buffers;

    // Get template dimensions
    const templateMeta = await sharp(template).metadata();
    if (!templateMeta.width || !templateMeta.height) {
        throw new Error("Invalid template image dimensions");
    }
    const width = templateMeta.width;
    const height = templateMeta.height;

    console.log(width, height);

    // Resize text and art images to match template
    const resizedText = await sharp(text)
        .resize(width, height, { fit: "fill" })
        .toBuffer();

    const imageMeta = await sharp(image).metadata();
    const cropTop = 35;
    const cropBottom = 35;
    const newImageHeight = imageMeta.height - (cropTop + cropBottom);

    const resizedImage = await sharp(image)
        .extract({
            left: 0,
            top: cropTop,
            width: imageMeta.width,
            height: newImageHeight,
        })
        .resize(
            imageMeta.width * 2 + 445,
            imageMeta.height * 2 + 333,
            { fit: "fill" }
        )
        .toBuffer();


    // Composite: template at bottom, then art, then text
    await sharp(template)
        .composite([
            { input: resizedImage, top: 317, left: 157 },
            { input: resizedText, top: 0, left: 0 }
        ])
        .png()
        .toFile(`./src/output/${name}.png`);

    console.log(`✅ Assembled card saved to`);
};

export default assembleCard;