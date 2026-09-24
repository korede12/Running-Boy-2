// ── Obstacle spawner ──────────────────────────────────────────────────────
// Drives the non-classic themes. Obstacles are placed in world space and the
// camera scrolls past them, so they need no per-frame movement of their own —
// the same approach Godzilla uses.
//
// Collision and scoring deliberately mirror _updatePterodactyls: a dodge
// window opens while the obstacle overlaps the player, closes when it passes,
// and scores only if the player was airborne during it.

const PLAYER_H   = 50;   // display height of the player sprite
// spawn just off the right edge, whatever the canvas width
const AIR_Y       = 255; // head height for 'air' lane obstacles

class ObstacleSpawner {

    static preload(scene, set) {
        set.forEach(o => (o.frames || []).forEach((f, i) => {
            scene.load.image(`obs_${o.key}_${i}`, f);
        }));
    }

    constructor(scene, set) {
        this.scene = scene;
        this.set   = set.filter(o => (o.frames && o.frames.length > 0) || o.shape);
        this.live  = [];
        this.nextGap = 0;
        this.totalWeight = this.set.reduce((s, o) => s + (o.weight || 1), 0);
    }

    // Distance the player must travel before the next obstacle appears.
    // Tightens as the score climbs, with a floor so it stays clearable.
    _gapFor(score) {
        const base = 320 - Math.min(160, score * 2.2);
        return Math.max(150, base) + Phaser.Math.Between(0, 90);
    }

    _pick() {
        let r = Math.random() * this.totalWeight;
        for (const o of this.set) {
            r -= (o.weight || 1);
            if (r <= 0) return o;
        }
        return this.set[this.set.length - 1];
    }

    _spawn(camX) {
        const def = this._pick();
        const x   = camX + GAME_W + 30;
        const y   = def.lane === 'air' ? AIR_Y : GROUND_Y;

        let spr, h, w;
        if (def.shape) {
            // placeholder geometry — reads clearly and needs no art
            h = PLAYER_H * def.shape.h;
            w = PLAYER_H * def.shape.w;
            spr = this.scene.add.rectangle(0, y, w, h, def.shape.color)
                .setOrigin(0.5, 1)
                .setScrollFactor(0)
                .setDepth(18);
            if (def.shape.stroke !== undefined) spr.setStrokeStyle(2, def.shape.stroke);
        } else {
            h = w = PLAYER_H * def.height;
            spr = this.scene.add.image(0, y, `obs_${def.key}_0`)
                .setOrigin(0.5, 1)
                .setScrollFactor(0)
                .setDepth(18);
            spr.setDisplaySize(h, h);   // Kenney art is square
        }

        this.live.push({
            def, spr, x, y, h, w,
            frame: 0, frameTimer: 0,
            dodgeWindow: false, hit: false,
        });
    }

    reset() {
        this.live.forEach(o => o.spr.destroy());
        this.live = [];
        this.nextGap = 0;
    }

    shutdown() { this.reset(); }

    update(delta, camX) {
        const sc = this.scene;
        if (!this.set.length) return;

        // ── spawn on distance travelled, not on a timer ───────────────────
        if (!sc.isGameOver) {
            if (this.nextGap <= 0) {
                this._spawn(camX);
                this.nextGap = this._gapFor(sc.score || 0);
            }
            this.nextGap -= (sc.scrollSpeed || SCROLL_SPEED);
        }

        for (let i = this.live.length - 1; i >= 0; i--) {
            const o = this.live[i];
            const sx = o.x - camX;

            // off the left edge — retire it
            if (sx < -80) { o.spr.destroy(); this.live.splice(i, 1); continue; }

            o.spr.x = sx;

            // frame animation
            if (!o.def.shape && o.def.fps > 0 && o.def.frames.length > 1) {
                o.frameTimer += delta;
                const step = 1000 / o.def.fps;
                if (o.frameTimer >= step) {
                    o.frameTimer -= step;
                    o.frame = (o.frame + 1) % o.def.frames.length;
                    o.spr.setTexture(`obs_${o.def.key}_${o.frame}`);
                }
            }
            if (o.def.lane === 'air') {
                o.spr.y = o.y + Math.sin((sc.time.now + o.x) / 260) * 6;
            }

            if (sc.isGameOver) continue;

            // ── overlap test on BOTH axes ─────────────────────────────────
            // Horizontal alone is not enough: an 'air' hazard sits at head
            // height and must be run under, while a ground hazard must be
            // jumped. Comparing the two vertical bands handles both without
            // caring which state the player is in.
            const dx = sx - BOY_SCREEN_X;
            const reach = 10 + o.w * 0.5;
            const overlapX = dx > -reach && dx < reach + 16;

            // boy origin is (0.5, 1), so boy.y is his feet
            const boyTop = sc.boy.y - PLAYER_H;
            const obsTop = o.y - o.h;
            const overlapY = boyTop < o.y && sc.boy.y > obsTop;

            if (!o.dodgeWindow && overlapX) o.dodgeWindow = true;

            // Any state except already-reeling can take a hit — a ground
            // hazard catches you running, an air one catches you mid-jump.
            const vulnerable = sc.boyState === 'running' || sc.boyState === 'jumping';
            if (overlapX && overlapY && vulnerable && !o.hit) {
                o.hit = true;
                sc._hitBoy();
            }

            // Cleared it — award the dodge on the way out.
            if (o.dodgeWindow && !overlapX) {
                if (!o.hit) sc._onDodge(o.def.lane === 'air' ? 2 : 1);
                o.dodgeWindow = false;
            }
        }
    }
}
