// Cut the two generated 3x3 sheets into frames and lay them out as one
// animation sheet.
//
// The two sheets interleave: sheet two's cells are the halfway points between
// sheet one's, so the running order is 1a, 1b, 2a, 2b, ... and the pair reads
// as a single sequence rather than two sets of poses.
//
// Frames are registered on a shared baseline rather than centred in their
// own box, because a bounding box follows the pose. Centre each box and the
// fighter bobs about; stand them all on the same floor and he does not.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SHEETS = ['gen1.png', 'gen2.png'];
const GRID = 3;
const OUT = process.argv[2] || 'final';
const COLS = 6;

async function cells(file) {
    const img = sharp(file);
    const { width, height } = await img.metadata();
    const cw = Math.floor(width / GRID), ch = Math.floor(height / GRID);
    const found = [];
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const { data, info } = await sharp(file)
                .extract({ left: c * cw, top: r * ch, width: cw, height: ch })
                .raw().toBuffer({ resolveWithObject: true });
            // The figure is one connected shape. Anything else in the cell is
            // a ground-shadow arc the model drew despite being told not to —
            // and left in, it drags the baseline down and floats him.
            const W = info.width, Hh = info.height;
            const solid = new Uint8Array(W * Hh);
            for (let i = 0; i < W * Hh; i++) solid[i] = data[i * 4 + 3] >= 40 ? 1 : 0;

            const seen = new Uint8Array(W * Hh);
            const stack = new Int32Array(W * Hh);
            let best = null;
            for (let s0 = 0; s0 < W * Hh; s0++) {
                if (seen[s0] || !solid[s0]) continue;
                let sp = 0, n = 0, x0 = W, y0 = Hh, x1 = -1, y1 = -1;
                stack[sp++] = s0; seen[s0] = 1;
                while (sp) {
                    const p = stack[--sp];
                    const x = p % W, y = (p / W) | 0;
                    n++;
                    if (x < x0) x0 = x; if (x > x1) x1 = x;
                    if (y < y0) y0 = y; if (y > y1) y1 = y;
                    if (x > 0     && solid[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
                    if (x < W - 1 && solid[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
                    if (y > 0     && solid[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
                    if (y < Hh - 1 && solid[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
                }
                if (!best || n > best.n) best = { n, x0, y0, x1, y1 };
            }
            if (!best || best.n < 500) { console.log(`  ${file} cell ${r},${c}: EMPTY`); continue; }
            found.push({
                file, left: c * cw + best.x0, top: r * ch + best.y0,
                w: best.x1 - best.x0 + 1, h: best.y1 - best.y0 + 1, ink: best.n,
            });
        }
    }
    return found;
}

(async () => {
    const a = await cells(SHEETS[0]);
    const b = await cells(SHEETS[1]);
    console.log(`${SHEETS[0]}: ${a.length} frames, ${SHEETS[1]}: ${b.length} frames`);

    // Interleave: each in-between sits after the keyframe it follows.
    const seq = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i]) seq.push({ ...a[i], kind: 'key',     src: i });
        if (b[i]) seq.push({ ...b[i], kind: 'between', src: i });
    }

    const maxW = Math.max(...seq.map(f => f.w));
    const maxH = Math.max(...seq.map(f => f.h));
    console.log(`widest ${maxW}px, tallest ${maxH}px over ${seq.length} frames`);

    // One cell size for every frame, with a margin, scaled down to something
    // a game will actually load.
    const PAD = 12;
    const raw = Math.max(maxW, maxH) + PAD * 2;
    const CELL = 256;
    const s = CELL / raw;
    console.log(`cell ${CELL}px (source ${raw}px, scale ${s.toFixed(3)})`);

    const rows = Math.ceil(seq.length / COLS);
    const tiles = [];
    for (let i = 0; i < seq.length; i++) {
        const f = seq[i];
        const tw = Math.max(1, Math.round(f.w * s)), th = Math.max(1, Math.round(f.h * s));
        const buf = await sharp(f.file)
            .extract({ left: f.left, top: f.top, width: f.w, height: f.h })
            .resize(tw, th).png().toBuffer();
        tiles.push({
            input: buf,
            left: (i % COLS) * CELL + Math.round((CELL - tw) / 2),
            top:  ((i / COLS) | 0) * CELL + (CELL - Math.round(PAD * s) - th),
        });
    }

    fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
    const sheet = path.join(OUT, 'fight_sheet.png');
    await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4,
                            background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(tiles).png().toFile(sheet);

    for (let i = 0; i < tiles.length; i++) {
        await sharp({ create: { width: CELL, height: CELL, channels: 4,
                                background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: tiles[i].input, left: tiles[i].left % CELL, top: tiles[i].top % CELL }])
            .png().toFile(path.join(OUT, 'frames', `fight_${String(i + 1).padStart(2, '0')}.png`));
    }

    fs.writeFileSync(path.join(OUT, 'fight_frames.json'), JSON.stringify({
        source: 'hand-drawn page, restyled',
        frameWidth: CELL, frameHeight: CELL,
        columns: COLS, rows, count: seq.length,
        anchor: 'bottom-centre, frames share a baseline',
        suggestedFps: 14,
        frames: seq.map((f, i) => ({
            index: i, name: `fight_${String(i + 1).padStart(2, '0')}`,
            kind: f.kind,
            col: i % COLS, row: (i / COLS) | 0,
            x: (i % COLS) * CELL, y: ((i / COLS) | 0) * CELL, w: CELL, h: CELL,
        })),
    }, null, 2));

    // Flattened contact sheet, to check the cut by eye.
    await sharp(sheet).flatten({ background: { r: 228, g: 228, b: 234 } })
        .png().toFile(path.join(OUT, 'fight_sheet_check.png'));

    console.log(`\nwrote ${sheet}  ${COLS * CELL}x${rows * CELL}  ${seq.length} frames`);
})();
