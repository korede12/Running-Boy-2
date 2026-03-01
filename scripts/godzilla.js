// ── Godzilla ──────────────────────────────────────────────────────────────
class Godzilla {
    constructor(scene, tierConfig) {
        this.scene      = scene;
        this.tierConfig = tierConfig;
        this.s          = tierConfig.sizeScale;
        this.x          = 530;          // world x (starts off right of screen)
        this.speed      = tierConfig.speed;
        this.walkPhase  = 0;
        this.state      = 'walking';
        this.stateTime  = 3500;
        this.STOMP_DUR  = 1000;
        this.gfx        = scene.add.graphics().setDepth(18);
        this.fireEmitter = null;
        this.dustEmitter = null;
        this.onRecycle   = null;  // set by GameScene for tier re-roll
        this.dangerRight = 90 * this.s;
        // Pre-allocated spike objects — mutated each draw instead of allocating per frame
        this._spikes = [
            {bx:0, by:0, h:28, w:12}, {bx:0, by:0, h:22, w:10},
            {bx:0, by:0, h:17, w: 9}, {bx:0, by:0, h:13, w: 8},
            {bx:0, by:0, h: 9, w: 6},
        ];
        this._spikeDx = [14, 16, 17, 18, 19];
        this._spikeDy = [-94, -79, -66, -53, -42];
    }

    initEmitters() {
        this.fireEmitter = this.scene.add.particles(0, 0, 'fire_particle', {
            lifespan: 550, speedX: { min: -420, max: -160 },
            speedY: { min: -65, max: 65 }, scale: { start: 1.2, end: 0 },
            alpha: { start: 0.9, end: 0 }, quantity: 4, frequency: 18,
            tint: this.tierConfig.fireColor,
        }).setDepth(32);
        this.fireEmitter.stop();

        this.dustEmitter = this.scene.add.particles(0, 0, 'dust_particle', {
            lifespan: 800, speedX: { min: -90, max: 90 },
            speedY: { min: -100, max: -30 }, gravityY: 220,
            scale: { start: 1.0, end: 0 }, alpha: { start: 0.6, end: 0 },
            quantity: 12, frequency: -1,
        }).setDepth(32);
    }

    update(dt, camX) {
        this.walkPhase += dt * 0.004;
        this.stateTime -= dt;

        if (this.state === 'walking') {
            this.x -= this.speed;
            if (this.stateTime <= 0) {
                Math.random() < 0.38 ? this._enterStomp() : this._enterAttack();
            }
        } else if (this.state === 'stomping') {
            if (this.stateTime <= 0) {
                this.state = 'walking';
                this.stateTime = Phaser.Math.Between(2500, 4500);
            }
        } else if (this.state === 'attacking') {
            this.x -= this.speed * 0.35;
            if (this.stateTime <= 0) {
                this.fireEmitter?.stop();
                this.state = 'walking';
                this.stateTime = Phaser.Math.Between(2000, 4000);
            }
        }

        // Recycle: when Godzilla scrolls off left edge, call onRecycle callback
        if (this.x < camX - 160) {
            if (this.onRecycle) {
                this.onRecycle();
            } else {
                this.x = camX + 530;
                this.state = 'walking';
                this.stateTime = Phaser.Math.Between(3000, 5000);
                this.fireEmitter?.stop();
            }
        }

        if (this.fireEmitter) {
            const s = this.s;
            this.fireEmitter.setPosition(Math.round(this.x) - 63 * s, GROUND_Y - 83 * s);
        }

        this.gfx.clear();
        this._draw();
    }

    _enterStomp() {
        this.state = 'stomping';
        this.stateTime = this.STOMP_DUR;
        this.scene.time.delayedCall(520, () => {
            this.scene.cameras.main.shake(350, 0.011);
            this.dustEmitter?.explode(14, Math.round(this.x), GROUND_Y - 4);
            this.scene.sound.play('snd_stomp', { volume: 0.5 });
        });
    }

    _enterAttack() {
        this.state = 'attacking';
        this.stateTime = Phaser.Math.Between(1800, 3000);
        this.fireEmitter?.start();
    }

