interface Card {
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    power: string;
    toughness: string;
    set: string;
    image_uris: { art_crop: string };
}

export default Card