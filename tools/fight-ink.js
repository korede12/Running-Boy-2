// Lift the biro off the paper.
//
// The photo is lit unevenly and shot on a desk, so a flat threshold either
// keeps the desk or loses the lighter strokes. Dividing by a heavily blurred
// copy removes the shading — paper and desk both normalise to about 1, and
// only marks that are darker than their own surroundings survive. Requiring
// the mark to be blue as well drops the printed text showing through the
// sheet, which is grey.

const sharp = require('sharp');

const SRC = process.env.FIGHT_SRC || '../assets/fight/source/page_photo.png';
const SCALE = 3;                 // work big; the strokes are a pixel or two

async function inkMask(opts = {}) {
    const { ratio = 0.90, blue = 4, sigma = 18 } = opts;

    const base = sharp(SRC).ensureAlpha().resize({ width: 669 * SCALE, kernel: 'cubic' });
    const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    const { data: bg } = await base.clone().blur(sigma * SCALE / 3).raw().toBuffer({ resolveWithObject: true });

    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        const l  = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
        const lb = bg[o]   * 0.299 + bg[o + 1]   * 0.587 + bg[o + 2]   * 0.114;
        if (lb < 1) continue;
        const r = l / lb;
        const isBlue = (data[o + 2] - data[o]) > blue;
        if (r < ratio && isBlue) mask[i] = 1;
    }
    return { mask, w, h, data };
}

module.exports = { inkMask, SRC, SCALE };

if (require.main === module) {
    (async () => {
        const { mask, w, h } = await inkMask();
        let n = 0;
        const out = Buffer.alloc(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            const v = mask[i] ? 0 : 255;
            out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
            out[i * 4 + 3] = 255;
            n += mask[i];
        }
        await sharp(out, { raw: { width: w, height: h, channels: 4 } })
            .resize(900).png().toFile('dbg_ink.png');
        console.log(`${w}x${h}, ink ${n}px (${(100 * n / (w * h)).toFixed(2)}%) -> dbg_ink.png`);
    })();
}
