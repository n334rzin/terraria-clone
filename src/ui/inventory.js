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

    /**
     * Draw the hotbar at the top center of the screen.
     */
    drawHotbar(ctx, canvasW) {
        const totalW = HOTBAR_SLOTS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
        const startX = (canvasW - totalW) * 0.5;
        const startY = 8;

        for (let i = 0; i < HOTBAR_SLOTS; i++) {
            const x = startX + i * (SLOT_SIZE + SLOT_GAP);
            const y = startY;
            const selected = (i === this.selectedSlot);

            // Slot background
            ctx.fillStyle = selected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.55)';
            ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);

            // Border
            ctx.strokeStyle = selected ? '#ffcc00' : '#555';
            ctx.lineWidth = selected ? 2 : 1;
            ctx.strokeRect(x, y, SLOT_SIZE, SLOT_SIZE);

            // Item icon
            const slot = this.hotbar[i];
            if (slot.itemId) {
                const def = getItemDef(slot.itemId);
                if (def) {
                    this._drawItemIcon(ctx, x + 4, y + 4, SLOT_SIZE - 8, def);
                    // Quantity
                    if (slot.quantity > 1) {
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 11px monospace';
                        ctx.textAlign = 'right';
                        ctx.fillText(slot.quantity, x + SLOT_SIZE - 4, y + SLOT_SIZE - 4);
                    }
                }
            }

            // Slot number
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(i === 9 ? '0' : `${i + 1}`, x + 3, y + 11);
        }
    }

    /**
     * Draw the expanded inventory overlay.
     */
    drawInventory(ctx, canvasW, canvasH) {
        if (!this.isOpen) return;

        // Darken background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        const totalW = INVENTORY_COLS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
        const totalH = INVENTORY_ROWS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
        const startX = (canvasW - totalW) * 0.5;
        const startY = (canvasH - totalH) * 0.5;

        // Title
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('INVENTÁRIO (E para fechar)', canvasW * 0.5, startY - 20);

        // Draw slots
        for (let row = 0; row < INVENTORY_ROWS; row++) {
            for (let col = 0; col < INVENTORY_COLS; col++) {
                const idx = row * INVENTORY_COLS + col;
                const x = startX + col * (SLOT_SIZE + SLOT_GAP);
                const y = startY + row * (SLOT_SIZE + SLOT_GAP);

                ctx.fillStyle = 'rgba(30,30,50,0.85)';
                ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, SLOT_SIZE, SLOT_SIZE);

                const slot = this.inventory[idx];
                if (slot && slot.itemId) {
                    const def = getItemDef(slot.itemId);
                    if (def) {
                        this._drawItemIcon(ctx, x + 4, y + 4, SLOT_SIZE - 8, def);
                        if (slot.quantity > 1) {
                            ctx.fillStyle = '#fff';
                            ctx.font = 'bold 11px monospace';
                            ctx.textAlign = 'right';
                            ctx.fillText(slot.quantity, x + SLOT_SIZE - 4, y + SLOT_SIZE - 4);
                        }
                    }
                }
            }
        }
    }

    /**
     * Draw a simple colored icon for an item.
     */
    _drawItemIcon(ctx, x, y, size, def) {
        ctx.fillStyle = def.iconBg || '#333';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = def.color || '#fff';

        if (def.type === ITEM_TYPE.TOOL) {
            // Pickaxe icon
            ctx.fillRect(x + size * 0.3, y + 2, size * 0.15, size * 0.7);
            ctx.fillRect(x + size * 0.15, y + 2, size * 0.5, size * 0.25);
        } else if (def.type === ITEM_TYPE.WEAPON) {
            // Sword icon
            ctx.fillRect(x + size * 0.4, y + 2, size * 0.2, size * 0.75);
            ctx.fillRect(x + size * 0.2, y + size * 0.55, size * 0.6, size * 0.12);
        } else if (def.type === ITEM_TYPE.LIGHT) {
            // Torch icon
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(x + size * 0.4, y + size * 0.3, size * 0.2, size * 0.6);
            ctx.fillStyle = '#ff8800';
            ctx.fillRect(x + size * 0.3, y + 2, size * 0.4, size * 0.35);
            ctx.fillStyle = '#ffdd00';
            ctx.fillRect(x + size * 0.35, y + 4, size * 0.3, size * 0.2);
        } else {
            // Block or other item — filled square
            ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
        }
    }
}
