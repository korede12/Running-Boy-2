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
const AIR_Y      = 255;  // head height for 'air' lane obstacles
const GRACE_Y    = 5;    // px shaved off an obstacle's top edge

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

    // Minimum hazards between two pickups, so wings never chain.
    static get PICKUP_COOLDOWN() { return 6; }

    _pick() {
        const roll = () => {
            let r = Math.random() * this.totalWeight;
            for (const o of this.set) {
                r -= (o.weight || 1);
                if (r <= 0) return o;
            }
            return this.set[this.set.length - 1];
        };

        const score = this.scene.score || 0;

        for (let attempt = 0; attempt < 6; attempt++) {
            const d = roll();
            // some entries are earned, not handed out at the start
            if (d.minScore !== undefined && score < d.minScore) continue;
            // never two pickups close together
            if (d.pickup &&
                (this.sinceLastPickup || 0) < ObstacleSpawner.PICKUP_COOLDOWN) continue;
            // and never the same thing twice in a row
            if (d.key === this.lastKey) continue;
            return d;
        }
        // fall back to something always available so a bad streak cannot stall
        return this.set.find(d => !d.pickup && d.minScore === undefined)
            || this.set[0];
    }

    _spawn(camX) {
        const def = this._pick();
        const x   = camX + GAME_W + 30;
        const lift = (def.shape && def.shape.yOffset) || 0;
        const y   = (def.lane === 'air' ? AIR_Y : GROUND_Y) - lift;

        let spr, h, w;
        if (def.sketch && typeof Doodle !== 'undefined') {
            // drawn once into its own graphics, then moved each frame
            h = PLAYER_H * def.shape.h;
            w = PLAYER_H * def.shape.w;
            spr = this.scene.add.graphics().setScrollFactor(0).setDepth(18);
            Doodle.shape(spr, def.key, 0, 0, w, h, (Math.random() * 97) | 0);
            spr.y = y;
        } else if (def.shape) {
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

        // Pickups must never be mistaken for a hazard: gold, outlined,
        // pulsing, and labelled.
        let label = null;
        if (def.pickup) {
            spr.setDepth(19);
            label = this.scene.add.text(0, y - h - 6, def.key.toUpperCase(), {
                fontSize: '11px', color: '#fff3b0',
                fontFamily: 'monospace', fontStyle: 'bold',
                stroke: '#6b5410', strokeThickness: 3,
            }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(19);
        }

        this.live.push({
            def, spr, label, x, y, h, w,
            frame: 0, frameTimer: 0,
            dodgeWindow: false, hit: false,
        });
        this.sinceLastPickup = def.pickup ? 0 : (this.sinceLastPickup || 0) + 1;
        this.lastKey = def.key;
    }

    _destroy(o) {
        o.spr.destroy();
        if (o.label) o.label.destroy();
    }

    /// Destroy breakable obstacles whose box overlaps [x0, x1] in screen
    /// space. Returns how many were broken, so the caller can score them.
    /// Anything not marked breakable is unaffected — that split is what
    /// makes each hazard a choice between punching and jumping.
    breakInZone(camX, x0, x1) {
        let broken = 0;
        for (let i = this.live.length - 1; i >= 0; i--) {
            const o = this.live[i];
            if (!o.def.breakable || o.broken) continue;
            const sx = o.x - camX;
            const left = sx - o.w / 2, right = sx + o.w / 2;
            if (right < x0 || left > x1) continue;
            o.broken = true;
            this._shatter(sx, o);
            this._destroy(o);
            this.live.splice(i, 1);
            broken++;
        }
        return broken;
    }

    /// A brief burst where the obstacle was, so a hit reads as a hit.
    _shatter(sx, o) {
        const g = this.scene.add.graphics().setScrollFactor(0).setDepth(19);
        const col = (o.def.shape && o.def.shape.color) || 0xffffff;
        const bits = [];
        for (let n = 0; n < 7; n++) {
            bits.push({
                x: sx, y: o.y - o.h * 0.5,
                vx: (Math.random() - 0.35) * 150,
                vy: -60 - Math.random() * 130,
                r: 2 + Math.random() * 3,
            });
        }
        const ev = this.scene.time.addEvent({
            delay: 16, repeat: 26,
            callback: () => {
                g.clear();
                const t = ev.getOverallProgress();
                g.fillStyle(col, 1 - t);
                bits.forEach(b => {
                    b.x += b.vx * 0.016;
                    b.y += b.vy * 0.016;
                    b.vy += 520 * 0.016;
                    g.fillCircle(b.x, b.y, b.r);
                });
                if (t >= 1) g.destroy();
            },
        });
    }

    reset() {
        this.live.forEach(o => this._destroy(o));
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
            if (sx < -80) { this._destroy(o); this.live.splice(i, 1); continue; }

            o.spr.x = sx;
            if (o.label) {
                // gentle pulse so a pickup reads as collectable, not solid
                o.label.x = sx;
                const pulse = 1 + Math.sin(sc.time.now / 180) * 0.10;
                o.spr.setScale(pulse, pulse);
            }

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
                const bob = Math.sin((sc.time.now + o.x) / 260) * 6;
                o.spr.y = o.y + bob;
                if (o.label) o.label.y = o.y - o.h - 6 + bob;
            }

            if (sc.isGameOver) continue;

            // ── overlap test on BOTH axes ─────────────────────────────────
            // Horizontal alone is not enough: an 'air' hazard sits at head
            // height and must be run under, while a ground hazard must be
            // jumped. Comparing the two vertical bands handles both without
            // caring which state the player is in.
            // Forgiving hitboxes: the collision box is inset from the art on
            // both axes, so a near-miss reads as a miss. Standard platformer
            // practice — without it the game feels like it cheats.
            const dx = sx - BOY_SCREEN_X;
            const reach = 6 + o.w * 0.40;
            const overlapX = dx > -reach && dx < reach + 12;

            // boy origin is (0.5, 1), so boy.y is his feet
            const boyTop = sc.boy.y - PLAYER_H * 0.82;   // ignore the head
            const obsTop = o.y - o.h + GRACE_Y;          // shave the top edge
            const overlapY = boyTop < o.y && sc.boy.y > obsTop;

            // ── Pickups are collected, not dodged ────────────────────────
            if (o.def.pickup) {
                if (overlapX && overlapY && !o.taken) {
                    o.taken = true;
                    this._destroy(o);
                    this.live.splice(i, 1);
                    sc._collectPickup(o.def.pickup);
                }
                continue;
            }

            if (!o.dodgeWindow && overlapX) o.dodgeWindow = true;

            // Any state except already-reeling can take a hit — a ground
            // hazard catches you running, an air one catches you mid-jump,
            // and a float keeps you level with the air lane.
            // A float landing is graced, so burning out directly above a
            // hazard is never an unavoidable hit.
            const graced = (sc.landGraceUntil || 0) > sc.time.now;
            const vulnerable = !graced && (sc.boyState === 'running' ||
                               sc.boyState === 'jumping' ||
                               sc.boyState === 'floating' ||
                               sc.boyState === 'attacking');
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
