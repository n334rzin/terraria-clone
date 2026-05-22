/**
 * ItemRegistry — Single source of truth for all items in the game.
 * Tiered progression: Starter → Copper → Iron → Gold → Underworld.
 */

const ITEM_TYPE = Object.freeze({
    TOOL:      'tool',
    WEAPON:    'weapon',
    BLOCK:     'block',
    CONSUMABLE:'consumable',
    SPECIAL:   'special',
    LIGHT:     'light',
    MATERIAL:  'material',
});

// Pickaxe tier determines which blocks can be mined
const PICK_TIER = Object.freeze({ STARTER: 0, COPPER: 1, IRON: 2, GOLD: 3 });

const ITEMS = {
    // ---- PICKAXES (tiered) ----
    pickaxe: {
        id: 'pickaxe', name: 'Picareta Inicial', type: ITEM_TYPE.TOOL,
        stackSize: 1, mineSpeed: 1.0, damage: 5, pickTier: PICK_TIER.STARTER,
        toolKind: 'pickaxe',
        color: '#8899aa', iconBg: '#556677',
    },
    axe: {
        id: 'axe', name: 'Machado Inicial', type: ITEM_TYPE.TOOL,
        stackSize: 1, mineSpeed: 1.0, damage: 6, pickTier: PICK_TIER.STARTER,
        toolKind: 'axe',
        color: '#9aaa88', iconBg: '#556644',
    },
    copper_axe: {
        id: 'copper_axe', name: 'Machado de Cobre', type: ITEM_TYPE.TOOL,
        stackSize: 1, mineSpeed: 1.6, damage: 9, pickTier: PICK_TIER.COPPER,
        toolKind: 'axe',
        color: '#c47030', iconBg: '#8a4a20',
    },
    iron_axe: {
        id: 'iron_axe', name: 'Machado de Ferro', type: ITEM_TYPE.TOOL,
        stackSize: 1, mineSpeed: 2.2, damage: 13, pickTier: PICK_TIER.IRON,
        toolKind: 'axe',
        color: '#a07850', iconBg: '#705030',
    },
    copper_pickaxe: {
        id: 'copper_pickaxe', name: 'Picareta de Cobre', type: ITEM_TYPE.TOOL,
        stackSize: 1, mineSpeed: 1.6, damage: 8, pickTier: PICK_TIER.COPPER,
        toolKind: 'pickaxe',
        color: '#c47030', iconBg: '#8a4a20',
    },
    iron_pickaxe: {
        id: 'iron_pickaxe', name: 'Picareta de Ferro', type: ITEM_TYPE.TOOL,
        stackSize: 1, mineSpeed: 2.2, damage: 12, pickTier: PICK_TIER.IRON,
        toolKind: 'pickaxe',
        color: '#a07850', iconBg: '#705030',
    },
    gold_pickaxe: {
        id: 'gold_pickaxe', name: 'Picareta de Ouro', type: ITEM_TYPE.TOOL,
        stackSize: 1, mineSpeed: 3.0, damage: 15, pickTier: PICK_TIER.GOLD,
        toolKind: 'pickaxe',
        color: '#d4a800', iconBg: '#a08000',
    },

    // ---- SWORDS (tiered) ----
    sword: {
        id: 'sword', name: 'Espada de Pedra', type: ITEM_TYPE.WEAPON,
        stackSize: 1, damage: 15, knockback: 6, attackSpeed: 0.40,
        color: '#888', iconBg: '#445566',
    },
    copper_sword: {
        id: 'copper_sword', name: 'Espada de Cobre', type: ITEM_TYPE.WEAPON,
        stackSize: 1, damage: 22, knockback: 7, attackSpeed: 0.35,
        color: '#c47030', iconBg: '#8a4a20',
    },
    iron_sword: {
        id: 'iron_sword', name: 'Espada de Ferro', type: ITEM_TYPE.WEAPON,
        stackSize: 1, damage: 32, knockback: 8, attackSpeed: 0.30,
        color: '#a0a0a0', iconBg: '#606060',
    },
    gold_sword: {
        id: 'gold_sword', name: 'Espada de Ouro', type: ITEM_TYPE.WEAPON,
        stackSize: 1, damage: 42, knockback: 9, attackSpeed: 0.28,
        color: '#d4a800', iconBg: '#a08000',
    },
    plasma_sword: {
        id: 'plasma_sword', name: 'Espada de Plasma', type: ITEM_TYPE.WEAPON,
        stackSize: 1, damage: 55, knockback: 12, attackSpeed: 0.22,
        color: '#44ddff', iconBg: '#2288aa',
    },

    // ---- BLOCKS ----
    dirt:       { id: 'dirt',       name: 'Terra',    type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.DIRT,       color: '#7a5230', iconBg: '#5a3a20' },
    grass:      { id: 'grass',      name: 'Grama',    type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.GRASS,      color: '#4a8f2a', iconBg: '#3a6f1a' },
    stone:      { id: 'stone',      name: 'Pedra',    type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.STONE,      color: '#6e6e6e', iconBg: '#4e4e4e' },
    sand:       { id: 'sand',       name: 'Areia',    type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.SAND,       color: '#c8b560', iconBg: '#a89540' },
    coal_ore:   { id: 'coal_ore',   name: 'Carvão',   type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.COAL_ORE,   color: '#3a3a3a', iconBg: '#1a1a1a' },
    copper_ore: { id: 'copper_ore', name: 'Cobre',    type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.COPPER_ORE, color: '#c47030', iconBg: '#8a4a20' },
    iron_ore:   { id: 'iron_ore',   name: 'Ferro',    type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.IRON_ORE,   color: '#a07850', iconBg: '#806040' },
    gold_ore:   { id: 'gold_ore',   name: 'Ouro',     type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.GOLD_ORE,   color: '#d4a800', iconBg: '#b48800' },
    obsidian:   { id: 'obsidian',   name: 'Obsidiana', type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.OBSIDIAN,  color: '#1a0a2e', iconBg: '#0d0518' },
    ash:        { id: 'ash',        name: 'Cinzas',   type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.ASH,        color: '#4a3a3a', iconBg: '#2a1a1a' },
    hellstone:  { id: 'hellstone',  name: 'Pedra Infernal', type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.HELLSTONE, color: '#cc3300', iconBg: '#882200' },
    wood:       { id: 'wood',       name: 'Madeira',  type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.WOOD,       color: '#6e4a22', iconBg: '#3e2a14' },
    leaves:     { id: 'leaves',     name: 'Folhas',   type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.LEAVES,     color: '#3a7a2a', iconBg: '#1e3e14' },
    plank:      { id: 'plank',      name: 'Tábua',    type: ITEM_TYPE.BLOCK, stackSize: 99, blockId: BLOCK.PLANK,      color: '#a07840', iconBg: '#7a5a30' },

    // ---- WORKSTATIONS (placeable) ----
    workbench:  { id: 'workbench',  name: 'Bancada de Trabalho', type: ITEM_TYPE.BLOCK, stackSize: 50, blockId: BLOCK.WORKBENCH, color: '#a06030', iconBg: '#6a4020', stationKind: 'workbench' },
    furnace:    { id: 'furnace',    name: 'Fornalha', type: ITEM_TYPE.BLOCK, stackSize: 50, blockId: BLOCK.FURNACE,    color: '#666',    iconBg: '#333',    stationKind: 'furnace' },
    anvil:      { id: 'anvil',      name: 'Bigorna',  type: ITEM_TYPE.BLOCK, stackSize: 50, blockId: BLOCK.ANVIL,      color: '#444458', iconBg: '#22222e', stationKind: 'anvil' },

    // ---- LIGHT ----
    torch: {
        id: 'torch', name: 'Tocha', type: ITEM_TYPE.LIGHT,
        stackSize: 99, blockId: BLOCK.TORCH, color: '#ffaa22', iconBg: '#cc8800',
    },

    // ---- CONSUMABLES ----
    health_potion: {
        id: 'health_potion', name: 'Poção de Vida', type: ITEM_TYPE.CONSUMABLE,
        stackSize: 30, healAmount: 50, color: '#ff4466', iconBg: '#aa2244',
    },
    coin: {
        id: 'coin', name: 'Moeda', type: ITEM_TYPE.MATERIAL,
        stackSize: 999, color: '#ffdd44', iconBg: '#aa9922',
    },

    // ---- BOSS SUMMONING ITEMS ----
    old_battery: {
        id: 'old_battery', name: 'Bateria Velha', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, color: '#55aa55', iconBg: '#337733',
        lore: 'Uma célula de energia antiga. Pulsa com uma frequência familiar nas Cavernas...',
    },
    mech_heart: {
        id: 'mech_heart', name: 'Coração Mecânico', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, color: '#cc8844', iconBg: '#886622',
        lore: 'O coração pulsante de uma máquina ancestral. As veias de ouro parecem reagir a ele...',
    },
    deep_invoker: {
        id: 'deep_invoker', name: 'Invocador Profundo', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, color: '#ff2244', iconBg: '#aa1133',
        lore: 'Um artefato proibido que sussurra no escuro. Só desperta nas profundezas do Submundo.',
    },

    // ---- BOSS DROPS / PROGRESSION MATERIALS ----
    advanced_iron: {
        id: 'advanced_iron', name: 'Ferro Avançado', type: ITEM_TYPE.MATERIAL,
        stackSize: 30, color: '#b0c0d0', iconBg: '#708090',
    },
    brass_fragment: {
        id: 'brass_fragment', name: 'Fragmento de Latão', type: ITEM_TYPE.MATERIAL,
        stackSize: 30, color: '#ccaa44', iconBg: '#aa8822',
    },
    lore_tablet: {
        id: 'lore_tablet', name: 'Tabuleta do Mundo Antigo', type: ITEM_TYPE.SPECIAL,
        stackSize: 5, color: '#8888cc', iconBg: '#5555aa',
        lore: 'Contém registros da civilização antes do Cataclismo de Silício.',
    },
    light_artifact: {
        id: 'light_artifact', name: 'Artefato de Luz', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, color: '#ffffff', iconBg: '#aaddff',
        lore: 'A essência purificada do Núcleo. Levá-lo à superfície pode salvar o mundo.',
    },
    crystal_fragment: {
        id: 'crystal_fragment', name: 'Fragmento de Cristal', type: ITEM_TYPE.SPECIAL,
        stackSize: 10, color: '#aa44ff', iconBg: '#7722cc',
    },

    // ---- CRAFTING MATERIALS ----
    wire: {
        id: 'wire', name: 'Fio Elétrico', type: ITEM_TYPE.MATERIAL,
        stackSize: 50, color: '#44cc44', iconBg: '#228822',
    },
    trap: {
        id: 'trap', name: 'Armadilha', type: ITEM_TYPE.SPECIAL,
        stackSize: 10, color: '#cc4444', iconBg: '#882222',
    },

    // ---- ARMADURAS (FASE 3) ----
    copper_helmet: { id: 'copper_helmet', name: 'Elmo de Cobre', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'head', defense: 2, color: '#c47030', iconBg: '#8a4a20' },
    copper_chest:  { id: 'copper_chest', name: 'Peitoral de Cobre', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'chest', defense: 3, color: '#c47030', iconBg: '#8a4a20' },
    copper_legs:   { id: 'copper_legs', name: 'Grevas de Cobre', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'legs', defense: 2, color: '#c47030', iconBg: '#8a4a20' },

    iron_helmet:   { id: 'iron_helmet', name: 'Elmo de Ferro', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'head', defense: 4, mineSpeedBonus: 0.1, color: '#a0a0a0', iconBg: '#606060' },
    iron_chest:    { id: 'iron_chest', name: 'Peitoral de Ferro', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'chest', defense: 5, color: '#a0a0a0', iconBg: '#606060' },
    iron_legs:     { id: 'iron_legs', name: 'Grevas de Ferro', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'legs', defense: 3, moveSpeedBonus: 0.05, color: '#a0a0a0', iconBg: '#606060' },

    gold_helmet:   { id: 'gold_helmet', name: 'Elmo de Ouro', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'head', defense: 6, mineSpeedBonus: 0.2, color: '#d4a800', iconBg: '#a08000' },
    gold_chest:    { id: 'gold_chest', name: 'Peitoral de Ouro', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'chest', defense: 8, maxHpBonus: 20, color: '#d4a800', iconBg: '#a08000' },
    gold_legs:     { id: 'gold_legs', name: 'Grevas de Ouro', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'legs', defense: 5, moveSpeedBonus: 0.1, color: '#d4a800', iconBg: '#a08000' },

    // ---- ACESSÓRIOS ----
    speed_boots:   { id: 'speed_boots', name: 'Botas de Vento', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'accessory', moveSpeedBonus: 0.15, color: '#88ccff', iconBg: '#4488aa' },
    miner_charm:   { id: 'miner_charm', name: 'Amuleto do Minerador', type: ITEM_TYPE.SPECIAL,
        stackSize: 1, slot: 'accessory', mineSpeedBonus: 0.25, color: '#ffcc44', iconBg: '#aa8822' },

    // ---- ESTAÇÃO DE ALQUIMIA ----
    alchemy_table: { id: 'alchemy_table', name: 'Mesa de Alquimia', type: ITEM_TYPE.BLOCK,
        stackSize: 10, blockId: 21, color: '#9955dd', iconBg: '#4a2080', stationKind: 'alchemy' },

    // ---- POÇÕES DE ALQUIMIA ----
    potion_speed:   { id: 'potion_speed',   name: 'Elixir Veloz',           type: ITEM_TYPE.CONSUMABLE,
        stackSize: 20, color: '#44ffcc', iconBg: '#228866', buffId: 'alchemy_swift' },
    potion_defense: { id: 'potion_defense', name: 'Elixir de Escudo',       type: ITEM_TYPE.CONSUMABLE,
        stackSize: 20, color: '#4488ff', iconBg: '#224488', buffId: 'alchemy_shield' },
    potion_mining:  { id: 'potion_mining',  name: 'Elixir do Minerador',    type: ITEM_TYPE.CONSUMABLE,
        stackSize: 20, color: '#aaff44', iconBg: '#558822', buffId: 'mine_haste' },
    potion_regen:   { id: 'potion_regen',   name: 'Elixir de Cura',         type: ITEM_TYPE.CONSUMABLE,
        stackSize: 20, color: '#ff88cc', iconBg: '#882244', buffId: 'alchemy_regen' },

    // ---- INGREDIENTES DE ALQUIMIA ----
    herb_green:  { id: 'herb_green',  name: 'Erva Verde',    type: ITEM_TYPE.MATERIAL, stackSize: 50, color: '#44dd44', iconBg: '#226622' },
    herb_blue:   { id: 'herb_blue',   name: 'Erva Azul',     type: ITEM_TYPE.MATERIAL, stackSize: 50, color: '#4488ff', iconBg: '#224488' },
    herb_red:    { id: 'herb_red',    name: 'Erva Vermelha', type: ITEM_TYPE.MATERIAL, stackSize: 50, color: '#ff4444', iconBg: '#882222' },
    mushroom:    { id: 'mushroom',    name: 'Cogumelo',      type: ITEM_TYPE.MATERIAL, stackSize: 50, color: '#ddbb88', iconBg: '#886644' },
    glowing_sap: { id: 'glowing_sap', name: 'Seiva Brilhante', type: ITEM_TYPE.MATERIAL, stackSize: 30, color: '#ffee44', iconBg: '#886600' },

    // ---- SELA DE MONTARIA ----
    slime_saddle: { id: 'slime_saddle', name: 'Sela de Slime',     type: ITEM_TYPE.SPECIAL,
        stackSize: 1, color: '#88dd88', iconBg: '#446644', mountType: 'slime' },
    batwing_mount: { id: 'batwing_mount', name: 'Asa de Morcego',  type: ITEM_TYPE.SPECIAL,
        stackSize: 1, color: '#9944bb', iconBg: '#551177', mountType: 'bat' },
    golem_saddle:  { id: 'golem_saddle',  name: 'Sela do Golem',   type: ITEM_TYPE.SPECIAL,
        stackSize: 1, color: '#cc8844', iconBg: '#886622', mountType: 'golem' },
};

