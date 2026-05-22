/**
 * EquipmentSystem
 * ---------------
 * Gerencia slots de equipamento do jogador:
 *   head, chest, legs, accessory1, accessory2
 *
 * Calcula stats derivados:
 *   totalDefense, moveSpeedBonus, mineSpeedBonus, maxHpBonus
 *
 * Fórmula de defesa (estilo Terraria):
 *   dano_final = max(1, dano_bruto - defesa * 0.5)
 */

class EquipmentSystem {
    constructor(inventory) {
        this.inventory = inventory;

        // Equipment slots: each has { itemId, def } or null
        this.slots = {
            head:       null,
            chest:      null,
            legs:       null,
            accessory1: null,
            accessory2: null,
        };

        // Derived stats (recalculated on equip/unequip)
        this.totalDefense     = 0;
        this.moveSpeedBonus   = 0;   // multiplicador adicional (0.1 = +10%)
        this.mineSpeedBonus   = 0;
        this.maxHpBonus       = 0;
    }

    /**
     * Tenta equipar um item do inventário no slot correspondente.
     * Se já tem item no slot, desequipa primeiro.
     * @param {string} itemId
     * @returns {boolean} true se equipou com sucesso
     */
    equip(itemId) {
        const def = getItemDef(itemId);
        if (!def || !def.slot) return false;

        // Determina o slot destino
        let targetSlot;
        if (def.slot === 'accessory') {
            // Usa primeiro slot de acessório vago, senão troca o 1
            targetSlot = !this.slots.accessory1 ? 'accessory1' :
                         !this.slots.accessory2 ? 'accessory2' : 'accessory1';
        } else {
            targetSlot = def.slot; // 'head', 'chest', 'legs'
        }

        // Desequipa item atual nesse slot (devolve ao inventário)
        this.unequip(targetSlot);

        // Remove do inventário
        const removed = this.inventory.removeItem(itemId, 1);
        if (!removed) return false;

        this.slots[targetSlot] = { itemId, def };
        this._recalcStats();
        return true;
    }

    /**
     * Remove equipamento de um slot e devolve ao inventário.
     */
    unequip(slotName) {
        const current = this.slots[slotName];
        if (!current) return false;

        this.inventory.addItem(current.itemId, 1);
        this.slots[slotName] = null;
        this._recalcStats();
        return true;
    }

    /**
     * Recalcula todos os stats derivados dos equipamentos.
     */
    _recalcStats() {
        this.totalDefense   = 0;
        this.moveSpeedBonus = 0;
        this.mineSpeedBonus = 0;
        this.maxHpBonus     = 0;

        for (const slot of Object.values(this.slots)) {
            if (!slot) continue;
            const d = slot.def;
            this.totalDefense   += d.defense         || 0;
            this.moveSpeedBonus += d.moveSpeedBonus   || 0;
            this.mineSpeedBonus += d.mineSpeedBonus   || 0;
            this.maxHpBonus     += d.maxHpBonus       || 0;
        }
    }

    /**
     * Aplica fórmula de defesa do Terraria.
     * @param {number} rawDamage - dano bruto do inimigo
     * @returns {number} dano final (mínimo 1)
     */
    applyDefense(rawDamage) {
        return Math.max(1, Math.round(rawDamage - this.totalDefense * 0.5));
    }

    /**
     * Retorna o multiplicador de velocidade de mineração (1.0 + bonus).
     */
    getMineSpeedMultiplier() {
        return 1.0 + this.mineSpeedBonus;
    }

    /**
     * Retorna o multiplicador de velocidade de movimento (1.0 + bonus).
     */
    getMoveSpeedMultiplier() {
        return 1.0 + this.moveSpeedBonus;
    }

    /**
     * Retorna HP máximo com bonus.
     */
    getMaxHp(baseMaxHp) {
        return baseMaxHp + this.maxHpBonus;
    }

    /**
     * Desenha painel de equipamento (à direita do inventário expandido).
     */
    draw(ctx, x, y) {
        const slotW = 32;
        const slotH = 32;
        const pad = 4;

        ctx.fillStyle = 'rgba(10,10,20,0.85)';
        ctx.fillRect(x, y, slotW + pad * 2 + 60, (slotH + pad) * 5 + pad + 20);
        ctx.strokeStyle = '#555';
        ctx.strokeRect(x, y, slotW + pad * 2 + 60, (slotH + pad) * 5 + pad + 20);

        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('Equipamento', x + 6, y + 14);

        const slotNames = ['head', 'chest', 'legs', 'accessory1', 'accessory2'];
        const slotLabels = ['Cabeça', 'Corpo', 'Pernas', 'Acess.1', 'Acess.2'];

        for (let i = 0; i < slotNames.length; i++) {
            const sx = x + pad;
            const sy = y + 20 + i * (slotH + pad);
            const slot = this.slots[slotNames[i]];

            // Slot background
            ctx.fillStyle = slot ? '#334' : '#1a1a2a';
            ctx.fillRect(sx, sy, slotW, slotH);
            ctx.strokeStyle = '#555';
            ctx.strokeRect(sx, sy, slotW, slotH);

            if (slot) {
                // Item icon
                ctx.fillStyle = slot.def.iconBg || '#333';
                ctx.fillRect(sx + 4, sy + 4, slotW - 8, slotH - 8);
                ctx.fillStyle = slot.def.color || '#fff';
                ctx.fillRect(sx + 6, sy + 6, slotW - 12, slotH - 12);
            }

            // Label
            ctx.fillStyle = '#888';
            ctx.font = '8px monospace';
            ctx.fillText(slotLabels[i], sx + slotW + 4, sy + 12);

            if (slot) {
                ctx.fillStyle = '#ccc';
                ctx.font = '8px monospace';
                ctx.fillText(slot.def.name, sx + slotW + 4, sy + 22);
                if (slot.def.defense) {
                    ctx.fillStyle = '#88aaff';
                    ctx.fillText(`DEF +${slot.def.defense}`, sx + slotW + 4, sy + 30);
                }
            }
        }

        // Total stats
        const statsY = y + 20 + 5 * (slotH + pad) + 4;
        ctx.fillStyle = '#88aaff';
        ctx.font = '9px monospace';
        ctx.fillText(`Defesa: ${this.totalDefense}`, x + 6, statsY);
        if (this.moveSpeedBonus > 0) {
            ctx.fillText(`Veloc: +${Math.round(this.moveSpeedBonus * 100)}%`, x + 6, statsY + 11);
        }
    }
}
