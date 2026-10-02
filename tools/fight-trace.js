// Cut the nine poses out of the photographed page and lay them out as a
// sprite sheet.
//
// Each pose is taken from a generous region rather than from the drawn grid:
// the figures overrun their cells and the ruled lines are curved, so cutting
// on the grid would clip arms. Inside a region the figure is found by keeping
// the biggest run of connected ink plus anything touching it, which drops the
// pencilled frame number and any ruled line that strayed in without needing
// to recognise either.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { inkMask } = require('./fight-ink.js');

const OUT = process.argv[2] || '.';
const CELL = Number(process.env.CELL || 256);
const PAD  = 10;          // breathing room inside a cell
const INK  = [0x22, 0x22, 0xdd];

// The pencilled frame numbers sit hard against the figures' trailing limbs,
// so no proximity rule separates them — they are struck out by position.
// Working-image rectangles: [x, y, w, h].
const EXCLUDE = [
    [170,  268,  70,  56],   // 1)
    [788,  208,  60,  60],   // 2)
    [1196, 134,  60,  56],   // 3)
    [104,  676,  70,  60],   // 4)
    [708,  648,  62,  60],   // 5)
    [1262, 590,  74,  92],   // 6)
    [ 54, 1068,  62,  60],   // 7)
    [728, 1038,  68,  70],   // 8)
    [1326, 950,  80,  80],   // 9, written as "7)" on the page
];

// Regions of interest in the 2007x1527 working image: [x, y, w, h].
const ROI = [
    [ 200,  250, 400, 270],   // 1  flying kick, arms forward
    [ 720,  200, 340, 370],   // 2  lunge, both arms out
    [1280,  120, 220, 350],   // 3  upright, arms raised
    [  60,  650, 540, 300],   // 4  low kick, trailing leg
    [ 800,  650, 260, 330],   // 5  guard, knees bent
    [1280,  550, 470, 250],   // 6  straight thrust
    [ 190, 1030, 450, 250],   // 7  crouched, long sweep
    [ 720, 1034, 390, 376],   // 8  wide stance, punch (top trimmed off a ruled line)
    [1360,  950, 370, 410],   // 9  overhead strike
];

// ── Connected components within a region ─────────────────────────────────
function components(mask, W, roi) {
    const [rx, ry, rw, rh] = roi;
    const seen = new Uint8Array(rw * rh);
    const comps = [];
    const stack = new Int32Array(rw * rh);

    const at = (x, y) => mask[(ry + y) * W + (rx + x)];

    for (let s = 0; s < rw * rh; s++) {
        if (seen[s] || !at(s % rw, (s / rw) | 0)) continue;
        let sp = 0, n = 0;
        let x0 = rw, y0 = rh, x1 = 0, y1 = 0;
        const px = [];
        stack[sp++] = s; seen[s] = 1;
        while (sp) {
            const p = stack[--sp];
            const x = p % rw, y = (p / rw) | 0;
            n++; px.push(p);
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
                    const q = ny * rw + nx;
                    if (seen[q] || !at(nx, ny)) continue;
                    seen[q] = 1; stack[sp++] = q;
                }
            }
        }
        comps.push({ n, x0, y0, x1, y1, px });
    }
    return comps;
}

/// Keep the largest component, then anything close enough to it to be part of
/// the same drawing, growing until nothing new is pulled in.
function figure(comps, rw, rh, near = 15) {
    if (!comps.length) return null;
    comps.sort((a, b) => b.n - a.n);

    // A ruled line that strayed into the region: spans the region edge to edge
    // and is far thinner than it is long.
    const isRule = c => {
        const w = c.x1 - c.x0, h = c.y1 - c.y0;
        return (w > rw * 0.95 && h < rh * 0.22) || (h > rh * 0.95 && w < rw * 0.22);
    };
    const pool = comps.filter(c => !isRule(c) && c.n >= 40);
    if (!pool.length) return null;

    // Nearness is measured against each kept stroke, never against the union
    // of them: the union swells as an outstretched arm is taken in, and a
    // frame number sitting well clear of the figure ends up inside it.
    const close = (a, b) => a.x0 <= b.x1 + near && a.x1 >= b.x0 - near &&
                            a.y0 <= b.y1 + near && a.y1 >= b.y0 - near;

    const keep = [pool[0]];
    let grew = true;
    while (grew) {
        grew = false;
        for (const c of pool) {
            if (keep.includes(c)) continue;
            if (!keep.some(k => close(c, k))) continue;
            keep.push(c);
            grew = true;
        }
    }

    const box = keep.reduce((b, c) => ({
        x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0),
        x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1),
    }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    return { keep, box };
}