// Map block IDs → item IDs for drops
const BLOCK_TO_ITEM = {
    [BLOCK.GRASS]:      'dirt',
    [BLOCK.DIRT]:       'dirt',
    [BLOCK.STONE]:      'stone',
    [BLOCK.SAND]:       'sand',
    [BLOCK.COAL_ORE]:   'coal_ore',
    [BLOCK.COPPER_ORE]: 'copper_ore',
    [BLOCK.IRON_ORE]:   'iron_ore',
    [BLOCK.GOLD_ORE]:   'gold_ore',
    [BLOCK.OBSIDIAN]:   'obsidian',
    [BLOCK.ASH]:        'ash',
    [BLOCK.HELLSTONE]:  'hellstone',
    [BLOCK.COBWEB]:     null, // destroyed, no drop
    [BLOCK.WOOD]:       'wood',
    [BLOCK.LEAVES]:     'leaves',
    [BLOCK.PLANK]:         'plank',
    [BLOCK.WORKBENCH]:     'workbench',
    [BLOCK.FURNACE]:       'furnace',
    [BLOCK.ANVIL]:         'anvil',
    [21]:                  'alchemy_table',
};

// Block hardness (base hits). Actual time = hardness / (pickaxe mineSpeed * 5)
const BLOCK_HARDNESS = {
    [BLOCK.GRASS]:      3,
    [BLOCK.DIRT]:       3,
    [BLOCK.STONE]:      8,
    [BLOCK.SAND]:       2,
    [BLOCK.COAL_ORE]:   10,
    [BLOCK.COPPER_ORE]: 8,
    [BLOCK.IRON_ORE]:   14,
    [BLOCK.GOLD_ORE]:   18,
    [BLOCK.OBSIDIAN]:   25,
    [BLOCK.ASH]:        5,
    [BLOCK.HELLSTONE]:  22,
    [BLOCK.COBWEB]:     1,
    [BLOCK.BEDROCK]:    Infinity,
    [BLOCK.TORCH]:      1,
    [BLOCK.WOOD]:       6,
    [BLOCK.LEAVES]:     1,
    [BLOCK.PLANK]:      4,
    [BLOCK.WORKBENCH]:  8,
    [BLOCK.FURNACE]:    10,
    [BLOCK.ANVIL]:      12,
    [21]:               10,
};

