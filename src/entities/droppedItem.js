/**
 * DroppedItem + DropManager
 * --------------------------
 * Entidade física de item caído no mundo, com:
 *   - Gravidade + atrito + colisão AABB com chunks
 *   - Magnetismo: dentro de magnetRadius, acelera em direção ao jogador
 *   - Pickup: AABB com jogador → tenta addItem; se inventário cheio, fica esperando
 *   - Tempo de vida: despawna após DROP_LIFETIME
 *   - Pickup delay inicial (~0.4s) para drops não serem instantaneamente coletados
 *     em cima do jogador (importante para feedback visual de chefes)
 *
 * Renderização:
 *   - Pequeno ícone com cor do item (igual ao inventário)
 *   - Bobbing (flutuação senoidal) suave
 *   - Glow para itens raros (SPECIAL/MATERIAL com lore)
 *   - Contador de stack se quantity > 1
 */

const DROP_LIFETIME       = 300;   // s — 5 minutos
const DROP_PICKUP_DELAY   = 0.4;   // s — atraso inicial de pickup
const DROP_GRAVITY        = 1100;
const DROP_TERMINAL_VEL   = 700;
const DROP_FRICTION_GROUND= 4;     // multiplicador exponencial
const DROP_FRICTION_AIR   = 0.5;
const DROP_MAGNET_RADIUS  = 120;   // px — raio de atração
const DROP_MAGNET_FORCE   = 1800;  // px/s² em direção ao player
const DROP_MAGNET_MAX_VEL = 700;
const DROP_PICKUP_RADIUS  = 40;    // px — raio de coleta (player h/2 + margem)
const DROP_SIZE           = 12;    // px (caixa de colisão e ícone)
const DROP_BOB_AMPLITUDE  = 2;
const DROP_BOB_SPEED      = 3;
const DROP_MERGE_RADIUS   = 16;    // drops do mesmo tipo se fundem

class DroppedItem {
    /**
     * @param {string} itemId - id do item em ITEMS
     * @param {number} quantity
     * @param {number} x - centro X
     * @param {number} y - centro Y
     * @param {number} vx - velocidade inicial
     * @param {number} vy
     */
    constructor(itemId, quantity, x, y, vx = 0, vy = 0) {
        this.itemId = itemId;
        this.quantity = quantity;
        this.def = getItemDef(itemId) || { color: '#fff', iconBg: '#888', name: itemId };

        // Position (top-left of AABB)
        this.w = DROP_SIZE;
        this.h = DROP_SIZE;
        this.x = x - this.w * 0.5;
        this.y = y - this.h * 0.5;

        this.vx = vx;
        this.vy = vy;

        this.onGround = false;
        this.lifetime = DROP_LIFETIME;
        this.pickupDelay = DROP_PICKUP_DELAY;
        this.bobTime = Math.random() * Math.PI * 2; // dessincroniza animação

        this.dead = false;
        this.magnetized = false;

        // Raridade derivada (para glow)
        this.rarity = this._computeRarity();
    }

    _computeRarity() {
        const id = this.itemId;
        if (id === 'light_artifact') return 4;          // dourado
        if (id === 'lore_tablet' || id === 'deep_invoker' || id === 'mech_heart') return 3; // roxo
        if (id === 'plasma_sword' || id === 'gold_pickaxe' || id === 'gold_sword') return 2; // amarelo
        if (id === 'crystal_fragment' || id === 'brass_fragment' || id === 'advanced_iron') return 1; // azul
        return 0;
    }

    update(dt, player, chunkManager) {
        if (this.dead) return;

        this.lifetime -= dt;
        if (this.lifetime <= 0) { this.dead = true; return; }

        if (this.pickupDelay > 0) this.pickupDelay -= dt;
        this.bobTime += dt * DROP_BOB_SPEED;

        // --- Magnetismo ---
        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;
        const cx = this.x + this.w * 0.5;
        const cy = this.y + this.h * 0.5;
        const dx = pcx - cx;
        const dy = pcy - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (this.pickupDelay <= 0 && dist < DROP_MAGNET_RADIUS) {
            this.magnetized = true;
            const inv = 1 / Math.max(dist, 0.001);
            this.vx += dx * inv * DROP_MAGNET_FORCE * dt;
            this.vy += dy * inv * DROP_MAGNET_FORCE * dt;
            // Cap magnet velocity
            const sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (sp > DROP_MAGNET_MAX_VEL) {
                this.vx = (this.vx / sp) * DROP_MAGNET_MAX_VEL;
                this.vy = (this.vy / sp) * DROP_MAGNET_MAX_VEL;
            }
        } else {
            this.magnetized = false;
            // Gravidade normal
            this.vy += DROP_GRAVITY * dt;
            if (this.vy > DROP_TERMINAL_VEL) this.vy = DROP_TERMINAL_VEL;
        }

        // --- Movimento + colisão ---
        if (this.magnetized) {
            // Quando magnetizado, ignora colisão com blocos (passa por paredes)
            this.x += this.vx * dt;
            this.y += this.vy * dt;
        } else {
            this.y += this.vy * dt;
            this._resolveY(chunkManager);
            this.x += this.vx * dt;
            this._resolveX(chunkManager);

            // Atrito
            if (this.onGround) {
                this.vx *= Math.exp(-DROP_FRICTION_GROUND * dt);
                if (Math.abs(this.vx) < 5) this.vx = 0;
            } else {
                this.vx *= Math.exp(-DROP_FRICTION_AIR * dt);
            }
        }
    }

