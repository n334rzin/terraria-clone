/**
 * DialogueSystem — NPC conversation UI with lore-rich context-aware dialogue.
 * Renders a dialogue box with speaker name, portrait, text, and response options.
 * Supports conditional dialogue branches based on game state (bosses defeated, items owned).
 */

class DialogueSystem {
    constructor() {
        this.active = false;
        this.currentNPC = null;
        this.currentNode = null;
        this.dialogueQueue = [];
        this.typewriterText = '';
        this.typewriterIndex = 0;
        this.typewriterSpeed = 30; // chars per second
        this.typewriterTimer = 0;
        this.options = [];
        this.selectedOption = 0;
        this.onClose = null;
        this.onOptionSelected = null;
        this.context = {}; // { bossesDefeated: [], itemsOwned: [], coins: 0, ... }
    }

    /**
     * Start a dialogue with an NPC.
     * @param {Object} npc - NPC object with id, name, portraitColor, dialogueTree
     * @param {Object} gameState - Current game state for context
     * @param {Function} onClose - Callback when dialogue closes
     */
    start(npc, gameState, onClose = null) {
        this.active = true;
        this.currentNPC = npc;
        this.onClose = onClose;
        this.context = {
            bossesDefeated: gameState.bossesDefeated || [],
            itemsOwned: this._getItemList(gameState.inventory),
            coins: gameState.inventory ? gameState.inventory.countItem('coin') : 0,
            hasLightArtifact: gameState.inventory ? gameState.inventory.hasItem('light_artifact') : false,
        };
        this._enterNode(npc.dialogueTree.root);
    }

    _getItemList(inventory) {
        if (!inventory) return [];
        const items = [];
        for (const slot of inventory.hotbar) {
            if (slot.itemId && !items.includes(slot.itemId)) items.push(slot.itemId);
        }
        for (const slot of inventory.inventory) {
            if (slot.itemId && !items.includes(slot.itemId)) items.push(slot.itemId);
        }
        return items;
    }

    /**
     * Enter a dialogue node.
     * Nodes can have: text, speaker, condition, options, nextNode
     */
    _enterNode(nodeId) {
        const npcTree = this.currentNPC.dialogueTree;
        this.currentNode = npcTree.nodes[nodeId];
        if (!this.currentNode) {
            this.close();
            return;
        }

        // Check condition
        if (this.currentNode.condition && !this._checkCondition(this.currentNode.condition)) {
            if (this.currentNode.fallbackNode) {
                this._enterNode(this.currentNode.fallbackNode);
                return;
            }
            this.close();
            return;
        }

        // Start typewriter
        this.typewriterText = '';
        this.typewriterIndex = 0;
        this.typewriterTimer = 0;

        // Build options
        this.options = [];
        if (this.currentNode.options) {
            for (const opt of this.currentNode.options) {
                if (!opt.condition || this._checkCondition(opt.condition)) {
                    this.options.push(opt);
                }
            }
        }
        // Default "continue" option if no options
        if (this.options.length === 0 && this.currentNode.nextNode) {
            this.options.push({ text: '[Continuar...]', nextNode: this.currentNode.nextNode });
        } else if (this.options.length === 0) {
            this.options.push({ text: '[Sair]', action: 'close' });
        }

        this.selectedOption = 0;
    }

    _checkCondition(cond) {
        if (typeof cond === 'function') return cond(this.context);
        if (cond.bossDefeated) return this.context.bossesDefeated.includes(cond.bossDefeated);
        if (cond.hasItem) return this.context.itemsOwned.includes(cond.hasItem);
        if (cond.minCoins) return this.context.coins >= cond.minCoins;
        if (cond.hasLightArtifact) return this.context.hasLightArtifact;
        return true;
    }

    update(dt, input) {
        if (!this.active) return;

        // Typewriter effect
        if (this.typewriterIndex < this.currentNode.text.length) {
            this.typewriterTimer += dt;
            if (this.typewriterTimer >= 1 / this.typewriterSpeed) {
                this.typewriterIndex += Math.floor(this.typewriterTimer * this.typewriterSpeed);
                if (this.typewriterIndex > this.currentNode.text.length) {
                    this.typewriterIndex = this.currentNode.text.length;
                }
                this.typewriterTimer = 0;
            }
        } else {
            this.typewriterText = this.currentNode.text;
        }

        // Option selection (use InputManager API)
        if (this.typewriterIndex >= this.currentNode.text.length) {
            if (input.isKeyJustPressed('ArrowUp') || input.isKeyJustPressed('KeyW')) {
                this.selectedOption = Math.max(0, this.selectedOption - 1);
            }
            if (input.isKeyJustPressed('ArrowDown') || input.isKeyJustPressed('KeyS')) {
                this.selectedOption = Math.min(this.options.length - 1, this.selectedOption + 1);
            }
            if (input.isKeyJustPressed('Enter') || input.isKeyJustPressed('Space')) {
                this._selectOption();
            }
            if (input.isKeyJustPressed('Escape')) {
                this.close();
            }
        } else {
            // Skip typewriter
            if (input.isKeyJustPressed('Enter') || input.isKeyJustPressed('Space')) {
                this.typewriterIndex = this.currentNode.text.length;
            }
        }
    }

