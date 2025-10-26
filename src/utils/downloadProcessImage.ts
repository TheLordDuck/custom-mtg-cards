import axios from "axios";
import sharp from "sharp";

const downloadProcessImage = async (imageURL: string) => {
    const imageResponse = await axios.get<ArrayBuffer>(imageURL, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(imageResponse.data);

    const processedImage = await sharp(imageBuffer)
        .grayscale()                            // remove all color
        .modulate({ brightness: 1.5, saturation: 0 }) // brighten + remove any remaining color tint
        .linear(1.1, 30)                        // increase midtones slightly
        .gamma(1)                             // lift shadows (makes darker areas lighter)
        .blur(0.4)                              // soft blur to reduce harshness
        .normalize()                            // balance histogram for better contrast
        .toBuffer();

    return processedImage;
};

export default downloadProcessImage;