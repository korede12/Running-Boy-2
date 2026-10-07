// ── Chase mode ────────────────────────────────────────────────────────────
// Portable runs a Lagos street with someone on his heels. The camera sits
// over his shoulder, so the road is projected rather than scrolled and the
// player steers between three lanes instead of along one.
//
// Three verbs, one answer each: jump it, slide under it, or change lane.
// Every hazard declares which, and the collision check reads only that — the
// art never decides whether something is survivable.
//
// The chase itself is the health bar. There are no hearts: a mistake costs
// speed, lost speed is ground, and ground is the gap behind you. That makes
// the danger continuous and readable without a meter, though there is one.

class ChaseScene extends Phaser.Scene {

    // ── Tuning ────────────────────────────────────────────────────────────
    static SPEED_BASE   = 6600;    // world units per second
    static SPEED_MAX    = 12200;   // capped by how far ahead a hazard is readable
    static SPEED_RAMP   = 90;      // gained per second, before the easing below
    static SPEED_EASE   = 0.65;    // how much the ramp slackens as it nears the
                                   // top — reaching it is roughly 100 seconds'
                                   // work rather than half a minute
    static JUMP_V       = 2700;    // apex ≈ 470, airtime ≈ 0.70s
    static GRAV         = 7700;
    static SLIDE_MS     = 460;
    static LANE_MS      = 165;
    static JUMP_BUFFER  = 140;     // a jump pressed just before landing still counts
    static STUMBLE_MS   = 480;
    static STUMBLE_DRAG = 0.84;    // speed kept while stumbling

    static CHASE_START  = 2100;
    static CHASE_MAX    = 2400;
    static CHASE_HIT    = 150;     // ground lost the instant you trip
    static CHASE_REGAIN = 260;     // per second, only at full speed
    static CAUGHT_AT    = 150;

    // The camera trails by CAM_BACK, and the road only starts about 630 units
    // in front of it, so anyone more than ~270 units behind the runner is off
    // the bottom of the screen. The gap is therefore kept as its own quantity
    // and the chaser is placed by mapping it into the band he can be seen in:
    // held at the frame's edge while he is merely close, climbing into shot as
    // he closes for real. Below CHASER_Z_LAST the mapping stops lying and he
    // is where the gap says he is.
    // He also runs beside the lane rather than in it, and is capped well
    // under twice the runner's height: dead behind and full size he covers
    // the player completely, and you cannot play what you cannot see.
    static CHASER_SHOW   = 900;    // gap below which he is in shot at all
    static CHASER_Z_FIRST = 300;   // held this far back when he first appears
    static CHASER_Z_LAST  = 180;   // and this far back at the last moment
    static CHASER_OFF     = 620;   // how far off the runner's line he sits
    static CHASER_CAP     = 1.4;   // of the runner's drawn height

    static CAM_LAG      = 0.55;    // how much of a lane change the camera takes
    static PULLBACK_HIT = 300;     // the camera lurches back when you trip

    static SCORE_UNIT   = 20000;   // world units per point, to keep chase scores
                                   // in the same band as the 2D modes
    static PLAYER_HALF  = 110;     // half the runner's width, for collisions


    constructor() { super({ key: 'ChaseScene' }); }

    preload() {
        // Drives the boot bar; the creep hands over to real progress here.
        if (typeof Boot !== 'undefined') Boot.attach(this);
        this.load.audio('snd_jump',     'sounds/game-scene-jumping-floor-sound-effect-material.mp3');
        this.load.audio('snd_land',     'sounds/landing-effect.mp3');
        this.load.audio('snd_hit',      'sounds/hit-sound-in-game.mp3');
        this.load.audio('snd_slide',    'sounds/shock-with-vibration.mp3');
        this.load.audio('snd_skubu',    'sounds/the-sound-of-getting-a-bonus-or-extra-life-in-an-arcade-game.mp3');
        this.load.audio('snd_gameover', 'sounds/freesound_community-game-over-arcade-6435.mp3');
    }

