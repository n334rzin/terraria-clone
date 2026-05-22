/**
 * CraftingUI — Painel de fabricação lateral (abre com inventário)
 * ----------------------------------------------------------------
 * • Usa ícones pixel-art reais do InventorySystem
 * • Tabs por estação (Mão | Bancada | Fornalha | Bigorna)
 * • Mouse click + setas/Enter para selecionar e fabricar
 * • Destaque de materiais faltantes e hint de progressão
 */

const CRAFT_PANEL_W      = 240;
const CRAFT_PANEL_MARGIN = 10;
const CRAFT_ROW_H        = 46;   // altura de cada linha de receita
const CRAFT_ICON_SIZE    = 30;   // ícone do item resultado
const CRAFT_MAX_VISIBLE  = 7;

// Mapeamento estação → label
const STATION_LABELS = {
    null:        '✋ Mão',
    workbench:   '🪵 Bancada',
    furnace:     '🔥 Fornalha',
    anvil:       '⚒ Bigorna',
    alchemy:     '⚗ Alquimia',
};

class CraftingUI {
    constructor(inventory, workstationDetector) {
        this.inventory = inventory;
        this.detector  = workstationDetector;

        this.selectedIndex   = 0;
        this.scrollOffset    = 0;
        this.availableRecipes = []; // [{id, recipe, canCraft, station}]
        this.craftFlash      = 0;
        this.craftFlashOk    = true;
        this.hud             = null;
        this.activeTab       = null;  // estação da tab ativa
        this.tabs            = [];    // estações disponíveis (null = mão, 'workbench', …)

        // Para click
        this._rowRects  = [];   // [{x,y,w,h,idx}] — atualizado a cada draw
        this._tabRects  = [];   // [{x,y,w,h,station}]
        this._craftRect = null; // botão Fabricar
    }

