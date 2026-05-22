/**
 * CraftingUI
 * ----------
 * Painel de fabricação que aparece quando o inventário está aberto.
 * Lista receitas disponíveis (filtradas por estação + materiais).
 * Jogador clica/tecla para fabricar.
 *
 * Tabs: Mão | Bancada | Fornalha | Bigorna (destaca as disponíveis)
 * Cada tab mostra receitas daquela estação se o jogador está perto dela.
 */

const CRAFT_PANEL_W = 220;
const CRAFT_PANEL_MARGIN = 12;
const CRAFT_ROW_H = 28;
const CRAFT_MAX_VISIBLE = 8;

class CraftingUI {
    constructor(inventory, workstationDetector) {
        this.inventory = inventory;
        this.detector = workstationDetector;

        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.availableRecipes = []; // [{id, recipe, canCraft}]
        this.craftFlash = 0; // countdown para flash visual
        this.hud = null; // referência opcional
    }

    /**
     * Atualiza lista de receitas visíveis.
     * Chamada quando o inventário abre ou muda.
     */
    refresh() {
        this.availableRecipes = [];
        for (const [itemId, recipe] of Object.entries(RECIPES)) {
            // Só mostra se tem a estação requerida por perto (ou é receita de mão)
            if (!this.detector.hasStation(recipe.station)) continue;

            // Checa se tem todos os materiais
            let canCraft = true;
            for (const [matId, qty] of Object.entries(recipe.materials)) {
                if (this.inventory.countItem(matId) < qty) {
                    canCraft = false;
                    break;
                }
            }

            this.availableRecipes.push({ id: itemId, recipe, canCraft });
        }

        // Manter seleção válida
        if (this.selectedIndex >= this.availableRecipes.length) {
            this.selectedIndex = Math.max(0, this.availableRecipes.length - 1);
        }
    }

    /**
     * Input: setas para navegar, Enter/C para fabricar.
     */
    update(dt, input) {
        if (this.craftFlash > 0) this.craftFlash -= dt;

        if (input.isKeyJustPressed('ArrowUp') || input.isKeyJustPressed('KeyW')) {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this._fixScroll();
        }
        if (input.isKeyJustPressed('ArrowDown') || input.isKeyJustPressed('KeyS')) {
            this.selectedIndex = Math.min(this.availableRecipes.length - 1, this.selectedIndex + 1);
            this._fixScroll();
        }
        if (input.isKeyJustPressed('KeyC') || input.isKeyJustPressed('Enter')) {
            this.tryCraft();
        }
    }

    _fixScroll() {
        if (this.selectedIndex < this.scrollOffset) {
            this.scrollOffset = this.selectedIndex;
        }
        if (this.selectedIndex >= this.scrollOffset + CRAFT_MAX_VISIBLE) {
            this.scrollOffset = this.selectedIndex - CRAFT_MAX_VISIBLE + 1;
        }
    }

    tryCraft() {
        const entry = this.availableRecipes[this.selectedIndex];
        if (!entry || !entry.canCraft) return;

        const recipe = entry.recipe;
        // Consume materials
        for (const [matId, qty] of Object.entries(recipe.materials)) {
            this.inventory.removeItem(matId, qty);
        }
        // Add result
        const amount = recipe.yield || 1;
        this.inventory.addItem(entry.id, amount);

        this.craftFlash = 0.3;

        const def = getItemDef(entry.id);
        if (this.hud && def) {
            const msg = amount > 1
                ? `${def.name} x${amount} fabricado!`
                : `${def.name} fabricado!`;
            this.hud.showMessage(msg, 2, '#44ff44');
        }

        events.emit('item:craft', { itemId: entry.id, quantity: amount, def });

        // Refresh list (materiais mudaram)
        this.refresh();
    }

