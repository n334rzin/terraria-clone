/**
 * AlchemySystem — Experimental crafting at the Alchemy Table.
 *
 * How it works:
 *   1. Player opens alchemy panel (T key near alchemy_table).
 *   2. Up to 3 ingredients are queued (number keys 1-3 to add from hotbar).
 *   3. Player selects temperature (Cold / Warm / Hot / Molten) with Left/Right.
 *   4. Brew time counts down (2-4 s based on recipe complexity).
 *   5. On completion:
 *      - Correct temp  → potion discovered + crafted with quality variance.
 *      - Wrong temp    → degraded result or small explosion particle burst.
 *   6. Discovered combos are shown with their names; unknown = "???" until found.
 *
 * Temperatures:
 *   COLD    → speed potions (no heat)
 *   WARM    → regen potions (gentle heat)
 *   HOT     → defense potions (strong heat)
 *   MOLTEN  → mine-haste potions (extreme heat)
 */

const ALCHEMY_TEMP = Object.freeze({ COLD: 0, WARM: 1, HOT: 2, MOLTEN: 3 });
const ALCHEMY_TEMP_LABELS = ['Frio', 'Morno', 'Quente', 'Vulcânico'];
const ALCHEMY_TEMP_COLORS = ['#88ccff', '#ffcc44', '#ff6622', '#ff2200'];

// Each recipe: { ingredients (sorted), temp, result buffId, resultItem }
const ALCHEMY_RECIPES = [
    { ingredients: ['herb_green', 'mushroom'],           temp: ALCHEMY_TEMP.COLD,   resultItem: 'potion_speed',   quality: [1, 2] },
    { ingredients: ['herb_blue', 'stone'],               temp: ALCHEMY_TEMP.HOT,    resultItem: 'potion_defense', quality: [1, 2] },
    { ingredients: ['herb_red', 'coal_ore'],             temp: ALCHEMY_TEMP.MOLTEN, resultItem: 'potion_mining',  quality: [1, 3] },
    { ingredients: ['herb_green', 'herb_red', 'crystal_fragment'], temp: ALCHEMY_TEMP.WARM, resultItem: 'potion_regen', quality: [1, 2] },
    { ingredients: ['mushroom', 'coal_ore'],             temp: ALCHEMY_TEMP.WARM,   resultItem: 'health_potion',  quality: [1, 2] },
];

class AlchemySystem {
    constructor(inventory, workstationDetector, hud, buffs) {
        this.inventory  = inventory;
        this.detector   = workstationDetector;
        this.hud        = hud;
        this.buffs      = buffs;

        this.isOpen      = false;
        this.temperature = ALCHEMY_TEMP.WARM;

        // Queue of ingredient item IDs (max 3)
        this.ingredients = [];

        // Brew state
        this.brewing     = false;
        this.brewTimer   = 0;
        this.brewMax     = 3;

        // Discovery set — recipe indices the player has found
        this.discovered  = new Set();

        // UI state
        this.flashTimer  = 0;
        this.flashColor  = '#ffffff';
        this.resultMsg   = '';
    }

    /**
     * Toggle panel open/close (T key).
     */
    toggle() {
        if (!this.detector.hasStation('alchemy')) {
            if (this.hud) this.hud.showMessage('Sem Mesa de Alquimia por perto!', 2, '#ff8888');
            return;
        }
        this.isOpen = !this.isOpen;
        if (!this.isOpen) this._reset();
    }

    _reset() {
        this.ingredients = [];
        this.brewing = false;
        this.brewTimer = 0;
        this.resultMsg = '';
    }

    /**
     * Add selected hotbar item as an ingredient.
     * Called when player presses A while alchemy panel is open.
     */
    addIngredient() {
        if (this.brewing || this.ingredients.length >= 3) return;
        const item = this.inventory.getSelectedItem();
        if (!item || item.type !== 'material') {
            if (this.hud) this.hud.showMessage('Selecione um material!', 1, '#ff8888');
            return;
        }
        if (!this.inventory.hasItem(item.id)) return;

        this.ingredients.push(item.id);
        this.inventory.removeItem(item.id, 1);
        if (window._audio) window._audio.playSelect();
    }

    /**
     * Remove last ingredient (returns it to inventory).
     */
    removeLastIngredient() {
        if (this.brewing || this.ingredients.length === 0) return;
        const id = this.ingredients.pop();
        this.inventory.addItem(id, 1);
    }

