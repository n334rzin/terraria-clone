/**
 * BuffSystem
 * ----------
 * Gerencia buffs/debuffs temporais do jogador.
 * Cada buff tem: id, duration, icon color, e efeito por tick.
 *
 * Buffs disponíveis:
 *   - regen:    +2 HP/s por 10s (poção de vida)
 *   - burn:     -3 HP/s por 4s  (Fire Demon)
 *   - slow:     movespeed * 0.4 por 3s (Crystal Spider web)
 *   - defense_up: +5 defesa por 30s (futuro item)
 *   - speed_up:   +30% velocidade por 20s (futuro item)
 */

const BUFF_DEFS = {
    regen: {
        name: 'Regeneração', color: '#ff4466', icon: '❤',
        duration: 10, hpPerSec: 2,
    },
    burn: {
        name: 'Queimadura', color: '#ff6600', icon: '🔥',
        duration: 4, hpPerSec: -3, isDebuff: true,
    },
    slow: {
        name: 'Lentidão', color: '#aaaaaa', icon: '🕸',
        duration: 3, moveMultiplier: 0.4, isDebuff: true,
    },
    defense_up: {
        name: 'Escudo', color: '#4488ff', icon: '🛡',
        duration: 30, defenseBonus: 5,
    },
    speed_up: {
        name: 'Velocidade', color: '#44ffaa', icon: '💨',
        duration: 20, moveMultiplier: 1.3,
    },
    well_fed: {
        name: 'Bem Alimentado', color: '#ffcc44', icon: '🍖',
        duration: 60, defenseBonus: 2, moveMultiplier: 1.05, hpPerSec: 0.5,
    },
};

class BuffSystem {
    constructor() {
        // Active buffs: Map<buffId, { remaining, def }>
        this.active = new Map();
    }

    /**
     * Aplica ou renova um buff.
     * @param {string} buffId - chave em BUFF_DEFS
     * @param {number} [duration] - override de duração
     */
    apply(buffId, duration) {
        const def = BUFF_DEFS[buffId];
        if (!def) return;
        const dur = duration || def.duration;
        // Renova se já existe (não acumula)
        this.active.set(buffId, { remaining: dur, def });
    }

    /**
     * Remove um buff.
     */
    remove(buffId) {
        this.active.delete(buffId);
    }

    has(buffId) {
        return this.active.has(buffId);
    }

    /**
     * Tick: reduz timers, aplica efeitos de HP.
     * @param {number} dt
     * @param {Object} player - { hp, maxHp }
     * @returns {{ hpDelta, moveMultiplier, defenseBonus }}
     */
    update(dt, player) {
        let hpDelta = 0;
        let moveMultiplier = 1.0;
        let defenseBonus = 0;

        for (const [id, buff] of this.active.entries()) {
            buff.remaining -= dt;
            if (buff.remaining <= 0) {
                this.active.delete(id);
                continue;
            }

            const d = buff.def;

            // HP per second (regen or burn)
            if (d.hpPerSec) {
                hpDelta += d.hpPerSec * dt;
            }

            // Move multiplier (stacks multiplicatively)
            if (d.moveMultiplier) {
                moveMultiplier *= d.moveMultiplier;
            }

            // Defense bonus (stacks additively)
            if (d.defenseBonus) {
                defenseBonus += d.defenseBonus;
            }
        }

        // Apply HP changes
        if (hpDelta !== 0) {
            player.hp = Math.max(0, Math.min(player.maxHp, player.hp + hpDelta));
        }

        return { hpDelta, moveMultiplier, defenseBonus };
    }

    /**
     * Desenha ícones de buff ativos no HUD.
     */
    draw(ctx, startX, startY) {
        let x = startX;
        for (const [id, buff] of this.active.entries()) {
            const d = buff.def;
            const isDebuff = d.isDebuff || false;

            // Background
            ctx.fillStyle = isDebuff ? 'rgba(100,20,20,0.7)' : 'rgba(20,40,80,0.7)';
            ctx.fillRect(x, startY, 28, 28);
            ctx.strokeStyle = d.color;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, startY, 28, 28);

            // Icon
            ctx.font = '14px sans-serif';
            ctx.fillStyle = d.color;
            ctx.fillText(d.icon, x + 6, startY + 18);

            // Timer
            ctx.font = '7px monospace';
            ctx.fillStyle = '#ccc';
            ctx.fillText(`${Math.ceil(buff.remaining)}s`, x + 2, startY + 27);

            x += 32;
        }
    }

    /**
     * Retorna bônus de defesa total dos buffs ativos (sem side-effects).
     */
    _getDefenseBonus() {
        let bonus = 0;
        for (const [, buff] of this.active.entries()) {
            if (buff.def.defenseBonus) bonus += buff.def.defenseBonus;
        }
        return bonus;
    }

    getActiveCount() {
        return this.active.size;
    }

    clear() {
        this.active.clear();
    }
}
