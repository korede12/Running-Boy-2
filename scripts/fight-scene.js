// ── Fight mode ────────────────────────────────────────────────────────────
// One-on-one on a Lagos street, best of three. The other modes are about
// avoiding things; this one is about range — every attack has a reach and a
// recovery, so stepping in is a commitment and whiffing is punishable.
//
// Blocks come in two heights and attacks come in two heights, which is the
// whole defensive game: a sweep beats a standing block, everything else beats
// a crouching one, and jumping escapes both at the cost of landing committed.

class FightScene extends Phaser.Scene {

    static ROUNDS_TO_WIN = 2;
    static ROUND_SECONDS = 60;
    static ARENA_X0      = 70;
    static ARENA_X1      = GAME_W - 70;
    static START_GAP     = 190;

    constructor() { super({ key: 'FightScene' }); }

    preload() {
        // Drives the boot bar; the creep hands over to real progress here.
        if (typeof Boot !== 'undefined') Boot.attach(this);
        this.load.spritesheet('fightsheet', 'assets/fight/fight_sheet.png',
            { frameWidth: 256, frameHeight: 256 });
        this.load.audio('snd_hit',      'sounds/hit-sound-in-game.mp3');
        this.load.audio('snd_block',    'sounds/shock-with-vibration.mp3');
        this.load.audio('snd_jump',     'sounds/game-scene-jumping-floor-sound-effect-material.mp3');
        this.load.audio('snd_ko',       'sounds/freesound_community-game-over-arcade-6435.mp3');
        this.load.audio('snd_round',    'sounds/the-sound-of-getting-a-bonus-or-extra-life-in-an-arcade-game.mp3');
        this.load.audio('snd_click',    'sounds/single-click.mp3');
    }

    create() {
        this.gBg  = this.add.graphics().setDepth(0);
        this.gFx  = this.add.graphics().setDepth(30);
        this.gHud = this.add.graphics().setDepth(50).setScrollFactor(0);

        const blockedUntil = RunStore.checkLaunchCooldown();
        if (blockedUntil) { this.isBlocked = true; this._showCooldown(blockedUntil); return; }

        Fighter.defineAnims(this);
        this._drawArena();

        this.roundsWon = { p: 0, c: 0 };
        this.matchOver = false;
        this.round     = 0;

        this._buildHud();
        this._bindInput();
        this._startRound();
    }

    // ── Arena ─────────────────────────────────────────────────────────────

    _drawArena() {
        const g = this.gBg, H = FIGHT_GROUND_Y;
        g.clear();

        // The wall has to clear the fighters' heads, or they read as giants
        // standing over a row of doll houses.
        const WALL_H = 196;
        g.fillGradientStyle(0x9ab4cc, 0x9ab4cc, 0xe3d7b4, 0xe3d7b4, 1);
        g.fillRect(0, 0, GAME_W, H - WALL_H + 2);

        // Sun through the haze, same hour of the day as the chase.
        g.fillStyle(0xfff2cc, 0.5); g.fillCircle(GAME_W * 0.74, 56, 30);
        g.fillStyle(0xfff2cc, 0.85); g.fillCircle(GAME_W * 0.74, 56, 15);

        // A far skyline, then the street the fight happens in front of.
        g.fillStyle(0x8d94a0, 0.40);
        const far = [[0, 44], [46, 28], [84, 58], [140, 34], [190, 50], [246, 30],
                     [292, 62], [350, 38], [398, 52], [452, 30], [500, 46],
                     [556, 60], [612, 34], [664, 50], [720, 40], [772, 56]];
        for (const [x, h] of far) g.fillRect(x, H - WALL_H - h, 40, h);

        const WALL = [0x8a5a34, 0x7d5130, 0x6f4a2c];
        for (let i = 0, x = -20; x < GAME_W + 40; i++, x += 96) {
            g.fillStyle(WALL[i % WALL.length], 1);
            g.fillRect(x, H - WALL_H, 92, WALL_H);
            g.fillStyle(0x9aa0a4, 1);                        // zinc roof strip
            g.fillRect(x - 4, H - WALL_H - 7, 100, 9);
            g.fillStyle(0x6f767b, 1);
            g.fillRect(x - 4, H - WALL_H + 2, 100, 4);
            if (i % 2 === 0) {
                g.fillStyle(0x1a1a1c, 1);                    // a doorway
                g.fillRect(x + 28, H - 74, 36, 74);
                g.fillStyle(0x2b3a44, 1);                    // and a window above
                g.fillRect(x + 22, H - 150, 48, 34);
            } else {
                g.fillStyle(0x2b3a44, 1);
                g.fillRect(x + 18, H - 118, 56, 36);
                g.fillStyle(0x1a1a1c, 1);
                g.fillRect(x + 30, H - 56, 32, 56);
                g.fillStyle(0xc8912e, 1);                    // a painted shutter
                g.fillRect(x + 14, H - 172, 64, 14);
            }
        }

        // Road, kerb, and a worn centre line to read movement against.
        g.fillStyle(0xb39a74, 1); g.fillRect(0, H - 6, GAME_W, 8);
        g.fillStyle(0x3c3c3f, 1); g.fillRect(0, H, GAME_W, GAME_H - H);
        g.fillStyle(0x343436, 1);
        for (let x = 0; x < GAME_W; x += 64) g.fillRect(x, H + 26, 38, 5);
        g.fillStyle(0x2a2a2c, 0.5);
        g.fillRect(0, H, GAME_W, 3);
    }