    _isSolid(bx, by, chunkManager) {
        const id = chunkManager.getBlockAt(bx, by);
        return id !== BLOCK.AIR && id !== BLOCK.TORCH && id !== BLOCK.COBWEB;
    }

    _resolveY(chunkManager) {
        this.onGround = false;
        const x0 = Math.floor(this.x / BLOCK_SIZE);
        const x1 = Math.floor((this.x + this.w - 1) / BLOCK_SIZE);
        if (this.vy > 0) {
            const y1 = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
            for (let bx = x0; bx <= x1; bx++) {
                if (this._isSolid(bx, y1, chunkManager)) {
                    this.y = y1 * BLOCK_SIZE - this.h;
                    this.vy = 0;
                    this.onGround = true;
                    return;
                }
            }
        } else if (this.vy < 0) {
            const y0 = Math.floor(this.y / BLOCK_SIZE);
            for (let bx = x0; bx <= x1; bx++) {
                if (this._isSolid(bx, y0, chunkManager)) {
                    this.y = (y0 + 1) * BLOCK_SIZE;
                    this.vy = 0;
                    return;
                }
            }
        }
    }

    _resolveX(chunkManager) {
        const y0 = Math.floor(this.y / BLOCK_SIZE);
        const y1 = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
        if (this.vx > 0) {
            const cx = Math.floor((this.x + this.w) / BLOCK_SIZE);
            for (let by = y0; by <= y1; by++) {
                if (this._isSolid(cx, by, chunkManager)) {
                    this.x = cx * BLOCK_SIZE - this.w;
                    this.vx = 0;
                    return;
                }
            }
        } else if (this.vx < 0) {
            const cx = Math.floor((this.x - 1) / BLOCK_SIZE);
            for (let by = y0; by <= y1; by++) {
                if (this._isSolid(cx, by, chunkManager)) {
                    this.x = (cx + 1) * BLOCK_SIZE;
                    this.vx = 0;
                    return;
                }
            }
        }
    }

    /**
     * Verifica se está colidindo com o jogador para pickup.
     * @returns {boolean} true se foi coletado (deve ser removido)
     */
    tryPickup(player, inventory) {
        if (this.dead || this.pickupDelay > 0) return false;
        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;
        const cx = this.x + this.w * 0.5;
        const cy = this.y + this.h * 0.5;
        const dx = pcx - cx;
        const dy = pcy - cy;
        if (dx * dx + dy * dy > DROP_PICKUP_RADIUS * DROP_PICKUP_RADIUS) return false;

        const added = inventory.addItem(this.itemId, this.quantity);
        if (added > 0) {
            this.quantity -= added;
            if (this.quantity <= 0) {
                this.dead = true;
                if (window._audio) window._audio.playSelect();
                return true;
            }
        }
        return false;
    }

    /**
     * Tenta fundir com outro drop do mesmo tipo (otimização visual).
     */
    tryMerge(other) {
        if (this.dead || other.dead || this.itemId !== other.itemId) return false;
        const dx = (other.x + other.w * 0.5) - (this.x + this.w * 0.5);
        const dy = (other.y + other.h * 0.5) - (this.y + this.h * 0.5);
        if (dx * dx + dy * dy > DROP_MERGE_RADIUS * DROP_MERGE_RADIUS) return false;

        const max = (this.def.stackSize || 99);
        const space = max - this.quantity;
        if (space <= 0) return false;
        const transfer = Math.min(space, other.quantity);
        this.quantity += transfer;
        other.quantity -= transfer;
        if (other.quantity <= 0) other.dead = true;
        return true;
    }

