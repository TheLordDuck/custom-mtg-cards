import { ArtBounds } from "../utils/scrapeCardConjurer";

interface CardAssemble {
    template: Buffer
    text: Buffer
    image: Buffer
    artBounds: ArtBounds
    rotateArt?: boolean
}

export default CardAssemble
