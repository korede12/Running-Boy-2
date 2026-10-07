// ── Phaser game entry point ───────────────────────────────────────────────
// Where the player went on the map decides the scene. The character only
// decides who runs it — most venues are side-on and share GameScene, but a
// chase is a different camera altogether and brings its own.

const START_SCENE = (() => {
    if (GAME_MODE === 'chase' && typeof ChaseScene !== 'undefined') return ChaseScene;
    if (GAME_MODE === 'fight' && typeof FightScene !== 'undefined') return FightScene;
    return GameScene;
})();

new Phaser.Game({
    type:            Phaser.AUTO,
    width:           GAME_W,
    height:          GAME_H,
    backgroundColor: '#000000',
    pixelArt:        true,
    scene:           START_SCENE,
    scale: {
        mode:          Phaser.Scale.FIT,
        autoCenter:    Phaser.Scale.CENTER_BOTH,
        // Measure the real viewport rather than the document, which iOS
        // Safari reports taller than the visible area.
        expandParent:  false,
        width:         GAME_W,
        height:        GAME_H,
    },
});
