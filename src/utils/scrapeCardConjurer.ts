import { chromium, Page } from "playwright";
import Card from "../types/Card";
import { TextTabs } from "../enums/TextTabs";

const scrapeCardConjurer = async (card: Card) => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto("https://cardconjurer.app/", { waitUntil: "domcontentloaded" });

    // Sometimes the site needs a few seconds to fully load the editor
    await page.waitForTimeout(5000);

    await clickCreatorTab(page, "Set Symbol");
    await writeSetCode(page, card.set, "C");

    await clickCreatorTab(page, "Text");
    await clickWriteTextOption(page, TextTabs.Mana_Cost, card.mana_cost);
    await clickWriteTextOption(page, TextTabs.Title, card.name);
    await clickWriteTextOption(page, TextTabs.Type, card.type_line);
    await clickWriteTextOption(page, TextTabs.Rules_Text, card.oracle_text);
    await clickWriteTextOption(page, TextTabs.Power_Toughness, card.power && card.toughness ? card.power + "/" + card.toughness : "");

    const cardImage = await downloadCardFromCanvas(page, './card.png');

    await browser.close();

    return cardImage;
};


const clickCreatorTab = async (page: Page, tabName: string) => {
    // Wait until Card Conjurer has initialized its creator tabs
    await page.waitForFunction(() => {
        const el = document.querySelector('#creator-menu-tabs h3.selectable.readable-background');
        return el && typeof (el as any).onclick === 'function';
    }, { timeout: 20000 });

    // Click via DOM (real click inside browser context)
    const didClick = await page.evaluate((tabName: string) => {
        const tabs = Array.from(
            document.querySelectorAll<HTMLHeadingElement>(
                '#creator-menu-tabs h3.selectable.readable-background'
            )
        );
        const target = tabs.find(t => t.textContent?.trim() === tabName);
        if (target) {
            target.scrollIntoView({ behavior: 'instant', block: 'center' });
            target.click();
            return true;
        }
        return false;
    }, tabName);

    if (!didClick) throw new Error(`❌ Could not find tab "${tabName}"`);
    console.log(`✅ Clicked the "${tabName}" tab`);
};

const clickWriteTextOption = async (page: Page, optionName: string, text: string) => {
    // Wait until text options are visible and interactive
    await page.waitForFunction(() => {
        const el = document.querySelector('#text-options h4.text-option');
        return el && typeof (el as any).click === 'function';
    }, { timeout: 10000 });

    // Perform the click inside the browser context
    const didClick = await page.evaluate((optionName: string) => {
        const options = Array.from(
            document.querySelectorAll<HTMLHeadingElement>(
                '#text-options h4.selectable.text-option'
            )
        );
        const target = options.find(o => o.textContent?.trim() === optionName);
        if (target) {
            target.scrollIntoView({ behavior: 'instant', block: 'center' });
            target.click();
            return true;
        }
        return false;
    }, optionName);

    if (!didClick) throw new Error(`❌ Could not find text option "${optionName}"`);

    // Insert text in the textarea
    await writeInTextEditor(page, optionName, text);
};

const writeInTextEditor = async (page: Page, optionName: string, text: string) => {
    // Wait for the text editor to be visible and ready
    await page.waitForSelector('#text-editor', { state: 'visible' });

    // Focus, clear, and type
    const editor = page.locator('#text-editor');
    await editor.click({ clickCount: 3 }); // select existing text if any

    await page.evaluate(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('#text-editor');
        if (textarea) {
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    await editor.type(text, { delay: 500, timeout: 1000000 }); // type slowly to mimic a real user
    //await editor.type(text, { delay: 50, timeout: 90000 }); // type slowly to mimic a real user


    if (optionName === TextTabs.Type || optionName === TextTabs.Title) {
        await editTextboxWidthAndClose(page, 1500);
    }

    console.log(`✅ Typed text in editor: "${text}"`);
};

const editTextboxWidthAndClose = async (page: Page, width: number) => {
    // Click the "Edit Bounds" button
    const editBoundsButton = page.locator('button.input:has-text("Edit Bounds")');
    await editBoundsButton.waitFor({ state: 'visible', timeout: 10000 });
    await editBoundsButton.click();

    // Wait for the width input to appear
    const widthInput = page.locator('#textbox-editor-width');
    await widthInput.waitFor({ state: 'visible', timeout: 10000 });

    // Clear and set new width
    await widthInput.fill('');
    await widthInput.type(width.toString(), { delay: 50 });
    await widthInput.evaluate(input => input.dispatchEvent(new Event('change', { bubbles: true })));

    console.log(`✅ Set textbox width to ${width}`);

    // Click the close button to exit the textbox editor
    const closeButton = page.locator('h2.textbox-editor-close');
    await closeButton.waitFor({ state: 'visible', timeout: 10000 });
    await closeButton.click();

    console.log(`✅ Closed the textbox editor`);
};

const writeSetCode = async (page: Page, setCode: string, rarity: string) => {
    // Set Code input
    const setCodeInput = page.locator('#set-symbol-code');
    await setCodeInput.waitFor({ state: 'visible', timeout: 10000 });
    await setCodeInput.fill('');               // clear any existing value
    await setCodeInput.type(setCode, { delay: 50 }); // type slowly
    // Trigger the onchange manually
    await setCodeInput.evaluate(input => input.dispatchEvent(new Event('change', { bubbles: true })));

    console.log(`✅ Set set code: "${setCode}"`);

    const rarityInput = page.locator('#set-symbol-rarity');
    await rarityInput.waitFor({ state: 'visible', timeout: 10000 });
    await rarityInput.fill('');
    await rarityInput.type(rarity, { delay: 50 });
    await rarityInput.evaluate(input => input.dispatchEvent(new Event('change', { bubbles: true })));

    console.log(`✅ Set rarity: "${rarity}"`);
};

const downloadCardFromCanvas = async (page: Page, outputPath: string) => {
    // Wait for the canvas to be visible
    await page.waitForSelector('#previewCanvas', { state: 'visible' });

    const canvas = page.locator('#previewCanvas');
    await canvas.waitFor({ state: 'visible', timeout: 10000 });

    // Extract the image as base64
    const base64 = await canvas.evaluate((canvas: HTMLCanvasElement) => {
        return canvas.toDataURL('image/png').split(',')[1]; // get only the base64 part
    });

    // Convert base64 to buffer
    const buffer = Buffer.from(base64, 'base64');

    // Save as PNG
    //fs.writeFileSync(outputPath, buffer);

    return buffer
};

export default scrapeCardConjurer