    draw(ctx, camera) {
        if (this.dead) return;
        const cx = this.x + this.w * 0.5;
        const cy = this.y + this.h * 0.5;
        const { sx, sy } = camera.worldToScreen(cx, cy);

        // Bobbing (apenas no chão e não magnetizado)
        const bob = (this.onGround && !this.magnetized)
            ? Math.sin(this.bobTime) * DROP_BOB_AMPLITUDE
            : 0;

        // Piscar quando perto de despawnar (últimos 5s)
        if (this.lifetime < 5 && Math.floor(this.lifetime * 8) % 2 === 0) return;

        const rx = (sx - this.w * 0.5) | 0;
        const ry = (sy - this.h * 0.5 + bob) | 0;

        // Glow para raridade
        if (this.rarity > 0) {
            const glowColors = ['#fff', '#88ccff', '#ffdd44', '#cc66ff', '#ffaa00'];
            const glowColor = glowColors[this.rarity];
            const pulse = 0.5 + 0.5 * Math.sin(this.bobTime * 0.7);
            ctx.fillStyle = glowColor;
            ctx.globalAlpha = 0.15 + pulse * 0.15;
            const glowSize = 6 + this.rarity * 2;
            ctx.fillRect(rx - glowSize, ry - glowSize, this.w + glowSize * 2, this.h + glowSize * 2);
            ctx.globalAlpha = 1;
        }

        // Sombra (no chão)
        if (this.onGround && !this.magnetized) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(rx + 1, ry + this.h + 1 - bob, this.w - 2, 2);
        }

        // Outline preta
        ctx.fillStyle = '#000';
        ctx.fillRect(rx - 1, ry - 1, this.w + 2, this.h + 2);

        // Background do ícone
        ctx.fillStyle = this.def.iconBg || '#444';
        ctx.fillRect(rx, ry, this.w, this.h);

        // "Frente" do item
        ctx.fillStyle = this.def.color || '#fff';
        ctx.fillRect(rx + 2, ry + 2, this.w - 4, this.h - 4);

        // Stack count
        if (this.quantity > 1) {
            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#000';
            ctx.fillText(this.quantity, rx + this.w - 5, ry + this.h + 7);
            ctx.fillStyle = '#fff';
            ctx.fillText(this.quantity, rx + this.w - 6, ry + this.h + 6);
        }
    }
}

// ============================================================================
// DropManager
// ============================================================================

const DROP_VIEW_PAD = 100; // margem de cull

class DropManager {
    constructor(chunkManager) {
        this.drops = [];
        this.chunkManager = chunkManager;
    }

    /**
     * Spawna um drop no mundo.
     * @param {string} itemId
     * @param {number} quantity
     * @param {number} x - centro X em world-pixels
     * @param {number} y - centro Y em world-pixels
     * @param {Object} opts - { vx, vy, scatter }
     * @returns {DroppedItem|null}
     */
    spawn(itemId, quantity, x, y, opts = {}) {
        if (!itemId || quantity <= 0) return null;
        const def = getItemDef(itemId);
        if (!def) {
            console.warn(`[DropManager] Item desconhecido: ${itemId}`);
            return null;
        }
        const stackSize = def.stackSize || 99;

        // Quebra em vários drops se exceder stackSize
        let remaining = quantity;
        const result = [];
        while (remaining > 0) {
            const qty = Math.min(remaining, stackSize);
            remaining -= qty;

            const scatter = opts.scatter !== undefined ? opts.scatter : 80;
            const vx = opts.vx !== undefined ? opts.vx : (Math.random() - 0.5) * scatter * 2;
            const vy = opts.vy !== undefined ? opts.vy : -100 - Math.random() * 80;

            const drop = new DroppedItem(itemId, qty, x, y, vx, vy);
            this.drops.push(drop);
            result.push(drop);
        }
        return result[0];
    }

    /**
     * Spawna drops a partir de uma drop table.
     * Tabela: array de { id, min, max, chance }
     */
    spawnFromTable(table, x, y, opts = {}) {
        if (!table) return;
        for (const entry of table) {
            if (Math.random() > (entry.chance ?? 1.0)) continue;
            const min = entry.min ?? 1;
            const max = entry.max ?? min;
            const qty = min + Math.floor(Math.random() * (max - min + 1));
            if (qty > 0) this.spawn(entry.id, qty, x, y, opts);
        }
    }

    update(dt, player, inventory) {
        // Pickup + update
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            d.update(dt, player, this.chunkManager);
            d.tryPickup(player, inventory);
            if (d.dead) this.drops.splice(i, 1);
        }

        // Merge passes (só checka pares vizinhos no array — barato)
        for (let i = 0; i < this.drops.length; i++) {
            const a = this.drops[i];
            if (a.dead || a.magnetized) continue;
            for (let j = i + 1; j < Math.min(i + 8, this.drops.length); j++) {
                const b = this.drops[j];
                if (b.dead || b.magnetized) continue;
                if (a.tryMerge(b)) break;
            }
        }
    }

    draw(ctx, camera) {
        const view = camera.getViewBounds();
        for (const d of this.drops) {
            if (d.dead) continue;
            if (d.x + d.w < view.left - DROP_VIEW_PAD || d.x > view.right + DROP_VIEW_PAD) continue;
            if (d.y + d.h < view.top - DROP_VIEW_PAD || d.y > view.bottom + DROP_VIEW_PAD) continue;
            d.draw(ctx, camera);
        }
    }

    clear() { this.drops.length = 0; }
    getCount() { return this.drops.length; }
}
