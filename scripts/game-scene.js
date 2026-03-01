// ── GameScene ─────────────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {

    preload() {
        for (let i = 0; i < TOTAL_FRAMES; i++) {
            const p = String(i).padStart(2,'0');
            this.load.image(`run_${p}`, `assets/skeleton-01_run_01start_${p}.png`);
        }
        for (let i = 0; i <= 20; i++) {
            const p = String(i).padStart(2,'0');
            this.load.image(`idle_${p}`, `assets/skeleton-00_idle_${p}.png`);
        }
    }

    create() {
        // ── Play-limit gate (runs once per page load, not on scene restart) ──
        this.isBlocked = false;
        if (!_playConsumedThisSession) {
            if (!this._checkAndConsumePlay()) {
                this.isBlocked = true;
                return;
            }
        }

        // ── Game state ────────────────────────────────────────────────────
        this.isGameOver      = false;
        this.score           = 0;
        this.lives           = 5;
        this.skubuCount      = (() => {
            try { return parseInt(localStorage.getItem('runningboy_skubu')) || 0; }
            catch { return 0; }
        })();
        this.nextSkubuAt     = SKUBU_INTERVAL;
        this.dodgeWindow     = false;
        this.dodgedInWindow  = false;
        this.isCharging      = false;
        this.chargeStartTime = 0;

        // ── Phase / background state ───────────────────────────────────────
        this.currentPhase      = 0;
        this.dayProgress       = 0.0;
        this.targetDayProgress = 0.0;
        this.lastSkyDraw       = -1;

        // ── Pterodactyl state ──────────────────────────────────────────────
        this.pterodactyls      = [];
        this.pterodactylTimer  = 0;

        this._makeTextures();

        // ── Fixed background layers (scrollFactor=0) ──────────────────────
        this._drawSky();
        this._drawMoon();
        this._drawSun();
        this._addStars();

        // ── Scrolling world (cleared + redrawn each frame) ─────────────────
        this.worldGfx = this.add.graphics().setDepth(6);

        // ── Fixed ground (scrollFactor=0, drawn OVER world so horizon is sharp)
        this._drawGround();

        // ── Godzilla (world space) ─────────────────────────────────────────
        this.godzilla = new Godzilla(this, GODZILLA_TIERS[0]);
        this.godzilla.onRecycle = () => this._respawnGodzilla();

        // ── Boy (fixed to screen) ──────────────────────────────────────────
        this._addBoy();
        this._addBoyEffects();

        // ── Rain (fixed, atmospheric) ──────────────────────────────────────
        this._addRain();

        // ── Fire / dust emitters (world space, highest depth so they clear rain)
        this.godzilla.initEmitters();

        // ── HUD ───────────────────────────────────────────────────────────
        this._addUI();
    }

    // ── Texture generation ────────────────────────────────────────────────
    _makeTextures() {
        // Free old generated textures before recreating — prevents GPU leak on restart
        ['raindrop', 'star', 'fire_particle', 'dust_particle'].forEach(k => {
            if (this.textures.exists(k)) this.textures.remove(k);
        });

        const rd = this.make.graphics({ add: false });
        rd.lineStyle(1, 0x99bbff, 0.8);
        rd.lineBetween(0, 0, Math.round(12 * RAIN_ANGLE), 12);
        rd.generateTexture('raindrop', Math.ceil(12 * RAIN_ANGLE) + 2, 14);
        rd.destroy();

        const sg = this.make.graphics({ add: false });
        sg.fillStyle(0xffffff, 1);
        sg.fillCircle(2, 2, 2);
        sg.generateTexture('star', 5, 5);
        sg.destroy();

        // White fire particle — tinted per Godzilla tier via emitter.setTint()
        const fg = this.make.graphics({ add: false });
        fg.fillStyle(0xffffff, 0.25); fg.fillCircle(7,7,7);
        fg.fillStyle(0xffffff, 0.65); fg.fillCircle(7,7,4);
        fg.fillStyle(0xffffff, 1);    fg.fillCircle(7,7,2);
        fg.generateTexture('fire_particle', 14, 14);
        fg.destroy();

        const dg = this.make.graphics({ add: false });
        dg.fillStyle(0xaaa090, 0.7); dg.fillCircle(4,4,4);
        dg.generateTexture('dust_particle', 9, 9);
        dg.destroy();
    }

    // ── Static layers (scrollFactor = 0) ──────────────────────────────────
    _drawSky() {
        this.skyGfx = this.add.graphics().setScrollFactor(0).setDepth(0);
        this._redrawSky();
    }

    _redrawSky() {
        const p = this.dayProgress;
        const idxA = Math.min(Math.floor(p * 3), 2);
        const idxB = Math.min(idxA + 1, 3);
        const t    = (p * 3) - idxA;
        const pA   = PHASES[idxA], pB = PHASES[idxB];
        const skyTop = lerpColor(pA.skyTop, pB.skyTop, t);
        const skyBot = lerpColor(pA.skyBot, pB.skyBot, t);
        this.skyGfx.clear();
        this.skyGfx.fillGradientStyle(skyTop, skyTop, skyBot, skyBot, 1);
        this.skyGfx.fillRect(0, 0, 400, GROUND_Y);
    }

    _drawMoon() {
        const mx = 338, my = 46, mr = 17;
        this.moonGfx = this.add.graphics().setScrollFactor(0).setDepth(3);
        [40, 28, 16].forEach((r, i) => {
            this.moonGfx.fillStyle(0xc8e0ff, 0.04 + i * 0.03);
            this.moonGfx.fillCircle(mx, my, mr + r);
        });
        this.moonGfx.fillStyle(0xcddff5, 1);
        this.moonGfx.fillCircle(mx, my, mr);
        // Initial alpha from phase 0
        this.moonGfx.setAlpha(PHASES[0].moonAlpha);
    }

    _drawSun() {
        const sx = 338, sy = 46, sr = 17;
        this.sunGfx = this.add.graphics().setScrollFactor(0).setDepth(4).setAlpha(0);
        [40, 28, 16].forEach((r, i) => {
            this.sunGfx.fillStyle(0xffdd44, 0.04 + i * 0.03);
            this.sunGfx.fillCircle(sx, sy, sr + r);
        });
        this.sunGfx.fillStyle(0xfffacc, 1);
        this.sunGfx.fillCircle(sx, sy, sr);
    }

    _addStars() {
        this.starObjects = [];
        for (let i = 0; i < 70; i++) {
            const star = this.add.image(
                Phaser.Math.Between(0, 400),
                Phaser.Math.Between(0, Math.floor(GROUND_Y * 0.65)),
                'star'
            )
            .setScrollFactor(0).setDepth(5)
            .setScale(Phaser.Math.FloatBetween(0.2, 0.9))
            .setAlpha(Phaser.Math.FloatBetween(0.3, 0.7));

            this.tweens.add({
                targets: star,
                alpha: { from: Phaser.Math.FloatBetween(0.1,0.4), to: Phaser.Math.FloatBetween(0.6,1.0) },
                duration: Phaser.Math.Between(800, 3000),
                yoyo: true, repeat: -1,
                delay: Phaser.Math.Between(0, 2500),
                ease: 'Sine.easeInOut',
            });

            this.starObjects.push(star);
        }
    }

    // Fixed ground gradient + horizon line (drawn over world so horizon is clean)
    _drawGround() {
        this.groundGfx = this.add.graphics().setScrollFactor(0).setDepth(12);
        this._redrawGround();
    }

    _redrawGround() {
        const p = this.dayProgress;
        const idxA = Math.min(Math.floor(p * 3), 2);
        const idxB = Math.min(idxA + 1, 3);
        const t    = (p * 3) - idxA;
        const pA   = PHASES[idxA], pB = PHASES[idxB];
        const gTop  = lerpColor(pA.groundTop,   pB.groundTop,   t);
        const gBot  = lerpColor(pA.groundBot,   pB.groundBot,   t);
        const hLine = lerpColor(pA.horizonLine, pB.horizonLine, t);
        this.groundGfx.clear();
        this.groundGfx.fillGradientStyle(gTop, gTop, gBot, gBot, 1);
        this.groundGfx.fillRect(0, GROUND_Y, 400, 400 - GROUND_Y);
        this.groundGfx.lineStyle(1, hLine, 0.35);
        this.groundGfx.lineBetween(0, GROUND_Y, 400, GROUND_Y);
    }

    // ── World (buildings + lampposts + puddles, tiled, redrawn each frame) ─
    _updateWorld(camX) {
        const g = this.worldGfx;
        g.clear();

        // Which tile indices are visible? Draw 3 tiles for safety.
        const tileStart = Math.floor(camX / TILE_W) - 1;

        for (let t = tileStart; t <= tileStart + 3; t++) {
            const off = t * TILE_W;  // world x offset for this tile

            // ── Building bodies ──────────────────────────────────────────
            for (const b of BUILDINGS) {
                const bx = off + b.x;
                if (bx + b.width < camX - 10 || bx > camX + 410) continue;
                g.fillStyle(b.color, 1);
                g.fillRect(bx, b.y, b.width, b.height);
            }

            // ── Roofs ────────────────────────────────────────────────────
            g.fillStyle(0x0a0a10, 1);
            for (const b of BUILDINGS) {
                const bx = off + b.x;
                if (bx + b.width < camX - 10 || bx > camX + 410) continue;
                g.fillTriangle(
                    bx - 2,             b.y,
                    bx + b.width / 2,   b.y - 24,
                    bx + b.width + 2,   b.y
                );
            }

            // ── Windows ──────────────────────────────────────────────────
            for (const b of BUILDINGS) {
                const bx = off + b.x;
                if (bx + b.width < camX - 10 || bx > camX + 410) continue;
                for (const w of b.windows) {
                    if (w.lit) {
                        g.fillStyle(0xffcc55, 0.12);
                        g.fillRect(bx + w.rx - 3, w.y - 3, 14, 14);
                        g.fillStyle(0xffcc55, 1);
                    } else {
                        g.fillStyle(0x090c16, 1);
                    }
                    g.fillRect(bx + w.rx, w.y, 8, 8);
                }
            }

            // ── Lampposts + puddles ──────────────────────────────────────
            for (const lrx of LAMPPOST_RX) {
                const topX = off + lrx + 12;
                const topY = GROUND_Y - 82;
                if (topX < camX - 60 || topX > camX + 460) continue;

                // Ambient halo
                [45, 30, 15].forEach((r, i) => {
                    g.fillStyle(0xffd250, 0.04 + i * 0.04);
                    g.fillCircle(topX, topY, r);
                });

                // Pole + arm
                g.lineStyle(2.5, 0x363646, 1);
                g.beginPath();
                g.moveTo(off + lrx, GROUND_Y);
                g.lineTo(off + lrx, topY);
                g.lineTo(topX, topY);
                g.strokePath();

                // Bulb
                g.fillStyle(0xffe070, 1);
                g.fillCircle(topX, topY, 4);

                // Puddle reflection
                [3, 2, 1].forEach(i => {
                    g.fillStyle(0xffc840, 0.04 * i);
                    g.fillEllipse(topX, GROUND_Y + 12, 70 / i, 18 / i);
                });
            }
        }
    }

    // ── Phase management ──────────────────────────────────────────────────
    _updatePhase() {
        const newPhase = PHASES.reduce((acc, p, i) => this.score >= p.score ? i : acc, 0);
        if (newPhase !== this.currentPhase) {
            this.currentPhase = newPhase;
            this._transitionToPhase(newPhase);
        }
    }

    _transitionToPhase(idx) {
        const phase = PHASES[idx];

        // Tween moon / sun alpha
        this.tweens.add({ targets: this.moonGfx, alpha: phase.moonAlpha, duration: 1500 });
        this.tweens.add({ targets: this.sunGfx,  alpha: phase.sunAlpha,  duration: 1500 });

        // Tween stars (kill existing individual tweens, then fade to target)
        this.starObjects.forEach((star, i) => {
            this.tweens.killTweensOf(star);
            const targetAlpha = phase.starsAlpha > 0 ? phase.starsAlpha * 0.5 : 0;
            this.tweens.add({
                targets: star, alpha: targetAlpha,
                duration: 1200, delay: i * 8,
                ease: 'Sine.easeInOut',
            });
        });

        // Drive sky/ground interpolation
        this.targetDayProgress = idx / 3;

        // Update rain
        if (phase.rainFreq === -1) {
            this.rainEmitter.stop();
        } else {
            this.rainEmitter.start();
            this.rainEmitter.setFrequency(phase.rainFreq);
        }
    }

    _updateBackground() {
        if (Math.abs(this.dayProgress - this.targetDayProgress) > 0.001) {
            this.dayProgress = Phaser.Math.Linear(this.dayProgress, this.targetDayProgress, 0.003);
            if (Math.abs(this.dayProgress - this.lastSkyDraw) > 0.008) {
                this._redrawSky();
                this._redrawGround();
                this.lastSkyDraw = this.dayProgress;
            }
        }
    }

    // ── Boy ───────────────────────────────────────────────────────────────
    _addBoy() {
        const runFrames = Array.from({ length: TOTAL_FRAMES }, (_, i) => ({
            key: `run_${String(i).padStart(2,'0')}`,
        }));
        this.anims.create({ key: 'run', frames: runFrames, frameRate: 15, repeat: -1 });

        const idleFrames = Array.from({ length: 21 }, (_, i) => ({
            key: `idle_${String(i).padStart(2,'0')}`,
        }));
        this.anims.create({ key: 'idle', frames: idleFrames, frameRate: 12, repeat: -1 });

        this.boy = this.add.sprite(BOY_SCREEN_X, GROUND_Y, 'run_00')
            .setOrigin(0.5, 1)
            .setDisplaySize(50, 50)
            .setScrollFactor(0)
            .setDepth(20)
            .play('run');

        this.boyState = 'running'; // 'running' | 'jumping' | 'hit' | 'dazed'
        this.boyVelX  = 0;
        this.boyVelY  = 0;
        this.boyAngle = 0;
    }

    // ── Boy jump effects ──────────────────────────────────────────────────
    _addBoyEffects() {
        // Dust burst used on takeoff and landing
        this.jumpDust = this.add.particles(BOY_SCREEN_X, GROUND_Y, 'dust_particle', {
            lifespan: 520,
            speedX: { min: -100, max: 100 },
            speedY: { min: -85, max: -10 },
            gravityY: 280,
            scale: { start: 1.4, end: 0 },
            alpha: { start: 0.75, end: 0 },
            quantity: 12,
            frequency: -1,
        }).setScrollFactor(0).setDepth(21);

        // Ghost trail sprites (sample the boy's position history while airborne)
        this.trailSprites = Array.from({ length: 5 }, () =>
            this.add.sprite(BOY_SCREEN_X, GROUND_Y, 'idle_00')
                .setOrigin(0.5, 1)
                .setDisplaySize(50, 50)
                .setScrollFactor(0)
                .setDepth(17)
                .setAlpha(0)
        );
        this.trailHistory = [];

        // Glow / aura (charge + airborne energy)
        this.boyGlow = this.add.graphics().setScrollFactor(0).setDepth(19);
    }

    // ── Rain ──────────────────────────────────────────────────────────────
    _addRain() {
        this.rainEmitter = this.add.particles(0, -20, 'raindrop', {
            x: { min: -30, max: 430 },
            speedX: { min: 50, max: 95 }, speedY: { min: 200, max: 380 },
            lifespan: 1800, frequency: PHASES[0].rainFreq, quantity: 2,
            alpha: { start: 0.55, end: 0.1 },
        }).setScrollFactor(0).setDepth(28);
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    _addUI() {
        const playerName = (() => {
            try { return (localStorage.getItem('runningboy_name') || '').toUpperCase(); } catch { return ''; }
        })();

        this.scoreText = this.add.text(10, 10, 'Score: 0', {
            fontSize: '16px', color: '#ffffff',
            fontFamily: 'monospace', stroke: '#000000', strokeThickness: 3,
        }).setScrollFactor(0).setDepth(50);

        if (playerName) {
            this.add.text(10, 30, playerName, {
                fontSize: '10px', color: '#4488aa',
                fontFamily: 'monospace', stroke: '#000000', strokeThickness: 2,
            }).setScrollFactor(0).setDepth(50);
        }

        const btnGfx = this.add.graphics().setScrollFactor(0).setDepth(50);
        btnGfx.fillStyle(0x112244, 0.85);
        btnGfx.fillRoundedRect(282, 368, 96, 24, 7);
        btnGfx.lineStyle(1.5, 0x4488ff, 0.8);
        btnGfx.strokeRoundedRect(282, 368, 96, 24, 7);

        this.add.text(330, 380, 'JUMP', {
            fontSize: '13px', color: '#88bbff',
            fontFamily: 'monospace', fontStyle: 'bold',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(51);

        this.add.text(330, 360, 'hold to charge', {
            fontSize: '9px', color: '#445566', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(51);

        this.chargeBar = this.add.graphics().setScrollFactor(0).setDepth(52);

        this.input.on('pointerdown', () => this._startJumpCharge());
        this.input.on('pointerup',   () => this._releaseJump());

        const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        spaceKey.on('down', () => this._startJumpCharge());
        spaceKey.on('up',   () => this._releaseJump());

        this._addSkubuBar();
        this._addLivesDisplay();
    }

    // ── Skubu bar ─────────────────────────────────────────────────────────
    _addSkubuBar() {
        this.skubuLabel = this.add.text(10, 46, `✦ SKUBU: ${this.skubuCount}`, {
            fontSize: '8px', color: '#ccaa44', fontFamily: 'monospace',
        }).setScrollFactor(0).setDepth(50);

        this.skubuBarGfx = this.add.graphics().setScrollFactor(0).setDepth(51);
    }

    _addLivesDisplay() {
        this.livesText = this.add.text(390, 10, '', {
            fontSize: '13px', color: '#cc3355', fontFamily: 'monospace',
        }).setScrollFactor(0).setDepth(50).setOrigin(1, 0);
        this._updateLivesDisplay();
    }

    _updateLivesDisplay() {
        let str = '';
        for (let i = 0; i < 5; i++) str += i < this.lives ? '♥' : '♡';
        this.livesText.setText(str);
        this.livesText.setColor(this.lives <= 1 ? '#ff2244' : '#cc3355');
    }

    _updateSkubuBar() {
        this.skubuBarGfx.clear();
        const t = (this.score % SKUBU_INTERVAL) / SKUBU_INTERVAL;
        this.skubuBarGfx.fillStyle(0x221100, 0.85);
        this.skubuBarGfx.fillRoundedRect(10, 56, 80, 6, 3);
        this.skubuBarGfx.fillStyle(t > 0.85 ? 0xffee55 : 0xddaa22, 0.9);
        this.skubuBarGfx.fillRoundedRect(10, 56, Math.round(80 * t), 6, 3);
        this.skubuBarGfx.lineStyle(0.5, 0x886600, 0.5);
        this.skubuBarGfx.strokeRoundedRect(10, 56, 80, 6, 3);
    }

    // ── Score helper ──────────────────────────────────────────────────────
    _addScore(amount) {
        this.score += amount;
        this.scoreText.setText(`Score: ${this.score}`);
        this._showScorePopup(amount);
        this._checkSkubuMilestone();
    }

    _checkSkubuMilestone() {
        if (this.score >= this.nextSkubuAt) {
            this.nextSkubuAt += SKUBU_INTERVAL;
            this._awardSkubu();
        }
    }

    _awardSkubu() {
        try {
            this.skubuCount += 1;
            localStorage.setItem('runningboy_skubu', this.skubuCount);
        } catch (_) {}
        this.skubuLabel.setText(`✦ SKUBU: ${this.skubuCount}`);
        this._showSkubuSplash();
    }

    _showSkubuSplash() {
        const bg = this.add.graphics().setScrollFactor(0).setDepth(80);
        bg.fillStyle(0x000000, 0.55);
        bg.fillRect(0, 145, 400, 80);

        const title = this.add.text(200, 165, '✦  SKUBU!  ✦', {
            fontSize: '28px', color: '#ffcc22', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#442200', strokeThickness: 4,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(81);

        const sub = this.add.text(200, 200, 'keep going!', {
            fontSize: '11px', color: '#aa8844', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(81);

        const objs = [bg, title, sub];
        objs.forEach(o => o.setAlpha(0));
        this.tweens.add({
            targets: objs, alpha: 1, duration: 280,
            onComplete: () => {
                this.tweens.add({
                    targets: objs, alpha: 0, duration: 1400, delay: 700,
                    onComplete: () => objs.forEach(o => o.destroy()),
                });
            },
        });
    }

    // ── Jump ──────────────────────────────────────────────────────────────
    _startJumpCharge() {
        if (this.isGameOver || this.boyState !== 'running' || this.isCharging) return;
        this.isCharging      = true;
        this.chargeStartTime = this.time.now;
    }

    _releaseJump() {
        if (!this.isCharging) return;
        this.isCharging = false;
        if (this.boyState !== 'running' || this.isGameOver) return;
        const t       = Math.min((this.time.now - this.chargeStartTime) / 700, 1);
        this.boyVelY  = Phaser.Math.Linear(-220, -530, t);
        this.boyState = 'jumping';
        this.boy.play('idle');
        this.chargeBar.clear();

        // Takeoff dust burst
        this.jumpDust.setPosition(BOY_SCREEN_X, GROUND_Y);
        this.jumpDust.explode(Math.round(8 + t * 10));

        // Stretch upward on launch (squish horizontally)
        const sx = this.boy.scaleX, sy = this.boy.scaleY;
        this.tweens.add({
            targets: this.boy,
            scaleX: sx * 0.68,
            scaleY: sy * 1.38,
            duration: 70,
            yoyo: true,
            ease: 'Power2',
            onComplete: () => { this.boy.scaleX = sx; this.boy.scaleY = sy; },
        });
    }

    // ── Collision result ──────────────────────────────────────────────────
    _hitBoy() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.isCharging = false;
        this.boyState   = 'hit';
        this.boyVelX    = -260;
        this.boyVelY    = -480;
        this.boyAngle   = 0;
        this.boy.setFlipX(true);
        this.boy.play('idle');
        this.cameras.main.shake(280, 0.014);
        this.cameras.main.flash(100, 255, 180, 80, false);
    }

    _landBoy() {
        this.boy.y    = GROUND_Y;
        this.boyVelX  = 0;
        this.boyVelY  = 0;
        this.boy.setAngle(0);
        this.boyState = 'dazed';
        this.boy.play('idle');
        this.lives -= 1;
        this._updateLivesDisplay();
        if (this.lives > 0) {
            this.time.delayedCall(600, () => this._revive());
        } else {
            this.time.delayedCall(600, () => this._trySkubuContinue());
        }
    }

    _revive() {
        this.isGameOver = false;
        this.boyState   = 'running';
        this.boy.setFlipX(false);
        this.boy.x = BOY_SCREEN_X;
        this.boy.y = GROUND_Y;
        this.boy.setAngle(0);
        this.boy.play('run');
        this.trailHistory = [];

        this.godzilla.x         = this.cameras.main.scrollX + 600;
        this.godzilla.state     = 'walking';
        this.godzilla.stateTime = 3000;

        this.pterodactyls.forEach(pt => pt.destroy());
        this.pterodactyls     = [];
        this.pterodactylTimer = 3000;

        this.cameras.main.flash(200, 255, 255, 255, false);
    }

    _trySkubuContinue() {
        if (this.skubuCount > 0) {
            this._showContinueScreen();
        } else {
            this._gameOver();
        }
    }

    _showContinueScreen() {
        const objs = [];
        const add  = o => { objs.push(o); return o; };

        const bg = add(this.add.graphics().setScrollFactor(0).setDepth(90));
        bg.fillStyle(0x000000, 0.80);
        bg.fillRoundedRect(50, 120, 300, 165, 10);
        bg.lineStyle(1.5, 0x886600, 0.8);
        bg.strokeRoundedRect(50, 120, 300, 165, 10);

        add(this.add.text(200, 145, 'OUT OF LIVES', {
            fontSize: '20px', color: '#ff4444',
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 3,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(91));

        add(this.add.text(200, 182, 'Spend 1 skubu to continue?', {
            fontSize: '11px', color: '#ccaa44', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(91));

        add(this.add.text(200, 200, `You have: ${this.skubuCount} skubu`, {
            fontSize: '11px', color: '#aa8844', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(91));

        add(this.add.text(200, 237, '[ CONTINUE ]', {
            fontSize: '14px', color: '#ffcc22',
            fontFamily: 'monospace', fontStyle: 'bold',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(91)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#ffee66'); })
          .on('pointerout',  function() { this.setColor('#ffcc22'); })
          .on('pointerdown', () => this._doContinue(objs)));

        add(this.add.text(200, 266, '[ GIVE UP ]', {
            fontSize: '11px', color: '#446688', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(91)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#88bbff'); })
          .on('pointerout',  function() { this.setColor('#446688'); })
          .on('pointerdown', () => this._doGiveUp(objs)));
    }

    _doContinue(objs) {
        objs.forEach(o => o.destroy());
        this.skubuCount -= 1;
        try { localStorage.setItem('runningboy_skubu', this.skubuCount); } catch (_) {}
        this.skubuLabel.setText(`✦ SKUBU: ${this.skubuCount}`);
        this.lives = 5;
        this._updateLivesDisplay();
        this._revive();
    }

    _doGiveUp(objs) {
        objs.forEach(o => o.destroy());
        this._gameOver();
    }

    _saveScore(score) {
        const LS_SCORES = 'runningboy_scores';
        const LS_NAME   = 'runningboy_name';
        try {
            const name   = (localStorage.getItem(LS_NAME) || 'ANON').toUpperCase();
            const scores = JSON.parse(localStorage.getItem(LS_SCORES)) || [];
            scores.push({ name, score });
            scores.sort((a, b) => b.score - a.score);
            localStorage.setItem(LS_SCORES, JSON.stringify(scores.slice(0, 20)));
        } catch (_) {}
    }

    _gameOver() {
        this._saveScore(this.score);

        const ol = this.add.graphics().setScrollFactor(0).setDepth(100);
        ol.fillStyle(0x000000, 0.75);
        ol.fillRect(0, 0, 400, 400);

        this.add.text(200, 120, 'GAME OVER', {
            fontSize: '30px', color: '#ff4444',
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 4,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 172, `Score: ${this.score}`, {
            fontSize: '22px', color: '#ffffff', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 240, 'Click or SPACE to restart', {
            fontSize: '12px', color: '#888888', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 290, '[ MENU ]', {
            fontSize: '12px', color: '#446688', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#88bbff'); })
          .on('pointerout',  function() { this.setColor('#446688'); })
          .on('pointerdown', () => { window.location.href = 'index.html'; });

        this.time.delayedCall(500, () => {
            this.input.once('pointerdown', () => this.scene.restart());
            this.input.keyboard.once('keydown', e => {
                if (e.key !== 'Escape') this.scene.restart();
            });
        });
    }

    _showScorePopup(amount) {
        const label = amount > 0 ? `+${amount}` : `${amount}`;
        const popup = this.add.text(BOY_SCREEN_X, this.boy.y - 30, label, {
            fontSize: '22px', color: '#ffff44',
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#886600', strokeThickness: 3,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(60);

        this.tweens.add({
            targets: popup, y: popup.y - 55, alpha: 0,
            duration: 1000, ease: 'Power2',
            onComplete: () => popup.destroy(),
        });
    }

    // ── Godzilla tier management ──────────────────────────────────────────
    _respawnGodzilla() {
        const unlocked = GODZILLA_TIERS.filter(t => this.score >= t.scoreUnlock);
        const newTier  = unlocked[Phaser.Math.Between(0, unlocked.length - 1)];
        this.godzilla.tierConfig  = newTier;
        this.godzilla.s           = newTier.sizeScale;
        this.godzilla.speed       = newTier.speed;
        this.godzilla.dangerRight = 90 * newTier.sizeScale;
        this.godzilla.x           = this.cameras.main.scrollX + 530;
        this.godzilla.state       = 'walking';
        this.godzilla.stateTime   = Phaser.Math.Between(3000, 5000);
        this.godzilla.fireEmitter?.stop();
        if (this.godzilla.fireEmitter?.setTint) {
            this.godzilla.fireEmitter.setTint(newTier.fireColor);
        }
    }

    // ── Pterodactyls ──────────────────────────────────────────────────────
    get _pteroInterval() {
        if (this.currentPhase === 0) return Infinity;
        return Math.max(3000, 8000 - (this.score - 15) * 60);
    }

    _spawnPterodactyl() {
        // Swoop depth scales from y=210 (harmless) at score 15 up to y=268 (full threat) at score 30
        const maxSwoopY = Math.min(268, 210 + Math.max(0, this.score - 15) * (58 / 15));
        this.pterodactyls.push(new Pterodactyl(this, maxSwoopY));
    }

    _updatePterodactyls(delta, camX) {
        // Spawning (gated by phase and game-over)
        this.pterodactylTimer -= delta;
        if (this.pterodactylTimer <= 0 && this.currentPhase >= 1 && !this.isGameOver) {
            this._spawnPterodactyl();
            this.pterodactylTimer = this._pteroInterval;
        }

        for (let i = this.pterodactyls.length - 1; i >= 0; i--) {
            const pt = this.pterodactyls[i];
            pt.update(delta, camX);

            if (pt.dead) {
                pt.destroy();
                this.pterodactyls.splice(i, 1);
                continue;
            }

            if (!this.isGameOver) {
                const psx = pt.x - camX;
                const dx  = psx - BOY_SCREEN_X;
                const inDanger = dx > -15 && dx < 55 && pt.isAtDangerHeight();

                // Dodge window tracking
                if (!pt.dodgeWindow && inDanger) {
                    pt.dodgeWindow    = true;
                    pt.dodgedInWindow = false;
                }
                if (pt.dodgeWindow && inDanger && this.boyState === 'jumping') {
                    pt.dodgedInWindow = true;
                }
                if (pt.dodgeWindow && !inDanger) {
                    if (pt.dodgedInWindow) {
                        this._addScore(1);
                    }
                    pt.dodgeWindow = false;
                }

                // Hit detection
                if (inDanger && this.boyState === 'running') {
                    this._hitBoy();
                }
            }
        }
    }

    // ── Play-limit logic ──────────────────────────────────────────────────
    _checkAndConsumePlay() {
        try {
            // Reset plays if the 5-hour cooldown has elapsed
            const resetAt = parseInt(localStorage.getItem('runningboy_plays_reset')) || 0;
            if (resetAt > 0 && Date.now() >= resetAt) {
                localStorage.removeItem('runningboy_plays_reset');
                localStorage.setItem('runningboy_plays', 5);
            }

            let plays = parseInt(localStorage.getItem('runningboy_plays'));
            if (isNaN(plays)) plays = 5; // first ever launch

            if (plays > 0) {
                plays -= 1;
                localStorage.setItem('runningboy_plays', plays);
                if (plays === 0) {
                    // Start 5-hour cooldown from this moment
                    localStorage.setItem('runningboy_plays_reset',
                        Date.now() + 5 * 60 * 60 * 1000);
                }
                _playConsumedThisSession = true;
                return true;
            }

            // Plays exhausted — ensure a reset timer exists
            let rt = parseInt(localStorage.getItem('runningboy_plays_reset')) || 0;
            if (!rt) {
                rt = Date.now() + 5 * 60 * 60 * 1000;
                localStorage.setItem('runningboy_plays_reset', rt);
            }

            const skubuCount = parseInt(localStorage.getItem('runningboy_skubu')) || 0;
            if (skubuCount > 0) {
                this._showSpendSkubuToPlayScreen(skubuCount, rt);
            } else {
                this._showCooldownScreen(rt);
            }
            return false;
        } catch (_) {
            _playConsumedThisSession = true;
            return true; // fail open
        }
    }

    _showSpendSkubuToPlayScreen(skubuCount, resetAt) {
        const bg = this.add.graphics().setScrollFactor(0).setDepth(100);
        bg.fillGradientStyle(0x000005, 0x000005, 0x06080f, 0x06080f, 1);
        bg.fillRect(0, 0, 400, 400);

        this.add.text(200, 80, 'OUT OF PLAYS', {
            fontSize: '24px', color: '#ff4444',
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 4,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 126, 'No free plays remaining.', {
            fontSize: '12px', color: '#667788', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        // Reset timer hint
        const msLeft = Math.max(0, resetAt - Date.now());
        const rh = Math.floor(msLeft / 3600000);
        const rm = Math.floor((msLeft % 3600000) / 60000);
        this.add.text(200, 148, `Resets in ${rh}h ${String(rm).padStart(2,'0')}m`, {
            fontSize: '10px', color: '#445566', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        const div = this.add.graphics().setScrollFactor(0).setDepth(101);
        div.lineStyle(1, 0x334455, 0.6);
        div.lineBetween(60, 172, 340, 172);

        this.add.text(200, 195, 'Spend 1 ✦ skubu to play now?', {
            fontSize: '13px', color: '#ccaa44', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 218, `You have: ${skubuCount} skubu`, {
            fontSize: '11px', color: '#aa8844', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 262, '[ PLAY ]', {
            fontSize: '16px', color: '#ffcc22',
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#442200', strokeThickness: 2,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#ffee66'); })
          .on('pointerout',  function() { this.setColor('#ffcc22'); })
          .on('pointerdown', () => {
              localStorage.setItem('runningboy_skubu', skubuCount - 1);
              _playConsumedThisSession = true;
              this.scene.restart();
          });

        this.add.text(200, 306, '[ MARKET ]', {
            fontSize: '12px', color: '#44aa66', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#66ffaa'); })
          .on('pointerout',  function() { this.setColor('#44aa66'); })
          .on('pointerdown', () => { window.location.href = 'index.html#market'; });

        this.add.text(200, 334, '[ MENU ]', {
            fontSize: '12px', color: '#446688', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#88bbff'); })
          .on('pointerout',  function() { this.setColor('#446688'); })
          .on('pointerdown', () => { window.location.href = 'index.html'; });
    }

    _showCooldownScreen(resetAt) {
        const bg = this.add.graphics().setScrollFactor(0).setDepth(100);
        bg.fillGradientStyle(0x000005, 0x000005, 0x06080f, 0x06080f, 1);
        bg.fillRect(0, 0, 400, 400);

        this.add.text(200, 70, 'NO PLAYS LEFT', {
            fontSize: '24px', color: '#ff4444',
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 4,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 115, "You've used all 5 plays.", {
            fontSize: '12px', color: '#667788', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 148, 'Come back in:', {
            fontSize: '12px', color: '#557799', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        const fmtTime = () => {
            const ms = Math.max(0, resetAt - Date.now());
            const h  = Math.floor(ms / 3600000);
            const m  = Math.floor((ms % 3600000) / 60000);
            const s  = Math.floor((ms % 60000) / 1000);
            return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        };

        const timeText = this.add.text(200, 190, fmtTime(), {
            fontSize: '32px', color: '#ffcc44',
            fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#442200', strokeThickness: 3,
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.time.addEvent({
            delay: 1000,
            callback: () => { timeText.setText(fmtTime()); },
            repeat: -1,
        });

        const div = this.add.graphics().setScrollFactor(0).setDepth(101);
        div.lineStyle(1, 0x334455, 0.6);
        div.lineBetween(60, 238, 340, 238);

        this.add.text(200, 258, 'Earn ✦ skubu by playing to bypass', {
            fontSize: '10px', color: '#445566', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 272, 'the wait — or buy them in the market.', {
            fontSize: '10px', color: '#445566', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101);

        this.add.text(200, 316, '[ MARKET ]', {
            fontSize: '14px', color: '#44aa66', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#66ffaa'); })
          .on('pointerout',  function() { this.setColor('#44aa66'); })
          .on('pointerdown', () => { window.location.href = 'index.html#market'; });

        this.add.text(200, 348, '[ MENU ]', {
            fontSize: '12px', color: '#446688', fontFamily: 'monospace',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(101)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function() { this.setColor('#88bbff'); })
          .on('pointerout',  function() { this.setColor('#446688'); })
          .on('pointerdown', () => { window.location.href = 'index.html'; });
    }

    // ── Scene cleanup (called by Phaser on restart/stop) ──────────────────
    shutdown() {
        if (this.isBlocked) return;
        this.trailHistory = [];
        this.godzilla = null;
        if (this.pterodactyls) {
            this.pterodactyls.forEach(pt => pt.destroy());
            this.pterodactyls = [];
        }
    }

    // ── Main loop ─────────────────────────────────────────────────────────
    update(_, delta) {
        if (this.isBlocked) return;
        const dt   = delta / 1000;
        const camX = this.cameras.main.scrollX;

        // Scroll the world left (camera moves right)
        this.cameras.main.scrollX += SCROLL_SPEED;

        // Phase transitions and background interpolation (run even during game over)
        this._updatePhase();
        this._updateBackground();

        // Always redraw the tiled world
        this._updateWorld(camX);

        // ── Hit arc continues even after game over ───────────────────────
        if (this.boyState === 'hit') {
            this.boyVelY  += 900 * dt;
            this.boy.x    += this.boyVelX * dt;
            this.boy.y    += this.boyVelY * dt;
            this.boyAngle += 380 * dt;
            this.boy.setAngle(this.boyAngle);
            if (this.boy.y >= GROUND_Y) this._landBoy();
        }

        if (this.isGameOver) {
            this.godzilla.update(delta, this.cameras.main.scrollX);
            this._updatePterodactyls(delta, this.cameras.main.scrollX);
            return;
        }

        // ── Boy movement (screen space, scrollFactor=0) ──────────────────
        if (this.boyState === 'running') {
            this.boy.x = BOY_SCREEN_X;

        } else if (this.boyState === 'jumping') {
            this.boyVelY += 900 * dt;
            this.boy.y   += this.boyVelY * dt;
            this.boy.x    = BOY_SCREEN_X;
            if (this.boy.y >= GROUND_Y) {
                this.boy.y    = GROUND_Y;
                this.boyVelY  = 0;
                this.boyState = 'running';
                this.boy.play('run');
                this.trailHistory = [];

                // Landing dust burst
                this.jumpDust.setPosition(BOY_SCREEN_X, GROUND_Y);
                this.jumpDust.explode(8);

                // Squash on impact
                const sx = this.boy.scaleX, sy = this.boy.scaleY;
                this.tweens.add({
                    targets: this.boy,
                    scaleX: sx * 1.45,
                    scaleY: sy * 0.62,
                    duration: 55,
                    yoyo: true,
                    ease: 'Power2',
                    onComplete: () => { this.boy.scaleX = sx; this.boy.scaleY = sy; },
                });
                this.cameras.main.shake(80, 0.004);
            }
        }

        // ── Jump charge ──────────────────────────────────────────────────
        if (this.isCharging && this.time.now - this.chargeStartTime >= 700) {
            this._releaseJump();
        }

        // ── Skubu bar ────────────────────────────────────────────────────
        this._updateSkubuBar();

        // ── Charge bar ───────────────────────────────────────────────────
        this.chargeBar.clear();
        if (this.isCharging) {
            const t = Math.min((this.time.now - this.chargeStartTime) / 700, 1);
            this.chargeBar.fillStyle(0x112244, 0.85);
            this.chargeBar.fillRoundedRect(282, 350, 96, 14, 4);
            this.chargeBar.fillStyle(t > 0.7 ? 0xff4433 : 0x44aaff, 0.95);
            this.chargeBar.fillRoundedRect(282, 350, Math.round(96 * t), 14, 4);
        }

        // ── Charge glow + airborne aura ──────────────────────────────────
        this.boyGlow.clear();
        if (this.isCharging) {
            const t = Math.min((this.time.now - this.chargeStartTime) / 700, 1);
            const cy = this.boy.y - 25;
            [38, 24, 13].forEach((r, i) => {
                this.boyGlow.fillStyle(0x44aaff, (0.025 + i * 0.04) * t);
                this.boyGlow.fillCircle(BOY_SCREEN_X, cy, r);
            });
        } else if (this.boyState === 'jumping') {
            const cy = this.boy.y - 25;
            const fade = Math.max(0, -this.boyVelY / 530);
            [28, 16].forEach((r, i) => {
                this.boyGlow.fillStyle(0xffffff, (0.06 + i * 0.06) * fade);
                this.boyGlow.fillCircle(BOY_SCREEN_X, cy, r);
            });
        }

        // ── Motion trail while airborne ──────────────────────────────────
        const frameKey = this.boy.anims.currentFrame?.textureKey ?? 'idle_00';
        if (this.boyState === 'jumping') {
            this.trailHistory.push({ x: this.boy.x, y: this.boy.y, key: frameKey });
            if (this.trailHistory.length > 25) this.trailHistory.shift();
        }
        this.trailSprites.forEach((ts, i) => {
            const histIdx = this.trailHistory.length - 2 - i * 4;
            if (this.boyState === 'jumping' && histIdx >= 0) {
                const h = this.trailHistory[histIdx];
                ts.setPosition(h.x, h.y).setTexture(h.key);
                ts.setAlpha(0.22 - i * 0.04);
                ts.setTint(0x88ccff);
            } else {
                ts.setAlpha(0);
            }
        });

        // ── Godzilla (world space) ────────────────────────────────────────
        this.godzilla.update(delta, this.cameras.main.scrollX);

        const godzillaScreenX = this.godzilla.x - this.cameras.main.scrollX;
        const dx              = godzillaScreenX - BOY_SCREEN_X;
        const inDangerZone    = dx > -20 && dx < this.godzilla.dangerRight;

        // ── Godzilla dodge scoring ────────────────────────────────────────
        if (!this.dodgeWindow && inDangerZone) {
            this.dodgeWindow    = true;
            this.dodgedInWindow = false;
        }
        if (this.dodgeWindow && inDangerZone && this.boyState === 'jumping') {
            this.dodgedInWindow = true;
        }
        if (this.dodgeWindow && !inDangerZone) {
            if (this.dodgedInWindow) {
                this._addScore(2);
            }
            this.dodgeWindow    = false;
            this.dodgedInWindow = false;
        }

        // ── Godzilla collision (ground only) ─────────────────────────────
        if (this.boyState === 'running' && inDangerZone) {
            this._hitBoy();
        }

        // ── Pterodactyls ─────────────────────────────────────────────────
        this._updatePterodactyls(delta, this.cameras.main.scrollX);
    }
}
