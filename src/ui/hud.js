/**
 * HUD — Heads-up display for HP bar, boss bar, messages, death/victory screens.
 */

class HUD {
    constructor() {
        this.messages = [];       // { text, timer, color }
        this.screenShake = 0;     // shake timer in seconds
        this.deathScreen = false;
        this.victoryScreen = false;
        this.victoryStats = null;
        this.bossHP = 0;
        this.bossMaxHP = 0;
        this.bossName = '';
        this.showBossBar = false;
    }

    /**
     * Show a temporary message on screen.
     */
    showMessage(text, duration = 4, color = '#ffffff') {
        this.messages.push({ text, timer: duration, color });
    }

    /**
     * Trigger screen shake.
     */
    shake(duration = 0.15) {
        this.screenShake = duration;
    }

    /**
     * Show boss health bar.
     */
    setBoss(name, hp, maxHp) {
        this.bossName = name;
        this.bossHP = hp;
        this.bossMaxHP = maxHp;
        this.showBossBar = hp > 0;
    }

    /**
     * Update message timers and shake.
     */
    update(dt) {
        this.screenShake = Math.max(0, this.screenShake - dt);

        for (let i = this.messages.length - 1; i >= 0; i--) {
            this.messages[i].timer -= dt;
            if (this.messages[i].timer <= 0) {
                this.messages.splice(i, 1);
            }
        }
    }

    /**
     * Get camera offset for screen shake effect.
     */
    getShakeOffset() {
        if (this.screenShake <= 0) return { sx: 0, sy: 0 };
        const intensity = 5;
        return {
            sx: (Math.random() - 0.5) * intensity * 2,
            sy: (Math.random() - 0.5) * intensity * 2
        };
    }

    /**
     * Draw all HUD elements.
     */
    draw(ctx, canvasW, canvasH, player) {
        // HP Bar
        this._drawHPBar(ctx, canvasW, player);

        // Boss bar
        if (this.showBossBar) {
            this._drawBossBar(ctx, canvasW);
        }

        // Messages
        this._drawMessages(ctx, canvasW, canvasH);

        // Death screen
        if (this.deathScreen) {
            this._drawDeathScreen(ctx, canvasW, canvasH);
        }

        // Victory screen
        if (this.victoryScreen) {
            this._drawVictoryScreen(ctx, canvasW, canvasH);
        }
    }

    _drawHPBar(ctx, canvasW, player) {
        const barW = 260;
        const barH = 22;
        const x = 18;
        const y = 18;
        const hpRatio = Math.max(0, player.hp / player.maxHp);

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 10;

        ctx.fillStyle = 'rgba(7, 10, 22, 0.82)';
        ctx.fillRect(x - 8, y - 8, barW + 16, barH + 36);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 8, y - 8, barW + 16, barH + 36);

        ctx.fillStyle = '#ff3b5c';
        ctx.font = '20px VT323, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('♥ VIDA', x, y - 2);

        const grd = ctx.createLinearGradient(x, y, x + barW, y);
        grd.addColorStop(0, hpRatio > 0.25 ? '#2ee66b' : '#ff3b5c');
        grd.addColorStop(0.55, hpRatio > 0.5 ? '#9cff57' : '#ffb84d');
        grd.addColorStop(1, '#ffdf6b');

        ctx.fillStyle = 'rgba(30, 8, 18, 0.95)';
        ctx.fillRect(x, y + 6, barW, barH);
        ctx.fillStyle = grd;
        ctx.fillRect(x, y + 6, Math.max(2, barW * hpRatio), barH);

