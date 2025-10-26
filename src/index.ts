import readCardsFile from './utils/readCardsFile';
import downloadProcessImage from './utils/downloadProcessImage';
import scrapeCardConjurer from "./utils/scrapeCardConjurer";
import fetchScryfall from "./utils/fetchScryfall";
import selectTemplateCard from './utils/selectTemplateCard';
import assembleCard from './utils/assembleCard';

const main = async () => {
    const items = await readCardsFile();

    items.forEach(async item => {
        // Fetch scryfall data of card
        const card = await fetchScryfall(item);

        // Fetch and process the image of the uri from scryfall
        const imageArt = await downloadProcessImage(card.image_uris.art_crop);

        // Scrape Cardconjurer to get the text image of the card
        const scrapeCard = await scrapeCardConjurer(card);

        // Select template based on the card type
        const cardImage = await selectTemplateCard(card.type_line);

        // Assemble card
        await assembleCard(
            card.name,
            {
                template: cardImage,
                text: scrapeCard,
                image: imageArt
            });
    });
}

main().catch(console.error);