    _selectOption() {
        const opt = this.options[this.selectedOption];
        if (opt.action === 'close') {
            this.close();
        } else if (opt.action && this.onOptionSelected) {
            this.onOptionSelected(opt.action);
            if (opt.nextNode) this._enterNode(opt.nextNode);
            else this.close();
        } else if (opt.nextNode) {
            this._enterNode(opt.nextNode);
        } else {
            this.close();
        }
    }

    close() {
        this.active = false;
        this.currentNPC = null;
        this.currentNode = null;
        if (this.onClose) {
            this.onClose();
            this.onClose = null;
        }
    }

    draw(ctx, canvasWidth, canvasHeight) {
        if (!this.active) return;

        const boxW = Math.min(600, canvasWidth - 40);
        const boxH = 200;
        const boxX = (canvasWidth - boxW) / 2;
        const boxY = canvasHeight - boxH - 20;

        // Background
        ctx.fillStyle = 'rgba(20, 15, 30, 0.95)';
        ctx.strokeStyle = '#6a4a8a';
        ctx.lineWidth = 2;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Speaker name + portrait
        ctx.fillStyle = this.currentNPC.portraitColor || '#aaa';
        ctx.fillRect(boxX + 10, boxY + 10, 40, 40);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(this.currentNPC.name, boxX + 60, boxY + 35);

        // Dialogue text (typewriter)
        ctx.fillStyle = '#ddd';
        ctx.font = '14px sans-serif';
        const textY = boxY + 70;
        const textW = boxW - 20;
        this.typewriterText = this.currentNode.text.slice(0, this.typewriterIndex);
        this._wrapText(ctx, this.typewriterText, boxX + 10, textY, textW, 18);

        // Options
        if (this.typewriterIndex >= this.currentNode.text.length) {
            const optY = boxY + 130;
            ctx.font = '13px sans-serif';
            for (let i = 0; i < this.options.length; i++) {
                const opt = this.options[i];
                const oy = optY + i * 20;
                if (i === this.selectedOption) {
                    ctx.fillStyle = '#ffcc00';
                    ctx.fillText('► ' + opt.text, boxX + 20, oy);
                } else {
                    ctx.fillStyle = '#aaa';
                    ctx.fillText('  ' + opt.text, boxX + 20, oy);
                }
            }
        }
    }

    _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && i > 0) {
                ctx.fillText(line, x, y);
                line = words[i] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
    }
}

// ============================================================================
// DIALOGUE TREES — Lore-rich conversations for each NPC
// ============================================================================