    _draw() {
        const g    = this.gfx;
        const s    = this.s;
        const tc   = this.tierConfig;
        const x    = Math.round(this.x);
        const base = GROUND_Y;
        const attacking = this.state === 'attacking';
        const stomping  = this.state === 'stomping';
        const stompProgress = stomping ? 1 - this.stateTime / this.STOMP_DUR : 0;
        const stompLift = stomping ? Math.sin(stompProgress * Math.PI) * 10 * s : 0;
        const slamming  = stomping && stompProgress > 0.5;
        const bodyColor = slamming ? 0x5a1818 : tc.bodyColor;
        const darkColor = slamming ? 0x3d1010 : tc.darkColor;
        const bellyCol  = slamming ? 0x7a2828 : tc.bellyCol;
        const lp      = Math.sin(this.walkPhase * 3);
        const legLOff = Math.round(lp *  5 * s);
        const legROff = Math.round(-lp * 5 * s);
        const jawDrop = attacking ? (10 + Math.sin(this.walkPhase * 9) * 3) * s : 0;
        const tailWag = Math.sin(this.walkPhase) * 5 * s;

        // Shadow
        g.fillStyle(0x000000, 0.22);
        g.fillEllipse(x, base - 2 * s, 105 * s, 18 * s);

        // Tail
        g.fillStyle(darkColor, 1);
        g.beginPath();
        g.moveTo(x + 18*s, base - 35*s - stompLift);
        g.lineTo(x + 50*s, base - 21*s + tailWag);
        g.lineTo(x + 95*s, base - 10*s + tailWag * 0.4);
        g.lineTo(x + 98*s, base - 16*s + tailWag * 0.4);
        g.lineTo(x + 58*s, base - 29*s + tailWag);
        g.lineTo(x + 24*s, base - 42*s - stompLift);
        g.closePath(); g.fillPath();

        // Tail tip
        g.fillStyle(darkColor, 1);
        g.fillTriangle(
            x+90*s, base-13*s+tailWag*0.4,
            x+98*s, base-16*s+tailWag*0.4,
            x+105*s, base-9*s+tailWag*0.3
        );

        // Right leg
        g.fillStyle(darkColor, 1);
        const rlTop = base - 30*s + legROff - stompLift;
        g.fillRect(x + 2*s, rlTop, 18*s, base - rlTop);
        g.fillRect(x - 2*s, base - 7*s, 24*s, 7*s);

        // Body
        g.fillStyle(bodyColor, 1);
        g.beginPath();
        g.moveTo(x - 34*s, base - 35*s - stompLift);
        g.lineTo(x + 22*s, base - 35*s - stompLift);
        g.lineTo(x + 18*s, base - 94*s - stompLift);
        g.lineTo(x - 28*s, base - 92*s - stompLift);
        g.closePath(); g.fillPath();

        // Belly
        g.fillStyle(bellyCol, 1);
        g.beginPath();
        g.moveTo(x - 14*s, base - 36*s - stompLift);
        g.lineTo(x +  8*s, base - 36*s - stompLift);
        g.lineTo(x +  6*s, base - 86*s - stompLift);
        g.lineTo(x - 12*s, base - 85*s - stompLift);
        g.closePath(); g.fillPath();

        // Left leg
        g.fillStyle(bodyColor, 1);
        const llTop = base - 30*s + legLOff - stompLift;
        g.fillRect(x - 28*s, llTop, 18*s, base - llTop);
        g.fillRect(x - 33*s, base - 7*s, 28*s, 7*s);

        // Left claws
        g.fillStyle(darkColor, 1);
        g.fillTriangle(x-33*s, base-7*s, x-38*s, base+1*s, x-28*s, base-7*s);
        g.fillTriangle(x-21*s, base-7*s, x-23*s, base+1*s, x-16*s, base-7*s);
        g.fillTriangle(x- 8*s, base-7*s, x-10*s, base+1*s, x- 4*s, base-7*s);

        // Left arm
        g.fillStyle(bodyColor, 1);
        g.fillRect(x-38*s, base-72*s-stompLift, 12*s, 28*s);
        g.fillRect(x-44*s, base-55*s-stompLift, 20*s, 8*s);

        // Right arm
        g.fillStyle(darkColor, 1);
        g.fillRect(x+18*s, base-70*s-stompLift, 10*s, 22*s);
        g.fillRect(x+14*s, base-56*s-stompLift, 16*s, 7*s);

        // Spikes (base arrays scaled at draw time)
        const sb = base - stompLift;
        for (let si = 0; si < 5; si++) {
            this._spikes[si].bx = x + this._spikeDx[si] * s;
            this._spikes[si].by = sb + this._spikeDy[si] * s;
        }
        g.fillStyle(darkColor, 1);
        for (let si = 0; si < 5; si++) {
            const sp = this._spikes[si];
            g.fillTriangle(sp.bx - sp.w*s/2, sp.by, sp.bx + sp.w*s/2, sp.by, sp.bx, sp.by - sp.h*s);
        }
        if (attacking) {
            const pulse = 0.15 + 0.12 * Math.sin(this.walkPhase * 10);
            g.fillStyle(0x00ff66, pulse);
            for (let si = 0; si < 3; si++) {
                g.fillCircle(this._spikes[si].bx, this._spikes[si].by - 4*s, 7*s);
            }
        }

        // Head
        const hy = base - 92*s - stompLift;
        g.fillStyle(bodyColor, 1);
        g.beginPath();
        g.moveTo(x-26*s, hy); g.lineTo(x+14*s, hy);
        g.lineTo(x+10*s, hy-13*s); g.lineTo(x-18*s, hy-12*s);
        g.lineTo(x-62*s, hy-3*s); g.lineTo(x-68*s, hy+5*s);
        g.lineTo(x-60*s, hy+9*s); g.lineTo(x-24*s, hy+4*s);
        g.closePath(); g.fillPath();

        // Upper jaw line
        g.fillStyle(darkColor, 1);
        g.beginPath();
        g.moveTo(x-18*s, hy-9*s); g.lineTo(x-60*s, hy-1*s);
        g.lineTo(x-60*s, hy+2*s); g.lineTo(x-18*s, hy-5*s);
        g.closePath(); g.fillPath();

        // Lower jaw
        g.fillStyle(darkColor, 1);
        g.beginPath();
        g.moveTo(x-24*s, hy+4*s); g.lineTo(x-60*s, hy+9*s);
        g.lineTo(x-66*s, hy+13*s+jawDrop);
        g.lineTo(x-47*s, hy+17*s+jawDrop);
        g.lineTo(x-18*s, hy+12*s+jawDrop*0.4);
        g.lineTo(x-14*s, hy+7*s);
        g.closePath(); g.fillPath();

        // Teeth
        const toothCount = attacking ? 5 : 3;
        const toothH     = (attacking ? 7 : 4) * s;
        g.fillStyle(0xd8d8b0, 1);
        for (let t = 0; t < toothCount; t++) {
            const tx = x - 61*s + t * 10*s;
            g.fillTriangle(tx, hy+9*s, tx+8*s, hy+9*s, tx+4*s, hy+9*s+toothH);
        }
        if (attacking) {
            g.fillStyle(0xff6600, 0.35 + 0.15 * Math.sin(this.walkPhase * 8));
            g.beginPath();
            g.moveTo(x-62*s, hy+9*s); g.lineTo(x-18*s, hy+12*s);
            g.lineTo(x-47*s, hy+17*s+jawDrop);
            g.closePath(); g.fillPath();
        }

        // Boss: extra glow ring during attack
        if (tc.isBoss && attacking) {
            const cx = x - 8*s, cy = base - 65*s - stompLift;
            const pulse = 0.08 + 0.06 * Math.sin(this.walkPhase * 7);
            g.lineStyle(3*s, tc.fireColor, pulse * 2);
            g.strokeCircle(cx, cy, 40*s);
            g.fillStyle(tc.fireColor, pulse);
            g.fillCircle(cx, cy, 40*s);
        }

        // Eye
        const ex = x-46*s, ey = hy-1*s;
        g.fillStyle(0x00bb44, 0.35); g.fillCircle(ex, ey, 9*s);
        g.fillStyle(0x00ff77, 1);    g.fillCircle(ex, ey, 5*s);
        g.fillStyle(0x001100, 1);    g.fillCircle(ex-1*s, ey, 2*s);
    }
}
