import fs from 'fs';
import { parseCardList } from '../cardList';

const readCardsFile = async (path = 'src/entry.txt') => {
    const entries = parseCardList(fs.readFileSync(path, 'utf8'));
    console.log(entries.map(entry => entry.name));
    return entries;
}

export default readCardsFile
