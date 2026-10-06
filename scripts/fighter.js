// ── Fighter ───────────────────────────────────────────────────────────────
// One combatant in the fight mode: a state machine driving the 18-frame sheet
// drawn from the notebook page.
//
// Attacks are described in milliseconds rather than in frames — startup,
// active, recovery — because that is what the player actually feels, and it
// keeps the timing readable when the art changes. A hit only lands during the
// active window, so every attack can be walked into or punished, and nothing
// is decided by which picture happens to be showing.

// Sheet indices are zero-based; the sheet's own numbering is one higher.
const FIGHT_ANIM = {
    idle:   { frames: [3, 15],          fps: 3,  repeat: -1 },
    walk:   { frames: [15, 3],          fps: 6,  repeat: -1 },
    jump:   { frames: [5],              fps: 1,  repeat: 0  },
    fall:   { frames: [4],              fps: 1,  repeat: 0  },
    crouch: { frames: [9],              fps: 1,  repeat: 0  },
    block:  { frames: [13],             fps: 1,  repeat: 0  },
    punch:  { frames: [15, 17, 16, 3],  fps: 14, repeat: 0  },
    heavy:  { frames: [4, 14, 2, 3],    fps: 10, repeat: 0  },
    kick:   { frames: [11, 10, 3],      fps: 11, repeat: 0  },
    sweep:  { frames: [8, 12, 9],       fps: 11, repeat: 0  },
    air:    { frames: [5, 0, 6],        fps: 10, repeat: 0  },
    hurt:   { frames: [4],              fps: 1,  repeat: 0  },
    ko:     { frames: [12],             fps: 1,  repeat: 0  },
};

// reach/height are measured from the fighter's own centre, in world pixels.
// `low` must be blocked crouching, `high` standing — which is the whole
// reason to have two blocks rather than one.
const FIGHT_MOVES = {
    punch: { anim: 'punch', startup: 90,  active: 90,  recovery: 130,
             damage: 6,  reach: 92,  top: 150, bottom: 62, height: 'high',
             push: 10, hitstun: 240 },

    heavy: { anim: 'heavy', startup: 190, active: 110, recovery: 260,
             damage: 13, reach: 118, top: 165, bottom: 70, height: 'high',
             push: 26, hitstun: 400 },

    kick:  { anim: 'kick',  startup: 150, active: 120, recovery: 220,
             damage: 10, reach: 128, top: 130, bottom: 40, height: 'high',
             push: 20, hitstun: 330 },

    sweep: { anim: 'sweep', startup: 140, active: 110, recovery: 280,
             damage: 9,  reach: 112, top: 54,  bottom: 0,  height: 'low',
             push: 14, hitstun: 300, knockdown: true },

    air:   { anim: 'air',   startup: 80,  active: 260, recovery: 60,
             damage: 11, reach: 108, top: 150, bottom: 30, height: 'air',
             push: 18, hitstun: 340 },
};

const FIGHT_GROUND_Y = 336;   // the street the fighters stand on

const FIGHTER = {
    SPEED:       168,     // px/sec walking
    JUMP_V:      560,
    GRAVITY:     1500,
    HEALTH:      100,
    BODY_W:      62,      // hurtbox
    STAND_H:     152,
    CROUCH_H:    92,
    BLOCK_CHIP:  0.18,    // share of damage that gets through a block
    SCALE:       0.95,
};

class Fighter {

    /// `skin` tints the sheet, so a second fighter costs no second sheet.
    constructor(scene, x, facing, opts = {}) {
        this.scene  = scene;
        this.x      = x;
        this.y      = 0;              // height above the floor
        this.vy     = 0;
        this.facing = facing;         // 1 = right, -1 = left
        this.health = FIGHTER.HEALTH;
        this.name   = opts.name || 'FIGHTER';
        this.isCPU  = !!opts.cpu;

        this.state     = 'idle';
        this.move      = null;        // the attack in progress
        this.moveStart = 0;
        this.hitThisMove = false;
        this.stunUntil = 0;
        this.blocking  = false;
        this.crouching = false;

        this.sprite = scene.add.sprite(x, FIGHT_GROUND_Y, 'fightsheet', 3)
            .setOrigin(0.5, 1)
            .setScale(FIGHTER.SCALE)
            .setDepth(20);
        if (opts.tint) this.sprite.setTint(opts.tint);
        this.play('idle');
    }

    play(key) {
        if (this._anim === key) return;
        this._anim = key;
        this.sprite.play('f_' + key, true);
    }

    get busy() {
        return this.state === 'attack' || this.state === 'hurt' || this.state === 'ko';
    }

    get airborne() { return this.y > 0.5; }

    // ── Intent ────────────────────────────────────────────────────────────
    // Nothing here commits unless the fighter is free to act, so the AI and
    // the player go through exactly the same gate.

    walk(dir) {
        // Crouching wins over walking, or ducking while nudging the stick
        // would stand the fighter back up a frame later.
        if (this.busy || this.airborne || this.crouching) return;
        if (dir === 0) { this.play('idle'); this.walking = 0; return; }
        this.walking = dir;
        this.play('walk');
    }

    jump() {
        if (this.busy || this.airborne) return;
        this.crouching = false;
        this.vy = FIGHTER.JUMP_V;
        this.play('jump');
    }

