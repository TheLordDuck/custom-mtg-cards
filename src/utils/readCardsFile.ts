
import fs from 'fs';

const readCardsFile = async () => {
    const file = fs.readFileSync('src/entry.txt', 'utf8');

    // Split into lines, filter out empty ones
    const items = file
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

    console.log(items)
    return items
}

export default readCardsFile