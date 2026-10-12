import axios from "axios";
import ScryfallCard from "../types/ScryfallCard";

const named = async (mode: "exact" | "fuzzy", cardName: string) => {
    const response = await axios.get<ScryfallCard>(`https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(cardName)}`);
    return response.data;
};

const isNotFound = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 404;

// Card Conjurer's importer does the text formatting, so the raw Scryfall object is passed along
const fetchScryfall = async (cardName: string): Promise<ScryfallCard> => {
    try {
        return await named("exact", cardName);
    } catch (error) {
        if (!isNotFound(error)) throw error;
    }

    // Tolerate typos and partial names ("jace mind sculptor")
    try {
        return await named("fuzzy", cardName);
    } catch (error) {
        if (isNotFound(error)) throw new Error(`Card not found on Scryfall: "${cardName}"`);
        throw error;
    }
}

export default fetchScryfall
