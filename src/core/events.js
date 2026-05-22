/**
 * GameEvents — Barramento de eventos centralizado.
 *
 * Padrão: Observer / EventEmitter.
 * Todos os sistemas se comunicam ATRAVÉS deste objeto,
 * nunca chamando uns aos outros diretamente.
 *
 * Uso:
 *   events.on('player:damage', ({ amount, source }) => { ... });
 *   events.emit('player:damage', { amount: 10, source: 'slime' });
 *   events.off('player:damage', handler);  // remover listener
 *   events.once('boss:spawn', handler);    // escuta uma vez só
 *
 * Catálogo de eventos do jogo (referência):
 *
 *   PLAYER
 *   ─────────────────────────────────────────────
 *   player:damage       { amount, source, x, y }
 *   player:heal         { amount }
 *   player:death        { x, y }
 *   player:respawn      { x, y }
 *   player:levelup      { newLevel }
 *   player:mount        { mount }
 *   player:dismount     { mount }
 *
 *   INVENTORY / CRAFTING
 *   ─────────────────────────────────────────────
 *   item:add            { itemId, quantity }
 *   item:remove         { itemId, quantity }
 *   item:craft          { itemId, quantity }
 *   item:equip          { itemId, slot }
 *   item:unequip        { itemId, slot }
 *   item:pickup         { itemId, quantity, x, y }
 *
 *   WORLD / BLOCKS
 *   ─────────────────────────────────────────────
 *   block:mine          { bx, by, blockId }
 *   block:place         { bx, by, blockId }
 *   block:break         { bx, by, blockId }
 *
 *   COMBAT
 *   ─────────────────────────────────────────────
 *   enemy:damage        { enemy, amount, knockDir }
 *   enemy:death         { enemy, x, y }
 *   enemy:spawn         { enemy }
 *   boss:spawn          { boss, type }
 *   boss:phase-change   { boss, phase }
 *   boss:death          { boss, type }
 *
 *   BUFF
 *   ─────────────────────────────────────────────
 *   buff:apply          { buffId, duration }
 *   buff:expire         { buffId }
 *
 *   WORLD STATE
 *   ─────────────────────────────────────────────
 *   time:dawn           {}
 *   time:dusk           {}
 *   game:victory        { stats }
 *   game:over           {}
 *
 *   ALCHEMY (reservado para Fase 3)
 *   ─────────────────────────────────────────────
 *   alchemy:start       { ingredients }
 *   alchemy:tick        { temperature, progress }
 *   alchemy:unstable    { riskLevel }
 *   alchemy:complete    { result, quality }
 *   alchemy:explode     { x, y }
 *
 *   MOUNT (reservado para Fase 3)
 *   ─────────────────────────────────────────────
 *   mount:xp-gain       { mount, amount }
 *   mount:levelup       { mount, level }
 *   mount:ability       { mount, abilityId }
 */

class GameEvents {
    constructor() {
        /** @type {Map<string, Array<{fn: Function, once: boolean}>>} */
        this._listeners = new Map();
        this._debug = false; // set true to log all events to console
    }

    /**
     * Registra um listener para um evento.
     * @param {string} event
     * @param {Function} fn
     * @returns {Function} o próprio fn (para facilitar off())
     */
    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push({ fn, once: false });
        return fn;
    }

    /**
     * Registra um listener que será removido após a primeira chamada.
     * @param {string} event
     * @param {Function} fn
     */
    once(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push({ fn, once: true });
        return fn;
    }

    /**
     * Remove um listener específico.
     * @param {string} event
     * @param {Function} fn  — deve ser a mesma referência passada para on()
     */
    off(event, fn) {
        if (!this._listeners.has(event)) return;
        const list = this._listeners.get(event);
        const idx = list.findIndex(entry => entry.fn === fn);
        if (idx !== -1) list.splice(idx, 1);
    }

    /**
     * Dispara um evento, notificando todos os listeners registrados.
     * @param {string} event
     * @param {Object} [data={}]
     */
    emit(event, data = {}) {
        if (this._debug) console.log(`[Events] ${event}`, data);

        const list = this._listeners.get(event);
        if (!list || list.length === 0) return;

        // Iterate a copy so listeners can safely call off() during dispatch
        for (let i = list.length - 1; i >= 0; i--) {
            const entry = list[i];
            entry.fn(data);
            if (entry.once) list.splice(i, 1);
        }
    }

    /**
     * Remove todos os listeners de um evento (ou todos se sem argumento).
     */
    clear(event) {
        if (event) this._listeners.delete(event);
        else this._listeners.clear();
    }

    /** Retorna quantos listeners existem para um evento (útil para debug). */
    listenerCount(event) {
        return this._listeners.has(event) ? this._listeners.get(event).length : 0;
    }
}

// Instância global — acessível por todos os sistemas
const events = new GameEvents();