    // ── Setup ─────────────────────────────────────────────────────────────

    create() {
        this.gWorld = this.add.graphics().setDepth(10);
        this.gFx    = this.add.graphics().setDepth(40).setScrollFactor(0);

        // Who you are and who is behind you both come from the theme, so a
        // second chase pairing needs no change here.
        const theme      = (typeof getTheme === 'function') ? getTheme(RunStore.character()) : null;
        this.runnerSkin  = (theme && theme.runner) || 'portable';
        this.chaserSkin  = (theme && theme.chaser) || 'police';

        const blockedUntil = RunStore.checkLaunchCooldown();
        if (blockedUntil) {
            this.isBlocked = true;
            this._showCooldown(blockedUntil);
            return;
        }

        // ── Runner ────────────────────────────────────────────────────────
        this.playerZ   = ROAD.SEG_LEN * 8;
        this.lane      = 1;
        this.laneX     = Lagos.laneX(1);
        this.laneFrom  = this.laneX;
        this.laneT     = 1;
        this.py        = 0;
        this.vy        = 0;
        this.sliding   = false;
        this.slideEnd  = 0;
        this.stumbleTo = 0;
        this.jumpBuffer = 0;
        this.runPhase  = 0;

        this.speed       = ChaseScene.SPEED_BASE;
        this.speedTarget = ChaseScene.SPEED_BASE;
        this.chaseGap    = ChaseScene.CHASE_START;
        this.chaserX     = this.laneX;

        this.cam = { x: 0, z: this.playerZ - ROAD.CAM_BACK, pitch: 0, pullback: 0 };

        // ── World contents ────────────────────────────────────────────────
        this.hazards = [];
        this.coins   = [];
        this.nextEventSeg = Math.floor(this.playerZ / ROAD.SEG_LEN) + 34;

        // ── Run state ─────────────────────────────────────────────────────
        this.score        = 0;
        this.metres       = 0;
        this.coinsTaken   = 0;
        this.pendingSkubu = 0;
        this.nextSkubuAt  = SKUBU_INTERVAL;
        this.skubuCount   = RunStore.skubu();
        this.sessionId    = 'chase-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
        this.over         = false;

        this._buildHud();
        this._bindInput();

        this.cameras.main.setBackgroundColor('#9ab4cc');
    }

    _bindInput() {
        const k = this.input.keyboard;
        this.keys = k.addKeys({
            left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN',
            a: 'A', d: 'D', w: 'W', s: 'S', space: 'SPACE',
        });

        // Touch: a swipe picks the verb, a tap jumps.
        this.input.on('pointerdown', p => { this._swipeFrom = { x: p.x, y: p.y, t: this.time.now }; });
        this.input.on('pointerup', p => {
            const f = this._swipeFrom;
            this._swipeFrom = null;
            if (!f || this.over) return;    // the end screens own their own taps
            const dx = p.x - f.x, dy = p.y - f.y;
            if (Math.abs(dx) < 26 && Math.abs(dy) < 26) { this._jump(); return; }
            if (Math.abs(dx) > Math.abs(dy)) this._changeLane(dx > 0 ? 1 : -1);
            else if (dy < 0)                 this._jump();
            else                             this._slide();
        });
    }

