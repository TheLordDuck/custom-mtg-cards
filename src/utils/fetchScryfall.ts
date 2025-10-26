import axios from "axios";
import Card from "../types/Card";

const fetchScryfall = async (cardName: string): Promise<Card> => {
    try {
        const response = await axios.get(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);

        const card: Card = {
            name: response.data.name,
            mana_cost: response.data.mana_cost,
            type_line: response.data.type_line,
            oracle_text: formatRulesText(response.data.oracle_text),
            power: response.data.power || "",
            toughness: response.data.toughness || "",
            set: response.data.set,
            image_uris: { art_crop: response.data.image_uris.art_crop },
        };

        return card;
    } catch (error) {
        console.error("Error fetching card:", error);
        throw error;
    }
}

const formatRulesText = (text: string): string => {
    // 1️⃣ Replace ( with {i}(
    text = text.replace(/\(/g, '{i}(');

    // 2️⃣ Replace ) with ){/i}
    text = text.replace(/\)/g, '){/i}');

    // 3️⃣ Format ability names between \n and —
    // Example: "\nEquip—" → "\n{i}Equip{/i}—"
    //text = text.replace(/\n([\w\s]+?)—/g, '\n{i}$1{/i}—');

    return text;
};

export default fetchScryfall