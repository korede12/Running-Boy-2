// ── Pterodactyl ───────────────────────────────────────────────────────────
class Pterodactyl {
    static GLIDE_Y         = 155;
    static SWOOP_Y         = 268;
    static SWOOP_TRIGGER_X = 280;

    constructor(scene, maxSwoopY = 268) {
        this.scene      = scene;
        const camX      = scene.cameras.main.scrollX;
        this.x          = camX + 520;   // world x
        this.maxSwoopY  = maxSwoopY;    // how low this pterodactyl swoops (score-scaled)
        this.swoopY     = Pterodactyl.GLIDE_Y;
        this.swoopState = 'gliding';
        this.swoopProg  = 0;
        this.wingPhase  = 0;
        this.speed      = 2.8;
        this.dead       = false;
        // Dodge tracking
        this.dodgeWindow    = false;
        this.dodgedInWindow = false;
        // Screen-space graphics (scrollFactor=0), drawn at screenX = this.x - camX
        this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(16);
    }

    update(delta, camX) {
        this.x -= this.speed;
        this.wingPhase += delta * 0.006;

        const screenX = this.x - camX;

        // Swoop state machine
        if (this.swoopState === 'gliding') {
            this.swoopY = Pterodactyl.GLIDE_Y;
            if (screenX < Pterodactyl.SWOOP_TRIGGER_X) {
                this.swoopState = 'swooping';
                this.swoopProg  = 0;
            }
        } else if (this.swoopState === 'swooping') {
            this.swoopProg += delta * 0.0008;
            if (this.swoopProg >= 1) {
                this.swoopProg  = 1;
                this.swoopState = 'recovering';
            }
            this.swoopY = Pterodactyl.GLIDE_Y + Math.sin(this.swoopProg * Math.PI) * (this.maxSwoopY - Pterodactyl.GLIDE_Y);
        } else if (this.swoopState === 'recovering') {
            this.swoopProg -= delta * 0.001;
            if (this.swoopProg <= 0) {
                this.swoopProg  = 0;
                this.swoopState = 'gliding';
            }
            this.swoopY = Pterodactyl.GLIDE_Y + Math.sin(this.swoopProg * Math.PI) * (this.maxSwoopY - Pterodactyl.GLIDE_Y);
        }

        if (this.x < camX - 160) {
            this.dead = true;
        }

        this.gfx.clear();
        if (!this.dead) {
            this._draw(screenX, this.swoopY);
        }
    }

    isAtDangerHeight() {
        // Only dangerous when close enough to ground to actually hit a running boy
        return this.swoopY > 255;
    }

    _draw(sx, sy) {
        const g  = this.gfx;
        const wf = Math.sin(this.wingPhase) * 18;

        // Body
        g.fillStyle(0x6b4a28, 1);
        g.fillEllipse(sx, sy, 40, 16);

        // Left wing (forward direction)
        g.fillStyle(0x5a3a1e, 1);
        g.fillTriangle(sx - 10, sy, sx - 55, sy - 20 - wf, sx - 30, sy + 4);
        // Membrane detail
        g.fillStyle(0x4a2e16, 0.6);
        g.fillTriangle(sx - 10, sy, sx - 55, sy - 20 - wf, sx - 40, sy - 5 - wf * 0.4);

        // Right wing (trailing)
        g.fillStyle(0x5a3a1e, 1);
        g.fillTriangle(sx + 10, sy, sx + 50, sy - 18 - wf * 0.8, sx + 28, sy + 4);

        // Head
        g.fillStyle(0x6b4a28, 1);
        g.fillCircle(sx - 22, sy - 2, 8);

        // Beak
        g.fillStyle(0xcc9944, 1);
        g.fillTriangle(sx - 28, sy - 4, sx - 42, sy, sx - 28, sy + 2);

        // Eye — yellow iris + black pupil
        g.fillStyle(0xffdd00, 1); g.fillCircle(sx - 25, sy - 4, 3);
        g.fillStyle(0x000000, 1); g.fillCircle(sx - 25, sy - 4, 1.5);

        // Tail
        g.fillStyle(0x5a3a1e, 1);
        g.fillTriangle(sx + 18, sy - 2, sx + 38, sy - 8, sx + 18, sy + 4);
    }

    destroy() {
        this.gfx.destroy();
    }
}