// Minimum pickaxe tier required to mine each block.
// Blocks not listed here can be mined by any pickaxe.
const BLOCK_MIN_TIER = {
    [BLOCK.IRON_ORE]:   PICK_TIER.COPPER,
    [BLOCK.GOLD_ORE]:   PICK_TIER.IRON,
    [BLOCK.OBSIDIAN]:   PICK_TIER.GOLD,
    [BLOCK.HELLSTONE]:  PICK_TIER.GOLD,
};

// Crafting recipes: itemId → { station, materials }
// station: null = mão, 'workbench', 'furnace', 'anvil'
const RECIPES = {
    // ---- Mão (sem estação) ----
    torch:          { station: null, materials: { coal_ore: 1, dirt: 1 } },
    plank:          { station: null, materials: { wood: 1 }, yield: 4 },
    workbench:      { station: null, materials: { plank: 10 } },

    // ---- Bancada de Trabalho ----
    axe:            { station: 'workbench', materials: { wood: 8, stone: 3 } },
    furnace:        { station: 'workbench', materials: { stone: 20, coal_ore: 5, plank: 4 } },
    copper_pickaxe: { station: 'workbench', materials: { copper_ore: 12, stone: 5 } },
    copper_sword:   { station: 'workbench', materials: { copper_ore: 10, stone: 3 } },
    copper_axe:     { station: 'workbench', materials: { copper_ore: 10, stone: 3 } },
    health_potion:  { station: 'workbench', materials: { crystal_fragment: 1, coal_ore: 3 } },
    old_battery:    { station: 'workbench', materials: { copper_ore: 10, coal_ore: 5, wire: 3 } },

    // ---- Fornalha ----
    iron_pickaxe:   { station: 'furnace', materials: { iron_ore: 15, copper_ore: 5 } },
    iron_sword:     { station: 'furnace', materials: { iron_ore: 12, copper_ore: 3 } },
    iron_axe:       { station: 'furnace', materials: { iron_ore: 10, copper_ore: 3 } },

    // ---- Bigorna ----
    anvil:          { station: 'furnace', materials: { iron_ore: 10, stone: 5 } },
    gold_pickaxe:   { station: 'anvil', materials: { gold_ore: 18, iron_ore: 8 } },
    gold_sword:     { station: 'anvil', materials: { gold_ore: 15, iron_ore: 5 } },
    mech_heart:     { station: 'anvil', materials: { iron_ore: 15, gold_ore: 10, advanced_iron: 3 } },
    deep_invoker:   { station: 'anvil', materials: { obsidian: 20, hellstone: 10, brass_fragment: 5, crystal_fragment: 3 } },

    // ---- Armaduras (Fase 3) ----
    copper_helmet:  { station: 'workbench', materials: { copper_ore: 10 } },
    copper_chest:   { station: 'workbench', materials: { copper_ore: 15 } },
    copper_legs:    { station: 'workbench', materials: { copper_ore: 12 } },
    iron_helmet:    { station: 'furnace', materials: { iron_ore: 12 } },
    iron_chest:     { station: 'furnace', materials: { iron_ore: 18 } },
    iron_legs:      { station: 'furnace', materials: { iron_ore: 15 } },
    gold_helmet:    { station: 'anvil', materials: { gold_ore: 15, iron_ore: 5 } },
    gold_chest:     { station: 'anvil', materials: { gold_ore: 22, iron_ore: 8 } },
    gold_legs:      { station: 'anvil', materials: { gold_ore: 18, iron_ore: 6 } },

    // ---- Mesa de Alquimia ----
    alchemy_table: { station: 'workbench', materials: { plank: 20, crystal_fragment: 3, coal_ore: 5 } },

    // ---- Poções (Mesa de Alquimia) ----
    potion_speed:   { station: 'alchemy', materials: { herb_green: 3, mushroom: 1 } },
    potion_defense: { station: 'alchemy', materials: { herb_blue: 3, stone: 5 } },
    potion_mining:  { station: 'alchemy', materials: { herb_red: 2, coal_ore: 3 } },
    potion_regen:   { station: 'alchemy', materials: { herb_green: 2, herb_red: 1, crystal_fragment: 1 } },

    // ---- Selas de Montaria (Bancada / Bigorna) ----
    slime_saddle:   { station: 'workbench', materials: { plank: 15, coal_ore: 5 } },
    batwing_mount:  { station: 'anvil',     materials: { iron_ore: 10, crystal_fragment: 2 } },
    golem_saddle:   { station: 'anvil',     materials: { gold_ore: 12, brass_fragment: 3, advanced_iron: 2 } },

    // ---- Ingredientes de Alquimia (bancada) ----
    herb_green:  { station: null, materials: { leaves: 3 } },
    mushroom:    { station: null, materials: { dirt: 4, coal_ore: 1 } },
};

