import readCardsFile from './utils/readCardsFile';
import { generateCards } from './pipeline';

const OUTPUT_DIR = './src/output';

const main = async () => {
    // An alternative card list can be passed as the first argument
    const entries = await readCardsFile(process.argv[2]);

    const results = await generateCards(entries, { outputDir: OUTPUT_DIR, headless: false, force: true });

    const failed = results.filter(result => result.error).map(result => result.entry.name);
    console.log(`Done: ${entries.length - failed.length}/${entries.length} cards generated.`);
    if (failed.length > 0) {
        console.log(`Failed: ${failed.join(', ')}`);
        process.exitCode = 1;
    }
}

main().catch(console.error);
