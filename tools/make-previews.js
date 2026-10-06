// Build the character-picker thumbnails.
//
// The source art is all over the place — full-frame run cycles at 799x736,
// 128px platformer sprites, 256px fight frames — so a picker that points at
// it directly shows seven characters at seven different sizes against seven
// different amounts of empty space. Each one is trimmed to the character and
// refitted into one box, so the grid reads as a set.
//
//   node tools/make-previews.js

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'assets', 'previews');
const W = 176, H = 208, PAD = 8;

// A sheet frame is named as [file, column, row, cellSize].
const SOURCES = {
    skeleton:      ['assets/skeleton-01_run_01start_00.png'],
    kolu:          ['assets/kolu_frames/run_00.png'],
    kenney_green:  ['assets/kenney/char/green_idle.png'],
    kenney_purple: ['assets/kenney/char/purple_idle.png'],
    portable:      ['assets/fight/fight_sheet.png', 3, 0, 256],   // guard stance
};

// The fight card gets both fighters squared up, because one figure alone
// looks like the same character the chase card already shows.
const VERSUS = {
    sheet: 'assets/fight/fight_sheet.png', cell: 256,
    left:  [2, 2],                        // big lunge punch
    right: [3, 1],                        // crouching guard, flipped
    tint:  { r: 0x7a, g: 0x8c, b: 0xa8 }, // the opponent's tint in game
};

// Drawn in code, so its thumbnail is drawn here too.
const STICK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 64" width="${W}" height="${H}">
<g stroke="#4444ee" stroke-width="3.4" fill="none" stroke-linecap="round">
<circle cx="20" cy="10" r="7"/><line x1="20" y1="17" x2="20" y2="38"/>
<polyline points="20,22 10,30 13,39"/><polyline points="20,22 31,29 28,38"/>
<polyline points="20,38 12,50 15,60"/><polyline points="20,38 29,49 27,60"/>
</g></svg>`;

/// Tight bounding box of everything that is not transparent.
async function trimmed(buf) {
    const { data, info } = await sharp(buf).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * 4 + 3] < 24) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) throw new Error('nothing but transparency');
    return sharp(buf).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
        .png().toBuffer();
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });

    const jobs = Object.entries(SOURCES).map(([id, [file, col, row, cell]]) => async () => {
        let buf = fs.readFileSync(path.join(ROOT, file));
        if (cell) {
            buf = await sharp(buf)
                .extract({ left: col * cell, top: row * cell, width: cell, height: cell })
                .png().toBuffer();
        }
        const art = await trimmed(buf);
        const m = await sharp(art).metadata();
        // Fit to the box, then stand the character on its floor rather than
        // centring it — a picker of figures reads better aligned at the feet.
        const s = Math.min((W - PAD * 2) / m.width, (H - PAD * 2) / m.height);
        const tw = Math.max(1, Math.round(m.width * s)), th = Math.max(1, Math.round(m.height * s));
        // Small sprites have to grow to match the others; smoothing them on
        // the way up turns pixel art to mush, so those are scaled hard-edged.
        const tile = await sharp(art)
            .resize(tw, th, s > 1.2 ? { kernel: 'nearest' } : {})
            .png().toBuffer();
        await sharp({ create: { width: W, height: H, channels: 4,
                                background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: tile, left: Math.round((W - tw) / 2), top: H - PAD - th }])
            .png().toFile(path.join(OUT, id + '.png'));
        console.log(`  ${id.padEnd(14)} ${m.width}x${m.height} -> ${tw}x${th}`);
    });

    for (const j of jobs) await j();

    await sharp(Buffer.from(STICK_SVG)).png().toFile(path.join(OUT, 'stick.png'));
    console.log('  stick          drawn');

    // ── The versus card ──────────────────────────────────────────────────
    const cellOf = async ([c, r], flip, tint) => {
        let p = sharp(path.join(ROOT, VERSUS.sheet)).extract({
            left: c * VERSUS.cell, top: r * VERSUS.cell,
            width: VERSUS.cell, height: VERSUS.cell });
        if (flip) p = p.flop();
        if (tint) p = p.tint(tint);
        return trimmed(await p.png().toBuffer());
    };
    const a = await cellOf(VERSUS.left, false, null);
    const b = await cellOf(VERSUS.right, true, VERSUS.tint);
    const ma = await sharp(a).metadata(), mb = await sharp(b).metadata();
    const tall = Math.max(ma.height, mb.height);
    const sv = (H - PAD * 2) / tall * 0.96;
    const fit = async (buf, m) => ({
        buf: await sharp(buf).resize(Math.round(m.width * sv), Math.round(m.height * sv))
            .png().toBuffer(),
        w: Math.round(m.width * sv), h: Math.round(m.height * sv),
    });
    const fa = await fit(a, ma), fb = await fit(b, mb);
    const total = fa.w + fb.w - Math.round(Math.min(fa.w, fb.w) * 0.22);  // let them overlap
    const k = Math.min(1, (W - PAD * 2) / total);
    const scaled = async f => sharp(f.buf)
        .resize(Math.max(1, Math.round(f.w * k)), Math.max(1, Math.round(f.h * k)))
        .png().toBuffer();
    const [sa, sb] = [await scaled(fa), await scaled(fb)];
    const wa = Math.round(fa.w * k), wb = Math.round(fb.w * k);
    const span = Math.round(total * k), x0 = Math.round((W - span) / 2);
    await sharp({ create: { width: W, height: H, channels: 4,
                            background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([
            { input: sb, left: x0 + span - wb, top: H - PAD - Math.round(fb.h * k) },
            { input: sa, left: x0,             top: H - PAD - Math.round(fa.h * k) },
        ]).png().toFile(path.join(OUT, 'fight.png'));
    console.log('  fight          two fighters squared up');
    console.log(`\nwrote ${Object.keys(SOURCES).length + 1} thumbnails to assets/previews/ at ${W}x${H}`);
})();