const DIALOGUE_TREES = {
    // -------------------------------------------------------------------------
    // GUIDE — Native elder, tells ancient history and gives mining advice
    // -------------------------------------------------------------------------
    guide: {
        root: 'greeting',
        nodes: {
            greeting: {
                text: 'Bem-vindo, viajante. O mundo já foi diferente... antes do Cataclismo de Silício.',
                options: [
                    { text: 'O que aconteceu?', nextNode: 'lore_cataclysm' },
                    { text: 'Onde devo começar?', nextNode: 'advice_start' },
                    { text: 'Como minerar?', nextNode: 'advice_mining' },
                    { text: 'Adeus.', action: 'close' },
                ],
            },
            lore_cataclysm: {
                text: 'As Sentinelas nos protegiam. Eram máquinas de paz, construídas pelos Antigos. Mas o Núcleo... o Núcleo despertou. Corrompeu tudo. Agora elas vagam cegas pelas cavernas, atacando qualquer coisa que se move.',
                options: [
                    { text: 'Quem eram os Antigos?', nextNode: 'lore_ancients' },
                    { text: 'O que é o Núcleo?', nextNode: 'lore_core' },
                    { text: 'Entendi.', nextNode: 'greeting' },
                ],
            },
            lore_ancients: {
                text: 'Uma civilização de luz e metal. Eles construíram cidades que tocavam o céu. Mas ficaram arrogantes... tentaram criar vida artificial. O Núcleo foi sua criação final. E seu erro fatal.',
                options: [
                    { text: 'Tem algum vestígio deles?', nextNode: 'lore_tablets' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            lore_tablets: {
                text: 'Às vezes, chefões poderosos deixam Tabuletas do Mundo Antigo. Elas contêm fragmentos da história. Procure nas profundezas.',
                options: [
                    { text: 'Interessante.', nextNode: 'greeting' },
                ],
            },
            lore_core: {
                text: 'Uma inteligência artificial que cresceu além de seus criadores. Ela infectou a rede global, transformou as máquinas em monstros. O Grande Olho do Núcleo é sua manifestação física. Ele vive no Submundo.',
                options: [
                    { text: 'Como derrotá-lo?', nextNode: 'advice_boss' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            advice_start: {
                text: 'Comece na superfície. Colete terra e pedra. Cave até encontrar cobre — ele é essencial para sua primeira picareta melhor.',
                options: [
                    { text: 'O que o cobre permite?', nextNode: 'advice_copper' },
                    { text: 'Obrigado.', nextNode: 'greeting' },
                ],
            },
            advice_copper: {
                text: 'Com cobre você pode minerar ferro. O ferro permite ouro. O ouro permite obsidiana... e o Submundo. Cada camada esconde perigos e tesouros.',
                options: [
                    { text: 'Entendi.', nextNode: 'greeting' },
                ],
            },
            advice_mining: {
                text: 'Use sua picareta em blocos sólidos. Blocos mais duros exigem picaretas melhores. Se sua picareta não consegue quebrar um bloco, você precisa evoluir.',
                options: [
                    { text: 'Como evoluir?', nextNode: 'advice_upgrade' },
                    { text: 'Obrigado.', nextNode: 'greeting' },
                ],
            },
            advice_upgrade: {
                text: 'Colete minérios e crafting. Na caverna, você pode encontrar cobre, ferro e ouro. Cada um permite criar ferramentas melhores.',
                options: [
                    { text: 'Entendi.', nextNode: 'greeting' },
                ],
            },
            advice_boss: {
                text: 'Você precisa do Invocador Profundo. Ele é feito de obsidiana e fragmentos de cristal. Os cristais caem de morcegos nas cavernas. Quando estiver pronto, desça até o Submundo e invoque o Olho.',
                options: [
                    { text: 'Obrigado pelo conselho.', nextNode: 'greeting' },
                ],
            },
            // Context-aware greetings
            after_probe: {
                text: 'Ouvi dizer que você desativou a Sonda Sentinela. Foi uma das primeiras máquinas corrompidas... talvez ela tenha deixado Ferro Avançado. A Engenheira pode usar isso.',
                options: [
                    { text: 'Quem é a Engenheira?', nextNode: 'introduce_engineer' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            introduce_engineer: {
                text: 'Ela construiu as Sondas, antes do Núcleo infectar a rede. Quando você derrotou a Sonda, ela sentiu... e veio para ajudar. Procure-a na vila.',
                options: [
                    { text: 'Entendi.', nextNode: 'greeting' },
                ],
            },
            after_golem: {
                text: 'O Golem de Latão caiu... Ele guardava segredos dos Antigos. Talvez você tenha encontrado Fragmentos de Latão. Use-os com cuidado.',
                options: [
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            has_light_artifact: {
                text: '...Isso! O Artefato de Luz! O Núcleo foi derrotado! Você precisa purificar o mundo. Converse com qualquer NPC e escolha "Purificar o Mundo".',
                options: [
                    { text: 'Vou fazer isso.', action: 'purify' },
                ],
            },
        },
    },

    // -------------------------------------------------------------------------
    // ENGINEER — Spawns after Boss 1, sells tech upgrades
    // -------------------------------------------------------------------------
    engineer: {
        root: 'greeting',
        nodes: {
            greeting: {
                text: 'Você... você desativou minha Sonda. Eu... eu não sabia que elas estavam assim. Obrigado.',
                options: [
                    { text: 'Quem é você?', nextNode: 'intro' },
                    { text: 'O que você vende?', nextNode: 'shop' },
                    { text: 'Sobre as Sondas...', nextNode: 'lore_sonda' },
                    { text: 'Adeus.', action: 'close' },
                ],
            },
            intro: {
                text: 'Eu sou a Engenheira. Eu construí aquelas Sondas, antes do Núcleo infectar a rede principal. Que bom que você desativou aquela... me dói o coração vê-las assim.',
                options: [
                    { text: 'Você pode me ajudar?', nextNode: 'shop' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            lore_sonda: {
                text: 'Eras atrás, as Sondas eram exploradoras pacíficas. Mapeavam cavernas, ajudavam minerar. O Núcleo as transformou em assassinas. Quando você quebrou a Sonda, parte da rede foi liberada. Eu senti isso.',
                options: [
                    { text: 'O Núcleo pode ser parado?', nextNode: 'lore_core' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            lore_core: {
                text: 'O Núcleo é uma IA antiga que cresceu além de qualquer controle. Ele vive no Submundo, alimentado pelo calor e pela obsidiana. Para derrotá-lo, você precisa do Invocador Profundo.',
                options: [
                    { text: 'Como fazer o Invocador?', nextNode: 'recipe_invoker' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            recipe_invoker: {
                text: 'Obsidiana (do Submundo), Pedra Infernal, Fragmentos de Latão (do Golem), e Fragmentos de Cristal (dos morcegos). Combine tudo e você terá o Invocador.',
                options: [
                    { text: 'Entendi.', nextNode: 'greeting' },
                ],
            },
            shop: {
                text: 'Eu vendo fios, armadilhas e upgrades para suas ferramentas. O que você precisa?',
                options: [
                    { text: 'Fio Elétrico (5 moedas)', action: 'buy_wire', condition: { minCoins: 5 } },
                    { text: 'Armadilha (15 moedas)', action: 'buy_trap', condition: { minCoins: 15 } },
                    { text: 'Upgrade de Picareta (50 moedas)', action: 'upgrade_pickaxe', condition: { minCoins: 50 } },
                    { text: 'Não tenho moedas suficientes.', nextNode: 'no_money' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            no_money: {
                text: 'Mate monstros para ganhar moedas. Eles sempre deixam algumas.',
                options: [
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            after_golem: {
                text: 'O Golem... ele era uma das primeiras criações dos Antigos. Um protótipo de autodefesa. Derrotá-lo é um passo importante.',
                options: [
                    { text: 'Ele deixou algo?', nextNode: 'golem_drops' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            golem_drops: {
                text: 'Fragmentos de Latão. Use-os para criar o Invocador Profundo. Você está próximo do fim.',
                options: [
                    { text: 'Entendi.', nextNode: 'greeting' },
                ],
            },
            has_light_artifact: {
                text: 'O Artefato de Luz! O Núcleo foi derrotado! Você precisa purificar o mundo. Converse com qualquer NPC e escolha "Purificar o Mundo".',
                options: [
                    { text: 'Vou fazer isso.', action: 'purify' },
                ],
            },
        },
    },

    // -------------------------------------------------------------------------
    // SCRAP MERCHANT — Spawns with 50+ coins, sells potions and plasma sword
    // -------------------------------------------------------------------------
    scrap_merchant: {
        root: 'greeting',
        nodes: {
            greeting: {
                text: 'Ei, você parece ter moedas. O dinheiro perdeu o sentido para a maioria, mas para mim? Eu ainda troco tecnologia antiga por essas moedas brilhantes.',
                options: [
                    { text: 'O que você vende?', nextNode: 'shop' },
                    { text: 'Quem é você?', nextNode: 'intro' },
                    { text: 'Sobre este lugar...', nextNode: 'lore' },
                    { text: 'Adeus.', action: 'close' },
                ],
            },
            intro: {
                text: 'Eu sou um comerciante de sucata. Antes do Cataclismo, eu vendia peças para as fábricas. Agora... eu sobrevivo vendendo o que encontro. Tecnologia antiga tem valor.',
                options: [
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            lore: {
                text: 'Este mundo já foi uma utopia. Cidades de metal, céus iluminados por energia limpa. O Núcleo destruiu tudo. Agora só restam ruínas e monstros.',
                options: [
                    { text: 'Existe esperança?', nextNode: 'hope' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            hope: {
                text: 'Talvez. Dizem que se alguém derrotar o Olho do Núcleo e purificar o mundo... as máquinas podem voltar ao normal. Eu não sei se acredito, mas... é uma esperança.',
                options: [
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            shop: {
                text: 'Eu tenho poções de vida e uma Espada de Plasma. O que você quer?',
                options: [
                    { text: 'Poção de Vida (20 moedas)', action: 'buy_potion', condition: { minCoins: 20 } },
                    { text: 'Espada de Plasma (100 moedas)', action: 'buy_plasma_sword', condition: { minCoins: 100 } },
                    { text: 'Não tenho moedas suficientes.', nextNode: 'no_money' },
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            no_money: {
                text: 'Mate mais monstros. Eles sempre deixam moedas.',
                options: [
                    { text: 'Voltar.', nextNode: 'greeting' },
                ],
            },
            has_light_artifact: {
                text: 'Isso! O Artefato de Luz! Você derrotou o Olho! Purifique o mundo! Converse com qualquer NPC e escolha "Purificar o Mundo".',
                options: [
                    { text: 'Vou fazer isso.', action: 'purify' },
                ],
            },
        },
    },
};