    crouch(on) {
        if (this.busy || this.airborne) return;
        this.crouching = on;
        this.walking = 0;
        if (on) this.play('crouch');
        else if (this._anim === 'crouch') this.play('idle');
    }

    block(on) {
        if (this.busy || this.airborne) { this.blocking = false; return; }
        this.blocking = on;
        if (on) this.play(this.crouching ? 'crouch' : 'block');
    }

    attack(name) {
        if (this.busy) return false;
        // The air attack is the only one available off the ground, and the
        // only one unavailable on it — which is what makes jumping in a
        // decision rather than a free extra button.
        if (this.airborne !== (name === 'air')) return false;

        const m = FIGHT_MOVES[name];
        if (!m) return false;
        this.state       = 'attack';
        this.move        = m;
        this.moveKey     = name;
        this.moveStart   = this.scene.time.now;
        this.hitThisMove = false;
        this.blocking    = false;
        this.walking     = 0;
        this.play(m.anim);
        return true;
    }

    // ── Being hit ─────────────────────────────────────────────────────────

    /// Returns 'hit', 'blocked', or null if it missed on height.
    takeHit(move, fromDir, now) {
        const facingIt = this.facing === -fromDir;
        // A block only works if it is the right height for the attack and the
        // fighter is turned towards it.
        const guarded = this.blocking && facingIt && !this.airborne &&
            (move.height === 'low' ? this.crouching : !this.crouching);

        const dmg = guarded ? move.damage * FIGHTER.BLOCK_CHIP : move.damage;
        this.health = Math.max(0, this.health - dmg);

        this.x += fromDir * (guarded ? move.push * 0.5 : move.push);

        if (this.health <= 0) {
            this.state = 'ko';
            this.play('ko');
            this.vy = 0;
            return 'ko';
        }
        if (!guarded) {
            this.state     = 'hurt';
            this.stunUntil = now + move.hitstun;
            this.move      = null;
            this.play('hurt');
            if (move.knockdown) this.play('ko');
        }
        return guarded ? 'blocked' : 'hit';
    }

    /// The attack's reach, as a world rectangle, or null when not active.
    hitbox(now) {
        const m = this.move;
        if (this.state !== 'attack' || !m || this.hitThisMove) return null;
        const t = now - this.moveStart;
        if (t < m.startup || t > m.startup + m.active) return null;
        const front = this.x + this.facing * (FIGHTER.BODY_W / 2);
        return {
            x0: Math.min(front, front + this.facing * m.reach),
            x1: Math.max(front, front + this.facing * m.reach),
            y0: this.y + m.bottom,
            y1: this.y + m.top,
            move: m,
        };
    }

    hurtbox() {
        const h = this.crouching && !this.airborne ? FIGHTER.CROUCH_H : FIGHTER.STAND_H;
        return {
            x0: this.x - FIGHTER.BODY_W / 2, x1: this.x + FIGHTER.BODY_W / 2,
            y0: this.y, y1: this.y + h,
        };
    }

    // ── Per frame ─────────────────────────────────────────────────────────

    update(dt, now, foeX, bounds) {
        if (this.state === 'ko') { this._settle(dt); this._draw(); return; }

        if (this.state === 'hurt' && now >= this.stunUntil) {
            this.state = 'idle';
            this.play('idle');
        }

        if (this.state === 'attack') {
            const m = this.move;
            if (now - this.moveStart >= m.startup + m.active + m.recovery) {
                this.state = 'idle';
                this.move  = null;
                this.play(this.airborne ? 'fall' : 'idle');
            }
        }

        // Turn to face the opponent, but never mid-attack: being able to
        // swivel during an active hitbox would make crossing up meaningless.
        if (!this.busy) this.facing = foeX >= this.x ? 1 : -1;

        if (this.walking && !this.busy && !this.airborne && !this.crouching) {
            this.x += this.walking * FIGHTER.SPEED * dt;
        }

        this._settle(dt);
        this.x = Phaser.Math.Clamp(this.x, bounds.x0, bounds.x1);
        this._draw();
    }

    _settle(dt) {
        if (this.airborne || this.vy > 0) {
            this.vy -= FIGHTER.GRAVITY * dt;
            this.y  += this.vy * dt;
            if (this.y <= 0) {
                this.y = 0; this.vy = 0;
                if (this.state === 'attack') { this.state = 'idle'; this.move = null; }
                if (this.state !== 'ko' && this.state !== 'hurt') this.play('idle');
            } else if (this.state !== 'attack' && this.state !== 'ko') {
                this.play(this.vy > 0 ? 'jump' : 'fall');
            }
        }
    }

    _draw() {
        this.sprite.x = Math.round(this.x);
        this.sprite.y = Math.round(FIGHT_GROUND_Y - this.y);
        this.sprite.setFlipX(this.facing === -1);
    }

    /// Register every animation once, on whichever scene loads the sheet.
    static defineAnims(scene) {
        for (const [key, a] of Object.entries(FIGHT_ANIM)) {
            const id = 'f_' + key;
            if (scene.anims.exists(id)) continue;
            scene.anims.create({
                key: id,
                frames: a.frames.map(f => ({ key: 'fightsheet', frame: f })),
                frameRate: a.fps,
                repeat: a.repeat,
            });
        }
    }
}