    /**
     * Start brewing with current ingredients and temperature.
     */
    startBrew() {
        if (this.brewing || this.ingredients.length === 0) return;
        this.brewing = true;
        this.brewMax = 2 + this.ingredients.length * 0.5;
        this.brewTimer = 0;
    }

    update(dt, input) {
        if (!this.isOpen) return;
        if (this.flashTimer > 0) this.flashTimer -= dt;

        // Temperature: Left/Right
        if (input.isKeyJustPressed('ArrowLeft')) {
            this.temperature = Math.max(0, this.temperature - 1);
        }
        if (input.isKeyJustPressed('ArrowRight')) {
            this.temperature = Math.min(3, this.temperature + 1);
        }

        // Add ingredient: A
        if (input.isKeyJustPressed('KeyA')) this.addIngredient();

        // Remove ingredient: Z
        if (input.isKeyJustPressed('KeyZ')) this.removeLastIngredient();

        // Start brew: Enter
        if (input.isKeyJustPressed('Enter') && !this.brewing) this.startBrew();

        // Close: T or Escape
        if (input.isKeyJustPressed('KeyT') || input.isKeyJustPressed('Escape')) {
            if (!this.brewing) { this.toggle(); return; }
        }

        // Brewing countdown
        if (this.brewing) {
            this.brewTimer += dt;
            if (this.brewTimer >= this.brewMax) {
                this._completeBrew();
            }
        }

        // Consume alchemy potions when pressing H while near alchemy table
        // (handled via normal H key in engine — potions are in inventory)
    }

    _completeBrew() {
        this.brewing = false;
        this.brewTimer = 0;

        const sorted = [...this.ingredients].sort();
        this.ingredients = [];

        // Find matching recipe
        const recipeIdx = ALCHEMY_RECIPES.findIndex(r => {
            if (r.ingredients.length !== sorted.length) return false;
            const rs = [...r.ingredients].sort();
            return rs.every((v, i) => v === sorted[i]);
        });

        if (recipeIdx === -1) {
            // Unknown combo → explosion effect
            this.flashTimer = 0.5;
            this.flashColor = '#ff4400';
            this.resultMsg = 'Explosão! Combinação inválida.';
            if (this.hud) this.hud.showMessage('Explosão de alquimia!', 2, '#ff4400');
            events.emit('alchemy:explosion', {});
            return;
        }

        const recipe = ALCHEMY_RECIPES[recipeIdx];
        const correct = recipe.temp === this.temperature;

        if (correct) {
            this.discovered.add(recipeIdx);
            const qty = recipe.quality[0] + Math.floor(Math.random() * (recipe.quality[1] - recipe.quality[0] + 1));
            this.inventory.addItem(recipe.resultItem, qty);
            const def = getItemDef(recipe.resultItem);
            const name = def ? def.name : recipe.resultItem;
            this.resultMsg = `${name} x${qty} criado!`;
            this.flashTimer = 0.4;
            this.flashColor = '#44ff88';
            if (this.hud) this.hud.showMessage(`${name} x${qty} criado!`, 3, '#44ff88');
            events.emit('alchemy:success', { itemId: recipe.resultItem, qty });
        } else {
            // Wrong temp → degraded: only 1 health potion consolation
            this.inventory.addItem('health_potion', 1);
            this.resultMsg = 'Temperatura errada! +1 Poção de Vida.';
            this.flashTimer = 0.4;
            this.flashColor = '#ffaa44';
            if (this.hud) this.hud.showMessage('Temp. errada! Obteve 1 Poção de Vida.', 2, '#ffaa44');
        }
    }

    /**
     * Handle using a potion from inventory (buffId-based consumables).
     * Called from engine when pressing H if selected item has buffId.
     */
    usePotion(itemId, player) {
        const def = getItemDef(itemId);
        if (!def || !def.buffId || !this.inventory.hasItem(itemId)) return false;
        this.inventory.removeItem(itemId, 1);
        this.buffs.apply(def.buffId);
        if (this.hud) this.hud.showMessage(`${def.name} usado!`, 2, '#44ff88');
        if (window._audio) window._audio.playSelect();
        return true;
    }

    draw(ctx, canvasW, canvasH) {
        if (!this.isOpen) return;

        const panelW = 260, panelH = 320;
        const px = canvasW * 0.5 - panelW * 0.5;
        const py = canvasH * 0.5 - panelH * 0.5;

        // Background
        const flashAlpha = this.flashTimer > 0 ? 0.25 : 0;
        ctx.fillStyle = `rgba(10,5,25,${0.92 + flashAlpha})`;
        ctx.fillRect(px, py, panelW, panelH);
        ctx.strokeStyle = ALCHEMY_TEMP_COLORS[this.temperature];
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, panelW, panelH);