    // ── Round flow ────────────────────────────────────────────────────────

    _startRound() {
        this.round++;
        const mid = GAME_W / 2, gap = FightScene.START_GAP;

        if (this.player) { this.player.sprite.destroy(); this.cpu.sprite.destroy(); }
        this.player = new Fighter(this, mid - gap / 2,  1, { name: RunStore.playerName() });
        this.cpu    = new Fighter(this, mid + gap / 2, -1,
            { name: 'OPPONENT', cpu: true, tint: 0x7a8ca8 });

        // Each round the opponent reacts faster and hesitates less.
        const step  = Math.min(2, this.round - 1);
        this.ai = {
            next: 0,
            react:   400 - step * 62,
            aggro:   0.40 + step * 0.10,
            guard:   0.30 + step * 0.09,
            pressure: 0,
        };

        this.roundEndsAt = this.time.now + FightScene.ROUND_SECONDS * 1000;
        this.phase = 'intro';
        this.phaseUntil = this.time.now + 1400;
        this._banner(`ROUND ${this.round}`, 0xffcc22);
        this.sound.play('snd_round', { volume: 0.4 });
        this.time.delayedCall(900, () => {
            if (this.phase === 'intro') this._banner('FIGHT!', 0xff4444);
        });
    }

    _endRound(winner) {
        if (this.phase !== 'fight') return;
        this.phase = 'over';
        this.phaseUntil = this.time.now + 2200;
        this.roundsWon[winner]++;
        this.sound.play('snd_ko', { volume: 0.55 });
        this._banner(winner === 'p' ? 'K.O.' : 'YOU LOSE', winner === 'p' ? 0x66dd66 : 0xff4444);
        this.cameras.main.shake(260, 0.012);
    }

    _advance() {
        const R = FightScene.ROUNDS_TO_WIN;
        if (this.roundsWon.p >= R || this.roundsWon.c >= R) this._matchOver();
        else this._startRound();
    }

    _matchOver() {
        this.matchOver = true;
        this.phase = 'match';
        const won = this.roundsWon.p > this.roundsWon.c;

        // The fight mode keeps its own record: its scores are rounds, not
        // metres, so putting them on the shared board would mix two scales.
        let best = 0;
        try {
            best = parseInt(localStorage.getItem('runningboy_fight_best')) || 0;
            if (won) { best += 1; localStorage.setItem('runningboy_fight_best', best); }
            else localStorage.setItem('runningboy_fight_best', 0);
        } catch (_) {}
        this.streak = best;

        // Beating Portable is a purse; losing is the night.
        if (typeof Player !== 'undefined' && Player.exists()) {
            this.purse = Player.payForFight(won, Player.cityId());
            Player.passTime(3);
        }

        // A lost match costs a play, the same as losing a run does.
        if (!won) {
            const blockedUntil = RunStore.recordLossAndCheck();
            if (blockedUntil) { this._showCooldown(blockedUntil); return; }
        }
        this._showResult(won);
    }

    // ── Input ─────────────────────────────────────────────────────────────

