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

// Game phase
let engineState = GAME_STATE_MENU;
let worldW = 2000, worldH = 600;

// FPS
let fps = 0, frameCount = 0, fpsAccum = 0, lastTime = 0;
let lightingRecalcTimer = 0;

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

    // Crafting UI (needs inventory + detector)
    craftingUI = new CraftingUI(inventory, workstationDetector);
    craftingUI.hud = null; // set after hud is created — see below

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

    // Buffs
    const buffResult = buffs.update(dt, player);

    // Player movement (skip if inventory open, dead, or in dialogue)
    if (!inventory.isOpen && !player.isDead && !dialogueSystem.active) {
        let speedMod = combat.getSpeedModifier();
        speedMod *= equipment.getMoveSpeedMultiplier();
        speedMod *= buffResult.moveMultiplier;
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

    // Use health potion (key H) — also applies regen buff
    if (input.isKeyJustPressed('KeyH') && inventory.hasItem('health_potion') && player.hp < player.maxHp) {
        inventory.removeItem('health_potion', 1);
        player.hp = Math.min(player.maxHp, player.hp + 50);
        buffs.apply('regen');
        if (window._audio) window._audio.playSelect();
        hud.showMessage('Poção de Vida usada! +50 HP + Regen', 2, '#ff4466');
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
    const def = equipment ? equipment.totalDefense : 0;
    const stations = workstationDetector ? workstationDetector.getAvailable().join(',') || 'nenhuma' : '-';
    debugEl.innerHTML =
        `Pos: ${bx}, ${by}<br>` +
        `HP: ${Math.ceil(player.hp)}/${player.maxHp} | DEF: ${def}<br>` +
        `Time: ${lighting.getTimeString()} | ${lighting.isNight() ? '🌙' : '☀️'}<br>` +
        `Chunks: ${visibleChunks} | Enemies: ${entities.getEnemies().length} | Drops: ${entities.dropManager.getCount()}<br>` +
        `Kills: ${entities.totalKills} | Buffs: ${buffs ? buffs.getActiveCount() : 0} | Stations: ${stations}<br>` +
        `NPCs: ${npcManager.npcs.length} | QA: ${qaBot.isActive() ? 'ON' : 'OFF'}`;
}

// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', init);
