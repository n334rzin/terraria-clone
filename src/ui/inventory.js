/**
 * InventorySystem — Hotbar (10 slots) + Expanded Inventory (30 slots).
 * Manages item stacks, selection, keyboard/scroll input.
 */

const HOTBAR_SLOTS = 10;
const INVENTORY_ROWS = 3;
const INVENTORY_COLS = 10;
const TOTAL_INV_SLOTS = INVENTORY_ROWS * INVENTORY_COLS;
const SLOT_SIZE = 48;
const SLOT_GAP = 4;

class InventorySystem {
    constructor() {
        // Each slot: { itemId: string|null, quantity: number }
        this.hotbar = Array.from({ length: HOTBAR_SLOTS }, () => ({ itemId: null, quantity: 0 }));
        this.inventory = Array.from({ length: TOTAL_INV_SLOTS }, () => ({ itemId: null, quantity: 0 }));

        this.selectedSlot = 0; // 0-9 hotbar index
        this.isOpen = false;   // expanded inventory visible

        // Give starting items
        this.hotbar[0] = { itemId: 'pickaxe', quantity: 1 };
        this.hotbar[1] = { itemId: 'sword', quantity: 1 };
        this.hotbar[2] = { itemId: 'torch', quantity: 20 };
    }

    /**
     * Get currently selected item definition.
     */
    getSelectedItem() {
        const slot = this.hotbar[this.selectedSlot];
        if (!slot || !slot.itemId) return null;
        return getItemDef(slot.itemId);
    }

    /**
     * Get selected slot data.
     */
    getSelectedSlot() {
        return this.hotbar[this.selectedSlot];
    }

    /**
     * Handle input for slot selection and inventory toggle.
     */
    handleInput(input) {
        // Number keys 1-0 for slots
        for (let i = 0; i <= 9; i++) {
            const code = i === 0 ? 'Digit0' : `Digit${i}`;
            if (input.isKeyJustPressed(code)) {
                this.selectedSlot = i === 0 ? 9 : i - 1;
            }
        }

        // Scroll wheel
        if (input.scrollDelta !== 0) {
            this.selectedSlot += input.scrollDelta;
            if (this.selectedSlot < 0) this.selectedSlot = HOTBAR_SLOTS - 1;
            if (this.selectedSlot >= HOTBAR_SLOTS) this.selectedSlot = 0;
        }

        // Toggle inventory
        if (input.isKeyJustPressed('KeyE')) {
            this.isOpen = !this.isOpen;
        }
    }

    /**
     * Add an item to inventory (hotbar first, then expanded).
     * Returns the **number of items actually added** (0 if inventory full).
     * NOTE: Truthy return (>0) still works for callers that did `if (inv.addItem(...))`.
     */
    addItem(itemId, quantity = 1) {
        const def = getItemDef(itemId);
        if (!def || quantity <= 0) return 0;

        const requested = quantity;

        // Try to stack in hotbar first
        for (let i = 0; i < HOTBAR_SLOTS; i++) {
            const s = this.hotbar[i];
            if (s.itemId === itemId && s.quantity < def.stackSize) {
                const canAdd = Math.min(quantity, def.stackSize - s.quantity);
                s.quantity += canAdd;
                quantity -= canAdd;
                if (quantity <= 0) return requested;
            }
        }

        // Try to stack in inventory
        for (let i = 0; i < TOTAL_INV_SLOTS; i++) {
            const s = this.inventory[i];
            if (s.itemId === itemId && s.quantity < def.stackSize) {
                const canAdd = Math.min(quantity, def.stackSize - s.quantity);
                s.quantity += canAdd;
                quantity -= canAdd;
                if (quantity <= 0) return requested;
            }
        }

        // Try empty hotbar slot
        for (let i = 0; i < HOTBAR_SLOTS; i++) {
            if (!this.hotbar[i].itemId) {
                const canAdd = Math.min(quantity, def.stackSize);
                this.hotbar[i] = { itemId, quantity: canAdd };
                quantity -= canAdd;
                if (quantity <= 0) return requested;
            }
        }

        // Try empty inventory slot
        for (let i = 0; i < TOTAL_INV_SLOTS; i++) {
            if (!this.inventory[i].itemId) {
                const canAdd = Math.min(quantity, def.stackSize);
                this.inventory[i] = { itemId, quantity: canAdd };
                quantity -= canAdd;
                if (quantity <= 0) return requested;
            }
        }

        return requested - quantity;
    }

