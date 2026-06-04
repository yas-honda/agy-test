const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Ensure screenshots folder exists
const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
}

test.describe('Aegis Vanguard Automated Visual Verification & Hitbox Probes', () => {
    let consoleErrors = [];

    test.beforeEach(({ page }) => {
        consoleErrors = [];
        // Capture browser errors
        page.on('pageerror', (err) => {
            consoleErrors.push(`Page Error: ${err.message}`);
        });
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(`Console Error: ${msg.text()}`);
            }
        });
    });

    test('01. Launch title screen and verify no console errors', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');

        // Check if there are any errors on startup
        expect(consoleErrors).toEqual([]);

        // Take Title screen screenshot
        await page.screenshot({ path: path.join(screenshotDir, '01_title.png') });
    });

    test('02. Navigate to Instructions screen', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');

        // Simulate press Enter to transition to INSTRUCTIONS
        await page.evaluate(() => {
            window.gameController.state = 'INSTRUCTIONS';
            window.gameController.render();
        });

        await page.screenshot({ path: path.join(screenshotDir, '02_instructions.png') });
        expect(consoleErrors).toEqual([]);
    });

    test('03. State warp to Stage 1 and verify visual playing frame', async ({ page }) => {
        await page.goto('http://localhost:3000');
        
        await page.evaluate(() => {
            const game = window.gameController;
            game.initGame();
            game.state = 'PLAYING';
            game.stage = 1;
            // Spawn some basic enemies
            game.enemies.push(new Enemy(600, 200, 'scout', false));
            game.enemies.push(new Enemy(750, 300, 'heavy', true));
            game.render();
        });

        await page.screenshot({ path: path.join(screenshotDir, '03_playing_stage1.png') });
        expect(consoleErrors).toEqual([]);
    });

    test('04. Capture Boss Warning state', async ({ page }) => {
        await page.goto('http://localhost:3000');

        await page.evaluate(() => {
            const game = window.gameController;
            game.initGame();
            game.state = 'BOSS_WARNING';
            game.bossWarningTimer = 100;
            game.render();
        });

        await page.screenshot({ path: path.join(screenshotDir, '04_boss_warning.png') });
        expect(consoleErrors).toEqual([]);
    });

    test('05. Spawn Boss 1 and perform Hitbox Probe verification', async ({ page }) => {
        await page.goto('http://localhost:3000');

        const hpResult = await page.evaluate(() => {
            const game = window.gameController;
            game.initGame();
            game.state = 'BOSS_BATTLE';
            game.stage = 1;
            
            // Explicitly spawn Stage 1 Boss
            game.boss = new Boss(1);
            // Move boss to target resting spot
            game.boss.x = 780;
            game.boss.y = 270;
            
            const initialHp = game.boss.hp;
            
            // Draw once to capture initial state screen
            game.render();
            
            // Hitbox probe: Spawn normal player bullet directly at core
            // Boss 1 core is at center-left: game.boss.x - 65 + (w:50)/2 = 780 - 65 + 25 = 740
            // Core Y: game.boss.y = 270
            const bullet = new Bullet(740, 270, 0, 0, 'normal', 5);
            game.bullets.push(bullet);
            
            // Run collision checks
            game.checkCollisions();
            
            return {
                initialHp: initialHp,
                currentHp: game.boss.hp,
                bulletActiveAfterHit: bullet.active
            };
        });

        // Verify the hitbox probe registers and reduces Boss HP
        console.log(`[Hitbox Probe Boss 1] Init HP: ${hpResult.initialHp}, Post HP: ${hpResult.currentHp}`);
        expect(hpResult.currentHp).toBe(hpResult.initialHp - 5);
        expect(hpResult.bulletActiveAfterHit).toBe(false); // Bullet should be consumed

        // Capture Boss 1 Battle screen
        await page.evaluate(() => { window.gameController.render(); });
        await page.screenshot({ path: path.join(screenshotDir, '05_boss1_battle.png') });
        expect(consoleErrors).toEqual([]);
    });

    test('06. Verify Boss 1 shield blocking logic', async ({ page }) => {
        await page.goto('http://localhost:3000');

        const result = await page.evaluate(() => {
            const game = window.gameController;
            game.initGame();
            game.state = 'BOSS_BATTLE';
            game.stage = 1;
            game.boss = new Boss(1);
            game.boss.x = 780;
            game.boss.y = 270;
            
            // Place shield orbit right in front of the core to intercept
            const shield = game.boss.shields[0];
            shield.x = 740;
            shield.y = 270;
            shield.hp = 10;
            shield.active = true;
            
            const initialBossHp = game.boss.hp;
            
            // Fire bullet directly towards the core
            const bullet = new Bullet(740, 270, 0, 0, 'normal', 4);
            game.bullets.push(bullet);
            
            // Run collisions
            game.checkCollisions();
            
            return {
                bossHp: game.boss.hp,
                initialBossHp: initialBossHp,
                shieldHp: shield.hp,
                shieldActive: shield.active,
                bulletActive: bullet.active
            };
        });

        // Bullet should hit the shield segment first and be absorbed, boss core remains undamaged!
        console.log(`[Shield Intercept Probe] Boss HP: ${result.bossHp}/${result.initialBossHp}, Shield HP: ${result.shieldHp}`);
        expect(result.bossHp).toBe(result.initialBossHp); // Unchanged
        expect(result.shieldHp).toBe(6); // 10 - 4
        expect(result.bulletActive).toBe(false); // Bullet consumed
    });

    test('07. Spawn Boss 2 and capture visual screen', async ({ page }) => {
        await page.goto('http://localhost:3000');

        await page.evaluate(() => {
            const game = window.gameController;
            game.initGame();
            game.state = 'BOSS_BATTLE';
            game.stage = 2;
            game.boss = new Boss(2);
            game.boss.x = 780;
            game.boss.y = 270;
            game.render();
        });

        await page.screenshot({ path: path.join(screenshotDir, '07_boss2_battle.png') });
        expect(consoleErrors).toEqual([]);
    });

    test('08. Spawn Boss 3 and verify vulnerability states', async ({ page }) => {
        await page.goto('http://localhost:3000');

        const result = await page.evaluate(() => {
            const game = window.gameController;
            game.initGame();
            game.state = 'BOSS_BATTLE';
            game.stage = 3;
            game.boss = new Boss(3);
            game.boss.x = 780;
            game.boss.y = 270;
            
            const initHp = game.boss.hp;
            
            // 1. Attack core while panels are CLOSED
            game.boss.panelOpen = false;
            const bullet1 = new Bullet(780, 270, 0, 0, 'normal', 3);
            game.bullets.push(bullet1);
            game.checkCollisions();
            
            const hpClosed = game.boss.hp;
            
            // 2. Attack core while panels are OPEN
            game.boss.panelOpen = true;
            const bullet2 = new Bullet(780, 270, 0, 0, 'normal', 5);
            game.bullets.push(bullet2);
            game.checkCollisions();
            
            const hpOpen = game.boss.hp;
            
            return {
                initHp: initHp,
                hpClosed: hpClosed,
                hpOpen: hpOpen
            };
        });

        console.log(`[Singularity Vulnerability Probe] Boss 3 HP - Init: ${result.initHp}, Post-Closed: ${result.hpClosed}, Post-Open: ${result.hpOpen}`);
        expect(result.hpClosed).toBe(result.initHp); // Armored panels closed: no damage
        expect(result.hpOpen).toBe(result.initHp - 5); // Panels open: took 5 damage
        
        await page.evaluate(() => { window.gameController.render(); });
        await page.screenshot({ path: path.join(screenshotDir, '09_boss3_battle.png') });
        expect(consoleErrors).toEqual([]);
    });

    test('09. Capture Game Over screen visual', async ({ page }) => {
        await page.goto('http://localhost:3000');

        await page.evaluate(() => {
            const game = window.gameController;
            game.state = 'GAMEOVER';
            game.score = 25400;
            game.render();
        });

        await page.screenshot({ path: path.join(screenshotDir, '10_gameover.png') });
        expect(consoleErrors).toEqual([]);
    });

    test('10. Capture Victory All Clear screen visual', async ({ page }) => {
        await page.goto('http://localhost:3000');

        await page.evaluate(() => {
            const game = window.gameController;
            game.state = 'ALL_CLEAR';
            game.score = 98900;
            game.render();
        });

        await page.screenshot({ path: path.join(screenshotDir, '11_all_clear.png') });
        expect(consoleErrors).toEqual([]);
    });
});