function getItemDef(itemId) {
    return ITEMS[itemId] || null;
}

function canMineTier(tool, blockId) {
    const required = BLOCK_MIN_TIER[blockId];
    if (required === undefined) return true;
    const tier = tool ? (tool.pickTier || 0) : 0;
    return tier >= required;
}

// ---------------------------------------------------------------------------
// DROP TABLES — usadas pelo DropManager.spawnFromTable()
// Formato: array de { id, min, max, chance }
// chance = probabilidade de a entrada ser rolada (0..1).
// ---------------------------------------------------------------------------
const DROP_TABLES = {
    // ---- Inimigos da Superfície ----
    slime: [
        { id: 'coin', min: 1, max: 3, chance: 1.0 },
        { id: 'health_potion', min: 1, max: 1, chance: 0.04 },
    ],
    zombie: [
        { id: 'coin', min: 2, max: 5, chance: 1.0 },
        { id: 'health_potion', min: 1, max: 1, chance: 0.06 },
    ],

    // ---- Inimigos da Caverna ----
    bat: [
        { id: 'coin', min: 1, max: 2, chance: 1.0 },
        { id: 'crystal_fragment', min: 1, max: 1, chance: 0.30 },
    ],
    cyber_infiltrator: [
        { id: 'coin', min: 4, max: 7, chance: 1.0 },
        { id: 'wire', min: 1, max: 2, chance: 0.40 },
        { id: 'iron_ore', min: 1, max: 2, chance: 0.20 },
    ],
    crystal_spider: [
        { id: 'coin', min: 3, max: 5, chance: 1.0 },
        { id: 'crystal_fragment', min: 1, max: 2, chance: 0.50 },
    ],

    // ---- Inimigos do Submundo ----
    fire_demon: [
        { id: 'coin', min: 6, max: 10, chance: 1.0 },
        { id: 'hellstone', min: 1, max: 2, chance: 0.30 },
        { id: 'ash', min: 1, max: 3, chance: 0.50 },
    ],
    scrap_sentinel: [
        { id: 'coin', min: 10, max: 15, chance: 1.0 },
        { id: 'advanced_iron', min: 1, max: 2, chance: 0.30 },
        { id: 'iron_ore', min: 2, max: 4, chance: 0.50 },
    ],

    // ---- Bosses ----
    boss_probe: [
        { id: 'coin', min: 25, max: 35, chance: 1.0 },
        { id: 'advanced_iron', min: 10, max: 15, chance: 1.0 },
        { id: 'lore_tablet', min: 1, max: 2, chance: 1.0 },
    ],
    boss_golem: [
        { id: 'coin', min: 45, max: 60, chance: 1.0 },
        { id: 'brass_fragment', min: 15, max: 25, chance: 1.0 },
        { id: 'gold_ore', min: 20, max: 30, chance: 1.0 },
        { id: 'lore_tablet', min: 2, max: 3, chance: 1.0 },
    ],
    boss_eye: [
        { id: 'coin', min: 90, max: 120, chance: 1.0 },
        { id: 'light_artifact', min: 1, max: 1, chance: 1.0 },
    ],
};