    /**
     * Remove quantity from selected hotbar slot.
     */
    consumeSelected(amount = 1) {
        const slot = this.hotbar[this.selectedSlot];
        if (!slot || !slot.itemId) return;
        slot.quantity -= amount;
        if (slot.quantity <= 0) {
            slot.itemId = null;
            slot.quantity = 0;
        }
    }

    /**
     * Check if player has a specific item (any slot).
     */
    hasItem(itemId) {
        for (const s of this.hotbar) if (s.itemId === itemId) return true;
        for (const s of this.inventory) if (s.itemId === itemId) return true;
        return false;
    }

    /**
     * Count total quantity of an item across all slots.
     */
    countItem(itemId) {
        let total = 0;
        for (const s of this.hotbar) if (s.itemId === itemId) total += s.quantity;
        for (const s of this.inventory) if (s.itemId === itemId) total += s.quantity;
        return total;
    }

    /**
     * Remove a specific item from anywhere (for crafting/using).
     */
    removeItem(itemId, amount = 1) {
        let remaining = amount;
        const allSlots = [...this.hotbar, ...this.inventory];
        for (const s of allSlots) {
            if (s.itemId === itemId && remaining > 0) {
                const take = Math.min(remaining, s.quantity);
                s.quantity -= take;
                remaining -= take;
                if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
            }
        }
        return remaining <= 0;
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    drawHotbar(ctx, canvasW) {
        const totalW = HOTBAR_SLOTS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
        const startX = (canvasW - totalW) * 0.5;
        const startY = 8;

        for (let i = 0; i < HOTBAR_SLOTS; i++) {
            const x = startX + i * (SLOT_SIZE + SLOT_GAP);
            const y = startY;
            const selected = (i === this.selectedSlot);

            // Slot shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(x + 2, y + 2, SLOT_SIZE, SLOT_SIZE);

            // Slot background
            ctx.fillStyle = selected ? 'rgba(60,60,100,0.85)' : 'rgba(15,15,25,0.80)';
            ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);

            // Inner bevel
            ctx.fillStyle = selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
            ctx.fillRect(x, y, SLOT_SIZE, 2);
            ctx.fillRect(x, y, 2, SLOT_SIZE);

            // Border
            ctx.strokeStyle = selected ? '#ffcc00' : '#334';
            ctx.lineWidth = selected ? 2 : 1;
            ctx.strokeRect(x, y, SLOT_SIZE, SLOT_SIZE);

            const slot = this.hotbar[i];
            if (slot.itemId) {
                const def = getItemDef(slot.itemId);
                if (def) {
                    this._drawItemIcon(ctx, x + 4, y + 4, SLOT_SIZE - 8, def);
                    if (slot.quantity > 1) {
                        ctx.font = 'bold 11px monospace';
                        ctx.textAlign = 'right';
                        ctx.fillStyle = '#000';
                        ctx.fillText(slot.quantity, x + SLOT_SIZE - 3, y + SLOT_SIZE - 3);
                        ctx.fillStyle = '#fff';
                        ctx.fillText(slot.quantity, x + SLOT_SIZE - 4, y + SLOT_SIZE - 4);
                    }
                }
            }

            // Slot number
            ctx.fillStyle = selected ? 'rgba(255,220,0,0.8)' : 'rgba(255,255,255,0.35)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(i === 9 ? '0' : `${i + 1}`, x + 3, y + 10);
        }

        // Selected item name below hotbar
        const selSlot = this.hotbar[this.selectedSlot];
        if (selSlot && selSlot.itemId) {
            const def = getItemDef(selSlot.itemId);
            if (def) {
                ctx.textAlign = 'center';
                ctx.font = 'bold 11px monospace';
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillText(def.name, canvasW * 0.5 + 1, startY + SLOT_SIZE + 16);
                ctx.fillStyle = '#eeeeee';
                ctx.fillText(def.name, canvasW * 0.5, startY + SLOT_SIZE + 15);
                ctx.textAlign = 'left';
            }
        }
    }