(async () => {
    const { mask, w: W, h: H } = await inkMask({ ratio: 0.965, blue: -6 });
    console.log(`working image ${W}x${H}`);

    let struck = 0;
    for (const [ex, ey, ew, eh] of EXCLUDE) {
        for (let y = ey; y < ey + eh; y++) {
            for (let x = ex; x < ex + ew; x++) {
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                struck += mask[y * W + x];
                mask[y * W + x] = 0;
            }
        }
    }
    console.log(`struck ${struck}px of frame numbering`);

    const frames = [];
    for (let i = 0; i < ROI.length; i++) {
        const roi = ROI[i];
        const [, , rw, rh] = roi;
        const comps = components(mask, W, roi);
        const fig = figure(comps, rw, rh);
        if (!fig) { console.log(`frame ${i + 1}: NOTHING FOUND`); continue; }

        const { keep, box } = fig;
        const fw = box.x1 - box.x0 + 1, fh = box.y1 - box.y0 + 1;

        // Ink only, at its own size, as alpha.
        const buf = Buffer.alloc(fw * fh * 4);
        for (const c of keep) {
            for (const p of c.px) {
                const x = (p % rw) - box.x0, y = ((p / rw) | 0) - box.y0;
                const o = (y * fw + x) * 4;
                buf[o] = INK[0]; buf[o + 1] = INK[1]; buf[o + 2] = INK[2]; buf[o + 3] = 255;
            }
        }
        const png = await sharp(buf, { raw: { width: fw, height: fh, channels: 4 } })
            .png().toBuffer();
        frames.push({ i, png, fw, fh, parts: keep.length, px: keep.reduce((a, c) => a + c.n, 0) });
        console.log(`frame ${i + 1}: ${fw}x${fh}  ${keep.length} stroke group(s), ` +
                    `${keep.reduce((a, c) => a + c.n, 0)}px ink`);
    }

    // ── Lay out ──────────────────────────────────────────────────────────
    // Scaled to fit the cell and stood on its floor, so the feet line up
    // across frames rather than the bounding boxes.
    // One scale for the whole sheet, not one per frame. Scaling each frame to
    // its own box makes the fighter grow and shrink through the animation,
    // because a bounding box tracks the pose rather than the person.
    const inner = CELL - PAD * 2;
    const widest = Math.max(...frames.map(f => Math.max(f.fw, f.fh)));
    const scale  = inner / widest;
    console.log(`\ncommon scale ${scale.toFixed(3)} (largest pose ${widest}px)`);

    const tiles = [];
    for (const f of frames) {
        const s = scale;
        const tw = Math.max(1, Math.round(f.fw * s)), th = Math.max(1, Math.round(f.fh * s));
        const resized = await sharp(f.png).resize(tw, th).png().toBuffer();
        tiles.push({
            input: resized,
            left: (f.i % 3) * CELL + Math.round((CELL - tw) / 2),
            top:  ((f.i / 3) | 0) * CELL + (CELL - PAD - th),
        });
    }

    fs.mkdirSync(OUT, { recursive: true });
    const sheetPath = path.join(OUT, 'fight_sheet.png');
    await sharp({ create: { width: CELL * 3, height: CELL * 3, channels: 4,
                            background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(tiles).png().toFile(sheetPath);

    const meta = {
        source: 'hand-drawn page, photographed',
        frameWidth: CELL, frameHeight: CELL, columns: 3, rows: 3, count: frames.length,
        anchor: 'bottom-centre',
        frames: frames.map(f => ({
            index: f.i, name: `fight_${String(f.i + 1).padStart(2, '0')}`,
            col: f.i % 3, row: (f.i / 3) | 0,
            x: (f.i % 3) * CELL, y: ((f.i / 3) | 0) * CELL, w: CELL, h: CELL,
        })),
    };
    fs.writeFileSync(path.join(OUT, 'fight_frames.json'), JSON.stringify(meta, null, 2));

    // The frames on their own as well, for anything that would rather have
    // files than offsets.
    const fdir = path.join(OUT, 'frames');
    fs.mkdirSync(fdir, { recursive: true });
    for (let k = 0; k < frames.length; k++) {
        const f = frames[k], t = tiles[k];
        await sharp({ create: { width: CELL, height: CELL, channels: 4,
                                background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: t.input, left: t.left % CELL, top: t.top % CELL }])
            .png().toFile(path.join(fdir, `fight_${String(f.i + 1).padStart(2, '0')}.png`));
    }

    // A contact sheet on paper-coloured backing, to check the cut by eye.
    await sharp({ create: { width: CELL * 3, height: CELL * 3, channels: 4,
                            background: { r: 247, g: 245, b: 236, alpha: 1 } } })
        .composite([{ input: sheetPath }]).png().toFile(path.join(OUT, 'fight_sheet_check.png'));

    console.log(`\nwrote ${sheetPath} (${CELL * 3}x${CELL * 3}) and fight_frames.json`);
})();
