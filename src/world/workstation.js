/**
 * WorkstationDetector
 * -------------------
 * Verifica quais estações de trabalho estão ao alcance do jogador.
 * Escaneia blocos ao redor procurando WORKBENCH, FURNACE, ANVIL.
 */

const STATION_RANGE = 4; // raio em blocos

const STATION_BLOCKS = {
    [BLOCK.WORKBENCH]:     'workbench',
    [BLOCK.FURNACE]:       'furnace',
    [BLOCK.ANVIL]:         'anvil',
    [BLOCK.ALCHEMY_TABLE]: 'alchemy',
};

class WorkstationDetector {
    constructor(chunkManager) {
        this.chunkManager = chunkManager;
        this.nearbyStations = new Set(); // Set of station kind strings
    }

    /**
     * Atualiza quais estações estão próximas do jogador.
     * Chamar uma vez por frame (ou a cada ~0.25s para otimizar).
     */
    update(player) {
        this.nearbyStations.clear();
        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h * 0.5) / BLOCK_SIZE);

        for (let dy = -STATION_RANGE; dy <= STATION_RANGE; dy++) {
            for (let dx = -STATION_RANGE; dx <= STATION_RANGE; dx++) {
                const bx = pbx + dx;
                const by = pby + dy;
                const blockId = this.chunkManager.getBlockAt(bx, by);
                const kind = STATION_BLOCKS[blockId];
                if (kind) this.nearbyStations.add(kind);
            }
        }
    }

    /**
     * Verifica se o jogador tem acesso a uma estação específica.
     * station=null → sempre true (crafting de mão).
     */
    hasStation(stationKind) {
        if (!stationKind) return true; // receitas sem estação
        return this.nearbyStations.has(stationKind);
    }

    /**
     * Retorna array de strings das estações disponíveis.
     */
    getAvailable() {
        return [...this.nearbyStations];
    }
}
