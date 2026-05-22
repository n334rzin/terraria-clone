/**
 * Engine — Full game orchestrator v2.0
 * Integrates: Menu, World, Chunks, Player, Camera, Input, Inventory, Combat,
 *             Enemies, NPCs, Lighting, HUD, GameState, BlockTextures,
 *             Audio, Particles, QABot.
 */

const MAX_DT = 0.05;
const GAME_STATE_MENU = 0;
const GAME_STATE_PLAYING = 1;

// ---- DOM ----
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const fpsEl  = document.getElementById('fps-counter');
const debugEl= document.getElementById('debug-info');

// ---- All systems ----
let camera, chunkManager, player, generator;
let input, inventory, hud, lighting, combat, entities, gameState, blockTextures;
let audio, particles, menu, npcManager, qaBot, dialogueSystem;
let workstationDetector, craftingUI, equipment, buffs;
let statSystem, mountManager, alchemySystem;

// Game phase
let engineState = GAME_STATE_MENU;
let worldW = 2000, worldH = 600;

// FPS
let fps = 0, frameCount = 0, fpsAccum = 0, lastTime = 0;
let lightingRecalcTimer = 0;
let parallaxTime = 0;

// ---------------------------------------------------------------------------
function init() {
    resizeCanvas();

    // Audio (initialize early for menu sounds)
    audio = new AudioSystem();
    window._audio = audio;

    // Particles
    particles = new ParticleSystem();
    window._particles = particles;

    // QA Bot
    qaBot = new QABot();

    // Input
    input = new InputManager(canvas);
    window._input = input;

    // Menu
    menu = new MainMenu(canvas);

    // Listeners
    window.addEventListener('resize', resizeCanvas);

    // First user interaction unlocks audio
    const unlockAudio = () => { audio.resume(); window.removeEventListener('click', unlockAudio); };
    window.addEventListener('click', unlockAudio);

    _wireEvents();

    console.log('[Engine] Menu ready. Awaiting player start.');
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function startGame(config) {
    worldW = config.worldW;
    worldH = config.worldH;

    console.log(`[Engine] Generating world ${worldW}×${worldH}…`);
    const t0 = performance.now();
    const seed = Math.floor(Math.random() * 100000);
    generator = new WorldGenerator(worldW, worldH, seed);
    const worldData = generator.generate();
    console.log(`[Engine] World generated in ${(performance.now() - t0).toFixed(1)} ms`);

    // Block textures
    blockTextures = new BlockTextures();

    // Chunks
    chunkManager = new ChunkManager(worldData, worldW, worldH);

    // Lighting
    lighting = new LightingSystem(worldW, worldH, chunkManager.chunksX, chunkManager.chunksY);
    lighting.setSurface(generator._surface);

    // Inventory
    inventory = new InventorySystem();
    window._inventory = inventory;

    // Workstation detector (needs chunkManager)
    workstationDetector = new WorkstationDetector(chunkManager);

    // Equipment system
    equipment = new EquipmentSystem(inventory);
    window._equipment = equipment;

    // Buff system
    buffs = new BuffSystem();
    window._buffs = buffs;

    // Spawn player
    const spawnBlockX = Math.floor(worldW * 0.5);
    let spawnBlockY = generator.getSurfaceY(spawnBlockX) - 3;
    while (spawnBlockY > 0 && chunkManager.getBlockAt(spawnBlockX, spawnBlockY) !== BLOCK.AIR) {
        spawnBlockY--;
    }
    player = new Player(spawnBlockX * BLOCK_SIZE, spawnBlockY * BLOCK_SIZE, chunkManager);
    player.setColors(config.playerColors);

    // Camera
    camera = new Camera(canvas.width, canvas.height);
    camera.setWorldBounds(worldW * BLOCK_SIZE, worldH * BLOCK_SIZE);
    const { cx, cy } = player.getCenter();
    camera.x = cx - canvas.width * 0.5;
    camera.y = cy - canvas.height * 0.5;

    // HUD
    hud = new HUD();

    // Entities
    entities = new EntityManager(chunkManager, lighting);

    // Dialogue system
    dialogueSystem = new DialogueSystem();
    // Wire dialogue actions to gameState
    dialogueSystem.onOptionSelected = (action) => {
        if (gameState) gameState.handleDialogueAction(action, player);
    };

    // NPCs
    npcManager = new NPCManager(chunkManager, lighting);
    npcManager.spawnGuide(player.x, player.y);

    // StatSystem (single source of truth for derived stats)
    statSystem = new StatSystem(equipment, buffs);
    window._statSystem = statSystem;

    // Mount manager
    mountManager = new MountManager(statSystem, hud);
    window._mountManager = mountManager;

    // Alchemy system
    alchemySystem = new AlchemySystem(inventory, workstationDetector, hud, buffs);
    window._alchemySystem = alchemySystem;

    // Crafting UI (needs inventory + detector)
    craftingUI = new CraftingUI(inventory, workstationDetector);

    // Combat
    combat = new CombatSystem(chunkManager, inventory, entities, lighting, hud);
    window._combat = combat;

    // Wire craftingUI → hud
    craftingUI.hud = hud;

    // Game state
    gameState = new GameState(hud, entities, inventory, lighting);
    window._gameState = gameState;

    // QA Bot from menu
    if (config.qaBotEnabled) qaBot.active = true;

    // Show intro
    setTimeout(() => gameState.showIntro(), 1000);

    engineState = GAME_STATE_PLAYING;
    menu.destroy();
    console.log('[Engine] All systems initialized. Game started.');
}

// ---------------------------------------------------------------------------
// EVENT WIRING — único lugar que conecta eventos a áudio/partículas/HUD
// Nenhum sistema de gameplay precisa saber que audio ou particles existem.
// ---------------------------------------------------------------------------
function _wireEvents() {
    // --- Blocos ---
    events.on('block:break', ({ bx, by, blockId }) => {
        if (audio) audio.playBlockBreak();
        if (particles) {
            const color = BLOCK_COLORS[blockId] || '#666';
            particles.emitBlockBreak(bx * BLOCK_SIZE, by * BLOCK_SIZE, color);
        }
    });

    events.on('block:place', ({ bx, by }) => {
        if (audio) audio.playPlace();
    });

    // --- Item coletado ---
    events.on('item:pickup', ({ name, quantity, x, y }) => {
        if (particles) particles.emitBlockBreak(x, y, '#ffee88');
        if (hud) hud.showPickup(name, quantity);
    });

    // --- Combate ---
    events.on('enemy:damage', ({ x, y }) => {
        if (particles) particles.emitHitSparks(x, y);
    });

    events.on('combat:hit', () => {
        if (audio) audio.playHit();
    });

    events.on('player:damage', ({ x, y }) => {
        if (audio) audio.playDamage();
        if (particles) particles.emitPlayerDamage(x, y);
    });

    events.on('player:webbed', () => {
        if (audio) audio.playHit();
    });

    // --- Crafting ---
    events.on('item:craft', () => {
        if (audio) audio.playSelect();
    });

    // --- Bosses ---
    events.on('boss:spawn', () => {
        if (audio) audio.playDamage();
    });

    events.on('boss:death', () => {
        if (audio) audio.playVictory();
    });

    // --- Vitória ---
    events.on('game:victory', ({ time, bossesDefeated }) => {
        if (audio) audio.playSelect();
        console.log(`[Engine] VITÓRIA em ${time}. Bosses: ${bossesDefeated}/3`);
    });

    // --- Mount AOE (stomp, dive bomb, golem smash) ---
    events.on('player:aoe', ({ x, y, radius, damage }) => {
        if (!entities) return;
        for (const e of entities.getEnemies()) {
            const ecx = e.x + e.w * 0.5;
            const ecy = e.y + e.h * 0.5;
            const dx = ecx - x, dy = ecy - y;
            if (dx * dx + dy * dy < radius * radius) {
                e.takeDamage(damage, Math.sign(dx), -0.5, 300);
                events.emit('enemy:damage', { enemy: e, amount: damage, x: ecx, y: ecy, source: 'mount_aoe' });
            }
        }
        if (particles) particles.emitBlockBreak(x, y, '#ffcc44');
        if (audio) audio.playHit();
    });

    // --- Alchemy explosion effect ---
    events.on('alchemy:explosion', () => {
        if (audio) audio.playDamage();
        if (particles && player) particles.emitPlayerDamage(player.x + 8, player.y + 16);
    });
}

function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    if (camera) camera.resize(canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
function gameLoop(timestamp) {
    const rawDt = (timestamp - lastTime) / 1000;
    const dt    = Math.min(rawDt, MAX_DT);
    lastTime    = timestamp;

    if (rawDt > 0.5) { requestAnimationFrame(gameLoop); return; }

    // FPS
    frameCount++;
    fpsAccum += dt;
    if (fpsAccum >= 1.0) {
        fps = Math.round(frameCount / fpsAccum);
        frameCount = 0; fpsAccum = 0;
        fpsEl.textContent = `FPS: ${fps}`;
    }

    if (engineState === GAME_STATE_MENU) {
        const shouldStart = menu.update(dt);
        menu.draw(ctx, canvas.width, canvas.height);
        if (shouldStart) startGame(menu.getConfig());
    } else {
        update(dt);
        render(dt);
    }

    input.endFrame();
    requestAnimationFrame(gameLoop);
}

// ---------------------------------------------------------------------------
function update(dt) {
    // Input → world coords
    input.update(camera);
    inventory.handleInput(input);

    // QA Bot toggle
    if (input.isKeyJustPressed('KeyP')) {
        qaBot.toggle();
    }

    // QA Bot control
    if (qaBot.isActive()) {
        qaBot.update(dt, player, input, chunkManager, entities, combat, lighting, inventory);
    }

    // Workstation + crafting update
    workstationDetector.update(player);
    if (inventory.isOpen) {
        craftingUI.refresh();
        craftingUI.update(dt, input);
    }

    // StatSystem: single update call consolidates equipment + buffs + mount stats
    statSystem.update(dt, player);

    // Alchemy system (open with T)
    if (input.isKeyJustPressed('KeyT')) alchemySystem.toggle();
    alchemySystem.update(dt, input);

    // Mount system (open/close with G)
    if (input.isKeyJustPressed('KeyG') && !alchemySystem.isOpen) {
        mountManager.tryMountAuto(player, inventory);
    }
    mountManager.update(dt, player, input, chunkManager);

    // Player movement (skip if inventory open, dead, in dialogue, or mounted)
    if (!inventory.isOpen && !player.isDead && !dialogueSystem.active && !mountManager.isMounted()) {
        let speedMod = combat.getSpeedModifier();
        speedMod *= statSystem.moveSpeed;
        player.update(dt, speedMod);
    }

    // Player swing animation
    player.updateSwing(dt);

    // Camera follow
    const { cx, cy } = player.getCenter();
    camera.update(cx, cy, dt);

    // Combat (mining, building, attack, contact damage)
    if (!inventory.isOpen && !qaBot.isActive() && !dialogueSystem.active) {
        combat.update(dt, player, input);
    }

    // Use boss summoning items
    const selItem = inventory.getSelectedItem();
    if (selItem && input.mouseJustPressed.right) {
        if (['old_battery', 'mech_heart', 'deep_invoker'].includes(selItem.id)) {
            gameState.trySummonBoss(player, selItem.id);
        }
    }

    // Entities (passa inventário para drops fazerem pickup)
    entities.update(dt, player, inventory);

    // NPCs
    npcManager.update(dt, player, entities.getEnemies(), gameState);
    if (!dialogueSystem.active) {
        npcManager.tryInteract(player, input, dialogueSystem, gameState);
    }

    // Dialogue system
    if (dialogueSystem.active) {
        dialogueSystem.update(dt, input);
    }

    // Use potion (key H) — check selected item first for alchemy potions, then fallback to health_potion
    if (input.isKeyJustPressed('KeyH') && player.hp < player.maxHp) {
        const selPotion = inventory.getSelectedItem();
        let used = false;
        if (selPotion && selPotion.type === 'consumable' && selPotion.buffId) {
            used = alchemySystem.usePotion(selPotion.id, player);
        }
        if (!used && inventory.hasItem('health_potion')) {
            inventory.removeItem('health_potion', 1);
            player.hp = Math.min(player.maxHp, player.hp + 50);
            buffs.apply('regen');
            if (window._audio) window._audio.playSelect();
            hud.showMessage('Poção de Vida usada! +50 HP + Regen', 2, '#ff4466');
        }
    }

    // Equip item (key R when inventory is open)
    if (inventory.isOpen && input.isKeyJustPressed('KeyR')) {
        const sel = inventory.getSelectedSlot();
        if (sel && sel.itemId) {
            const def = getItemDef(sel.itemId);
            if (def && def.slot) {
                equipment.equip(sel.itemId);
                hud.showMessage(`${def.name} equipado!`, 2, '#88aaff');
            }
        }
    }

    // Check enemy kills for crystal drops
    for (const e of entities.getEnemies()) {
        if (e.isDead() && !e._deathProcessed) {
            e._deathProcessed = true;
            gameState.onEnemyKilled(e);
        }
    }

    parallaxTime += dt;

    // Particles
    particles.update(dt);

    // Lighting
    lighting.update(dt);
    lightingRecalcTimer -= dt;
    if (lightingRecalcTimer <= 0) {
        const view = camera.getViewBounds();
        lighting.recalcVisible(view.left, view.top, view.right, view.bottom);
        lightingRecalcTimer = 0.25;
    }

    // HUD
    hud.update(dt);

    // Game state
    gameState.update(dt, player);

    // Export button click detection
    if (input.mouseJustPressed.left && qaBot._exportBtnRect) {
        if (qaBot.checkExportClick(input.mouseScreenX, input.mouseScreenY)) {
            qaBot.downloadReport();
        }
    }
}

// ---------------------------------------------------------------------------
function render(dt) {
    const shake = hud.getShakeOffset();

    ctx.save();
    ctx.translate(shake.sx, shake.sy);

    // --- Sky ---
    const skyColors = lighting.getSkyColors();
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, skyColors.top);
    skyGrad.addColorStop(0.5, skyColors.mid);
    skyGrad.addColorStop(1, skyColors.bot);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

    // --- Parallax background ---
    renderParallax(ctx, camera, canvas.width, canvas.height);

    // --- World chunks ---
    const chunkInfo = chunkManager.draw(ctx, camera, blockTextures);

    // --- Lighting overlay ---
    for (let cy = chunkInfo.cyMin; cy <= chunkInfo.cyMax; cy++) {
        for (let cx = chunkInfo.cxMin; cx <= chunkInfo.cxMax; cx++) {
            lighting.drawChunkOverlay(ctx, cx, cy, camera);
        }
    }

    // --- NPCs ---
    npcManager.draw(ctx, camera, player);

    // --- Enemies ---
    entities.draw(ctx, camera);

    // --- Mount ---
    mountManager.draw(ctx, camera);

    // --- Player ---
    player.draw(ctx, camera);

    // --- Particles ---
    particles.draw(ctx, camera);

    // --- Combat visuals (mining bar, attack arc, cursor) ---
    combat.draw(ctx, camera, player);

    ctx.restore();

    // --- UI layer (not affected by shake) ---
    inventory.drawHotbar(ctx, canvas.width);
    hud.draw(ctx, canvas.width, canvas.height, player);
    inventory.drawInventory(ctx, canvas.width, canvas.height);

    // --- Crafting & Equipment panels (when inventory open) ---
    if (inventory.isOpen) {
        craftingUI.draw(ctx, canvas.width, canvas.height);
        equipment.draw(ctx, canvas.width - 120, 60);
    }

    // --- Buff icons ---
    buffs.draw(ctx, canvas.width * 0.5 - 60, 62);

    // --- Alchemy UI ---
    alchemySystem.draw(ctx, canvas.width, canvas.height);

    // --- Dialogue box ---
    if (dialogueSystem.active) {
        dialogueSystem.draw(ctx, canvas.width, canvas.height);
    }

    // --- QA Bot overlay ---
    qaBot.draw(ctx, canvas.width, canvas.height);
    if (qaBot.isActive()) {
        qaBot.drawExportButton(ctx, canvas.width);
    }

    // --- Debug ---
    updateDebugHUD(chunkInfo.count);
}

// ---------------------------------------------------------------------------
function updateDebugHUD(visibleChunks) {
    const { bx, by } = player.getBlockPos();
    const def   = statSystem ? statSystem.defense   : 0;
    const spd   = statSystem ? statSystem.moveSpeed.toFixed(2) : '1.00';
    const mine  = statSystem ? statSystem.mineSpeed.toFixed(2) : '1.00';
    const mnt   = mountManager && mountManager.isMounted() ? mountManager.activeMount.type : '-';
    const stations = workstationDetector ? workstationDetector.getAvailable().join(',') || 'nenhuma' : '-';
    debugEl.innerHTML =
        `Pos: ${bx}, ${by}<br>` +
        `HP: ${Math.ceil(player.hp)}/${player.maxHp} | DEF: ${def} | SPD: ${spd} | MINE: ${mine}<br>` +
        `Time: ${lighting.getTimeString()} | ${lighting.isNight() ? 'Noite' : 'Dia'} | Mount: ${mnt}<br>` +
        `Chunks: ${visibleChunks} | Enemies: ${entities.getEnemies().length} | Drops: ${entities.dropManager.getCount()}<br>` +
        `Kills: ${entities.totalKills} | Buffs: ${buffs ? buffs.getActiveCount() : 0} | Stations: ${stations}<br>` +
        `NPCs: ${npcManager.npcs.length} | QA: ${qaBot.isActive() ? 'ON [P]' : 'OFF [P]'}`;
}

// ---------------------------------------------------------------------------
// PARALLAX BACKGROUND — drawn between sky gradient and world chunks
// ---------------------------------------------------------------------------
function renderParallax(ctx, cam, cw, ch) {
    if (!lighting) return;

    // Compute horizon Y in screen space (where surface meets sky)
    const midX = Math.floor(worldW / 2);
    const surfIdx = lighting.surfaceY ? Math.min(midX, lighting.surfaceY.length - 1) : -1;
    const surfBlockY = surfIdx >= 0 ? lighting.surfaceY[surfIdx] : Math.floor(worldH * 0.45);
    const horizonScreen = surfBlockY * BLOCK_SIZE - cam.y;

    // Only draw when sky is partly visible
    if (horizonScreen < -ch * 0.1) return;

    const isNight = lighting.isNight();
    const clampedHorizon = Math.min(horizonScreen, ch);

    // --- Stars (night only) ---
    if (isNight) {
        _parallaxStars(ctx, cam.x, cam.y, cw, clampedHorizon);
    }

    // --- Mountain layer 1 — far, very slow scroll ---
    const col1 = isNight ? '#0d1b2a' : '#2c3e50';
    _parallaxMountains(ctx, cam.x * 0.04 + 7777, cw, clampedHorizon, col1, 0.38, 0.22, 120, 0);

    // --- Mountain layer 2 — mid ---
    const col2 = isNight ? '#1a2a3a' : '#3d5166';
    _parallaxMountains(ctx, cam.x * 0.12 + 3333, cw, clampedHorizon, col2, 0.26, 0.14, 90, 1337);

    // --- Mountain layer 3 — near ---
    const col3 = isNight ? '#1c3344' : '#4a6741';
    _parallaxMountains(ctx, cam.x * 0.25 + 1111, cw, clampedHorizon, col3, 0.16, 0.09, 70, 2701);

    // --- Clouds ---
    if (!isNight) {
        _parallaxClouds(ctx, cam.x * 0.07, cw, clampedHorizon);
    }
}

function _parallaxStars(ctx, camX, camY, cw, horizonY) {
    // Use deterministic pseudo-random from seed so stars don't flicker on redraw
    ctx.save();
    const pxOff = (camX * 0.02) % cw;
    const pyOff = (camY * 0.02) % 200;
    const seed = 9301;
    let lcg = seed;
    const rng = () => { lcg = (lcg * 1664525 + 1013904223) & 0xffffffff; return (lcg >>> 0) / 0xffffffff; };

    for (let i = 0; i < 140; i++) {
        const sx = ((rng() * cw * 3 - pxOff) % (cw + 40) + cw + 40) % (cw + 40) - 20;
        const sy = ((rng() * (horizonY - 20) - pyOff) % (horizonY + 20) + horizonY + 20) % (horizonY + 20);
        const r = rng() * 1.2 + 0.3;
        const blink = 0.5 + 0.5 * Math.sin(parallaxTime * (1.5 + rng() * 2) + i * 1.7);
        ctx.fillStyle = `rgba(255,255,240,${0.4 + blink * 0.6})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function _parallaxMountains(ctx, offsetX, cw, horizonY, color, heightFrac, jagginess, freq, seed) {
    if (horizonY <= 0) return;
    const baseY = horizonY;
    const ampY  = horizonY * heightFrac;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, baseY);

    const steps = Math.ceil(cw / freq) + 4;
    for (let i = -2; i <= steps; i++) {
        const wx = i * freq - (offsetX % freq);
        const noise =
            Math.sin(wx * 0.0031 + seed)      * 0.5 +
            Math.sin(wx * 0.0073 + seed * 1.3) * 0.3 +
            Math.sin(wx * 0.0157 + seed * 0.7) * 0.2;
        const y = baseY - ampY * (0.5 + noise * jagginess / 0.22);
        ctx.lineTo(wx, y);
    }

    ctx.lineTo(cw + 10, baseY);
    ctx.lineTo(cw + 10, baseY + 20);
    ctx.lineTo(-10, baseY + 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function _parallaxClouds(ctx, offsetX, cw, horizonY) {
    if (horizonY <= 20) return;
    ctx.save();
    // Five deterministic clouds
    const clouds = [
        { xFrac: 0.1, yFrac: 0.25, w: 120, h: 30 },
        { xFrac: 0.3, yFrac: 0.12, w: 180, h: 40 },
        { xFrac: 0.55, yFrac: 0.3, w: 100, h: 25 },
        { xFrac: 0.7, yFrac: 0.18, w: 150, h: 35 },
        { xFrac: 0.9, yFrac: 0.08, w: 200, h: 45 },
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const c of clouds) {
        const cx = ((c.xFrac * cw * 2 - offsetX + parallaxTime * 8) % (cw + c.w + 60) + cw + c.w + 60) % (cw + c.w + 60) - c.w;
        const cy = horizonY * c.yFrac;
        _drawCloud(ctx, cx, cy, c.w, c.h);
    }
    ctx.restore();
}

function _drawCloud(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.6, w * 0.5, h * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.3, y + h * 0.5, w * 0.3, h * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.7, y + h * 0.5, w * 0.28, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
}

// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', init);
