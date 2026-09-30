// ── Notebook doodle world ─────────────────────────────────────────────────
// Everything here is drawn in biro on ruled paper: the page, the margin rule
// that serves as the floor, and the obstacles themselves. It matches the stick
// figure, which is already a pen drawing, so the whole screen reads as one
// sketch rather than a character pasted onto a background.

const PAPER = {
    page:      0xf7f5ec,   // slightly warm paper
    pageShade: 0xe8e4d6,   // below the margin line
    rule:      0x9fb4d8,   // faint blue ruling
    margin:    0xd2555c,   // the red margin — this is the floor
    ink:       0x2222dd,
    inkLight:  0x5a5ae0,
    ruleGap:   26,
};

/// Wobble a coordinate a little so lines look drawn, not printed. Deterministic
/// on its inputs, so a shape does not shimmer between frames.
function inkJitter(seed, i, amp = 1.1) {
    const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return ((n - Math.floor(n)) - 0.5) * 2 * amp;
}

/// A hand-drawn line: a few segments, each nudged off true.
function inkLine(g, x1, y1, x2, y2, seed) {
    const segs = 3;
    g.beginPath();
    g.moveTo(x1 + inkJitter(seed, 0), y1 + inkJitter(seed, 1));
    for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        g.lineTo(x1 + (x2 - x1) * t + inkJitter(seed, s + 2),
                 y1 + (y2 - y1) * t + inkJitter(seed, s + 9));
    }
    g.strokePath();
}

const Doodle = {

    /// The page itself. Ruling is horizontal so it does not need to scroll —
    /// only the margin line and the obstacles move.
    drawPage(g, w, h, groundY) {
        g.clear();
        g.fillStyle(PAPER.page, 1).fillRect(0, 0, w, h);

        g.lineStyle(1, PAPER.rule, 0.55);
        for (let y = PAPER.ruleGap; y < h; y += PAPER.ruleGap) {
            if (Math.abs(y - groundY) < 6) continue;   // leave room for the margin
            g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath();
        }

        // Below the floor the page is in shadow, so the ground reads as solid.
        g.fillStyle(PAPER.pageShade, 0.55).fillRect(0, groundY, w, h - groundY);

        // The red margin rule — the floor.
        g.lineStyle(2.2, PAPER.margin, 0.9);
        g.beginPath(); g.moveTo(0, groundY); g.lineTo(w, groundY); g.strokePath();
        g.lineStyle(1, PAPER.margin, 0.35);
        g.beginPath(); g.moveTo(0, groundY + 3); g.lineTo(w, groundY + 3); g.strokePath();
    },

    /// Obstacles, drawn as outlines the way they were sketched.
    /// x is the horizontal centre, y the base (feet on the floor).
    shape(g, key, x, y, w, h, seed) {
        g.lineStyle(2.2, PAPER.ink, 1);
        const l = x - w / 2, r = x + w / 2, t = y - h;

        switch (key) {
            // ① an arch to clear
            case 'hurdle':
                inkLine(g, l, y, l, t, seed);
                inkLine(g, l, t, r, t, seed + 1);
                inkLine(g, r, t, r, y, seed + 2);
                break;

            // ② a spiked ball
            case 'spikeball': {
                const cx = x, cy = y - h / 2, rad = Math.min(w, h) / 2 * 0.62;
                g.strokeCircle(cx + inkJitter(seed, 0), cy + inkJitter(seed, 1), rad);
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + 0.3;
                    inkLine(g, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad,
                               cx + Math.cos(a) * rad * 1.75, cy + Math.sin(a) * rad * 1.75,
                               seed + i);
                }
                break;
            }

            // ③ a pillar too tall to jump — this one has to be broken
            case 'pillar':
                inkLine(g, l, y, l, t, seed);
                inkLine(g, l, t, r, t, seed + 1);
                inkLine(g, r, t, r, y, seed + 2);
                inkLine(g, r, y, l, y, seed + 3);
                g.lineStyle(1.2, PAPER.inkLight, 0.8);
                for (let i = 1; i < 4; i++) {
                    const yy = t + (h * i / 4);
                    inkLine(g, l + 2, yy, r - 2, yy, seed + 10 + i);
                }
                break;

            // ④ a dart flying in — swat it
            case 'dart': {
                const my = y - h / 2;
                inkLine(g, r, my, l, my, seed);
                inkLine(g, l, my, l + w * 0.34, my - h * 0.42, seed + 1);
                inkLine(g, l, my, l + w * 0.34, my + h * 0.42, seed + 2);
                break;
            }

            default:
                inkLine(g, l, y, l, t, seed);
                inkLine(g, l, t, r, t, seed + 1);
                inkLine(g, r, t, r, y, seed + 2);
                inkLine(g, r, y, l, y, seed + 3);
        }
    },
};
