# TerraVoxel

Clone 2D de Terraria feito com HTML5 Canvas e JavaScript puro, sem dependências externas.

## Como rodar

1. Clone o repositório
2. Abra `index.html` diretamente no navegador (não precisa de servidor)

## Controles

| Tecla | Ação |
|-------|------|
| `A` / `D` | Mover esquerda / direita |
| `W` / `Espaço` | Pular |
| `Botão esquerdo` | Minerar / Atacar |
| `Botão direito` | Colocar bloco |
| `E` | Abrir inventário |
| `I` | Crafting |
| `Esc` | Menu |

## Estrutura do projeto

```
index.html          # Ponto de entrada
style.css           # Estilos globais
src/
  core/             # Engine, input, câmera, áudio, partículas
  world/            # Geração de mundo, chunks, iluminação, texturas
  entities/         # Player, inimigos, NPCs, itens no chão
  items/            # Registro de itens e equipamentos
  ui/               # HUD, inventário, crafting, menu, diálogos
  combat/           # Sistema de combate
```

## Tecnologias

- HTML5 Canvas 2D
- JavaScript ES6+
- Google Fonts (Press Start 2P, VT323, Cinzel)
