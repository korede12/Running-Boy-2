// ── Phaser game entry point ───────────────────────────────────────────────
new Phaser.Game({
    type:            Phaser.AUTO,
    width:           400,
    height:          400,
    backgroundColor: '#000000',
    pixelArt:        true,
    scene:           GameScene,
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
});
