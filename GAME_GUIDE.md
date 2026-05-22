# TerraVoxel — Guia Completo do Jogador e Desenvolvedor

> **Nota para Desenvolvimento:** Este documento deve ser mantido sincronizado com
> `src/items/itemRegistry.js`. Sempre que um novo item, receita ou mecânica for
> adicionado, atualize as seções de progressão, conquistas e guia abaixo.

---

## Índice

1. [Controles](#controles)
2. [Manual de Sobrevivência — Como Zerar](#manual-de-sobrevivência)
3. [Sistema de Ferramentas](#sistema-de-ferramentas)
4. [Sistema de Crafting (Bancadas)](#sistema-de-crafting)
5. [Árvore de Progressão](#árvore-de-progressão)
6. [Inimigos por Bioma](#inimigos-por-bioma)
7. [Bosses e Chefes](#bosses-e-chefes)
8. [Conquistas](#guia-de-conquistas)
9. [Referência para Desenvolvimento](#referência-para-desenvolvimento)

---

## Controles

| Tecla / Botão | Ação |
|---|---|
| `A` / `D` | Mover esquerda / direita |
| `W` / `Espaço` | Pular |
| `1–0` | Selecionar slot da hotbar |
| Scroll do mouse | Navegar na hotbar |
| **Botão esquerdo** | Minerar / Atacar |
| **Botão direito** | Colocar bloco / Usar item especial |
| `E` | Abrir / fechar inventário |
| `R` (inv. aberto) | Equipar item selecionado |
| `C` / `Enter` | Fabricar item selecionado |
| `T` | Abrir / fechar mesa de alquimia |
| `G` | Montar / desmontar montaria |
| `H` | Usar poção de vida (ou poção selecionada) |
| `P` | Alternar QA Bot |

---

## Manual de Sobrevivência

### Fase 1 — Coleta Inicial (Superfície)

1. **Corte madeira primeiro.**  Equipe o Machado Inicial e clique em troncos de madeira.
   Você vai ouvir o som de corte e ver o ícone da madeira voar em sua direção automaticamente.
   > ⚠ Picaretas **não** cortam madeira de forma eficiente — use sempre o machado!

2. **Construa sua Bancada de Trabalho.**  
   Abra o inventário (`E`) e pressione `C` com a tab **✋ Mão** ativa.  
   Receita: 4 Tábuas (craft de Madeira → Tábua × 4).  
   Coloque a bancada próxima a você com o botão direito.

3. **Forje a primeira picareta de cobre.**  
   Na tab **🪵 Bancada**, selecione *Picareta de Cobre* e pressione `C`.  
   Agora você pode quebrar as rochas da entrada das cavernas.

### Fase 2 — Exploração Subterrânea (Cavernas)

4. **Minere ferro e ouro.**  Com a picareta de cobre você acessa ferro; com a de ferro, ouro.
   Construa a **Fornalha** (`🪵 Bancada → Fornalha`) para fundir minérios.

5. **Forge a picareta e espada de ouro.**  
   Com a Bigorna (`🔥 Fornalha → Bigorna`) você desbloqueia equipamentos de topo de fase 2.

6. **Construa armaduras.** Cobre → Ferro → Ouro; cada set dá bônus crescentes de defesa e velocidade.

7. **Derrote o Sentinela Sonda** (summon: Bateria Velha, criada na Bancada).  
   Drops: *Ferro Avançado* — material chave para a fase seguinte.

### Fase 3 — O Submundo

8. **Use o GolemRider para acessar o Submundo.**  
   A montaria Golem é obtida após derrotar o Golem de Latão.  
   Sem ela você não consegue minerar as paredes de obsidiana do fundo do mundo.

9. **Colete Pedra Infernal** com a picareta de ouro (necessário).  
   Use-a na **⚒ Bigorna** para criar o *Invocador Profundo*.

10. **Derrote o BossEye — o Boss Final.**  
    Invoque-o com o Invocador Profundo nas profundezas do Submundo.  
    Ao vencer, você receberá o **Artefato de Luz** → leve-o à superfície para vencer o jogo!

---

## Sistema de Ferramentas

### Especialização Obrigatória

| Ferramenta | Eficiente em | Bloqueado em |
|---|---|---|
| **Machado** | Madeira, Folhas, Tábuas (+50% vel.) | Minérios, Pedra (não funciona) |
| **Picareta** | Pedra, Minérios, Blocos (-) | Madeira (15% vel. — emergencial) |

> 🔴 **Cursor vermelho com X** = ferramenta errada para o bloco. Troque na hotbar!

### Tiers de Picareta

| Picareta | Tier | Desbloqueia |
|---|---|---|
| Picareta Inicial | 0 | Pedra, Areia, Carvão, Cobre |
| Picareta de Cobre | 1 | Ferro |
| Picareta de Ferro | 2 | Ouro |
| Picareta de Ouro | 3 | Obsidiana, Pedra Infernal |

---

## Sistema de Crafting

### Como usar

1. Equipe materiais no inventário (eles chegam automaticamente ao minerar/matar).
2. **Aproxime-se** da estação necessária (distância: ~3 blocos).
3. Abra o inventário (`E`) → painel de Fabricação aparece à esquerda.
4. Clique na **tab** da estação desejada.
5. Selecione a receita (setas ou clique) → botão **⚒ Fabricar [C]** fica verde.
6. Pressione `C` ou clique no botão.

### Estações e Desbloqueios

| Estação | Construção | Receitas principais |
|---|---|---|
| ✋ Mão | — | Tábua, Tocha, Bancada |
| 🪵 Bancada | 10 Tábuas | Machados, Fornalha, Cobre/Picaretas, Armaduras de Cobre |
| 🔥 Fornalha | 20 Pedras + 5 Carvão + 4 Tábuas (Bancada) | Ferro/Espadas, Bigorna |
| ⚒ Bigorna | 10 Ferro + 5 Pedra (Fornalha) | Ouro, Armaduras avançadas, Bosses |

---

## Árvore de Progressão

```
Madeira (Machado)
    └── Bancada
            ├── Picareta de Cobre → Cobre
            │       └── Fornalha
            │               ├── Picareta de Ferro → Ferro / Ouro
            │               └── Bigorna
            │                       ├── Picareta de Ouro → Obsidiana
            │                       ├── Espada de Ouro
            │                       ├── Armadura de Ouro
            │                       └── Itens de Summon
            └── Armaduras de Cobre / Ferro
                    └── Invocação de Bosses
                            ├── Boss Sonda → Ferro Avançado → Coração Mecânico
                            ├── Boss Golem → Latão → Bigorna Advanced
                            └── BossEye (Submundo) → Artefato de Luz → VITÓRIA
```

---

## Inimigos por Bioma

### Superfície (Dia)
| Inimigo | HP | Dano | Drops |
|---|---|---|---|
| Slime | 40 | 6 | 1–3 Moedas, (raro) Poção |

### Superfície (Noite)
| Inimigo | HP | Dano | Drops |
|---|---|---|---|
| Zumbi | 60 | 9 | 2–5 Moedas, (raro) Poção |

### Cavernas
| Inimigo | HP | Dano | Drops |
|---|---|---|---|
| Morcego | 30 | 7 | 1–2 Moedas, (30%) Fragmento de Cristal |
| Infiltrador Cyber | 80 | 14 | 4–7 Moedas, (40%) Fio, (20%) Ferro |
| Aranha Cristal | 55 | 12 | 3–5 Moedas, (50%) Cristal ×1–2 |

### Submundo
| Inimigo | HP | Dano | Drops |
|---|---|---|---|
| Demônio de Fogo | 100 | 18 | 6–10 Moedas, (30%) Pedra Infernal |
| Sentinela Sucata | 140 | 22 | 10–15 Moedas, (30%) Ferro Avançado |

> **Controle Populacional:** O jogo limita inimigos por bioma (Superfície: 8,
> Cavernas: 12, Submundo: 10) e aumenta o intervalo de spawn dinamicamente
> para evitar sobrecarga. Bosses não contam para o limite.

---

## Bosses e Chefes

### 🤖 Sentinela Sonda (`boss_probe`)
- **Summon:** Bateria Velha (Bancada) → clique direito na superfície
- **HP:** 800 | **Fase 2:** < 400HP → aumenta velocidade e dispara lasers
- **Drops:** 25–35 Moedas, 10–15 Ferro Avançado, 1–2 Tabuletas de Lore
- **Recomendado:** Espada de Ferro + Armadura de Cobre completa

### ⚙ Golem de Latão (`boss_golem`)
- **Summon:** Coração Mecânico (Bigorna) → clique direito nas cavernas
- **HP:** 1800 | **Fase 2:** < 900HP → cospe projeteis de latão
- **Drops:** 45–60 Moedas, 15–25 Latão, 20–30 Ouro, 2–3 Tabuletas
- **Recomendado:** Espada de Ouro + Armadura de Ferro completa

### 👁 BossEye — O Guardião (`boss_eye`)
- **Summon:** Invocador Profundo (Bigorna) → clique direito no Submundo
- **HP:** 3500 | **Fase 2:** < 1000HP → teleporte + projéteis em cone
- **Drops:** 90–120 Moedas, **Artefato de Luz** (garante vitória!)
- **Recomendado:** Espada de Plasma + Armadura de Ouro completa + Montaria Golem

---

## Guia de Conquistas

| Conquista | Condição | Dica |
|---|---|---|
| **🌍 Explorador** | Alcance Y ≥ 80% da profundidade máxima com o GolemRider | Equipe o GolemRider e desça até o Submundo |
| **⚗ Alquimista** | Descubra todas as 4 receitas de poções sem causar explosão | Siga as receitas à risca na mesa de Alquimia; erros causam explosão |
| **🔨 Mestre Ferreiro** | Possua picareta, espada e armadura completa de nível 3 (Ouro) | Craftar tudo na Bigorna |
| **💀 Dominador** | Derrote o BossEye sem montar nenhuma montaria na luta | Use apenas Espada de Plasma e poções de combate |
| **🌟 Salvador** | Leve o Artefato de Luz à superfície | Derrote o BossEye e suba com o artefato — créditos do jogo |

---

## Referência para Desenvolvimento

### Adicionando novos itens

1. **`src/items/itemRegistry.js`** — adicione a definição em `ITEMS`:
   ```js
   novo_item: {
       id: 'novo_item', name: 'Nome', type: ITEM_TYPE.MATERIAL,
       stackSize: 30, color: '#rrggbb', iconBg: '#rrggbb',
   }
   ```

2. **Ícone pixel-art** — adicione um `case 'novo_item':` em
   `src/ui/inventory.js` → método `_drawItemIcon`.

3. **Se for bloco** — mapeie em `BLOCK_TO_ITEM` e `BLOCK_HARDNESS`.

4. **Se tiver receita** — adicione em `RECIPES`.

5. **Se for drop de inimigo** — adicione em `DROP_TABLES`.

6. **Atualize este documento** — seções de Progressão, Crafting e Conquistas.

### Adicionando novos inimigos

1. Crie a classe em `src/entities/enemies.js`.
2. Registre a drop table em `DROP_TABLES` (itemRegistry.js).
3. Conecte em `getDropTable()` e em `EntityManager._trySpawn()`.
4. Atinja o bioma correto via `enemy._biome = 'surface'|'cavern'|'underworld'`.
5. Atualize a tabela de Inimigos neste guia.

### Controle Populacional (Referência)

| Parâmetro | Valor | Descrição |
|---|---|---|
| `MAX_ENEMIES` | 30 | Cap absoluto global (non-boss) |
| `MAX_SURFACE` | 8 | Cap por bioma — superfície |
| `MAX_CAVERN` | 12 | Cap por bioma — cavernas |
| `MAX_UNDERWORLD` | 10 | Cap por bioma — submundo |
| `SPAWN_INTERVAL_BASE` | 2.5s | Intervalo mínimo de spawn |
| `SPAWN_INTERVAL_MAX` | 12s | Intervalo quando próximo ao cap |

### Sistema de Especialização de Ferramentas

```
ORGANIC_BLOCKS = { WOOD, LEAVES, PLANK }

Machado  + bloco_mineral  → BLOQUEADO (cursor vermelho ✗)
Machado  + bloco_orgânico → × 1.5 velocidade
Picareta + bloco_orgânico → × 0.15 velocidade (desincentivo)
Picareta + bloco_mineral  → × 1.0 (+ tier check)
```