/**
 * Returns the drop table for an enemy instance.
 *
 * Dispatch is done on `enemy.type` (the numeric ENEMY_TYPE constant set in each
 * constructor), NOT on `constructor.name`.  Using constructor.name is fragile
 * because JS minifiers rename classes, and because it creates an invisible
 * coupling between the class name string and this function.
 *
 * Boss types use the string keys ('probe' | 'golem' | 'eye') assigned in
 * entityManager.spawnBoss() alongside the numeric ENEMY_TYPE constant.
 *
 * To add a new enemy: assign `this.type = ENEMY_TYPE.YOUR_TYPE` in the
 * constructor, add a DROP_TABLES entry, and add a case here.
 *
 * @param {Enemy} enemy
 * @returns {Array|null}
 */
function getDropTable(enemy) {
    if (!enemy) return null;

    switch (enemy.type) {
        // ── Bosses (string type keys) ──────────────────────────────────────
        case 'probe': return DROP_TABLES.boss_probe;
        case 'golem': return DROP_TABLES.boss_golem;
        case 'eye':   return DROP_TABLES.boss_eye;

        // ── Common enemies (ENEMY_TYPE numeric constants) ──────────────────
        case ENEMY_TYPE.SLIME:            return DROP_TABLES.slime;
        case ENEMY_TYPE.ZOMBIE:           return DROP_TABLES.zombie;
        case ENEMY_TYPE.BAT:              return DROP_TABLES.bat;
        case ENEMY_TYPE.CYBER_INFILTRATOR:return DROP_TABLES.cyber_infiltrator;
        case ENEMY_TYPE.CRYSTAL_SPIDER:   return DROP_TABLES.crystal_spider;
        case ENEMY_TYPE.FIRE_DEMON:       return DROP_TABLES.fire_demon;
        case ENEMY_TYPE.SCRAP_SENTINEL:   return DROP_TABLES.scrap_sentinel;

        default: return null;
    }
}