    drawInventory(ctx, canvasW, canvasH) {
        if (!this.isOpen) return;

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        const totalW = INVENTORY_COLS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
        const totalH = INVENTORY_ROWS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
        const startX = (canvasW - totalW) * 0.5;
        const startY = (canvasH - totalH) * 0.5;

        // Panel background
        const panelPad = 16;
        ctx.fillStyle = 'rgba(10,10,20,0.92)';
        ctx.fillRect(startX - panelPad, startY - 44, totalW + panelPad * 2, totalH + 60);
        ctx.strokeStyle = '#334455';
        ctx.lineWidth = 1;
        ctx.strokeRect(startX - panelPad, startY - 44, totalW + panelPad * 2, totalH + 60);

        ctx.fillStyle = '#aabbcc';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('INVENTÁRIO', canvasW * 0.5, startY - 26);
        ctx.fillStyle = '#445566';
        ctx.font = '10px monospace';
        ctx.fillText('[E] fechar   [R] equipar', canvasW * 0.5, startY - 12);
        ctx.textAlign = 'left';

        const mx = window._input ? window._input.mouseScreenX : -1;
        const my = window._input ? window._input.mouseScreenY : -1;
        let hoveredDef = null;
        let hoveredX = 0, hoveredY = 0;

        for (let row = 0; row < INVENTORY_ROWS; row++) {
            for (let col = 0; col < INVENTORY_COLS; col++) {
                const idx = row * INVENTORY_COLS + col;
                const x = startX + col * (SLOT_SIZE + SLOT_GAP);
                const y = startY + row * (SLOT_SIZE + SLOT_GAP);
                const hovered = mx >= x && mx < x + SLOT_SIZE && my >= y && my < y + SLOT_SIZE;

                ctx.fillStyle = hovered ? 'rgba(80,100,160,0.7)' : 'rgba(20,22,35,0.88)';
                ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);

                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.fillRect(x, y, SLOT_SIZE, 2);
                ctx.fillRect(x, y, 2, SLOT_SIZE);

                ctx.strokeStyle = hovered ? '#8899cc' : '#2a2a3a';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, SLOT_SIZE, SLOT_SIZE);

                const slot = this.inventory[idx];
                if (slot && slot.itemId) {
                    const def = getItemDef(slot.itemId);
                    if (def) {
                        this._drawItemIcon(ctx, x + 4, y + 4, SLOT_SIZE - 8, def);
                        if (slot.quantity > 1) {
                            ctx.font = 'bold 11px monospace';
                            ctx.textAlign = 'right';
                            ctx.fillStyle = '#000';
                            ctx.fillText(slot.quantity, x + SLOT_SIZE - 3, y + SLOT_SIZE - 3);
                            ctx.fillStyle = '#fff';
                            ctx.fillText(slot.quantity, x + SLOT_SIZE - 4, y + SLOT_SIZE - 4);
                            ctx.textAlign = 'left';
                        }
                        if (hovered) { hoveredDef = def; hoveredX = x; hoveredY = y; }
                    }
                }
            }
        }

        // Tooltip on hover
        if (hoveredDef) this._drawTooltip(ctx, hoveredDef, hoveredX, hoveredY, canvasW, canvasH);
    }

    _drawTooltip(ctx, def, slotX, slotY, canvasW, canvasH) {
        const lines = [def.name];
        if (def.lore) lines.push(def.lore);
        if (def.damage) lines.push(`Dano: ${def.damage}`);
        if (def.defense) lines.push(`Defesa: +${def.defense}`);
        if (def.mineSpeed) lines.push(`Velocidade: ${def.mineSpeed}x`);
        if (def.moveSpeedBonus) lines.push(`Vel. Mov: +${Math.round(def.moveSpeedBonus*100)}%`);
        if (def.healAmount) lines.push(`Cura: +${def.healAmount} HP`);
        if (def.buffId) lines.push(`Efeito: ${def.buffId.replace('_', ' ')}`);

        const pw = 180, lh = 16, ph = lines.length * lh + 16;
        let tx = slotX + SLOT_SIZE + 4;
        let ty = slotY;
        if (tx + pw > canvasW) tx = slotX - pw - 4;
        if (ty + ph > canvasH) ty = canvasH - ph - 4;

        ctx.fillStyle = 'rgba(5,5,15,0.95)';
        ctx.fillRect(tx, ty, pw, ph);
        ctx.strokeStyle = def.color || '#556';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, pw, ph);

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = def.color || '#fff';
        ctx.fillText(lines[0], tx + 8, ty + 14);

        ctx.font = '9px monospace';
        ctx.fillStyle = '#aabbcc';
        for (let i = 1; i < lines.length; i++) {
            ctx.fillText(lines[i], tx + 8, ty + 14 + i * lh);
        }
    }

    // -----------------------------------------------------------------------
    // Icon renderer — pixel-art icons for every item
    // -----------------------------------------------------------------------
    _drawItemIcon(ctx, x, y, size, def) {
        const S = size / 16;

        ctx.fillStyle = def.iconBg || '#1a1a2a';
        ctx.fillRect(x, y, size, size);

        // Helper: draw a rect in 16x16 grid coords
        const r = (gx, gy, gw, gh, col) => {
            ctx.fillStyle = col;
            ctx.fillRect(
                Math.round(x + gx * S), Math.round(y + gy * S),
                Math.max(1, Math.round(gw * S)), Math.max(1, Math.round(gh * S))
            );
        };

        // Color helpers
        const c = def.color || '#ffffff';
        const adj = (hex, f) => {
            if (!hex || !hex.startsWith('#')) return hex || '#fff';
            let h = hex.replace('#','');
            if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
            if (h.length !== 6) return hex;
            const rv = Math.min(255, Math.round(parseInt(h.slice(0,2),16) * f));
            const gv = Math.min(255, Math.round(parseInt(h.slice(2,4),16) * f));
            const bv = Math.min(255, Math.round(parseInt(h.slice(4,6),16) * f));
            return `rgb(${rv},${gv},${bv})`;
        };
        const cL = adj(c, 1.5); const cD = adj(c, 0.5); const cLL = adj(c, 1.9);
        const WD = '#8B5E3C'; const WDD = '#5a3820';

        switch (def.id) {
            // ── PICKAXES ──────────────────────────────────────
            case 'pickaxe': case 'copper_pickaxe':
            case 'iron_pickaxe': case 'gold_pickaxe':
                r(7,10,2,5,WDD); r(6,10,2,5,WD);          // handle
                r(2,5,12,3,cD);  r(2,4,12,3,c);            // head bar
                r(2,3,3,5,c);    r(2,3,2,5,cL);            // left spike
                r(12,5,2,4,cD);  r(3,4,2,1,cLL);           // right end + shine
                break;

            // ── AXES ──────────────────────────────────────────
            case 'axe': case 'copper_axe': case 'iron_axe':
                r(8,10,2,5,WDD); r(7,10,2,5,WD);
                r(2,2,8,9,cD);   r(1,2,8,9,c);
                r(1,2,2,9,cL);   r(1,2,1,9,cLL);           // sharp edge
                r(8,5,2,3,cD);
                r(2,2,2,1,cLL);                             // top shine
                break;

            // ── SWORDS ────────────────────────────────────────
            case 'sword': case 'copper_sword':
            case 'iron_sword': case 'gold_sword':
                r(7,1,2,10,c);   r(7,1,1,8,cLL);          // blade
                r(8,2,1,8,cD);   r(7,1,2,2,cL);            // tip
                r(3,10,10,2,cD); r(3,9,10,2,c);            // guard
                r(3,9,2,1,cLL);
                r(7,12,2,3,WDD); r(6,12,2,3,WD);           // grip
                r(5,14,6,2,cD);  r(6,14,4,2,c);            // pommel
                break;

            case 'plasma_sword': {
                const pg='#44ddff', pgL='#aaeeff', pgD='#2288aa';
                r(7,1,2,10,pg); r(7,1,1,8,pgL); r(8,2,1,8,pgD);
                r(7,1,2,2,'#ffffff');
                r(3,10,10,2,pgD); r(3,9,10,2,pg); r(3,9,2,1,pgL);
                r(7,12,2,3,'#334455'); r(5,14,6,2,pgD); r(6,14,4,2,pg);
                ctx.globalAlpha=0.25; r(6,1,4,10,pgL); ctx.globalAlpha=1;
                break;
            }

            // ── TORCH ─────────────────────────────────────────
            case 'torch':
                r(7,10,2,6,WDD); r(6,10,2,6,WD);
                r(5,5,6,6,'#ff6600'); r(6,3,4,5,'#ff9900');
                r(7,2,2,4,'#ffdd00'); r(7,2,1,2,'#ffffff');
                r(5,9,6,2,'#7a5a2a');
                break;

            // ── DIRT & GRASS ──────────────────────────────────
            case 'dirt':
                r(1,1,14,14,c);
                r(1,1,14,3,adj(c,1.3)); r(1,12,14,3,cD);
                r(3,4,2,2,cD); r(8,3,2,2,cD); r(5,8,2,2,cD); r(11,6,2,2,cD);
                break;
            case 'grass':
                r(1,4,14,11,'#7a5230'); r(1,12,14,3,adj('#7a5230',0.65));
                r(1,1,14,5,c); r(1,1,14,2,adj(c,1.4));
                r(3,1,2,3,adj(c,1.7)); r(7,1,2,4,adj(c,1.5)); r(11,1,2,3,adj(c,1.7));
                break;
            case 'stone':
                r(1,1,14,14,c); r(1,1,14,2,cL); r(1,13,14,2,cD); r(13,1,2,14,cD);
                r(4,4,1,5,cD); r(4,4,4,1,cD); r(9,7,1,5,cD); r(7,10,5,1,cD); r(2,8,3,1,cD);
                break;
            case 'sand':
                r(1,1,14,14,c); r(1,1,14,3,cL); r(1,12,14,3,cD);
                for (let i=0;i<8;i++) r(2+(i*3)%12, 4+(i*4)%8, 1,1,cL);
                break;

            // ── ORE BLOCKS ────────────────────────────────────
            case 'coal_ore':
                r(1,1,14,14,'#484848');
                r(1,1,14,2,'#666'); r(1,13,14,2,'#333');
                r(3,3,4,4,c); r(8,5,3,3,c); r(4,8,3,3,c); r(9,10,3,3,c);
                r(4,4,2,2,cL); break;
            case 'copper_ore':
                r(1,1,14,14,'#585858');
                r(1,1,14,2,'#777'); r(3,3,4,4,c); r(8,5,4,3,c);
                r(3,9,3,3,c); r(9,9,4,3,c); r(4,4,2,2,cL); r(9,6,2,1,cL); break;
            case 'iron_ore':
                r(1,1,14,14,'#585858');
                r(1,1,14,2,'#777'); r(3,3,5,4,c); r(9,4,4,4,c);
                r(4,9,5,4,c); r(9,10,3,3,c); r(4,3,2,2,cL); r(10,5,2,2,cL); break;
            case 'gold_ore':
                r(1,1,14,14,'#585858');
                r(1,1,14,2,'#777'); r(2,3,5,5,c); r(8,2,5,5,c);
                r(3,9,4,5,c); r(9,8,5,5,c); r(3,4,2,2,cLL); r(9,3,2,2,cLL); break;
            case 'obsidian':
                r(1,1,14,14,c); r(1,1,14,2,adj(c,2.2)); r(1,13,14,2,'#050005');
                r(3,3,3,4,adj(c,2)); r(9,5,4,3,adj(c,1.7)); r(4,9,3,3,adj(c,2)); break;
            case 'hellstone':
                r(1,1,14,14,'#2a0808');
                r(3,3,4,4,c); r(8,5,5,3,c); r(3,9,5,4,c); r(9,9,4,4,c);
                r(4,4,2,2,'#ffaa44'); r(9,6,2,2,'#ffaa44');
                ctx.globalAlpha=0.2; r(1,1,14,14,'#ff3300'); ctx.globalAlpha=1; break;
            case 'ash':
                r(1,1,14,14,c); r(1,1,14,3,cL);
                r(2,4,3,2,cL); r(8,3,3,2,cL); r(5,8,2,2,cL); r(10,9,3,2,cL); break;
            case 'wood':
                r(1,1,14,14,c); r(1,1,14,2,cL); r(1,13,14,2,cD);
                r(3,1,1,14,cD); r(7,1,1,14,cD); r(11,1,1,14,cD);
                r(2,5,1,4,cL); r(6,3,1,6,cL); r(10,4,1,5,cL); break;
            case 'leaves':
                r(1,1,14,14,c); r(1,1,14,2,cL);
                r(3,3,2,2,cL); r(9,2,2,3,cL); r(6,5,2,2,cL);
                r(2,8,3,3,cD); r(10,7,3,3,cD); r(5,11,4,2,cD); break;
            case 'plank':
                r(1,1,14,14,c); r(1,1,14,2,cL);
                r(1,4,14,1,cD); r(1,8,14,1,cD); r(1,12,14,1,cD);
                r(2,1,1,14,cD); r(7,5,1,3,cD); r(8,5,2,2,cL); break;

            // ── WORKSTATIONS ──────────────────────────────────
            case 'workbench': {
                const wc='#a06030';
                r(1,4,14,1,adj(wc,1.6)); r(1,5,14,3,wc);  // table top
                r(1,7,14,1,adj(wc,0.6));
                r(2,8,3,7,wc); r(11,8,3,7,wc);            // legs
                r(3,11,10,2,adj(wc,0.75));                 // shelf
                r(5,1,1,5,'#999'); r(4,1,3,1,'#999');     // tool on table
                r(5,3,2,1,'#bbb');
                break;
            }
            case 'furnace': {
                r(1,1,14,14,'#555');
                r(1,1,14,2,'#777'); r(1,13,14,2,'#333');
                r(4,5,8,8,'#2a2a2a');
                r(5,7,6,5,'#ff6600'); r(6,8,4,3,'#ffaa00'); r(7,9,2,2,'#ffee44');
                r(6,1,4,3,'#444'); r(6,2,4,2,'#888');
                break;
            }
            case 'anvil': {
                const ac='#445566';
                r(3,1,10,4,adj(ac,1.3)); r(3,1,10,2,'#8899bb');
                r(1,5,14,6,ac); r(1,5,14,1,'#778899');
                r(3,11,10,4,ac); r(3,11,10,1,adj(ac,0.8));
                r(2,14,12,2,adj(ac,0.6));
                break;
            }
            case 'alchemy_table': {
                const ac='#6644aa';
                r(1,5,14,1,adj(ac,1.7)); r(1,6,14,3,ac); r(1,8,14,1,adj(ac,0.6));
                r(2,9,3,6,ac); r(11,9,3,6,ac); r(3,11,10,2,adj(ac,0.7));
                r(4,0,8,6,adj(ac,0.8)); r(5,0,6,2,'#cc88ff'); r(6,1,4,1,'#eeddff');
                r(6,2,1,1,'#eeddff'); r(10,3,1,1,'#eeddff');
                break;
            }

            // ── POTIONS ───────────────────────────────────────
            case 'health_potion':
                r(6,2,4,2,'#666'); r(6,4,4,2,'#aaa');
                r(3,6,10,7,adj(c,0.7)); r(4,13,8,2,adj(c,0.5));
                r(4,7,8,4,c); r(5,7,2,4,cL); r(10,8,1,2,cLL);
                r(3,6,1,7,cL); r(12,6,1,7,cD);
                break;
            case 'potion_speed': case 'potion_defense':
            case 'potion_mining': case 'potion_regen': {
                r(6,2,4,2,'#666'); r(6,4,4,2,'#aaa');
                r(3,6,10,7,adj(c,0.6)); r(4,13,8,2,adj(c,0.4));
                r(4,7,8,4,c); r(5,7,2,3,cL); r(10,9,1,1,cLL);
                r(3,6,1,7,cL); r(12,6,1,7,cD);
                if (def.id === 'potion_speed')   { r(4,5,4,1,'#fff'); r(5,4,2,1,'#fff'); }
                if (def.id === 'potion_defense') { r(7,9,2,1,'#fff'); r(6,10,4,1,'#fff'); r(7,11,2,1,'#fff'); }
                if (def.id === 'potion_mining')  { r(5,10,6,1,'#555'); r(5,10,1,3,'#555'); }
                if (def.id === 'potion_regen')   { r(6,9,1,1,'#fff'); r(9,9,1,1,'#fff'); r(5,10,6,2,'#fff'); r(7,13,2,1,'#fff'); }
                break;
            }
            case 'coin': {
                ctx.fillStyle=c; ctx.beginPath();
                ctx.arc(x+size*.5,y+size*.5,size*.38,0,Math.PI*2); ctx.fill();
                ctx.fillStyle=cLL; ctx.beginPath();
                ctx.arc(x+size*.44,y+size*.44,size*.18,0,Math.PI*2); ctx.fill();
                ctx.fillStyle=cD; ctx.font=`bold ${Math.round(size*.35)}px monospace`;
                ctx.textAlign='center';
                ctx.fillText('$',x+size*.5,y+size*.63); ctx.textAlign='left';
                break;
            }

            // ── BOSS ITEMS ────────────────────────────────────
            case 'old_battery':
                r(3,4,10,10,c); r(3,4,10,2,cL);
                r(5,1,2,4,cL); r(9,1,2,4,cD);
                r(5,1,2,1,'#fff'); r(9,1,2,1,'#777');
                r(8,6,2,2,'#ffff44'); r(7,8,2,2,'#ffff44');
                r(6,10,2,2,'#ffff44'); r(7,7,1,5,adj('#ffff44',1.1)); break;
            case 'mech_heart': {
                const hc='#cc3322';
                r(4,3,3,3,hc); r(9,3,3,3,hc);
                r(3,5,10,4,hc); r(4,9,8,2,hc); r(5,11,6,2,hc);
                r(6,13,4,1,hc); r(7,14,2,1,hc);
                r(5,4,2,2,cL); r(9,4,2,2,cL);
                r(7,7,2,2,'#ffcc44'); r(6,6,4,4,adj(hc,1.3)); r(7,7,2,2,'#ffdd66');
                break;
            }
            case 'deep_invoker': {
                const dc='#ff2244';
                r(6,0,4,2,adj(dc,.7)); r(5,2,6,9,dc); r(3,5,10,5,dc);
                r(5,11,6,3,adj(dc,.7)); r(6,13,4,2,adj(dc,.5));
                r(6,3,4,6,adj(dc,1.4)); r(7,5,2,4,'#ff9999');
                r(5,7,6,1,'#44000a'); r(7,5,2,7,'#44000a');
                break;
            }
            case 'light_artifact': {
                r(7,0,2,16,'#ffffff'); r(0,7,16,2,'#ffffff');
                r(4,4,2,2,'#ffffc0'); r(10,4,2,2,'#ffffc0');
                r(4,10,2,2,'#ffffc0'); r(10,10,2,2,'#ffffc0');
                ctx.fillStyle='#ffffff'; ctx.beginPath();
                ctx.arc(x+size*.5,y+size*.5,size*.22,0,Math.PI*2); ctx.fill();
                ctx.globalAlpha=0.35; ctx.fillStyle='#aaddff'; ctx.beginPath();
                ctx.arc(x+size*.5,y+size*.5,size*.42,0,Math.PI*2); ctx.fill();
                ctx.globalAlpha=1; break;
            }

            // ── MATERIALS ─────────────────────────────────────
            case 'crystal_fragment':
                r(7,0,2,9,c); r(6,1,1,8,cL); r(9,2,1,6,cD);
                r(4,4,3,8,cD); r(4,4,2,8,c); r(10,3,3,8,cD); r(10,3,2,8,adj(c,.8));
                r(7,0,1,7,'#ffffff'); break;
            case 'advanced_iron':
                r(1,1,14,14,c); r(1,1,14,2,cL); r(1,13,14,2,cD); r(13,1,2,14,cD);
                r(3,3,2,2,cL); r(11,3,2,2,cL); r(3,11,2,2,cL); r(11,11,2,2,cL);
                r(6,1,4,1,'#aaaacc'); r(1,6,1,4,'#aaaacc'); break;
            case 'brass_fragment':
                r(2,2,12,12,c); r(2,2,12,2,cL); r(2,12,12,2,cD); r(12,2,2,12,cD);
                r(3,3,4,2,cLL); r(8,5,3,2,cLL); r(4,8,3,2,cLL); r(3,3,1,8,cL); break;
            case 'lore_tablet':
                r(2,1,12,13,c); r(2,1,12,2,cL); r(2,12,12,2,cD);
                r(4,3,8,1,cD); r(3,5,9,1,cD); r(4,7,7,1,cD);
                r(3,9,8,1,cD); r(5,11,5,1,cD); r(2,1,1,13,cL); r(13,1,1,13,cD); break;
            case 'wire':
                r(4,2,8,2,c); r(12,2,2,6,c); r(4,4,8,2,cL);
                r(2,4,2,6,c); r(4,8,8,2,cD); r(7,6,2,4,adj(c,1.4)); break;
            case 'trap':
                r(2,10,12,4,cD); r(2,10,12,2,c); r(4,6,8,4,c);
                r(5,2,2,5,c); r(9,2,2,5,c);
                r(5,1,2,3,'#ff4444'); r(9,1,2,3,'#ff4444'); r(4,6,8,1,cL); break;

            // ── ARMOR ─────────────────────────────────────────
            case 'copper_helmet': case 'iron_helmet': case 'gold_helmet':
                r(4,2,8,6,c); r(3,5,10,5,c); r(2,8,12,2,c);
                r(2,8,12,1,cL); r(4,6,8,2,cD); r(5,6,6,1,adj(cD,.4));
                r(5,2,3,2,cLL); r(4,4,2,2,cL);
                r(2,8,1,2,cD); r(13,8,1,2,cD); break;
            case 'copper_chest': case 'iron_chest': case 'gold_chest':
                r(4,1,8,3,c); r(2,4,12,8,c); r(1,6,2,6,c); r(13,6,2,6,c);
                r(2,12,12,4,c); r(4,4,4,2,cLL); r(2,4,2,8,cL); r(12,4,2,8,cD);
                r(2,12,12,1,cL); r(7,7,2,4,cD); break;
            case 'copper_legs': case 'iron_legs': case 'gold_legs':
                r(2,1,12,3,c); r(2,1,12,1,cL);
                r(3,4,4,8,c); r(9,4,4,8,c);
                r(2,12,5,4,c); r(9,12,5,4,c);
                r(3,4,2,6,cL); r(9,4,2,6,cL);
                r(2,13,5,1,cL); r(9,13,5,1,cL); r(7,4,2,8,adj(cD,.6)); break;
            case 'speed_boots':
                r(3,8,10,5,c); r(2,12,12,3,c); r(2,12,12,1,cL);
                r(3,6,4,3,c); r(3,8,8,1,cL);
                r(2,9,3,1,cLL); r(1,10,2,1,cLL); r(1,11,1,1,cLL);
                r(13,12,2,3,cD); break;
            case 'miner_charm':
                ctx.fillStyle=c; ctx.beginPath();
                ctx.arc(x+size*.5,y+size*.58,size*.34,0,Math.PI*2); ctx.fill();
                ctx.fillStyle=cLL; ctx.beginPath();
                ctx.arc(x+size*.44,y+size*.52,size*.12,0,Math.PI*2); ctx.fill();
                r(7,1,2,5,'#888');
                r(6,9,4,1,cD); r(5,10,6,1,cD); r(8,8,1,5,cD); break;

            // ── MOUNT ITEMS ───────────────────────────────────
            case 'slime_saddle':
                r(2,9,12,5,'#8B6914'); r(2,9,12,2,'#a07820');
                r(3,6,10,4,c); r(4,4,8,3,adj(c,1.3)); r(5,4,3,1,adj(c,1.7));
                r(4,7,2,2,'#fff'); r(9,7,2,2,'#fff');
                r(5,8,1,1,'#111'); r(10,8,1,1,'#111'); break;
            case 'batwing_mount':
                r(7,7,2,6,adj(c,.5)); r(2,5,5,6,c); r(9,5,5,6,c);
                r(2,5,2,6,cL); r(13,5,2,6,cL); r(6,7,4,3,adj(c,1.2));
                r(7,5,2,3,'#ff44ff'); break;
            case 'golem_saddle':
                r(2,6,12,8,c); r(2,6,12,2,cL); r(4,4,8,3,cD);
                r(3,10,4,5,cD); r(9,10,4,5,cD);
                r(5,7,2,2,'#ff8800'); r(9,7,2,2,'#ff8800'); break;

            // ── HERBS & ALCHEMY MATS ──────────────────────────
            case 'herb_green': case 'herb_blue': case 'herb_red':
                r(8,13,1,3,WDD); r(4,9,5,5,c); r(7,7,5,6,adj(c,1.2));
                r(5,4,6,5,adj(c,.8)); r(5,4,2,2,cL); r(8,6,2,2,cLL);
                if (def.id==='herb_red') {
                    r(7,3,2,3,'#ffdd44'); r(6,2,4,2,'#ffdd44'); r(7,3,2,2,'#fff');
                }
                break;
            case 'mushroom':
                r(7,9,2,6,'#deb887'); r(3,5,10,5,c);
                r(3,5,10,2,cL); r(3,5,2,5,cL); r(11,5,2,5,cD);
                r(5,6,3,2,adj(c,1.4)); r(9,7,2,2,adj(c,1.4)); break;
            case 'glowing_sap':
                ctx.globalAlpha=.35; ctx.fillStyle=c; ctx.beginPath();
                ctx.arc(x+size*.5,y+size*.52,size*.44,0,Math.PI*2); ctx.fill();
                ctx.globalAlpha=1; ctx.fillStyle=c; ctx.beginPath();
                ctx.arc(x+size*.5,y+size*.52,size*.3,0,Math.PI*2); ctx.fill();
                ctx.fillStyle=cLL; ctx.beginPath();
                ctx.arc(x+size*.44,y+size*.46,size*.12,0,Math.PI*2); ctx.fill();
                r(7,12,2,3,adj(c,.8)); r(8,14,1,2,adj(c,.6)); break;

            // ── FALLBACK ──────────────────────────────────────
            default:
                if (def.type===ITEM_TYPE.TOOL) {
                    r(7,10,2,5,WDD); r(6,10,2,5,WD);
                    r(2,4,12,3,c); r(2,3,3,5,c); r(3,4,2,1,cLL);
                } else if (def.type===ITEM_TYPE.WEAPON) {
                    r(7,1,2,10,c); r(7,1,1,8,cLL); r(8,2,1,8,cD);
                    r(3,10,10,2,c); r(7,12,2,3,WD); r(6,14,4,2,cD);
                } else if (def.type===ITEM_TYPE.CONSUMABLE) {
                    r(6,2,4,2,'#888'); r(6,4,4,2,'#aaa');
                    r(3,6,10,8,c); r(4,7,8,4,cL); r(5,7,2,3,cLL);
                } else if (def.type===ITEM_TYPE.BLOCK) {
                    r(1,1,14,14,c); r(1,1,14,2,cL); r(1,13,14,2,cD); r(13,1,2,14,cD);
                } else {
                    r(2,2,12,12,c); r(2,2,12,2,cL); r(2,12,12,2,cD); r(12,2,2,12,cD);
                    r(4,4,4,3,cLL);
                }
        }

        // Glow border for lore items
        if (def.lore || def.type === ITEM_TYPE.SPECIAL) {
            ctx.strokeStyle = adj(c, 1.3);
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.4 + 0.2 * Math.sin(Date.now() * 0.003);
            ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
            ctx.globalAlpha = 1;
        }
    }
}
