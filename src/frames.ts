import ScryfallCard, { ScryfallFace } from "./types/ScryfallCard";

// Card Conjurer frame packs we can render, and whether they get a power/toughness template variant.
// Template images live in src/templates/<pack>.png (and <pack>_pt.png); see scripts/templates.
export const FRAME_PACKS: Record<string, { pt: boolean }> = {
    "M15Regular-1": { pt: true },
    "PlaneswalkerRegular": { pt: false },
    "SagaRegular": { pt: false },
    "SagaCreature": { pt: true },
    "M15TransformFront": { pt: true },
    "M15TransformBackNew": { pt: true },
    "ModalRegular": { pt: true },
    "Battle": { pt: false },
    "Class": { pt: false },
    "Case": { pt: false },
    "Adventure": { pt: true },
    "Omen": { pt: true },
    "Split": { pt: false },
    "Fuse": { pt: false },
    "Aftermath": { pt: false },
    "Flip": { pt: false },
    "Leveler": { pt: false },
    "Prototype": { pt: true },
    "M15Mutate": { pt: true },
    "Room": { pt: false },
    "StationRegular": { pt: false },
    "Prepare": { pt: true },
    "Spree": { pt: false },
    "TokenRegular-1": { pt: true },
};

export interface RenderJob {
    // Card Conjurer frame pack to load
    pack: string;
    // Index into Card Conjurer's import list (faces are listed separately)
    importIndex: number;
    // Name used for the output file
    name: string;
    artUrl: string;
    // Split-style cards print each half sideways, while Scryfall's art crop shows both arts side by side
    rotateArt: boolean;
    hasPT: boolean;
    // Template variant within the pack (e.g. "Long" for the long prototype cost box)
    variant?: string;
}

const ROTATED_ART_PACKS = ["Split", "Fuse", "Room"];

// Printed prototype costs with three symbols use the long cost box, two-symbol ones the short box
const prototypeVariant = (card: ScryfallCard) => {
    const cost = (card.oracle_text ?? "").match(/Prototype ((?:\{[^}]+\})+)/)?.[1] ?? "";
    return (cost.match(/\{/g)?.length ?? 0) > 2 ? "Long" : undefined;
};

const has = (text: string | undefined, word: string) => (text ?? "").includes(word);

// Pick the frame for a face that is rendered on its own image
const singleFacePack = (card: ScryfallCard, face: ScryfallFace): string => {
    const type = face.type_line ?? "";
    if (has(type, "Battle")) return "Battle";
    if (has(type, "Planeswalker")) return "PlaneswalkerRegular";
    if (has(type, "Saga")) return has(type, "Creature") ? "SagaCreature" : "SagaRegular";
    if (has(type, "Class")) return "Class";
    if (has(type, "Case")) return "Case";
    if (card.keywords?.includes("Spree")) return "Spree";
    if (has(face.oracle_text, "Station") && (has(type, "Spacecraft") || has(type, "Planet"))) return "StationRegular";
    return "M15Regular-1";
};

// Pick the frame for a card whose faces share a single image (split, adventure, flip...)
const sharedFacePack = (card: ScryfallCard): string | undefined => {
    const faces = card.card_faces ?? [];
    switch (card.layout) {
        case "split":
            if (faces.some(f => has(f.type_line, "Room"))) return "Room";
            if (card.keywords?.includes("Aftermath")) return "Aftermath";
            if (card.keywords?.includes("Fuse")) return "Fuse";
            return "Split";
        case "flip": return "Flip";
        case "adventure": return faces.some(f => has(f.type_line, "Omen")) ? "Omen" : "Adventure";
        case "prepare": return "Prepare";
        case "leveler": return "Leveler";
        case "prototype": return "Prototype";
        case "mutate": return "M15Mutate";
        case "class": return "Class";
        case "case": return "Case";
        case "saga": return has(card.type_line, "Creature") ? "SagaCreature" : "SagaRegular";
        case "token":
        case "double_faced_token": return "TokenRegular-1";
    }
    return undefined;
};

const hasPT = (face: ScryfallFace) => face.power !== undefined && face.toughness !== undefined;

// Decide which images to render for a card: one per face for double-faced cards, one otherwise
export const planRenders = (card: ScryfallCard): RenderJob[] => {
    const faces = card.card_faces ?? [];

    if ((card.layout === "transform" || card.layout === "modal_dfc") && faces.length >= 2) {
        return faces.slice(0, 2).map((face, index) => {
            let pack = singleFacePack(card, face);
            if (pack === "M15Regular-1") {
                pack = card.layout === "modal_dfc"
                    ? "ModalRegular"
                    : index === 0 ? "M15TransformFront" : "M15TransformBackNew";
            }
            return {
                pack,
                importIndex: index,
                name: face.name,
                artUrl: face.image_uris?.art_crop ?? card.image_uris?.art_crop ?? "",
                rotateArt: false,
                hasPT: hasPT(face),
            };
        });
    }

    const pack = sharedFacePack(card) ?? singleFacePack(card, faces[0] ?? card);
    return [{
        pack,
        importIndex: 0,
        name: card.name,
        artUrl: card.image_uris?.art_crop ?? faces[0]?.image_uris?.art_crop ?? "",
        rotateArt: ROTATED_ART_PACKS.includes(pack),
        hasPT: hasPT(card) || faces.some(hasPT),
        variant: pack === "Prototype" ? prototypeVariant(card) : undefined,
    }];
};

export const templateFile = (job: RenderJob) => {
    const withPT = job.hasPT && FRAME_PACKS[job.pack]?.pt;
    return `${job.pack}${job.variant ?? ""}${withPT ? "_pt" : ""}.png`;
};