    _bindInput() {
        this.keys = this.input.keyboard.addKeys({
            left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN',
            a: 'A', d: 'D', w: 'W', s: 'S',
            punch: 'Z', kick: 'X', punch2: 'J', kick2: 'K', space: 'SPACE',
        });
        this.pad = { left: 0, right: 0, up: 0, down: 0, punch: 0, kick: 0, sweepPad: 0 };
        this._buildTouch();
    }

    /// Thumb controls, since the game is played on a phone more than a desk.
    _buildTouch() {
        const mk = (x, y, r, label, key, col) => {
            const z = this.add.circle(x, y, r, col, 0.22).setDepth(60)
                .setScrollFactor(0).setInteractive({ useHandCursor: true });
            const t = this.add.text(x, y, label, {
                fontSize: r > 26 ? '15px' : '13px', color: '#ffffff',
                fontFamily: 'monospace', fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(61).setScrollFactor(0);
            const set = v => { this.pad[key] = v; z.setFillStyle(col, v ? 0.5 : 0.22); };
            z.on('pointerdown', () => set(1));
            z.on('pointerup',   () => set(0));
            z.on('pointerout',  () => set(0));
            return { z, t };
        };
        const B = GAME_H - 56;
        mk(46,  B,      25, '◀', 'left',  0xffffff);
        mk(122, B,      25, '▶', 'right', 0xffffff);
        mk(84,  B - 44, 23, '▲', 'up',    0xffffff);
        mk(84,  B + 30, 23, '▼', 'down',  0xffffff);
        mk(GAME_W - 110, B,      29, 'P',   'punch',    0xffcc22);
        mk(GAME_W - 44,  B,      29, 'K',   'kick',     0xff6644);
        mk(GAME_W - 77,  B - 50, 25, 'LOW', 'sweepPad', 0x66aaff);
    }

    _readPlayer(now) {
        const k = this.keys, p = this.pad, f = this.player;
        const down = key => key.isDown;

        const left  = down(k.left)  || down(k.a) || p.left;
        const right = down(k.right) || down(k.d) || p.right;
        const up    = down(k.up)    || down(k.w) || p.up;
        const duck  = down(k.down)  || down(k.s) || p.down;

        // Holding away from the opponent guards, the genre's convention: you
        // still walk backwards while you do it, so defence costs you ground
        // rather than freezing you in place.
        const away = f.facing === 1 ? left : right;
        f.crouch(!!duck);
        if (up) f.jump();
        f.walk(left ? -1 : right ? 1 : 0);
        f.block(!!away);

        const J = Phaser.Input.Keyboard.JustDown;
        const punch = J(k.punch) || J(k.punch2) || p.punch === 1;
        const kick  = J(k.kick)  || J(k.kick2)  || J(k.space) || p.kick === 1;
        const low   = p.sweepPad === 1;

        if (punch) { this._fire(f, f.airborne ? 'air' : (duck ? 'sweep' : 'punch')); p.punch = 0; }
        if (kick)  { this._fire(f, f.airborne ? 'air' : (duck ? 'sweep' : 'kick'));  p.kick  = 0; }
        if (low)   { this._fire(f, 'sweep'); p.sweepPad = 0; }
    }

    _fire(f, name) {
        if (f.attack(name)) this.sound.play('snd_jump', { volume: 0.12, rate: 1.6 });
    }

    // ── The opponent ──────────────────────────────────────────────────────
    // Deliberately readable: it closes, it attacks from its own range, and it
    // guards when it sees a swing. An opponent that reacted instantly would
    // be unbeatable and no fun; the delay is the difficulty.

    _updateAI(now) {
        const me = this.cpu, you = this.player, ai = this.ai;
        if (me.busy || this.phase !== 'fight') return;

        const dist = Math.abs(you.x - me.x);
        const dir  = you.x > me.x ? 1 : -1;

        // Guard on sight of a committed attack, not on its landing.
        const swinging = you.state === 'attack' && dist < 150;
        if (swinging && Math.random() < ai.guard) {
            me.crouch(you.move && you.move.height === 'low');
            me.block(true);
            me.walk(0);
            return;
        }
        me.block(false);

        if (now < ai.next) return;
        ai.next = now + ai.react + Math.random() * 180;

        if (dist > 138) { me.crouch(false); me.walk(dir); return; }
        if (dist < 58)  { me.walk(-dir); return; }

        me.walk(0);
        const r = Math.random();
        if (r > ai.aggro) { me.crouch(false); return; }      // sometimes just waits

        if (you.airborne)        this._fire(me, 'kick');
        else if (r < ai.aggro * 0.28) this._fire(me, 'sweep');
        else if (dist > 104)     this._fire(me, 'kick');
        else if (r < ai.aggro * 0.62) this._fire(me, 'punch');
        else                     this._fire(me, 'heavy');
    }

    // ── Loop ──────────────────────────────────────────────────────────────

    update(time, delta) {
        if (this.isBlocked || this.matchOver) return;
        const dt = Math.min(0.05, delta / 1000);
        const now = this.time.now;

        if (this.phase === 'intro' && now >= this.phaseUntil) this.phase = 'fight';
        if (this.phase === 'over'  && now >= this.phaseUntil) { this._advance(); return; }

        if (this.phase === 'fight') {
            this._readPlayer(now);
            this._updateAI(now);
        } else {
            this.player.walk(0); this.cpu.walk(0);
        }

        const bounds = { x0: FightScene.ARENA_X0, x1: FightScene.ARENA_X1 };
        this.player.update(dt, now, this.cpu.x, bounds);
        this.cpu.update(dt, now, this.player.x, bounds);
        this._separate();

        if (this.phase === 'fight') {
            this._resolve(this.player, this.cpu, now);
            this._resolve(this.cpu, this.player, now);

            if (this.cpu.health    <= 0) this._endRound('p');
            else if (this.player.health <= 0) this._endRound('c');
            else if (now >= this.roundEndsAt) {
                this._endRound(this.player.health >= this.cpu.health ? 'p' : 'c');
            }
        }
        this._drawHud(now);
    }

    /// Fighters push each other rather than overlapping, so range stays honest.
    _separate() {
        const a = this.player, b = this.cpu;
        const min = FIGHTER.BODY_W * 0.86;
        const d = b.x - a.x;
        if (Math.abs(d) >= min) return;
        const push = (min - Math.abs(d)) / 2 * Math.sign(d || 1);
        a.x -= push; b.x += push;
        a.x = Phaser.Math.Clamp(a.x, FightScene.ARENA_X0, FightScene.ARENA_X1);
        b.x = Phaser.Math.Clamp(b.x, FightScene.ARENA_X0, FightScene.ARENA_X1);
    }

    _resolve(attacker, defender, now) {
        const box = attacker.hitbox(now);
        if (!box) return;
        const hb = defender.hurtbox();
        if (box.x1 < hb.x0 || box.x0 > hb.x1) return;
        if (box.y1 < hb.y0 || box.y0 > hb.y1) return;

        attacker.hitThisMove = true;
        const result = defender.takeHit(box.move, attacker.facing, now);
        const px = (attacker.x + defender.x) / 2;
        const py = FIGHT_GROUND_Y - defender.y - 70;

        if (result === 'blocked') {
            this.sound.play('snd_block', { volume: 0.25 });
            this._spark(px, py, 0x88bbff, 'BLOCK');
        } else {
            this.sound.play('snd_hit', { volume: 0.5 });
            this._spark(px, py, 0xffdd44, box.move.damage >= 10 ? 'BIG' : '');
            this.cameras.main.shake(box.move.damage >= 10 ? 160 : 90, 0.006);
        }
    }

    _spark(x, y, col, label) {
        const g = this.add.graphics().setDepth(31);
        g.fillStyle(col, 0.9);
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            g.fillCircle(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 5);
        }
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });

