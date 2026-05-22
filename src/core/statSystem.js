/**
 * StatSystem — Fonte única de verdade para todos os stats derivados do jogador.
 *
 * Centraliza o cálculo de:
 *   maxHp      = base + equipment.maxHpBonus + mount.maxHpBonus
 *   defense    = equipment.totalDefense + buff.defenseBonus + mount.defenseBonus
 *   moveSpeed  = equipment.moveSpeedMult * buff.moveMult * mount.moveMult
 *   mineSpeed  = equipment.mineMult * buff.mineMult * mount.mineMult
 *   jumpPower  = mount.jumpBonus (multiplier on vy)
 *
 * Antes: cálculos espalhados em engine.js, combat.js e buffs.js.
 * Agora: qualquer sistema lê de statSystem.defense, statSystem.moveSpeed, etc.
 *
 * Suporta contribuições de montaria (setMountContrib / clearMountContrib)
 * para que MountSystem apenas defina seus bônus e StatSystem consolida tudo.
 */
class StatSystem {
    constructor(equipment, buffs) {
        this.equipment = equipment;
        this.buffs     = buffs;

        // Computed every frame in update()
        this.maxHp    = 100;
        this.defense  = 0;
        this.moveSpeed = 1.0;  // final multiplier applied to base player speed
        this.mineSpeed = 1.0;  // final multiplier
        this.jumpPower = 1.0;  // multiplier on jump vy

        // Mount contributions (set externally by MountManager)
        this._mount = {
            maxHpBonus:   0,
            defenseBonus: 0,
            moveBonus:    0,   // additive on top of 1.0 base
            mineBonus:    0,
            jumpBonus:    0,
            canFly:       false,
        };

        // Cached buff result (set during update, read by others)
        this._buffResult = { hpDelta: 0, moveMultiplier: 1, defenseBonus: 0, mineMultiplier: 1 };
    }

    /**
     * Called once per frame from engine.update().
     * Recalculates all derived stats, applies HP delta from buffs, caps player HP.
     * Returns the computed stats object (same reference each frame — don't store it).
     */
    update(dt, player) {
        const eq = this.equipment;
        const buffRes = this.buffs.update(dt, player);
        this._buffResult = buffRes;

        // Max HP
        this.maxHp = 100 + eq.maxHpBonus + this._mount.maxHpBonus;
        player.maxHp = this.maxHp;
        if (player.hp > this.maxHp) player.hp = this.maxHp;

        // Defense
        this.defense = eq.totalDefense + buffRes.defenseBonus + this._mount.defenseBonus;

        // Move speed (multiplicative chain)
        this.moveSpeed =
            eq.getMoveSpeedMultiplier() *
            buffRes.moveMultiplier *
            (1 + this._mount.moveBonus);

        // Mine speed
        const buffMine = buffRes.mineMultiplier || 1;
        this.mineSpeed = eq.getMineSpeedMultiplier() * buffMine * (1 + this._mount.mineBonus);

        // Jump power
        this.jumpPower = 1.0 + this._mount.jumpBonus;

        return {
            maxHp:    this.maxHp,
            defense:  this.defense,
            moveSpeed: this.moveSpeed,
            mineSpeed: this.mineSpeed,
            jumpPower: this.jumpPower,
        };
    }

    /**
     * Applies defense formula to raw incoming damage.
     * Terraria formula: max(1, rawDmg - defense * 0.5)
     */
    applyDefense(rawDamage) {
        return Math.max(1, Math.round(rawDamage - this.defense * 0.5));
    }

    /**
     * Called by MountManager when player mounts / ability changes level.
     */
    setMountContrib({ maxHpBonus = 0, defenseBonus = 0, moveBonus = 0,
                      mineBonus = 0, jumpBonus = 0, canFly = false } = {}) {
        this._mount = { maxHpBonus, defenseBonus, moveBonus, mineBonus, jumpBonus, canFly };
    }

    /** Called when player dismounts. */
    clearMountContrib() {
        this._mount = { maxHpBonus: 0, defenseBonus: 0, moveBonus: 0,
                        mineBonus: 0, jumpBonus: 0, canFly: false };
    }

    get isMountedWithFlight() { return this._mount.canFly; }
}
