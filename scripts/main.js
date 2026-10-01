// ── Phaser game entry point ───────────────────────────────────────────────
// The chosen character decides the scene as well as the look: most themes
// are side-on and share GameScene, but a `mode` of 'chase' is a different
// camera altogether and brings its own.

const START_SCENE = (() => {
    const theme = (typeof getTheme === 'function') ? getTheme(RunStore.character()) : null;
    return (theme && theme.mode === 'chase' && typeof ChaseScene !== 'undefined')
        ? ChaseScene
        : GameScene;
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
