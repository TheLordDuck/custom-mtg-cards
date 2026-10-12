export interface CardEntry {
    name: string;
    // Copies to print
    count: number;
}

// Parses one card per line, optionally with a decklist-style count ("4 Lightning Bolt", "4x Lightning Bolt").
// Repeated names are merged.
export const parseCardList = (text: string): CardEntry[] => {
    const entries = new Map<string, CardEntry>();
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || line.startsWith("//")) continue;

        const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
        const name = (match ? match[2] : line).trim();
        const count = match ? Math.max(1, parseInt(match[1], 10)) : 1;

        const key = name.toLowerCase();
        const existing = entries.get(key);
        if (existing) {
            existing.count += count;
        } else {
            entries.set(key, { name, count });
        }
    }
    return [...entries.values()];
};