        ctx.strokeStyle = '#ffd26a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y + 6, barW, barH);

        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x + 2, y + 8, Math.max(0, barW * hpRatio - 4), 5);

        ctx.fillStyle = '#ffffff';
        ctx.font = '20px VT323, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, x + barW * 0.5, y + 24);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    _drawBossBar(ctx, canvasW) {
        const barW = Math.min(620, canvasW - 80);
        const barH = 28;
        const x = (canvasW - barW) * 0.5;
        const y = 76;

        ctx.save();
        ctx.shadowColor = 'rgba(255,40,80,0.55)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = 'rgba(12, 4, 12, 0.88)';
        ctx.fillRect(x - 12, y - 28, barW + 24, barH + 42);
        ctx.strokeStyle = 'rgba(255,80,120,0.45)';
        ctx.strokeRect(x - 12, y - 28, barW + 24, barH + 42);

        ctx.fillStyle = '#ff5a78';
        ctx.font = '22px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.bossName, canvasW * 0.5, y - 8);

        ctx.fillStyle = '#26040a';
        ctx.fillRect(x, y, barW, barH);
        const ratio = Math.max(0, this.bossHP / this.bossMaxHP);
        const grd = ctx.createLinearGradient(x, y, x + barW, y);
        grd.addColorStop(0, '#ff315c');
        grd.addColorStop(0.55, '#b60f35');
        grd.addColorStop(1, '#5a061c');
        ctx.fillStyle = grd;
        ctx.fillRect(x, y, barW * ratio, barH);
        ctx.strokeStyle = '#ff8aa0';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barW, barH);

        ctx.fillStyle = '#fff';
        ctx.font = '20px VT323, monospace';
        ctx.fillText(`${Math.ceil(this.bossHP)} / ${this.bossMaxHP}`, canvasW * 0.5, y + 21);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    _drawMessages(ctx, canvasW, canvasH) {
        ctx.textAlign = 'center';
        let y = canvasH * 0.22;
        for (const msg of this.messages) {
            const alpha = Math.min(1, msg.timer);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowColor = 'rgba(0,0,0,0.95)';
            ctx.shadowBlur = 12;
            ctx.fillStyle = 'rgba(6, 10, 22, 0.78)';
            ctx.fillRect(canvasW * 0.5 - 250, y - 24, 500, 32);
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.strokeRect(canvasW * 0.5 - 250, y - 24, 500, 32);
            ctx.fillStyle = msg.color;
            ctx.font = '22px VT323, monospace';
            ctx.fillText(msg.text, canvasW * 0.5, y);
            ctx.restore();
            y += 38;
        }
        ctx.textAlign = 'left';
    }

    _drawDeathScreen(ctx, canvasW, canvasH) {
        ctx.fillStyle = 'rgba(25,0,8,0.82)';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.fillStyle = '#ff3b5c';
        ctx.font = '64px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillText('VOCÊ MORREU', canvasW * 0.5, canvasH * 0.4);
        ctx.fillStyle = '#ffd6dd';
        ctx.font = '28px VT323, monospace';
        ctx.fillText('Ressuscitando em 3 segundos...', canvasW * 0.5, canvasH * 0.5);
        ctx.textAlign = 'left';
    }

    _drawVictoryScreen(ctx, canvasW, canvasH) {
        ctx.fillStyle = 'rgba(3,18,48,0.9)';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.fillStyle = '#ffdf6b';
        ctx.font = '68px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillText('VITÓRIA!', canvasW * 0.5, canvasH * 0.3);
        ctx.fillStyle = '#aaddff';
        ctx.font = '34px VT323, monospace';
        ctx.fillText('O MUNDO FOI SALVO', canvasW * 0.5, canvasH * 0.38);

        if (this.victoryStats) {
            ctx.fillStyle = '#ddd';
            ctx.font = '24px VT323, monospace';
            const s = this.victoryStats;
            ctx.fillText(`Tempo de jogo: ${s.time}`, canvasW * 0.5, canvasH * 0.5);
            ctx.fillText(`Inimigos derrotados: ${s.kills}`, canvasW * 0.5, canvasH * 0.56);
            ctx.fillText(`Blocos minerados: ${s.blocksMined}`, canvasW * 0.5, canvasH * 0.62);
        }
        ctx.textAlign = 'left';
    }
}
