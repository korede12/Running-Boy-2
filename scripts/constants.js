// ── Game constants ────────────────────────────────────────────────────────
const GROUND_Y     = 330;
const TOTAL_FRAMES = 25;
const SCROLL_SPEED = 2;      // world scrolls left at this speed (px/frame)
const BOY_SCREEN_X = 110;    // boy's fixed screen x
const RAIN_ANGLE   = 0.25;
const TILE_W       = 411;    // building tile width (buildings span x=-5..406 = 411px)

const SKUBU_INTERVAL = 20;  // points between skubu awards

const WALL_COLORS = [0x252030, 0x1e2838, 0x28221a, 0x1c2030, 0x2c1c1c, 0x1e2232];

// Buildings defined with relative window coords (rx = x offset within the tile)
const BUILDINGS = [
    { x:  -5, width: 55, height: 130 },
    { x:  42, width: 45, height: 100 },
    { x:  78, width: 60, height: 152 },
    { x: 128, width: 45, height: 115 },
    { x: 167, width: 65, height: 142 },
    { x: 222, width: 42, height:  95 },
    { x: 256, width: 55, height: 126 },
    { x: 302, width: 50, height: 138 },
    { x: 346, width: 60, height: 108 },
].map((b, i) => {
    const y     = GROUND_Y - b.height;
    const color = WALL_COLORS[i % WALL_COLORS.length];
    const WW = 8, WCOL = 15, WROW = 18;
    const cols   = Math.max(1, Math.floor((b.width  - 10) / WCOL));
    const rows   = Math.max(1, Math.floor((b.height - 22) / WROW));
    const startX = b.x + (b.width - (cols - 1) * WCOL - WW) / 2;
    const startY = y + 12;
    const windows = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            windows.push({
                rx:  Math.round(startX + c * WCOL) - b.x, // relative to building x
                y:   Math.round(startY + r * WROW),
                lit: Math.random() > 0.4,
            });
        }
    }
    return { ...b, y, color, windows };
});

const LAMPPOST_RX = [100, 242, 376]; // lamppost x within a tile

// ── Color interpolation ────────────────────────────────────────────────────
function lerpColor(a, b, t) {
    const ar=(a>>16)&0xff, ag=(a>>8)&0xff, ab=a&0xff;
    const br=(b>>16)&0xff, bg=(b>>8)&0xff, bb=b&0xff;
    return ((Math.round(ar+(br-ar)*t))<<16)|((Math.round(ag+(bg-ag)*t))<<8)|(Math.round(ab+(bb-ab)*t));
}

// ── Day/night phases (score-triggered) ────────────────────────────────────
// rainFreq: -1 = stop rain entirely
const PHASES = [
    { score:  0, name:'night',   skyTop:0x04040e, skyBot:0x16132e, groundTop:0x10101e, groundBot:0x08080e, horizonLine:0x4664b4, moonAlpha:1,   sunAlpha:0,   starsAlpha:1,   rainFreq:5  },
    { score: 15, name:'dawn',    skyTop:0x1a1228, skyBot:0x4a2818, groundTop:0x181018, groundBot:0x100808, horizonLine:0xdd6633, moonAlpha:0.4, sunAlpha:0.3, starsAlpha:0.3, rainFreq:14 },
    { score: 30, name:'morning', skyTop:0x2a4880, skyBot:0x7b4e2a, groundTop:0x1e1e18, groundBot:0x141410, horizonLine:0xff8855, moonAlpha:0,   sunAlpha:0.7, starsAlpha:0,   rainFreq:35 },
    { score: 50, name:'day',     skyTop:0x3399dd, skyBot:0x66bbff, groundTop:0x303028, groundBot:0x202018, horizonLine:0xffeedd, moonAlpha:0,   sunAlpha:1,   starsAlpha:0,   rainFreq:-1 },
];

// ── Godzilla tiers (score-unlocked) ───────────────────────────────────────
const GODZILLA_TIERS = [
    { scoreUnlock:0,  sizeScale:0.72, speed:0.7, bodyColor:0x2d5a1e, darkColor:0x1e4010, bellyCol:0x3a7228, fireColor:0xff5500, label:'small'  },
    { scoreUnlock:20, sizeScale:1.0,  speed:0.9, bodyColor:0x6b3a1e, darkColor:0x4a2510, bellyCol:0x8a4a28, fireColor:0xff8800, label:'medium' },
    { scoreUnlock:45, sizeScale:1.45, speed:1.3, bodyColor:0x2a1a4a, darkColor:0x18103a, bellyCol:0x3a2860, fireColor:0xaa00ff, label:'boss', isBoss:true },
];
