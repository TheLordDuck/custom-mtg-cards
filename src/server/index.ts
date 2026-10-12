import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import express, { Response } from "express";
import { parseCardList } from "../cardList";
import { generateCards, PipelineEvent } from "../pipeline";
import { buildPdf, PAPER_SIZES, Paper, PdfOptions } from "./pdf";

const PORT = Number(process.env.PORT) || 3000;
const OUTPUT_DIR = path.resolve("./src/output");
const PUBLIC_DIR = path.resolve("./public");

// Events sent to the page; image paths become URLs
type JobEvent =
    | Exclude<PipelineEvent, { type: "image" } | { type: "done" }>
    | { type: "queued", position: number }
    | { type: "image", index: number, name: string, url: string, cached: boolean }
    | { type: "done" };

interface Job {
    events: JobEvent[];
    listeners: Set<Response>;
    finished: boolean;
}

const jobs = new Map<string, Job>();

const cardUrl = (file: string) => `/cards/${encodeURIComponent(path.basename(file))}`;

const emit = (job: Job, event: JobEvent) => {
    job.events.push(event);
    for (const listener of job.listeners) {
        listener.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    if (event.type === "done") {
        job.finished = true;
        for (const listener of job.listeners) listener.end();
        job.listeners.clear();
    }
};

// Jobs run one after another so only one browser is open at a time
let queue: Promise<void> = Promise.resolve();
let waiting = 0;

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));
app.use("/cards", express.static(OUTPUT_DIR));

app.post("/api/jobs", (req, res) => {
    const entries = parseCardList(String(req.body?.list ?? ""));
    if (entries.length === 0) {
        res.status(400).json({ error: "La lista está vacía" });
        return;
    }

    const id = randomUUID();
    const job: Job = { events: [], listeners: new Set(), finished: false };
    jobs.set(id, job);
    emit(job, { type: "queued", position: waiting });
    waiting++;

    queue = queue.then(async () => {
        waiting--;
        try {
            await generateCards(entries, {
                outputDir: OUTPUT_DIR,
                headless: true,
                force: Boolean(req.body?.force),
                onEvent: event => {
                    if (event.type === "image") {
                        emit(job, { type: "image", index: event.index, name: event.name, url: cardUrl(event.file), cached: event.cached });
                    } else if (event.type !== "done") {
                        emit(job, event);
                    }
                },
            });
        } catch (error) {
            emit(job, { type: "error", index: -1, entry: { name: "", count: 0 }, message: String(error) });
        } finally {
            emit(job, { type: "done" });
        }
    });

    res.json({ id, entries });
});

// Progress stream: replays what already happened, then follows the job live
app.get("/api/jobs/:id/events", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
        res.status(404).end();
        return;
    }
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    for (const event of job.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (job.finished) {
        res.end();
        return;
    }
    job.listeners.add(res);
    req.on("close", () => job.listeners.delete(res));
});

const number = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

app.post("/api/pdf", async (req, res) => {
    try {
        const body = req.body ?? {};
        const options: PdfOptions = {
            paper: (body.paper in PAPER_SIZES ? body.paper : "a4") as Paper,
            orientation: body.orientation === "landscape" ? "landscape" : "portrait",
            scale: number(body.scale, 100, 10, 400),
            marginMm: number(body.marginMm, 5, 0, 100),
            gapMm: number(body.gapMm, 0, 0, 50),
            cutGuides: ["none", "outline", "corners"].includes(body.cutGuides) ? body.cutGuides : "corners",
            dpi: number(body.dpi, 300, 72, 800),
        };

        // Only images generated into the output folder can be used
        const cards = (Array.isArray(body.cards) ? body.cards : []).flatMap((card: any) => {
            const file = path.join(OUTPUT_DIR, path.basename(decodeURIComponent(String(card?.url ?? "")).replace(/^\/cards\//, "")));
            return fs.existsSync(file) ? [{ file, copies: number(card?.copies, 1, 0, 100) }] : [];
        });
        if (cards.length === 0) {
            res.status(400).json({ error: "No hay cartas para el PDF" });
            return;
        }

        const pdf = await buildPdf(cards, options);
        res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="cartas.pdf"' });
        res.send(pdf);
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

app.listen(PORT, () => {
    console.log(`Card portal running at http://localhost:${PORT}`);
});