        if (!label) return;
        const t = this.add.text(x, y - 16, label, {
            fontSize: '13px', color: '#ffffff', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(32);
        this.tweens.add({ targets: t, y: y - 42, alpha: 0, duration: 520,
                          onComplete: () => t.destroy() });
    }

    // ── HUD ───────────────────────────────────────────────────────────────

    _buildHud() {
        const mono = { fontFamily: 'monospace' };
        this.nameL = this.add.text(16, 26, RunStore.playerName(), {
            ...mono, fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
        }).setDepth(51);
        this.nameR = this.add.text(GAME_W - 16, 26, 'OPPONENT', {
            ...mono, fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
        }).setOrigin(1, 0).setDepth(51);
        this.clock = this.add.text(GAME_W / 2, 14, '60', {
            ...mono, fontSize: '22px', color: '#ffcc22', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5, 0).setDepth(51);

        this.hint = this.add.text(GAME_W / 2, GAME_H - 14,
            'Z punch   X kick   ↓+Z sweep   hold away to block', {
            ...mono, fontSize: '10px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(51);
        this.tweens.add({ targets: this.hint, alpha: 0, delay: 5000, duration: 900,
                          onComplete: () => this.hint.destroy() });
    }

    _drawHud(now) {
        const g = this.gHud;
        g.clear();
        const W = GAME_W / 2 - 60, H = 13;

        const bar = (x, frac, flip) => {
            g.fillStyle(0x140808, 0.85); g.fillRect(x, 10, W, H);
            const w = Math.max(0, Math.round(W * frac));
            g.fillStyle(frac > 0.5 ? 0x4ccc5a : frac > 0.22 ? 0xddaa22 : 0xdd3322, 1);
            g.fillRect(flip ? x + W - w : x, 10, w, H);
            g.lineStyle(1, 0x000000, 0.7); g.strokeRect(x, 10, W, H);
        };
        bar(16, this.player.health / FIGHTER.HEALTH, false);
        bar(GAME_W - 16 - W, this.cpu.health / FIGHTER.HEALTH, true);

        // Round pips, so the match score is readable without a number.
        for (let i = 0; i < FightScene.ROUNDS_TO_WIN; i++) {
            g.fillStyle(i < this.roundsWon.p ? 0xffcc22 : 0x443322, 1);
            g.fillCircle(16 + 7 + i * 17, 32, 5);
            g.fillStyle(i < this.roundsWon.c ? 0xffcc22 : 0x443322, 1);
            g.fillCircle(GAME_W - 16 - 7 - i * 17, 32, 5);
        }

        if (this.phase === 'fight') {
            const left = Math.max(0, Math.ceil((this.roundEndsAt - now) / 1000));
            this.clock.setText(String(left));
            this.clock.setColor(left <= 10 ? '#ff4444' : '#ffcc22');
        }
    }

    _banner(text, col) {
        const t = this.add.text(GAME_W / 2, 150, text, {
            fontSize: '40px', color: '#' + col.toString(16).padStart(6, '0'),
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(70).setScale(0.6);
        this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.out' });
        this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 420,
                          onComplete: () => t.destroy() });
    }

    // ── End screens ───────────────────────────────────────────────────────

    _overlay() {
        const ol = this.add.graphics().setDepth(100).setScrollFactor(0);
        ol.fillStyle(0x000000, 0.80);
        ol.fillRect(0, 0, GAME_W, GAME_H);
        return ol;
    }

    _showResult(won) {
        this._overlay();
        this.add.text(GAME_W / 2, 96, won ? 'YOU WIN' : 'DEFEAT', {
            fontSize: '36px', color: won ? '#66dd66' : '#ff4444',
            fontFamily: 'monospace', fontStyle: 'bold', stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(101);

        this.add.text(GAME_W / 2, 146,
            `Rounds ${this.roundsWon.p} – ${this.roundsWon.c}` +
            (won ? `    ·    +${this.purse || 0} skubu` : ''), {
            fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(101);

        this.add.text(GAME_W / 2, 206, 'Click or SPACE to fight again', {
            fontSize: '13px', color: '#aab', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(101);

        this._menuLink(254);
        this.input.keyboard.once('keydown-SPACE', () => this.scene.restart());
        this.input.once('pointerdown', () => this.scene.restart());
    }

    _menuLink(y) {
        const link = this.add.text(GAME_W / 2, y, '[ MENU ]', {
            fontSize: '14px', color: '#66aaff', fontFamily: 'monospace',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(101).setInteractive({ useHandCursor: true });
        link.on('pointerdown', () => { window.location.href = 'index.html'; });
        return link;
    }

    /// Shared with every other mode, so no mode is a way around the gate.
    _showCooldown(resetAt) {
        this.matchOver = true;
        this._overlay();
        this.add.text(GAME_W / 2, 100, 'OUT OF PLAYS', {
            fontSize: '24px', color: '#ff4444', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(101);

        const clock = this.add.text(GAME_W / 2, 150, '', {
            fontSize: '28px', color: '#ffcc22', fontFamily: 'monospace',
            stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(101);

        const tick = () => {
            const ms = Math.max(0, resetAt - Date.now());
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            clock.setText(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            if (ms <= 0) window.location.reload();
        };
        tick();
        this.time.addEvent({ delay: 1000, loop: true, callback: tick });
        this._menuLink(210);
    }
}
