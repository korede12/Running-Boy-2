// ── Phaser game entry point ───────────────────────────────────────────────
new Phaser.Game({
    type:            Phaser.AUTO,
    width:           GAME_W,
    height:          GAME_H,
    backgroundColor: '#000000',
    pixelArt:        true,
    scene:           GameScene,
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
});
