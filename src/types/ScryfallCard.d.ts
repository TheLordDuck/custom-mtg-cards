// Subset of the Scryfall card object used by the pipeline (https://scryfall.com/docs/api/cards)
export interface ScryfallFace {
    object?: string;
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    power?: string;
    toughness?: string;
    image_uris?: { art_crop: string };
}

interface ScryfallCard extends ScryfallFace {
    layout: string;
    set: string;
    rarity: string;
    keywords?: string[];
    card_faces?: ScryfallFace[];
    [key: string]: unknown;
}

export default ScryfallCard