    /**
     * Desenha o painel de crafting à esquerda da tela.
     */
    draw(ctx, canvasW, canvasH) {
        const panelX = CRAFT_PANEL_MARGIN;
        const panelY = 60;
        const panelH = CRAFT_ROW_H * Math.min(CRAFT_MAX_VISIBLE, this.availableRecipes.length) + 50;

        // Background
        ctx.fillStyle = 'rgba(10,10,20,0.85)';
        ctx.fillRect(panelX, panelY, CRAFT_PANEL_W, panelH);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, CRAFT_PANEL_W, panelH);

        // Title
        ctx.fillStyle = '#ddd';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('Fabricação [C]', panelX + 8, panelY + 16);

        // Station indicators
        const stations = this.detector.getAvailable();
        ctx.font = '9px monospace';
        ctx.fillStyle = stations.length > 0 ? '#88cc88' : '#886666';
        const stationText = stations.length > 0
            ? stations.map(s => s === 'workbench' ? 'Bancada' : s === 'furnace' ? 'Fornalha' : 'Bigorna').join(', ')
            : 'Apenas mão';
        ctx.fillText(stationText, panelX + 8, panelY + 30);

        // Recipes list
        const startY = panelY + 38;
        for (let i = 0; i < CRAFT_MAX_VISIBLE; i++) {
            const idx = this.scrollOffset + i;
            if (idx >= this.availableRecipes.length) break;

            const entry = this.availableRecipes[idx];
            const def = getItemDef(entry.id);
            const ry = startY + i * CRAFT_ROW_H;
            const isSelected = idx === this.selectedIndex;

            // Selection highlight
            if (isSelected) {
                const flashAlpha = this.craftFlash > 0 ? 0.5 : 0.25;
                ctx.fillStyle = this.craftFlash > 0
                    ? `rgba(100,255,100,${flashAlpha})`
                    : 'rgba(80,120,200,0.3)';
                ctx.fillRect(panelX + 2, ry, CRAFT_PANEL_W - 4, CRAFT_ROW_H - 2);
            }

            // Item icon (small box)
            if (def) {
                ctx.fillStyle = def.iconBg || '#333';
                ctx.fillRect(panelX + 6, ry + 3, 16, 16);
                ctx.fillStyle = def.color || '#fff';
                ctx.fillRect(panelX + 8, ry + 5, 12, 12);
            }

            // Item name
            ctx.fillStyle = entry.canCraft ? '#ffffff' : '#666666';
            ctx.font = '11px monospace';
            const name = def ? def.name : entry.id;
            const yieldText = (entry.recipe.yield && entry.recipe.yield > 1) ? ` x${entry.recipe.yield}` : '';
            ctx.fillText(name + yieldText, panelX + 28, ry + 15);

            // Material cost (small text)
            ctx.font = '8px monospace';
            const matText = Object.entries(entry.recipe.materials)
                .map(([m, q]) => {
                    const has = this.inventory.countItem(m);
                    const mDef = getItemDef(m);
                    const mName = mDef ? mDef.name : m;
                    return `${mName}:${has}/${q}`;
                })
                .join(' ');
            ctx.fillStyle = entry.canCraft ? '#88aa88' : '#664444';
            ctx.fillText(matText, panelX + 28, ry + 24);
        }

        // Scroll indicators
        if (this.scrollOffset > 0) {
            ctx.fillStyle = '#888';
            ctx.font = '10px monospace';
            ctx.fillText('▲', panelX + CRAFT_PANEL_W - 15, panelY + 40);
        }
        if (this.scrollOffset + CRAFT_MAX_VISIBLE < this.availableRecipes.length) {
            ctx.fillStyle = '#888';
            ctx.font = '10px monospace';
            ctx.fillText('▼', panelX + CRAFT_PANEL_W - 15, panelY + panelH - 5);
        }

        // Empty state
        if (this.availableRecipes.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '10px monospace';
            ctx.fillText('Sem receitas disponíveis', panelX + 12, startY + 15);
            ctx.fillText('Colete materiais ou', panelX + 12, startY + 28);
            ctx.fillText('aproxime-se de uma estação.', panelX + 12, startY + 41);
        }
    }
}