    // ── Refresh ─────────────────────────────────────────────────────────────
    refresh() {
        // Monta lista de tabs disponíveis
        const available = this.detector.getAvailable(); // ['workbench','furnace',…]
        this.tabs = [null, ...available];               // null = "mão"
        if (!this.tabs.includes(this.activeTab)) this.activeTab = null;

        // Filtra receitas pela tab ativa
        this.availableRecipes = [];
        for (const [itemId, recipe] of Object.entries(RECIPES)) {
            const recipeStation = recipe.station || null;
            if (recipeStation !== this.activeTab) continue;
            if (!this.detector.hasStation(recipeStation)) continue;

            let canCraft = true;
            let missingMat = null;
            for (const [matId, qty] of Object.entries(recipe.materials)) {
                const has = this.inventory.countItem(matId);
                if (has < qty) { canCraft = false; missingMat = { matId, has, need: qty }; break; }
            }
            this.availableRecipes.push({ id: itemId, recipe, canCraft, missingMat });
        }

        // Ordena: fabricáveis primeiro
        this.availableRecipes.sort((a, b) => (b.canCraft ? 1 : 0) - (a.canCraft ? 1 : 0));

        // Mantém seleção válida
        this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.availableRecipes.length - 1));
    }

    // ── Input ────────────────────────────────────────────────────────────────
    update(dt, input) {
        if (this.craftFlash > 0) this.craftFlash -= dt;

        // Teclado
        if (input.isKeyJustPressed('ArrowUp')   || input.isKeyJustPressed('KeyW')) {
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

        // Mouse click
        if (input.mouseJustPressed && input.mouseJustPressed.left) {
            const mx = input.mouseScreenX, my = input.mouseScreenY;

            // Tab click
            for (const tr of this._tabRects) {
                if (mx >= tr.x && mx < tr.x + tr.w && my >= tr.y && my < tr.y + tr.h) {
                    if (this.tabs.includes(tr.station)) {
                        this.activeTab = tr.station;
                        this.selectedIndex = 0;
                        this.scrollOffset  = 0;
                        this.refresh();
                    }
                }
            }

            // Row click
            for (const rr of this._rowRects) {
                if (mx >= rr.x && mx < rr.x + rr.w && my >= rr.y && my < rr.y + rr.h) {
                    if (rr.idx === this.selectedIndex) {
                        this.tryCraft();
                    } else {
                        this.selectedIndex = rr.idx;
                    }
                }
            }

            // Craft button click
            const cr = this._craftRect;
            if (cr && mx >= cr.x && mx < cr.x + cr.w && my >= cr.y && my < cr.y + cr.h) {
                this.tryCraft();
            }
        }
    }

    _fixScroll() {
        if (this.selectedIndex < this.scrollOffset)
            this.scrollOffset = this.selectedIndex;
        if (this.selectedIndex >= this.scrollOffset + CRAFT_MAX_VISIBLE)
            this.scrollOffset = this.selectedIndex - CRAFT_MAX_VISIBLE + 1;
    }

    // ── Fabricação ───────────────────────────────────────────────────────────
    tryCraft() {
        const entry = this.availableRecipes[this.selectedIndex];
        if (!entry || !entry.canCraft) {
            this.craftFlash = 0.4;
            this.craftFlashOk = false;
            return;
        }
        for (const [matId, qty] of Object.entries(entry.recipe.materials)) {
            this.inventory.removeItem(matId, qty);
        }
        const amount = entry.recipe.yield || 1;
        this.inventory.addItem(entry.id, amount);

        this.craftFlash   = 0.5;
        this.craftFlashOk = true;

        const def = getItemDef(entry.id);
        if (this.hud && def) {
            const msg = amount > 1
                ? `Fabricado: ${def.name} ×${amount}` : `Fabricado: ${def.name}`;
            this.hud.showMessage(msg, 2.5, '#55ff88');
        }
        events.emit('item:craft', { itemId: entry.id, quantity: amount, def });
        this.refresh();
    }

    // ── Renderização ─────────────────────────────────────────────────────────
    draw(ctx, canvasW, canvasH) {
        this._rowRects  = [];
        this._tabRects  = [];
        this._craftRect = null;

        const panelX = CRAFT_PANEL_MARGIN;
        const panelY = 60;

        // Calcula altura necessária
        const tabH    = 22;
        const listH   = CRAFT_ROW_H * Math.min(CRAFT_MAX_VISIBLE, Math.max(1, this.availableRecipes.length));
        const detailH = 80; // área de detalhes / botão fabricar
        const panelH  = tabH + 6 + listH + detailH + 16;

        // Painel de fundo
        ctx.fillStyle = 'rgba(8,10,20,0.92)';
        ctx.fillRect(panelX, panelY, CRAFT_PANEL_W, panelH);
        // Borda top decorativa
        const grad = ctx.createLinearGradient(panelX, panelY, panelX + CRAFT_PANEL_W, panelY);
        grad.addColorStop(0, '#334466');
        grad.addColorStop(0.5, '#5566aa');
        grad.addColorStop(1, '#334466');
        ctx.fillStyle = grad;
        ctx.fillRect(panelX, panelY, CRAFT_PANEL_W, 2);
        ctx.strokeStyle = '#223';
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, CRAFT_PANEL_W, panelH);

        // Título
        ctx.fillStyle = '#aabbee';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('⚒ FABRICAÇÃO', panelX + 8, panelY + 14);
        ctx.font = '9px monospace';
        ctx.fillStyle = '#555';
        ctx.fillText('[C] ou clique', panelX + CRAFT_PANEL_W - 70, panelY + 14);

        // Tabs de estação
        this._drawTabs(ctx, panelX, panelY + tabH + 2);

        // Lista de receitas
        const listY = panelY + tabH + 6 + tabH + 4;
        this._drawRecipeList(ctx, panelX, listY, listH);

        // Detalhes + botão Fabricar
        const detailY = listY + listH + 4;
        this._drawDetail(ctx, panelX, detailY, panelH - (detailY - panelY) - 4, canvasW, canvasH);
    }

    _drawTabs(ctx, panelX, baseY) {
        const tabW   = CRAFT_PANEL_W / Math.max(1, this.tabs.length);
        this._tabRects = [];
        for (let i = 0; i < this.tabs.length; i++) {
            const station = this.tabs[i];
            const tx = panelX + i * tabW;
            const isActive  = station === this.activeTab;
            const hasStation = this.detector.hasStation(station);

            ctx.fillStyle = isActive
                ? 'rgba(60,90,180,0.85)'
                : hasStation ? 'rgba(30,40,70,0.7)' : 'rgba(15,18,30,0.5)';
            ctx.fillRect(tx, baseY, tabW - 2, 22);
            if (isActive) {
                ctx.fillStyle = 'rgba(100,130,220,0.3)';
                ctx.fillRect(tx, baseY, tabW - 2, 3);
            }
            ctx.strokeStyle = isActive ? '#6680cc' : '#222';
            ctx.lineWidth = 1;
            ctx.strokeRect(tx, baseY, tabW - 2, 22);

            const label = STATION_LABELS[station] || (station || 'Mão');
            ctx.fillStyle = hasStation ? (isActive ? '#ffffff' : '#8899cc') : '#445';
            ctx.font      = `${isActive ? 'bold ' : ''}9px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(label, tx + (tabW - 2) * 0.5, baseY + 14);
            ctx.textAlign = 'left';

            this._tabRects.push({ x: tx, y: baseY, w: tabW - 2, h: 22, station });
        }
    }

    _drawRecipeList(ctx, panelX, listY, listH) {
        // Clipping virtual (verifica bounds)
        const listBottom = listY + listH;
        const inv = window._inventory;

        for (let vi = 0; vi < CRAFT_MAX_VISIBLE; vi++) {
            const idx = this.scrollOffset + vi;
            if (idx >= this.availableRecipes.length) break;
            const entry = this.availableRecipes[idx];
            const def   = getItemDef(entry.id);
            const ry    = listY + vi * CRAFT_ROW_H;
            if (ry + CRAFT_ROW_H > listBottom) break;

            const isSel = idx === this.selectedIndex;

            // Row background
            if (isSel) {
                const flashOk = this.craftFlashOk;
                ctx.fillStyle = this.craftFlash > 0
                    ? (flashOk ? 'rgba(50,200,80,0.35)' : 'rgba(200,60,60,0.35)')
                    : 'rgba(50,80,160,0.45)';
            } else {
                ctx.fillStyle = vi % 2 === 0 ? 'rgba(20,24,40,0.5)' : 'rgba(10,12,22,0.5)';
            }
            ctx.fillRect(panelX + 2, ry, CRAFT_PANEL_W - 4, CRAFT_ROW_H - 1);

            // Borda lateral seleção
            if (isSel) {
                ctx.fillStyle = '#5577cc';
                ctx.fillRect(panelX + 2, ry, 3, CRAFT_ROW_H - 1);
            }

            // Ícone do resultado (pixel-art)
            const iconX = panelX + 8;
            const iconY = ry + (CRAFT_ROW_H - CRAFT_ICON_SIZE) * 0.5;
            if (def && inv && inv._drawItemIcon) {
                // Fundo do slot
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(iconX - 1, iconY - 1, CRAFT_ICON_SIZE + 2, CRAFT_ICON_SIZE + 2);
                inv._drawItemIcon(ctx, iconX, iconY, CRAFT_ICON_SIZE, def);
            } else if (def) {
                ctx.fillStyle = def.iconBg || '#333';
                ctx.fillRect(iconX, iconY, CRAFT_ICON_SIZE, CRAFT_ICON_SIZE);
                ctx.fillStyle = def.color || '#fff';
                ctx.fillRect(iconX + 4, iconY + 4, CRAFT_ICON_SIZE - 8, CRAFT_ICON_SIZE - 8);
            }

            // Nome do item
            const textX = panelX + 8 + CRAFT_ICON_SIZE + 6;
            ctx.fillStyle = entry.canCraft ? '#eeeeff' : '#667';
            ctx.font      = `${isSel ? 'bold ' : ''}10px monospace`;
            const yieldTxt = (entry.recipe.yield && entry.recipe.yield > 1)
                ? ` ×${entry.recipe.yield}` : '';
            ctx.fillText((def ? def.name : entry.id) + yieldTxt, textX, ry + 14);

            // Materiais necessários (mini icons + numbers)
            let matX = textX;
            const matY = ry + 28;
            ctx.font = '8px monospace';
            for (const [matId, need] of Object.entries(entry.recipe.materials)) {
                const has     = this.inventory.countItem(matId);
                const ok      = has >= need;
                const matDef  = getItemDef(matId);
                // Desenha mini ícone do material (12×12)
                if (matDef && inv && inv._drawItemIcon) {
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.fillRect(matX, matY - 10, 12, 12);
                    inv._drawItemIcon(ctx, matX, matY - 10, 12, matDef);
                }
                // Texto qty
                ctx.fillStyle = ok ? '#88cc88' : '#cc5555';
                ctx.fillText(`${has}/${need}`, matX + 13, matY);
                const matLabel = matDef ? matDef.name.slice(0, 6) : matId.slice(0, 5);
                matX += 13 + ctx.measureText(`${has}/${need}`).width + 4;
                if (matX > panelX + CRAFT_PANEL_W - 10) break; // overflow guard
            }

            this._rowRects.push({ x: panelX + 2, y: ry, w: CRAFT_PANEL_W - 4, h: CRAFT_ROW_H - 1, idx });
        }

        // Indicadores de scroll
        if (this.scrollOffset > 0) {
            ctx.fillStyle = '#6688bb'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
            ctx.fillText('▲ mais', panelX + CRAFT_PANEL_W * 0.5, listY - 2);
        }
        if (this.scrollOffset + CRAFT_MAX_VISIBLE < this.availableRecipes.length) {
            ctx.fillStyle = '#6688bb'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
            ctx.fillText('▼ mais', panelX + CRAFT_PANEL_W * 0.5, listY + listH + 10);
        }
        ctx.textAlign = 'left';

        // Estado vazio
        if (this.availableRecipes.length === 0) {
            ctx.fillStyle = '#446';
            ctx.font = '9px monospace';
            const hint = this.activeTab === null
                ? 'Construa uma Bancada de\nTrabalho para mais receitas!'
                : `Aproxime-se de: ${STATION_LABELS[this.activeTab]}`;
            for (const [i, line] of hint.split('\n').entries()) {
                ctx.fillText(line, panelX + 10, listY + 18 + i * 14);
            }
        }
    }

    _drawDetail(ctx, panelX, detailY, maxH, canvasW, canvasH) {
        const entry = this.availableRecipes[this.selectedIndex];
        if (!entry) {
            // Hint de progressão quando não há seleção
            ctx.fillStyle = '#334';
            ctx.font = '8px monospace';
            ctx.fillText('Dica: mine madeira com o Machado', panelX + 8, detailY + 14);
            ctx.fillText('e construa uma Bancada!', panelX + 8, detailY + 26);
            return;
        }

        const def = getItemDef(entry.id);

        // Separa detalhe com linha
        ctx.fillStyle = 'rgba(60,80,140,0.25)';
        ctx.fillRect(panelX + 4, detailY, CRAFT_PANEL_W - 8, 1);
        detailY += 6;

        // Ícone grande + nome
        const inv = window._inventory;
        if (def && inv && inv._drawItemIcon) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(panelX + 7, detailY, 32, 32);
            inv._drawItemIcon(ctx, panelX + 7, detailY, 32, def);
        }

        ctx.fillStyle = def ? (def.color || '#fff') : '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(def ? def.name : entry.id, panelX + 46, detailY + 12);

        // Stats do resultado
        ctx.font = '8px monospace';
        ctx.fillStyle = '#8899bb';
        const statLines = [];
        if (def) {
            if (def.damage)          statLines.push(`Dano: ${def.damage}`);
            if (def.defense)         statLines.push(`Defesa: +${def.defense}`);
            if (def.mineSpeed)       statLines.push(`Mine: ${def.mineSpeed}×`);
            if (def.healAmount)      statLines.push(`Cura: +${def.healAmount}HP`);
            if (def.moveSpeedBonus)  statLines.push(`Vel: +${Math.round(def.moveSpeedBonus*100)}%`);
            if (def.lore)            statLines.push('"' + def.lore.slice(0, 38) + (def.lore.length > 38 ? '…' : '') + '"');
        }
        for (const [i, line] of statLines.slice(0, 2).entries()) {
            ctx.fillText(line, panelX + 46, detailY + 24 + i * 11);
        }

        // Botão FABRICAR
        const btnY  = detailY + 38;
        const btnX  = panelX + 4;
        const btnW  = CRAFT_PANEL_W - 8;
        const btnH  = 24;

        const canCraft = entry.canCraft;
        const flashOk  = this.craftFlashOk;
        const flashAlpha = this.craftFlash > 0 ? 0.8 : 0.6;

        ctx.fillStyle = this.craftFlash > 0
            ? (flashOk ? `rgba(40,200,80,${flashAlpha})` : `rgba(200,50,50,${flashAlpha})`)
            : (canCraft ? 'rgba(40,80,160,0.75)' : 'rgba(30,30,50,0.6)');
        ctx.fillRect(btnX, btnY, btnW, btnH);

        // Brilho no topo do botão
        ctx.fillStyle = canCraft ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(btnX, btnY, btnW, 4);

        ctx.strokeStyle = canCraft ? '#5577cc' : '#334';
        ctx.lineWidth = 1;
        ctx.strokeRect(btnX, btnY, btnW, btnH);

        ctx.fillStyle = canCraft ? '#ffffff' : '#446';
        ctx.font = `bold 11px monospace`;
        ctx.textAlign = 'center';
        const btnLabel = this.craftFlash > 0
            ? (flashOk ? '✓ Fabricado!' : '✗ Sem materiais')
            : (canCraft ? '⚒ Fabricar [C]' : '⚒ Materiais insuficientes');
        ctx.fillText(btnLabel, panelX + CRAFT_PANEL_W * 0.5, btnY + 16);
        ctx.textAlign = 'left';

        // Dica de material faltante
        if (!canCraft && entry.missingMat) {
            const m    = entry.missingMat;
            const mDef = getItemDef(m.matId);
            ctx.font = '8px monospace';
            ctx.fillStyle = '#cc6644';
            ctx.fillText(`Falta: ${mDef ? mDef.name : m.matId} (${m.has}/${m.need})`,
                btnX + 4, btnY + btnH + 12);
        }

        this._craftRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    }
}
