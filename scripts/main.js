// ── Phaser game entry point ───────────────────────────────────────────────
new Phaser.Game({
    type:            Phaser.AUTO,
    width:           GAME_W,
    height:          GAME_H,
    backgroundColor: '#000000',
    pixelArt:        true,
    scene:           GameScene,
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