        // Flash overlay
        if (this.flashTimer > 0) {
            ctx.fillStyle = `${this.flashColor}22`;
            ctx.fillRect(px, py, panelW, panelH);
        }

        // Title
        ctx.fillStyle = '#ddaaff';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Mesa de Alquimia', px + panelW * 0.5, py + 22);
        ctx.textAlign = 'left';

        // Temperature selector
        ctx.font = '11px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('Temperatura: ← →', px + 12, py + 44);
        ctx.fillStyle = ALCHEMY_TEMP_COLORS[this.temperature];
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ALCHEMY_TEMP_LABELS[this.temperature], px + panelW * 0.5, py + 62);
        ctx.textAlign = 'left';

        // Temperature bar
        const barX = px + 20, barY = py + 68, barW = panelW - 40, barH = 8;
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = i <= this.temperature ? ALCHEMY_TEMP_COLORS[i] : '#222';
            ctx.fillRect(barX + i * (barW / 4) + 1, barY, barW / 4 - 2, barH);
        }

        // Ingredients
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '10px monospace';
        ctx.fillText('Ingredientes [A=add, Z=remover]:', px + 12, py + 94);
        for (let i = 0; i < 3; i++) {
            const ix = px + 12 + i * 80;
            const iy = py + 100;
            ctx.fillStyle = this.ingredients[i] ? '#334' : '#1a1a2a';
            ctx.fillRect(ix, iy, 72, 36);
            ctx.strokeStyle = '#445';
            ctx.lineWidth = 1;
            ctx.strokeRect(ix, iy, 72, 36);
            if (this.ingredients[i]) {
                const def = getItemDef(this.ingredients[i]);
                ctx.fillStyle = def ? (def.color || '#fff') : '#fff';
                ctx.font = '9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(def ? def.name.substring(0, 8) : this.ingredients[i], ix + 36, iy + 22);
                ctx.textAlign = 'left';
            } else {
                ctx.fillStyle = '#333';
                ctx.font = '18px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('+', ix + 36, iy + 24);
                ctx.textAlign = 'left';
            }
        }

        // Brew button / progress
        const btnY = py + 150;
        if (this.brewing) {
            const pct = this.brewTimer / this.brewMax;
            ctx.fillStyle = '#221133';
            ctx.fillRect(px + 20, btnY, panelW - 40, 24);
            ctx.fillStyle = '#9944ff';
            ctx.fillRect(px + 20, btnY, (panelW - 40) * pct, 24);
            ctx.fillStyle = '#fff';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Preparando...', px + panelW * 0.5, btnY + 16);
            ctx.textAlign = 'left';
        } else {
            ctx.fillStyle = this.ingredients.length > 0 ? '#334466' : '#222';
            ctx.fillRect(px + 20, btnY, panelW - 40, 24);
            ctx.strokeStyle = this.ingredients.length > 0 ? '#6688bb' : '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 20, btnY, panelW - 40, 24);
            ctx.fillStyle = this.ingredients.length > 0 ? '#aaccff' : '#555';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('[Enter] Preparar', px + panelW * 0.5, btnY + 16);
            ctx.textAlign = 'left';
        }

        // Result message
        if (this.resultMsg) {
            ctx.fillStyle = this.flashColor || '#aaaaaa';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.resultMsg, px + panelW * 0.5, btnY + 44);
            ctx.textAlign = 'left';
        }

        // Known recipes
        ctx.fillStyle = '#666';
        ctx.font = '9px monospace';
        ctx.fillText('Receitas descobertas:', px + 12, btnY + 62);
        let ry = btnY + 74;
        for (let i = 0; i < ALCHEMY_RECIPES.length; i++) {
            const known = this.discovered.has(i);
            const recipe = ALCHEMY_RECIPES[i];
            const def = known ? getItemDef(recipe.resultItem) : null;
            const name = known ? (def ? def.name : recipe.resultItem) : '???';
            const tempColor = ALCHEMY_TEMP_COLORS[recipe.temp];
            ctx.fillStyle = known ? tempColor : '#333';
            ctx.font = '9px monospace';
            ctx.fillText(`• ${name}`, px + 16, ry);
            ry += 14;
            if (ry > py + panelH - 10) break;
        }

        // Close hint
        ctx.fillStyle = '#555';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('[T / Esc] Fechar', px + panelW * 0.5, py + panelH - 8);
        ctx.textAlign = 'left';
    }
}
