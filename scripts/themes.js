// ── Themes ────────────────────────────────────────────────────────────────
// A theme bundles a playable character with the obstacle set that matches its
// art style. Choosing a character therefore chooses the whole look of the run,
// which keeps every theme internally consistent instead of mixing styles.
//
// `frames` supplies the run/idle animation. Two shapes are supported:
//   sequence — numbered files, e.g. run_00..run_24 (the original art)
//   pair     — a two-frame walk cycle (Kenney-style packs)
//
// `obstacles` lists what the spawner may throw at the player. Each entry gives
// the sprite(s), how it sits on the ground, and how it behaves.

const THEMES = {

    skeleton: {
        label: 'Skeleton',
        preview: 'assets/skeleton-01_run_01start_00.png',
        credit: null,
        frames: {
            type: 'sequence',
            run:  { path: i => `assets/skeleton-01_run_01start_${i}.png`, count: 25, fps: 15 },
            idle: { path: i => `assets/skeleton-00_idle_${i}.png`,        count: 21, fps: 12 },
        },
        obstacles: 'classic',   // Godzilla + pterodactyls, as originally built
    },

    kolu: {
        label: 'Kolu',
        preview: 'assets/kolu_frames/run_00.png',
        credit: null,
        frames: {
            type: 'sequence',
            run:  { path: i => `assets/kolu_frames/run_${i}.png`,  count: 25, fps: 15 },
            idle: { path: i => `assets/kolu_frames/idle_${i}.png`, count: 21, fps: 12 },
        },
        // Lagos street/slum backdrop — art pending, see assets/kolu_bg/
        background: {
            sky:      'assets/kolu_bg/sky_lagos.png',
            ground:   'assets/kolu_bg/ground_dirt.png',
            skyScale: 1.0,
            parallax: 0.35,
            pending:  true,   // skip until the art exists
        },
        obstacles: 'street',    // log, bottles, fire, dog, police — art pending
    },

    kenney_green: {
        label: 'Sprout',
        preview: 'assets/kenney/char/green_idle.png',
        credit: 'Kenney (kenney.nl) — CC0',
        // Tiled background replaces the procedural night-city sky.
        background: {
            sky:      'assets/kenney/bg/sky_hills.png',
            ground:   'assets/kenney/bg/ground_grass.png',
            skyScale: 1.6,   // how much the sky art is zoomed
            parallax: 0.35,  // sky drift relative to the ground
        },
        frames: {
            type: 'pair',
            run:  { a: 'assets/kenney/char/green_walk_a.png',
                    b: 'assets/kenney/char/green_walk_b.png', fps: 10 },
            idle: { a: 'assets/kenney/char/green_idle.png',
                    b: 'assets/kenney/char/green_idle.png',   fps: 2 },
            jump: 'assets/kenney/char/green_jump.png',
            hit:  'assets/kenney/char/green_hit.png',
        },
        obstacles: 'platformer',
    },

    kenney_purple: {
        label: 'Plum',
        preview: 'assets/kenney/char/purple_idle.png',
        credit: 'Kenney (kenney.nl) — CC0',
        background: {
            sky:      'assets/kenney/bg/sky_desert.png',
            ground:   'assets/kenney/bg/ground_sand.png',
            skyScale: 1.6,
            parallax: 0.35,
        },
        frames: {
            type: 'pair',
            run:  { a: 'assets/kenney/char/purple_walk_a.png',
                    b: 'assets/kenney/char/purple_walk_b.png', fps: 10 },
            idle: { a: 'assets/kenney/char/purple_idle.png',
                    b: 'assets/kenney/char/purple_idle.png',   fps: 2 },
            jump: 'assets/kenney/char/purple_jump.png',
            hit:  'assets/kenney/char/purple_hit.png',
        },
        obstacles: 'platformer',
    },
};

// ── Obstacle sets ─────────────────────────────────────────────────────────
// ground: sits on the floor and must be jumped.
// air:    flies at head height and must be ducked under or jumped between.
// height is a rough share of the player's height, used for the collision box.