    _buildHud() {
        const mono = { fontFamily: 'monospace' };
        this.scoreLabel = this.add.text(10, 8, 'Score: 0',
            { ...mono, fontSize: '16px', color: '#ffffff',
              stroke: '#000', strokeThickness: 3 }).setDepth(50).setScrollFactor(0);

        this.distLabel = this.add.text(10, 28, '0 m',
            { ...mono, fontSize: '11px', color: '#f0e6cc',
              stroke: '#000', strokeThickness: 2 }).setDepth(50).setScrollFactor(0);

        this.skubuLabel = this.add.text(10, 44, `✦ SKUBU: ${this.skubuCount}`,
            { ...mono, fontSize: '11px', color: '#ffcc22',
              stroke: '#000', strokeThickness: 2 }).setDepth(50).setScrollFactor(0);

        const name = RunStore.playerName();
        if (name && name !== 'ANON') {
            this.add.text(10, 60, name, { ...mono, fontSize: '10px', color: '#cfd6e0',
                stroke: '#000', strokeThickness: 2 }).setDepth(50).setScrollFactor(0);
        }

        this.chaseGfx = this.add.graphics().setDepth(50).setScrollFactor(0);
        this.warnText = this.add.text(GAME_W - 12, 28, '', {
            ...mono, fontSize: '12px', color: '#ff5050', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(1, 0).setDepth(50).setScrollFactor(0);

        const hint = this.add.text(GAME_W / 2, GAME_H - 26,
            '← →  lane     ↑ / tap  jump     ↓  slide', {
            ...mono, fontSize: '11px', color: '#ffffff',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(50).setScrollFactor(0);
        this.tweens.add({ targets: hint, alpha: 0, delay: 3200, duration: 900,
                          onComplete: () => hint.destroy() });
    }

    // ── Verbs ─────────────────────────────────────────────────────────────

    _changeLane(dir) {
        if (this.over || this.time.now < this.stumbleTo) return;
        const next = Phaser.Math.Clamp(this.lane + dir, 0, 2);
        if (next === this.lane) return;
        this.lane     = next;
        this.laneFrom = this.laneX;
        this.laneT    = 0;
    }

    _jump() {
        if (this.over || this.time.now < this.stumbleTo) return;
        if (this.py > 0) { this.jumpBuffer = this.time.now; return; }
        this.vy      = ChaseScene.JUMP_V;
        this.sliding = false;
        this.sound.play('snd_jump', { volume: 0.4 });
    }

    _slide() {
        if (this.over || this.time.now < this.stumbleTo) return;
        this.sliding  = true;
        this.slideEnd = this.time.now + ChaseScene.SLIDE_MS;
        if (this.py > 0) { this.vy = -ChaseScene.JUMP_V * 0.7; }   // slam back down
        this.sound.play('snd_slide', { volume: 0.25 });
    }

    // ── Loop ──────────────────────────────────────────────────────────────

    update(time, delta) {
        if (this.isBlocked || this.over) return;
        const dt = Math.min(0.05, delta / 1000);

        this._readKeys();
        this._advance(dt);
        this._moveCamera(dt);
        this._generate();
        this._collide();
        this._chase(dt);
        this._tallyScore();
        this._draw();
    }

    _readKeys() {
        const k = this.keys;
        const down = key => Phaser.Input.Keyboard.JustDown(key);
        if (down(k.left)  || down(k.a))               this._changeLane(-1);
        if (down(k.right) || down(k.d))               this._changeLane(1);
        if (down(k.up) || down(k.w) || down(k.space)) this._jump();
        if (down(k.down) || down(k.s))                this._slide();
    }

    _advance(dt) {
        const C = ChaseScene;

        // Speed ramps while clean and is dragged down by a stumble. The ramp
        // slackens as it climbs, so the pace still changes noticeably early
        // without the top of the range arriving before the run has settled.
        const climbed = (this.speedTarget - C.SPEED_BASE) / (C.SPEED_MAX - C.SPEED_BASE);
        const rate    = C.SPEED_RAMP * (1 - C.SPEED_EASE * climbed);
        this.speedTarget = Math.min(C.SPEED_MAX, this.speedTarget + rate * dt);
        const want = this.time.now < this.stumbleTo
            ? this.speedTarget * C.STUMBLE_DRAG
            : this.speedTarget;
        this.speed += (want - this.speed) * Math.min(1, dt * 7);

        this.playerZ += this.speed * dt;
        // The world's scale was set by what reads well on screen, not by the
        // runner's size, so the distance shown is calibrated to a believable
        // pace rather than derived from it.
        this.metres  += this.speed * dt / 800;
        this.runPhase += dt * (this.speed / 4200);

        // Lane change: a short ease, so being caught halfway is possible.
        if (this.laneT < 1) {
            this.laneT = Math.min(1, this.laneT + dt / (C.LANE_MS / 1000));
            const t = this.laneT * this.laneT * (3 - 2 * this.laneT);
            this.laneX = this.laneFrom + (Lagos.laneX(this.lane) - this.laneFrom) * t;
        }

        // Jump arc.
        if (this.py > 0 || this.vy > 0) {
            this.vy -= C.GRAV * dt;
            this.py += this.vy * dt;
            if (this.py <= 0) {
                this.py = 0; this.vy = 0;
                this.sound.play('snd_land', { volume: 0.25 });
                // A jump pressed just before touchdown still counts.
                if (this.time.now - this.jumpBuffer < C.JUMP_BUFFER) {
                    this.jumpBuffer = 0;
                    this._jump();
                }
            }
        }

        if (this.sliding && this.time.now > this.slideEnd) this.sliding = false;
    }

    _moveCamera(dt) {
        const C = ChaseScene;
        const want = this._hitPullback || 0;
        this.cam.pullback += (want - this.cam.pullback) * Math.min(1, dt * 4);
        if (this._hitPullback) this._hitPullback *= Math.max(0, 1 - dt * 3.2);

        this.cam.z = this.playerZ - (ROAD.CAM_BACK + this.cam.pullback);

        // Aim at the runner, not at the road's centre line, or a bend throws
        // him off the side of the screen.
        const centre = Lagos.centreAt(Math.floor(this.cam.z / ROAD.SEG_LEN), this.playerZ);
        const aim    = centre + this.laneX * C.CAM_LAG;
        this.cam.x  += (aim - this.cam.x) * Math.min(1, dt * 9);

        this.cam.pitch += ((this._shake || 0) - this.cam.pitch) * Math.min(1, dt * 12);
        if (this._shake) this._shake *= Math.max(0, 1 - dt * 5);
    }

    // ── What is in the road ───────────────────────────────────────────────

    /// Fill the road out to the draw distance, then some, and forget what is
    /// behind. Events are spaced by travel time rather than by distance, so
    /// the reaction window does not shrink as the run speeds up.
    _generate() {
        const horizon = Math.floor((this.playerZ + 34000) / ROAD.SEG_LEN);
        while (this.nextEventSeg < horizon) {
            this._spawnEvent(this.nextEventSeg);
            const gapSegs = Math.max(16, Math.round(this.speedTarget * 1.45 / ROAD.SEG_LEN));
            this.nextEventSeg += gapSegs + Math.floor(Math.random() * 7);
        }

        const behind = this.playerZ - 2000;
        this.hazards = this.hazards.filter(h => h.z > behind);
        this.coins   = this.coins.filter(c => c.z > behind && !c.got);
    }

    _spawnEvent(seg) {
        const z     = seg * ROAD.SEG_LEN;
        const early = this.score < 8;
        const r     = Math.random();
        const lanes = [0, 1, 2];
        Phaser.Utils.Array.Shuffle(lanes);

        const jumpers = early ? ['gutter', 'cones'] : ['gutter', 'barrow', 'cones'];
        const pickJump = () => jumpers[Math.floor(Math.random() * jumpers.length)];

        if (early || r < 0.32) {
            // One hazard, two lanes open.
            this._add(z, lanes[0], Math.random() < 0.25 && !early ? 'banner' : pickJump());
        } else if (r < 0.56) {
            // Two lanes, the same verb, one way through.
            const t = pickJump();
            this._add(z, lanes[0], t);
            this._add(z, lanes[1], t);
        } else if (r < 0.74) {
            // A danfo parked dead in one lane, something jumpable in another.
            this._add(z, lanes[0], 'danfo');
            this._add(z + 600, lanes[1], pickJump());
        } else if (r < 0.88) {
            // Across the whole road, head height: the only answer is to slide.
            const t = Math.random() < 0.5 ? 'banner' : 'pipe';
            for (const l of lanes) this._add(z, l, t);
        } else {
            // A trench across the whole road: the only answer is to jump.
            for (const l of lanes) this._add(z, l, 'gutter');
            this._arc(z, lanes[0]);
        }

        // A run of skubu down one of the lanes left open.
        if (Math.random() < 0.45) {
            const free = lanes.filter(l => !this.hazards.some(
                h => h.lane === l && Math.abs(h.z - z) < 1400));
            if (free.length) {
                const l = free[Math.floor(Math.random() * free.length)];
                for (let i = 0; i < 5; i++) {
                    this.coins.push({ z: z + 1600 + i * 420, lane: l, y: 240, got: false });
                }
            }
        }
    }

    _add(z, lane, type) {
        this.hazards.push({ z, lane, type, done: false });
    }

    /// Skubu arcing over a jump, so the reward and the lesson are the same.
    _arc(z, lane) {
        for (let i = 0; i < 5; i++) {
            const t = i / 4;
            this.coins.push({
                z: z - 600 + i * 420, lane,
                y: 150 + Math.sin(t * Math.PI) * 330, got: false,
            });
        }
    }

    // ── Collisions ────────────────────────────────────────────────────────

    _collide() {
        const C = ChaseScene;

        for (const h of this.hazards) {
            if (h.done) continue;
            const def = HAZARDS[h.type];
            if (this.playerZ < h.z + def.depth * 0.35) continue;
            h.done = true;

            // Overlap is measured against where the runner actually is, so
            // being caught halfway through a lane change still counts.
            const half = def.w * ROAD.LANE_W / 2 + C.PLAYER_HALF;
            if (Math.abs(this.laneX - Lagos.laneX(h.lane)) > half) continue;

            if (def.clear === 'jump'  && this.py > def.top + 20) continue;
            if (def.clear === 'slide' && this.sliding)           continue;
            this._stumble();
        }

        for (const c of this.coins) {
            if (c.got) continue;
            if (Math.abs(c.z - this.playerZ) > 260) continue;
            if (Math.abs(this.laneX - Lagos.laneX(c.lane)) > ROAD.LANE_W * 0.55) continue;
            const reach = this.sliding ? 160 : 330;
            if (Math.abs(c.y - (this.py + 190)) > reach) continue;
            c.got = true;
            this.coinsTaken++;
            this.sound.play('snd_skubu', { volume: 0.22, rate: 1.6 });
        }
    }

    _stumble() {
        const C = ChaseScene;
        this.stumbleTo    = this.time.now + C.STUMBLE_MS;
        this.sliding      = false;
        this.py           = 0;
        this.vy           = 0;
        this.chaseGap    -= C.CHASE_HIT;
        this._hitPullback = C.PULLBACK_HIT;
        this._shake       = 14;
        // Scaled to the ramp: with a slower climb, 300 was several seconds of
        // progress to lose on one trip.
        this.speedTarget  = Math.max(C.SPEED_BASE, this.speedTarget - 180);
        this.sound.play('snd_hit', { volume: 0.5 });

        this.gFx.clear();
        this.gFx.fillStyle(0xff2222, 0.26).fillRect(0, 0, GAME_W, GAME_H);
        this.tweens.addCounter({
            from: 0.26, to: 0, duration: 260,
            onUpdate: t => {
                this.gFx.clear();
                this.gFx.fillStyle(0xff2222, t.getValue()).fillRect(0, 0, GAME_W, GAME_H);
            },
        });
    }

    // ── The chase ─────────────────────────────────────────────────────────

    /// The chaser runs at the speed the player would have had without
    /// mistakes. So losing speed is losing ground, and the gap needs no rule
    /// of its own beyond a slow recovery for running clean.
    _chase(dt) {
        const C = ChaseScene;
        this.chaseGap += (this.speed - this.speedTarget) * dt;
        if (this.time.now > this.stumbleTo) this.chaseGap += C.CHASE_REGAIN * dt;
        this.chaseGap = Math.min(C.CHASE_MAX, this.chaseGap);

        // Over the shoulder with the most room, so he never sits on the
        // runner's head and never leaves the road.
        const side = this.lane === 0 ? 1 : this.lane === 2 ? -1 : (this.chaserSide || 1);
        this.chaserSide = side;
        const want = this.laneX + side * C.CHASER_OFF
                   + Math.sin(this.time.now / 620) * 90;
        this.chaserX += (want - this.chaserX) * Math.min(1, dt * 3.2);

        if (this.chaseGap <= C.CAUGHT_AT) this._caught();
    }

    _tallyScore() {
        const earned = Math.floor(this.playerZ / ChaseScene.SCORE_UNIT) + this.coinsTaken;
        if (earned !== this.score) { this.score = earned; this._checkSkubu(); }
        this.scoreLabel.setText('Score: ' + this.score);
        this.distLabel.setText(Math.floor(this.metres) + ' m');
    }

    _checkSkubu() {
        while (this.score >= this.nextSkubuAt) {
            this.nextSkubuAt += SKUBU_INTERVAL;
            this.pendingSkubu += 1;
            RunStore.credit(1, 'Run milestone');
            this.skubuCount = RunStore.skubu();
            this.skubuLabel.setText(`✦ SKUBU: ${this.skubuCount}`);
            this.sound.play('snd_skubu', { volume: 0.6 });
        }
    }

    // ── Drawing ───────────────────────────────────────────────────────────

    _draw() {
        const g = this.gWorld;
        g.clear();

        Lagos.drawSky(g, this.cam);
        Lagos.drawSkyline(g, this.cam);

        const pts  = Lagos.buildView(this.cam);
        const last = Lagos.drawRoad(g, pts);
        Lagos.drawScenery(g, pts, last);

        // Measured before anything is drawn, so the cap on the chaser's size
        // does not depend on the order the two of them come out in.
        this.playerPx = Lagos.at(pts, this.playerZ).scale * Lagos.PX * ROAD.PERSON_H;

        // Everything standing on the road is sorted by depth and drawn far
        // to near, so a near danfo hides what is behind it.
        const farZ  = this.cam.z + ROAD.DRAW_SEGS * ROAD.SEG_LEN;
        const items = [];
        for (const h of this.hazards) {
            if (h.z > this.cam.z + 120 && h.z < farZ) items.push({ z: h.z, h });
        }
        for (const c of this.coins) {
            if (!c.got && c.z > this.cam.z + 120 && c.z < farZ) items.push({ z: c.z, c });
        }
        items.push({ z: this.playerZ, player: true });
        if (this.chaseGap < ChaseScene.CHASER_SHOW) {
            items.push({ z: this._chaserZ(), chaser: true });
        }

        items.sort((a, b) => b.z - a.z);
        for (const it of items) {
            if (it.h)            Lagos.drawHazard(g, it.h, pts);
            else if (it.c)       Lagos.drawCoin(g, Lagos.at(pts, it.c.z),
                                                Lagos.laneX(it.c.lane), it.c.y,
                                                this.time.now / 260 + it.c.z);
            else if (it.player)  this._drawRunner(g, pts, this.playerZ, this.laneX, this.py,
                                                  this.runnerSkin, this._playerMode(), 0);
            else                 this._drawChaser(g, pts);
        }

        this._drawChaseBar();
    }

    _playerMode() {
        if (this.time.now < this.stumbleTo) return 'hurt';
        if (this.sliding)                   return 'slide';
        if (this.py > 0)                    return 'jump';
        return 'run';
    }

    /// `cap` limits the drawn height to that multiple of the runner's own,
    /// or 0 for no limit.
    _drawRunner(g, pts, z, wx, py, skin, mode, cap) {
        const p = Lagos.at(pts, z);
        const s = p.scale * Lagos.PX;
        const x = Lagos.offX(p, wx);
        const h = cap ? Math.min(ROAD.PERSON_H * s, this.playerPx * cap)
                      : ROAD.PERSON_H * s;
        if (h < 3) return;

        // The shadow is what tells you how high you are.
        g.fillStyle(0x000000, 0.30 * Math.max(0.12, 1 - py / 700));
        g.fillEllipse(x, p.y, h * 0.52, h * 0.15);

        Runner.draw(g, x, p.y - py * s, h, mode, this.runPhase, skin);
    }

    /// Where he is drawn, which is not quite where he is. See CHASER_SHOW.
    _chaserZ() {
        const C = ChaseScene;
        const d = Phaser.Math.Clamp(
            (C.CHASER_SHOW - this.chaseGap) / (C.CHASER_SHOW - C.CAUGHT_AT), 0, 1);
        const held = C.CHASER_Z_FIRST + (C.CHASER_Z_LAST - C.CHASER_Z_FIRST) * d;
        return this.playerZ - Math.min(this.chaseGap, held);
    }

    /// He is nearer the camera than the runner, so perspective would have him
    /// fill the screen. Capped at twice the runner's height: close enough to
    /// loom, not so close that there is nothing else to look at.
    _drawChaser(g, pts) {
        this._drawRunner(g, pts, this._chaserZ(), this.chaserX, 0,
                         this.chaserSkin, 'run', ChaseScene.CHASER_CAP);
    }

    _drawChaseBar() {
        const C = ChaseScene;
        const g = this.chaseGfx;
        g.clear();

        const t = Phaser.Math.Clamp(
            1 - (this.chaseGap - C.CAUGHT_AT) / (C.CHASE_MAX - C.CAUGHT_AT), 0, 1);
        const w = 120, x = GAME_W - w - 12, y = 12;
        g.fillStyle(0x140808, 0.8); g.fillRoundedRect(x, y, w, 9, 4);
        g.fillStyle(t > 0.72 ? 0xff3322 : t > 0.45 ? 0xffaa22 : 0x66cc55, 0.95);
        g.fillRoundedRect(x, y, Math.max(3, Math.round(w * t)), 9, 4);
        g.lineStyle(0.6, 0x000000, 0.6); g.strokeRoundedRect(x, y, w, 9, 4);

        // The danger frame goes in the HUD layer, not the flash layer: the
        // stumble tween owns gFx and the two would clear each other.
        this.warnText.setText(t > 0.72 ? 'HE DEY COME!' : '');
        if (t > 0.72) {
            g.fillStyle(0x880000, (t - 0.72) * 0.9);
            g.fillRect(0, 0, GAME_W, 14);
            g.fillRect(0, GAME_H - 14, GAME_W, 14);
        }
    }

    // ── Endings ───────────────────────────────────────────────────────────

    _caught() {
        if (this.over) return;

        if (this.skubuCount > 0) { this._offerEscape(); return; }
        this._gameOver();
    }

    /// One skubu buys back the ground you lost. The run continues rather than
    /// restarting, which is what the 2D mode's continue does too.
    _offerEscape() {
        this.over = true;
        const panel = this._overlay();

        panel.push(this.add.text(GAME_W / 2, this._y(0.24), 'HE DON CATCH YOU!', {
            fontSize: '24px', color: '#ff4444', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0));

        panel.push(this.add.text(GAME_W / 2, this._y(0.34),
            `Spend 1 skubu to break away?\n(you have ${this.skubuCount})`, {
            fontSize: '12px', color: '#cfd6e0', fontFamily: 'monospace',
            align: 'center',
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0));

        // Stacked, not side by side: two buttons on one line do not fit a
        // portrait canvas.
        const spend = this.add.text(GAME_W / 2, this._y(0.47), '[ SPEND 1 ✦ ]', {
            fontSize: '16px', color: '#ffcc22', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0).setInteractive({ useHandCursor: true });

        const quit = this.add.text(GAME_W / 2, this._y(0.56), '[ GIVE UP ]', {
            fontSize: '16px', color: '#889', fontFamily: 'monospace',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0).setInteractive({ useHandCursor: true });

        panel.push(spend, quit);
        spend.once('pointerdown', () => {
            panel.forEach(o => o.destroy());
            RunStore.debit(1, 'Broke away from the chase');
            this.skubuCount = RunStore.skubu();
            this.skubuLabel.setText(`✦ SKUBU: ${this.skubuCount}`);
            this._escape();
        });
        quit.once('pointerdown', () => {
            panel.forEach(o => o.destroy());
            this.over = false;
            this._gameOver();
        });
    }

    _escape() {
        this.over        = false;
        this.chaseGap    = ChaseScene.CHASE_MAX;
        this.speedTarget = ChaseScene.SPEED_BASE;
        this.speed       = ChaseScene.SPEED_BASE;
        this.stumbleTo   = 0;
        // Clear the road immediately ahead, or the escape is spent at once.
        this.hazards = this.hazards.filter(h => h.z > this.playerZ + 9000);
        this.cameras.main.flash(260, 255, 255, 255);
    }

    _gameOver() {
        if (this.over) return;
        this.over = true;

        RunStore.saveScore(this.score);
        if (typeof Player !== 'undefined' && Player.exists()) {
            Player.payForRun(this.score, Player.cityId());
            Player.passTime(1);
        }
        if (this.pendingSkubu > 0 && window.SkubuChain) {
            window.SkubuChain.mintSkubu(this.pendingSkubu, this.sessionId);
        }
        this.sound.play('snd_gameover', { volume: 0.7 });

        const blockedUntil = RunStore.recordLossAndCheck();
        if (blockedUntil) { this._showCooldown(blockedUntil); return; }

        this._overlay();
        this.add.text(GAME_W / 2, this._y(0.275), 'CAUGHT!', {
            fontSize: '34px', color: '#ff4444', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        this.add.text(GAME_W / 2, this._y(0.395),
            `Score ${this.score}   ·   ${Math.floor(this.metres)} m   ·   ${this.coinsTaken} ✦`, {
            fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        this.add.text(GAME_W / 2, this._y(0.535), 'Click or SPACE to run again', {
            fontSize: '13px', color: '#aab', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        this._menuLink(this._y(0.645));
        this.input.keyboard.once('keydown-SPACE', () => this._restart());
        this.input.once('pointerdown', () => this._restart());
    }

    _restart() { this.scene.restart(); }

    /// End screens are laid out in fractions of the canvas, so the same
    /// screen works on a tall portrait canvas and a wide landscape one.
    _y(f) { return Math.round(GAME_H * f); }

    _overlay() {
        const ol = this.add.graphics().setDepth(100).setScrollFactor(0);
        ol.fillStyle(0x000000, 0.78);
        ol.fillRect(0, 0, GAME_W, GAME_H);
        return [ol];
    }

    _menuLink(y) {
        const link = this.add.text(GAME_W / 2, y, '[ MENU ]', {
            fontSize: '14px', color: '#66aaff', fontFamily: 'monospace',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0)
          .setInteractive({ useHandCursor: true });
        link.on('pointerdown', () => { window.location.href = 'index.html'; });
        return link;
    }

    /// The play limit is shared with the 2D mode, so a loss here costs the
    /// same as a loss there and neither mode is a way around the gate.
    _showCooldown(resetAt) {
        this.over = true;
        this._overlay();

        this.add.text(GAME_W / 2, this._y(0.25), 'OUT OF PLAYS', {
            fontSize: '24px', color: '#ff4444', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        const clock = this.add.text(GAME_W / 2, this._y(0.375), '', {
            fontSize: '28px', color: '#ffcc22', fontFamily: 'monospace',
            stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        const tick = () => {
            const ms = Math.max(0, resetAt - Date.now());
            const h  = Math.floor(ms / 3600000);
            const m  = Math.floor((ms % 3600000) / 60000);
            const s  = Math.floor((ms % 60000) / 1000);
            clock.setText(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            if (ms <= 0) window.location.reload();
        };
        tick();
        this.time.addEvent({ delay: 1000, loop: true, callback: tick });

        this._menuLink(this._y(0.525));
    }
}