const OBSTACLE_SETS = {

    platformer: [
        { key: 'saw',    frames: ['assets/kenney/obstacles/saw_a.png',
                                  'assets/kenney/obstacles/saw_b.png'],
          fps: 12, lane: 'ground', height: 0.55, weight: 3 },

        { key: 'spikes', frames: ['assets/kenney/obstacles/block_spikes.png'],
          fps: 0,  lane: 'ground', height: 0.45, weight: 4 },

        { key: 'slime',  frames: ['assets/kenney/obstacles/slime_normal_walk_a.png',
                                  'assets/kenney/obstacles/slime_normal_walk_b.png'],
          fps: 6,  lane: 'ground', height: 0.40, weight: 3 },

        { key: 'plank',  frames: ['assets/kenney/obstacles/block_plank.png'],
          fps: 0,  lane: 'ground', height: 0.35, weight: 2 },

        { key: 'snail',  frames: ['assets/kenney/obstacles/snail_walk_a.png'],
          fps: 0,  lane: 'ground', height: 0.35, weight: 2 },

        { key: 'bee',    frames: ['assets/kenney/obstacles/bee_a.png',
                                  'assets/kenney/obstacles/bee_b.png'],
          fps: 10, lane: 'air',    height: 0.50, weight: 2 },

        { key: 'frog',   frames: ['assets/kenney/obstacles/frog_idle.png'],
          fps: 0,  lane: 'ground', height: 0.45, weight: 1 },
        // ── Pickup ────────────────────────────────────────────────────
        // Not a hazard. Jump into it to earn a float.
        { key: 'wings', frames: [], lane: 'air', height: 0.34, weight: 1,
          pickup: 'float', shape: { w: 0.80, h: 0.34, color: 0xf3e29a, stroke: 0xb99b3a } },
    ],

    // Lagos street chase. Drawn as flat shapes until the art exists — each
    // one is a distinct colour and silhouette so they read apart instantly.
    // `width`/`height` are multiples of the player's height.
    street: [
        { key: 'log',     frames: [], lane: 'ground', weight: 4,
          shape: { w: 1.30, h: 0.34, color: 0x6b4423, stroke: 0x3f2814 } },

        { key: 'bottles', frames: [], lane: 'ground', weight: 3,
          shape: { w: 0.55, h: 0.26, color: 0x2f7d4f, stroke: 0x17422a } },

        { key: 'fire',    frames: [], lane: 'ground', weight: 2,
          shape: { w: 0.60, h: 0.62, color: 0xe8632a, stroke: 0x7d2f0e } },

        { key: 'dog',     frames: [], lane: 'ground', weight: 2,
          shape: { w: 0.85, h: 0.46, color: 0x8a6a3a, stroke: 0x4a3720 } },

        { key: 'tyre',    frames: [], lane: 'ground', weight: 2,
          shape: { w: 0.52, h: 0.52, color: 0x2b2b30, stroke: 0x0d0d10 } },

        { key: 'crate',   frames: [], lane: 'ground', weight: 2,
          shape: { w: 0.62, h: 0.58, color: 0xa87f46, stroke: 0x5c4423 } },

        { key: 'wire',    frames: [], lane: 'air',    weight: 2,
          shape: { w: 1.10, h: 0.16, color: 0x555560, stroke: 0x2a2a30 } },
        // ── Pickup ────────────────────────────────────────────────────
        // Not a hazard. Jump into it to earn a float.
        { key: 'wings', frames: [], lane: 'air', height: 0.34, weight: 1,
          pickup: 'float', shape: { w: 0.80, h: 0.34, color: 0xf3e29a, stroke: 0xb99b3a } },
    ],
};

function getTheme(id) { return THEMES[id] || THEMES.skeleton; }
function getObstacles(id) { return OBSTACLE_SETS[getTheme(id).obstacles] || []; }
