// Aegis Vanguard: Chronicles of the Ion Void
// Core Game Engine

// Canvas Configuration
const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;

// Game State Enum
const GameState = {
    TITLE: 'TITLE',
    INSTRUCTIONS: 'INSTRUCTIONS',
    PLAYING: 'PLAYING',
    BOSS_WARNING: 'BOSS_WARNING',
    BOSS_BATTLE: 'BOSS_BATTLE',
    STAGE_CLEAR: 'STAGE_CLEAR',
    GAMEOVER: 'GAMEOVER',
    ALL_CLEAR: 'ALL_CLEAR'
};

// Power Up Options
const PowerUpType = {
    SPEED: 0,
    MISSILE: 1,
    DOUBLE: 2,
    SPREAD: 3,
    LASER: 4,
    OPTION: 5,
    SHIELD: 6
};

const PowerUpNames = ['SPEED', 'MISSILE', 'DOUBLE', 'SPREAD', 'LASER', 'OPTION', 'SHIELD'];

// Image Assets Cache
const Assets = {
    images: {},
    canvases: {}, // Stores chroma-keyed canvases
    loadedCount: 0,
    totalCount: 6,
    fallbackActive: false
};

// Asset sources list
const assetSources = {
    player: 'assets/player.png',
    enemy_scout: 'assets/enemy_scout.png',
    enemy_heavy: 'assets/enemy_heavy.png',
    boss1: 'assets/boss1.png',
    boss2: 'assets/boss2.png',
    boss3: 'assets/boss3.png'
};

// Load assets and apply Chroma Key + 1px Inner Clip
function loadAssets(callback) {
    let loaded = 0;
    const keys = Object.keys(assetSources);
    
    if (keys.length === 0) {
        Assets.fallbackActive = true;
        callback();
        return;
    }

    keys.forEach(key => {
        const img = new Image();
        img.src = assetSources[key];
        img.onload = () => {
            Assets.images[key] = img;
            
            // Apply chromakey immediately
            try {
                Assets.canvases[key] = applyChromaKey(img);
                console.log(`Chroma key applied successfully to ${key}`);
            } catch (e) {
                console.warn(`Failed to apply chroma key to ${key} (likely CORS on file://). Activating fallback mode.`);
                Assets.fallbackActive = true;
            }
            
            loaded++;
            Assets.loadedCount = loaded;
            if (loaded === keys.length) {
                callback();
            }
        };
        img.onerror = () => {
            console.warn(`Could not load image: ${assetSources[key]}. Fallback active.`);
            loaded++;
            Assets.loadedCount = loaded;
            Assets.fallbackActive = true;
            if (loaded === keys.length) {
                callback();
            }
        };
    });
}

// Chroma Key filter with 1px Inner Clip (Anti-alias correction)
function applyChromaKey(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;
    
    // Background pixels map
    const isBg = new Uint8Array(w * h);
    
    // Step 1: Detect green background (#00FF00 / chroma green)
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];
        
        // Pure green has high green and low red/blue
        if (a > 0 && g > 100 && g > r * 1.3 && g > b * 1.3) {
            isBg[i / 4] = 1;
        }
    }
    
    // Step 2: 1px inner clip (remove anti-aliased green edge pixels)
    const toClip = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            if (isBg[idx] === 0) {
                // If adjacent to any background pixel, mark to clip
                if (isBg[idx - 1] === 1 || 
                    isBg[idx + 1] === 1 || 
                    isBg[idx - w] === 1 || 
                    isBg[idx + w] === 1 ||
                    isBg[idx - w - 1] === 1 ||
                    isBg[idx - w + 1] === 1 ||
                    isBg[idx + w - 1] === 1 ||
                    isBg[idx + w + 1] === 1) {
                    toClip[idx] = 1;
                }
            }
        }
    }
    
    // Step 3: Write transparency back to pixel buffer
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        if (isBg[idx] === 1 || toClip[idx] === 1) {
            data[i + 3] = 0; // Alpha transparent
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

// Keyboard controls handler
const Keys = {
    pressed: {},
    init() {
        window.addEventListener('keydown', e => {
            let k = e.key.toLowerCase();
            if (e.code === 'Space') k = 'space';
            this.pressed[k] = true;
            
            // Prevent scrolling on Space and Arrow keys
            if (['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', e => {
            let k = e.key.toLowerCase();
            if (e.code === 'Space') k = 'space';
            this.pressed[k] = false;
        });
    },
    isPressed(key) {
        return !!this.pressed[key];
    }
};

// Main Game Controller
class GameController {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.state = GameState.TITLE;
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('aegis_highscore') || '0');
        this.lives = 3;
        this.stage = 1;
        this.scrollX = 0;
        this.scrollSpeed = 1.5;
        this.stageTimer = 0; // In frames
        this.stageDuration = 120 * 60; // 2 minutes at 60fps (7200 frames)
        
        // Game objects
        this.player = null;
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.capsules = [];
        this.particles = [];
        this.hazards = []; // Ground/Ceiling debris, Rocks, Press pistons
        
        // Death tracking (learn-by-dying)
        this.deathRecords = JSON.parse(localStorage.getItem('aegis_deaths') || '[]');
        this.activeWarnings = [];
        
        // Difficult Rank (1.0 to 3.0)
        this.rank = 1.0;
        
        // Mobile controls
        this.isMobile = false;
        this.touchStartPos = null;
        this.touchCurrentPos = null;
        this.virtualJoyRadius = 50;
        
        // Visual indicators
        this.bossWarningTimer = 0;
        this.boss = null;
        this.levelTransitionTimer = 0;
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
        
        this.initResize();
        this.initMobileDetect();
    }

    initMobileDetect() {
        const detect = () => {
            this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            if (this.isMobile) {
                document.getElementById('mobile-controls').style.display = 'flex';
            } else {
                document.getElementById('mobile-controls').style.display = 'none';
            }
        };
        detect();
        window.addEventListener('resize', detect);
    }

    initResize() {
        const resize = () => {
            const container = document.getElementById('game-container');
            const w = window.innerWidth;
            const h = window.innerHeight;
            
            // Maintain 16:9 ratio
            let targetW = w;
            let targetH = w * (9/16);
            
            if (targetH > h) {
                targetH = h;
                targetW = h * (16/9);
            }
            
            this.canvas.style.width = `${targetW}px`;
            this.canvas.style.height = `${targetH}px`;
        };
        window.addEventListener('resize', resize);
        resize();
    }

    start() {
        Keys.init();
        this.setupTouchControls();
        
        // Start game loop
        const loop = (timestamp) => {
            this.update();
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    setupTouchControls() {
        // Virtual Joystick Left Area
        const vpad = document.getElementById('vpad-area');
        vpad.addEventListener('touchstart', e => {
            const touch = e.touches[0];
            const rect = vpad.getBoundingClientRect();
            this.touchStartPos = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
            this.touchCurrentPos = { ...this.touchStartPos };
        });
        vpad.addEventListener('touchmove', e => {
            if (!this.touchStartPos) return;
            const touch = e.touches[0];
            const rect = vpad.getBoundingClientRect();
            this.touchCurrentPos = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        });
        vpad.addEventListener('touchend', () => {
            this.touchStartPos = null;
            this.touchCurrentPos = null;
        });

        // Fire & Power Buttons on Right
        const btnFire = document.getElementById('btn-fire');
        const btnPower = document.getElementById('btn-power');

        btnFire.addEventListener('touchstart', e => {
            e.preventDefault();
            Keys.pressed['space'] = true;
        });
        btnFire.addEventListener('touchend', e => {
            e.preventDefault();
            Keys.pressed['space'] = false;
        });

        btnPower.addEventListener('touchstart', e => {
            e.preventDefault();
            Keys.pressed['shift'] = true; // Use shift or click triggers
        });
        btnPower.addEventListener('touchend', e => {
            e.preventDefault();
            Keys.pressed['shift'] = false;
        });
    }

    triggerBGM(track) {
        try {
            if (window.SynthAudio) {
                window.SynthAudio.playBGM(track);
            }
        } catch (e) {
            console.error("Audio Context trigger failed:", e);
        }
    }

    triggerSFX(effect) {
        try {
            if (window.SynthAudio) {
                window.SynthAudio.playSFX(effect);
            }
        } catch (e) {
            console.error("SFX play failed:", e);
        }
    }

    initGame() {
        this.score = 0;
        this.lives = 3;
        this.stage = 1;
        this.scrollX = 0;
        this.stageTimer = 0;
        this.rank = 1.0;
        
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.capsules = [];
        this.particles = [];
        this.hazards = [];
        this.boss = null;
        this.levelTransitionTimer = 0;
        
        this.player = new Player(100, LOGICAL_HEIGHT / 2);
        
        this.loadStageTerrain();
        this.triggerBGM('stage1');
    }

    loadStageTerrain() {
        this.hazards = [];
        // Stage 1: Space / Asteroids. Floating ceiling/floor clusters
        // Stage 2: Tight cavern. Ceiling stalactites and Floor stalagmites, press traps
        // Stage 3: Metal Fortress. Narrow hallways, moving wall sections (press machine)
        
        const count = 30;
        for (let i = 0; i < count; i++) {
            const x = 500 + i * 400 + Math.random() * 150;
            
            if (this.stage === 1) {
                // Falling rocks
                this.hazards.push({
                    x: x,
                    y: 0,
                    width: 60 + Math.random() * 40,
                    height: 80 + Math.random() * 80,
                    type: 'rock',
                    state: 'hanging', // hanging, falling, shattered
                    triggerDist: 350,
                    vy: 0
                });
            } else if (this.stage === 2) {
                // Cavern pillars
                const isCeiling = Math.random() > 0.5;
                const h = 100 + Math.random() * 120;
                this.hazards.push({
                    x: x,
                    y: isCeiling ? 0 : LOGICAL_HEIGHT - h,
                    width: 70 + Math.random() * 30,
                    height: h,
                    type: 'cavern'
                });
                
                // Press Pistons (Stage 2 & 3)
                if (i % 3 === 0) {
                    this.hazards.push({
                        x: x + 200,
                        y: 0,
                        width: 80,
                        height: 60,
                        type: 'press',
                        state: 'retracted', // retracted, pressing, rising
                        pistonY: 0,
                        maxExtend: 280,
                        speed: 4
                    });
                }
            } else if (this.stage === 3) {
                // Fortress walls
                const isCeiling = Math.random() > 0.5;
                const h = 130 + Math.random() * 100;
                this.hazards.push({
                    x: x,
                    y: isCeiling ? 0 : LOGICAL_HEIGHT - h,
                    width: 100,
                    height: h,
                    type: 'fortress'
                });
                
                // Fast Pistons
                if (i % 2 === 0) {
                    this.hazards.push({
                        x: x + 220,
                        y: 0,
                        width: 90,
                        height: 80,
                        type: 'press',
                        state: 'retracted',
                        pistonY: 0,
                        maxExtend: 320,
                        speed: 7
                    });
                }
            }
        }
    }

    recordDeath(x, y, cause) {
        let causeText = "HOSTILE BULLET";
        let shortText = "CAUTION! HOSTILE SQUADRON!";
        
        if (cause === 'rock') {
            causeText = "FALLING DEBRIS";
            shortText = "WARNING! FALLING DEBRIS!";
        } else if (cause === 'press') {
            causeText = "CRUSH HAZARD";
            shortText = "DANGER! PRESSING HAZARD!";
        } else if (cause === 'wall' || cause === 'cavern' || cause === 'fortress') {
            causeText = "COLLISION DEBRIS";
            shortText = "WARNING! NARROW PASSAGE!";
        } else if (cause === 'rear') {
            causeText = "REAR AMBUSH";
            shortText = "CAUTION! REAR ASSAULT!";
        }
        
        const record = {
            stage: this.stage,
            scrollX: this.scrollX + x,
            y: y,
            cause: cause,
            text: shortText
        };
        
        this.deathRecords.push(record);
        // Keep last 15 records
        if (this.deathRecords.length > 15) this.deathRecords.shift();
        localStorage.setItem('aegis_deaths', JSON.stringify(this.deathRecords));
    }

    updateRank() {
        // Calculate Rank based on powerups, options, score, and deaths
        const powerUpsCount = this.player ? (
            this.player.speedLevel + 
            (this.player.hasMissile ? 1 : 0) + 
            (this.player.weaponMode !== 'normal' ? 2 : 0) + 
            this.player.options.length * 1.5 + 
            (this.player.shieldHp > 0 ? 1 : 0)
        ) : 0;
        
        this.rank = 1.0 + (powerUpsCount * 0.12) + (this.score * 0.00003);
        this.rank = Math.max(1.0, Math.min(3.0, this.rank));
    }

    screenShake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeTimer = duration;
    }

    update() {
        // Screen shake decay
        if (this.shakeTimer > 0) {
            this.shakeTimer--;
        }

        // State Machine Update
        switch (this.state) {
            case GameState.TITLE:
                if (Keys.isPressed('enter') || Keys.isPressed(' ') || Keys.isPressed('space')) {
                    if (window.SynthAudio) window.SynthAudio.init();
                    this.state = GameState.INSTRUCTIONS;
                    this.triggerSFX('power_activate');
                }
                break;
            case GameState.INSTRUCTIONS:
                if (Keys.isPressed('enter') || Keys.isPressed(' ') || Keys.isPressed('space')) {
                    this.initGame();
                    this.state = GameState.PLAYING;
                }
                break;
            case GameState.PLAYING:
                this.updatePlaying();
                break;
            case GameState.BOSS_WARNING:
                this.updateBossWarning();
                break;
            case GameState.BOSS_BATTLE:
                this.updateBossBattle();
                break;
            case GameState.STAGE_CLEAR:
                this.updateStageClear();
                break;
            case GameState.GAMEOVER:
                if (Keys.isPressed('enter') || Keys.isPressed('r')) {
                    this.initGame();
                    this.state = GameState.PLAYING;
                }
                break;
            case GameState.ALL_CLEAR:
                if (Keys.isPressed('enter') || Keys.isPressed('r')) {
                    this.state = GameState.TITLE;
                    this.triggerBGM('title');
                }
                break;
        }
    }

    updatePlaying() {
        this.scrollX += this.scrollSpeed;
        this.stageTimer++;
        
        this.updateRank();
        
        // Warning triggers from pre-death records
        this.activeWarnings = [];
        this.deathRecords.forEach(rec => {
            if (rec.stage === this.stage) {
                // Warning starts showing 300px before the spot, disappears 50px before
                const distance = rec.scrollX - this.scrollX;
                if (distance > 50 && distance < 350) {
                    this.activeWarnings.push(rec);
                }
            }
        });

        this.player.update(this);
        this.spawnEnemies();
        
        // Update hazards (rocks, walls, pistons)
        this.updateHazards();

        // Update all active bullet, particle, and entity loops
        this.updateEntities();
        
        // Check Collisions
        this.checkCollisions();
        
        // Progress Stage to Boss warning
        if (this.stageTimer >= this.stageDuration) {
            this.state = GameState.BOSS_WARNING;
            this.bossWarningTimer = 0;
            this.triggerBGM('boss');
            this.triggerSFX('warning');
        }
    }

    updateBossWarning() {
        this.bossWarningTimer++;
        this.player.update(this);
        this.updateEntities();
        
        if (this.bossWarningTimer > 180) { // 3 seconds warning
            this.state = GameState.BOSS_BATTLE;
            // Spawn Stage Boss
            this.boss = new Boss(this.stage);
        }
    }

    updateBossBattle() {
        this.player.update(this);
        
        if (this.boss) {
            this.boss.update(this);
        }
        
        this.updateEntities();
        this.checkCollisions();
        
        // If boss is destroyed
        if (this.boss && this.boss.dead) {
            this.boss = null;
            this.state = GameState.STAGE_CLEAR;
            this.levelTransitionTimer = 0;
            this.bullets = [];
            this.enemyBullets = [];
        }
    }

    updateStageClear() {
        this.player.x += 4; // Fly off screen
        this.player.updateTrailsOnly();
        this.updateEntities();
        
        this.levelTransitionTimer++;
        if (this.levelTransitionTimer > 180) {
            this.stage++;
            if (this.stage > 3) {
                this.state = GameState.ALL_CLEAR;
                this.triggerBGM('title');
            } else {
                this.stageTimer = 0;
                this.scrollX = 0;
                this.player.x = 100;
                this.player.y = LOGICAL_HEIGHT / 2;
                this.loadStageTerrain();
                this.state = GameState.PLAYING;
                
                if (this.stage === 2) this.triggerBGM('stage2');
                if (this.stage === 3) this.triggerBGM('stage3');
            }
        }
    }

    updateHazards() {
        this.hazards.forEach(hz => {
            const screenX = hz.x - this.scrollX;
            
            // Trigger falling rock
            if (hz.type === 'rock' && hz.state === 'hanging') {
                if (this.player && screenX < hz.triggerDist) {
                    hz.state = 'falling';
                    this.triggerSFX('explosion_small');
                }
            }
            
            if (hz.type === 'rock' && hz.state === 'falling') {
                hz.vy += 0.25; // gravity
                hz.y += hz.vy;
                
                // Particle trail for falling rock
                if (Math.random() < 0.3) {
                    this.particles.push(new Particle(hz.x - this.scrollX + hz.width / 2, hz.y, -1, -1, 4, '#888888'));
                }
                
                // Check ground contact
                if (hz.y + hz.height >= LOGICAL_HEIGHT) {
                    hz.y = LOGICAL_HEIGHT - hz.height;
                    hz.state = 'shattered';
                    this.screenShake(4, 10);
                    this.triggerSFX('explosion_small');
                    
                    // Spawn fragments
                    for (let p = 0; p < 8; p++) {
                        this.particles.push(new Particle(
                            hz.x - this.scrollX + hz.width / 2,
                            hz.y + hz.height,
                            (Math.random() - 0.5) * 6,
                            -Math.random() * 5 - 2,
                            5 + Math.random() * 4,
                            '#666666'
                        ));
                    }
                }
            }
            
            // Piston Press logic
            if (hz.type === 'press') {
                if (hz.state === 'retracted') {
                    if (this.player && screenX < 450) {
                        hz.state = 'pressing';
                    }
                } else if (hz.state === 'pressing') {
                    hz.pistonY += hz.speed;
                    if (hz.pistonY >= hz.maxExtend) {
                        hz.pistonY = hz.maxExtend;
                        hz.state = 'extended';
                        hz.waitTimer = 30; // wait 0.5s at full press
                        this.screenShake(6, 12);
                        this.triggerSFX('explosion_small');
                    }
                } else if (hz.state === 'extended') {
                    hz.waitTimer--;
                    if (hz.waitTimer <= 0) {
                        hz.state = 'rising';
                    }
                } else if (hz.state === 'rising') {
                    hz.pistonY -= hz.speed / 2;
                    if (hz.pistonY <= 0) {
                        hz.pistonY = 0;
                        hz.state = 'retracted';
                    }
                }
            }
        });
        
        // Remove offscreen hazards behind player to save memory
        this.hazards = this.hazards.filter(hz => hz.x - this.scrollX > -400);
    }

    spawnEnemies() {
        // Simple procedural waves based on frames
        const spawnDelay = Math.max(30, 90 - (this.rank * 15));
        
        if (this.stageTimer % Math.floor(spawnDelay) === 0) {
            const r = Math.random();
            const y = 80 + Math.random() * (LOGICAL_HEIGHT - 160);
            
            // 20% capsule carrier, 50% scout, 30% heavy (if stage > 1)
            let type = 'scout';
            let isCarrier = Math.random() < 0.25; // High capsule drop rate early
            
            if (this.stageTimer < 2000) {
                isCarrier = Math.random() < 0.45; // Even higher at stage starts to allow quick build
            }
            
            if (r > 0.7 && this.stage > 1) {
                type = 'heavy';
            } else if (r > 0.85) {
                type = 'scout';
            }
            
            this.enemies.push(new Enemy(LOGICAL_WIDTH + 50, y, type, isCarrier));
        }
        
        // Rear Assailant Ambush (Stage 3 gimmick)
        if (this.stage === 3 && this.stageTimer % 450 === 0) {
            // Spawn behind player!
            const y = 100 + Math.random() * (LOGICAL_HEIGHT - 200);
            const scout = new Enemy(-50, y, 'scout', false);
            scout.vx = 4; // Moves to the right
            scout.isRearAssault = true;
            this.enemies.push(scout);
        }
    }

    updateEntities() {
        // Update bullets
        this.bullets.forEach(b => b.update());
        this.bullets = this.bullets.filter(b => b.active && b.x < LOGICAL_WIDTH + 50 && b.x > -50);
        
        // Update enemy bullets
        this.enemyBullets.forEach(b => b.update());
        this.enemyBullets = this.enemyBullets.filter(b => b.active && b.x < LOGICAL_WIDTH + 50 && b.x > -50);
        
        // Update enemies
        this.enemies.forEach(e => e.update(this));
        this.enemies = this.enemies.filter(e => e.active && e.x < LOGICAL_WIDTH + 150 && e.x > -150);
        
        // Update capsules
        this.capsules.forEach(c => c.update());
        this.capsules = this.capsules.filter(c => c.active && c.x > -50);
        
        // Update particles
        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => p.active);
    }

    checkCollisions() {
        if (!this.player) return;
        
        const pBox = this.player.getBoundingBox();
        const playerVulnerable = this.player.invulnFrames <= 0 && !this.player.dead;
        
        if (playerVulnerable) {
            // 1. Enemy Bullets vs Player
            this.enemyBullets.forEach(eb => {
                if (eb.active && this.collides(pBox, eb.getBoundingBox())) {
                    eb.active = false;
                    this.hitPlayer('bullet');
                }
            });
            
            if (this.player.dead) return;
            
            // 2. Enemies vs Player
            this.enemies.forEach(e => {
                if (e.active && this.collides(pBox, e.getBoundingBox())) {
                    e.active = false;
                    this.hitPlayer('collision');
                }
            });
            
            if (this.player.dead) return;
            
            // 3. Hazards (Ceiling/Floor walls, Rocks, Pistons) vs Player
            this.hazards.forEach(hz => {
                const screenX = hz.x - this.scrollX;
                let hzBox = null;
                
                if (hz.type === 'rock') {
                    hzBox = { x: screenX, y: hz.y, w: hz.width, h: hz.height };
                    if (this.collides(pBox, hzBox)) {
                        this.hitPlayer('rock');
                    }
                } else if (hz.type === 'cavern' || hz.type === 'fortress') {
                    hzBox = { x: screenX, y: hz.y, w: hz.width, h: hz.height };
                    if (this.collides(pBox, hzBox)) {
                        this.hitPlayer('wall');
                    }
                } else if (hz.type === 'press') {
                    // Piston body is at y=0 extending downwards to hz.pistonY + 60
                    hzBox = { x: screenX, y: 0, w: hz.width, h: hz.pistonY + hz.height };
                    if (this.collides(pBox, hzBox)) {
                        this.hitPlayer('press');
                    }
                }
            });
            
            if (this.player.dead) return;
            
            // 4. Boss vs Player
            if (this.boss && !this.boss.dead) {
                // Check Boss Core
                const coreBox = this.boss.getCoreBoundingBox();
                if (this.collides(pBox, coreBox)) {
                    this.hitPlayer('collision');
                }
                
                // Check Boss Shell hitboxes (only for crash damage)
                const parts = this.boss.getShellBoundingBoxes();
                parts.forEach(part => {
                    if (this.collides(pBox, part)) {
                        this.hitPlayer('collision');
                    }
                });
            }
        }
        
        if (this.player.dead) return;
        
        // 5. Capsules vs Player
        this.capsules.forEach(c => {
            if (c.active && this.collides(pBox, { x: c.x - 12, y: c.y - 12, w: 24, h: 24 })) {
                c.active = false;
                this.player.collectCapsule(this);
            }
        });
        
        // 6. Player Bullets vs Enemies
        this.bullets.forEach(b => {
            if (!b.active) return;
            
            this.enemies.forEach(e => {
                if (e.active && this.collides(b.getBoundingBox(), e.getBoundingBox())) {
                    if (b.type !== 'laser') { // Laser pierces
                        b.active = false;
                    }
                    
                    e.hp -= b.damage;
                    this.triggerSFX('explosion_small');
                    
                    if (e.hp <= 0) {
                        e.active = false;
                        this.destroyEnemy(e);
                    } else {
                        // Impact particles
                        this.spawnFlashParticles(e.x, e.y, 4);
                    }
                }
            });
            
            // Player Bullets vs Boss
            if (this.boss && !this.boss.dead) {
                // Check if hit shield orbits (Boss 1 specific)
                let blockedByShield = false;
                if (this.boss.type === 1) {
                    this.boss.shields.forEach(sh => {
                        if (sh.active && this.collides(b.getBoundingBox(), sh.getBoundingBox())) {
                            blockedByShield = true;
                            sh.hp -= b.damage;
                            if (sh.hp <= 0) {
                                sh.active = false;
                                this.triggerSFX('explosion_large');
                                this.screenShake(3, 8);
                            }
                            if (b.type !== 'laser') b.active = false;
                            this.triggerSFX('shield_hit');
                            this.spawnFlashParticles(sh.x, sh.y, 3);
                        }
                    });
                }
                
                if (!blockedByShield) {
                    const coreBox = this.boss.getCoreBoundingBox();
                    if (this.collides(b.getBoundingBox(), coreBox)) {
                        if (b.type !== 'laser') b.active = false;
                        if (this.boss.isCoreVulnerable()) {
                            this.boss.damageCore(b.damage, this);
                        } else {
                            this.boss.damageShell(this);
                        }
                    } else {
                        // Check armored parts (hit flashes white/red, but no damage)
                        const shellParts = this.boss.getShellBoundingBoxes();
                        for (let p = 0; p < shellParts.length; p++) {
                            const part = shellParts[p];
                            if (this.collides(b.getBoundingBox(), part)) {
                                if (b.type !== 'laser') b.active = false;
                                this.boss.damageShell(this);
                                break;
                            }
                        }
                    }
                }
            }
        });
    }

    hitPlayer(cause) {
        if (this.player.shieldHp > 0) {
            // Shield absorbs damage
            this.player.shieldHp--;
            this.triggerSFX('shield_hit');
            this.player.invulnFrames = 60; // 1s invuln
            this.screenShake(2, 6);
            
            // Shield hit animation particles
            this.spawnFlashParticles(this.player.x + 30, this.player.y, 8, '#00ffff');
            return;
        }
        
        // Record coordinates and cause of death for WARNING indicators next time
        const playerRelativeX = this.player.x;
        this.recordDeath(playerRelativeX, this.player.y, cause);
        
        // Kill player
        this.player.dead = true;
        this.lives--;
        this.triggerSFX('player_death');
        this.screenShake(10, 30);
        
        // Multi-layer explosion sequence at player coords
        this.createMultiLayerExplosion(this.player.x, this.player.y, true);
        
        setTimeout(() => {
            if (this.lives >= 0) {
                // Respawn
                this.player = new Player(100, LOGICAL_HEIGHT / 2);
            } else {
                this.state = GameState.GAMEOVER;
                this.triggerBGM('gameover');
            }
        }, 1500);
    }

    destroyEnemy(e) {
        this.score += e.scoreValue;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('aegis_highscore', this.highScore.toString());
        }
        
        this.triggerSFX('explosion_small');
        this.createMultiLayerExplosion(e.x, e.y, false);
        
        // Drop power up capsule
        if (e.isCarrier) {
            this.capsules.push(new PowerUpCapsule(e.x, e.y));
        }
    }

    createMultiLayerExplosion(x, y, isBig) {
        const pCount = isBig ? 32 : 12;
        const color = isBig ? '#ff3300' : '#ff8800';
        
        // 1. Initial Flash Ring (Shockwave)
        this.particles.push(new Particle(x, y, 0, 0, isBig ? 12 : 6, '#ffffff', 1.0, 0.05, 'shockwave'));
        
        // 2. Fireballs
        for (let i = 0; i < pCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 4 + 1) * (isBig ? 1.5 : 1.0);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            this.particles.push(new Particle(
                x, y, vx, vy,
                (4 + Math.random() * 6) * (isBig ? 1.8 : 1.0),
                color,
                1.0,
                0.02 + Math.random() * 0.02,
                'fire'
            ));
        }
        
        // 3. Smoke debris
        for (let i = 0; i < (isBig ? 15 : 6); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 2 + 0.5;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            this.particles.push(new Particle(
                x, y, vx, vy,
                8 + Math.random() * 8,
                '#555555',
                0.7,
                0.01 + Math.random() * 0.01,
                'smoke'
            ));
        }
        
        // 4. Spark particles
        for (let i = 0; i < (isBig ? 20 : 5); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 3;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            this.particles.push(new Particle(
                x, y, vx, vy,
                1.5,
                '#ffff55',
                1.0,
                0.03 + Math.random() * 0.03,
                'spark'
            ));
        }
    }

    spawnFlashParticles(x, y, count, color = '#ffffff') {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.particles.push(new Particle(x, y, vx, vy, 1.5, color, 1.0, 0.08));
        }
    }

    collides(a, b) {
        return a.x < b.x + b.w &&
               a.x + a.w > b.x &&
               a.y < b.y + b.h &&
               a.y + a.h > b.y;
    }

    // --- RENDER METHODS ---

    render() {
        const ctx = this.ctx;
        ctx.save();
        
        // Shake screen offset
        if (this.shakeTimer > 0) {
            const sx = (Math.random() - 0.5) * this.shakeIntensity;
            const sy = (Math.random() - 0.5) * this.shakeIntensity;
            ctx.translate(sx, sy);
        }
        
        // Clear screen
        ctx.fillStyle = '#060610';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        
        // Draw Parallax Backgrounds
        this.drawParallaxBG();
        
        // Draw Warnings (Pre-death records)
        if (this.state === GameState.PLAYING) {
            this.drawDeathWarnings();
        }

        // Draw Stage hazards (terrain details)
        this.drawHazards();
        
        // Draw capsules
        this.capsules.forEach(c => c.draw(ctx));
        
        // Draw player
        if (this.player && !this.player.dead) {
            this.player.draw(ctx);
        }
        
        // Draw enemies
        this.enemies.forEach(e => e.draw(ctx));
        
        // Draw bullets
        this.bullets.forEach(b => b.draw(ctx));
        this.enemyBullets.forEach(b => b.draw(ctx));
        
        // Draw Boss
        if (this.boss) {
            this.boss.draw(ctx);
        }
        
        // Draw particles
        this.particles.forEach(p => p.draw(ctx));
        
        // Draw UI
        this.drawUI();
        
        ctx.restore();
    }

    drawParallaxBG() {
        const ctx = this.ctx;
        const time = Date.now() * 0.001;
        
        // Layer 1: Nebula clouds (procedural gradient maps)
        ctx.save();
        ctx.globalAlpha = 0.25;
        let nebGrad = ctx.createRadialGradient(
            LOGICAL_WIDTH/2 + Math.cos(time * 0.05) * 100, 
            LOGICAL_HEIGHT/2 + Math.sin(time * 0.03) * 50, 
            50, 
            LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2, 400
        );
        if (this.stage === 1) {
            nebGrad.addColorStop(0, '#1c1b3f');
            nebGrad.addColorStop(1, '#060610');
        } else if (this.stage === 2) {
            nebGrad.addColorStop(0, '#3a113a');
            nebGrad.addColorStop(1, '#060610');
        } else {
            nebGrad.addColorStop(0, '#1a3a3a');
            nebGrad.addColorStop(1, '#060610');
        }
        ctx.fillStyle = nebGrad;
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        ctx.restore();
        
        // Layer 2: Fast background stars
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 40; i++) {
            const x = (i * 73 - this.scrollX * 0.3) % (LOGICAL_WIDTH + 20) - 10;
            const y = (i * 29) % LOGICAL_HEIGHT;
            const size = (i % 3 === 0) ? 2.0 : 1.0;
            
            ctx.globalAlpha = 0.4 + (i % 5) * 0.12;
            ctx.fillRect(x, y, size, size);
        }
        
        // Layer 3: Far cosmic structures (only procedural if image is unavailable)
        ctx.globalAlpha = 1.0;
        if (this.stage === 3) {
            // Draw futuristic digital architecture (scrolling girder lattices)
            ctx.strokeStyle = '#1b1a30';
            ctx.lineWidth = 1.5;
            const space = 240;
            const scrollOffset = -(this.scrollX * 0.7) % space;
            for (let x = scrollOffset; x < LOGICAL_WIDTH + space; x += space) {
                // Ceil girders
                ctx.strokeRect(x, 0, 160, 45);
                ctx.beginPath();
                ctx.moveTo(x, 45);
                ctx.lineTo(x + 80, 80);
                ctx.lineTo(x + 160, 45);
                ctx.stroke();
                
                // Floor girders
                ctx.strokeRect(x, LOGICAL_HEIGHT - 45, 160, 45);
                ctx.beginPath();
                ctx.moveTo(x, LOGICAL_HEIGHT - 45);
                ctx.lineTo(x + 80, LOGICAL_HEIGHT - 80);
                ctx.lineTo(x + 160, LOGICAL_HEIGHT - 45);
                ctx.stroke();
            }
        }
    }

    drawHazards() {
        const ctx = this.ctx;
        this.hazards.forEach(hz => {
            const screenX = hz.x - this.scrollX;
            
            ctx.save();
            if (hz.type === 'rock') {
                // Rock rendering
                ctx.fillStyle = '#22222a';
                ctx.strokeStyle = '#555566';
                ctx.lineWidth = 2.0;
                
                ctx.beginPath();
                ctx.moveTo(screenX, hz.y + 10);
                ctx.lineTo(screenX + hz.width * 0.3, hz.y);
                ctx.lineTo(screenX + hz.width * 0.7, hz.y);
                ctx.lineTo(screenX + hz.width, hz.y + hz.height * 0.2);
                ctx.lineTo(screenX + hz.width * 0.9, hz.y + hz.height * 0.9);
                ctx.lineTo(screenX + hz.width * 0.5, hz.y + hz.height);
                ctx.lineTo(screenX + hz.width * 0.1, hz.y + hz.height * 0.7);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                
                // Hanging cracks texture
                ctx.strokeStyle = '#383844';
                ctx.beginPath();
                ctx.moveTo(screenX + hz.width * 0.3, hz.y);
                ctx.lineTo(screenX + hz.width * 0.4, hz.y + hz.height * 0.4);
                ctx.lineTo(screenX + hz.width * 0.6, hz.y + hz.height * 0.8);
                ctx.stroke();
            } 
            else if (hz.type === 'cavern') {
                ctx.fillStyle = '#261c17';
                ctx.strokeStyle = '#7c533c';
                ctx.lineWidth = 2;
                
                ctx.beginPath();
                if (hz.y === 0) { // Ceiling spike
                    ctx.moveTo(screenX, 0);
                    ctx.lineTo(screenX + hz.width * 0.5, hz.height);
                    ctx.lineTo(screenX + hz.width, 0);
                } else { // Floor spike
                    ctx.moveTo(screenX, LOGICAL_HEIGHT);
                    ctx.lineTo(screenX + hz.width * 0.5, hz.y);
                    ctx.lineTo(screenX + hz.width, LOGICAL_HEIGHT);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } 
            else if (hz.type === 'fortress') {
                ctx.fillStyle = '#1e222b';
                ctx.strokeStyle = '#424f63';
                ctx.lineWidth = 3;
                
                ctx.fillRect(screenX, hz.y, hz.width, hz.height);
                ctx.strokeRect(screenX, hz.y, hz.width, hz.height);
                
                // Add inner technical grid lines for detail
                ctx.strokeStyle = '#2d3747';
                ctx.strokeRect(screenX + 10, hz.y + 10, hz.width - 20, hz.height - 20);
            }
            else if (hz.type === 'press') {
                // Draw mount
                ctx.fillStyle = '#333333';
                ctx.fillRect(screenX, 0, hz.width, 40);
                
                // Draw shaft
                ctx.fillStyle = '#666666';
                ctx.fillRect(screenX + hz.width / 2 - 10, 40, 20, hz.pistonY);
                
                // Draw piston head (press slab)
                ctx.fillStyle = '#22252a';
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth = 2;
                ctx.fillRect(screenX, hz.pistonY + 40, hz.width, hz.height);
                ctx.strokeRect(screenX, hz.pistonY + 40, hz.width, hz.height);
                
                // Danger stripes
                ctx.fillStyle = '#ffaa00';
                for (let sx = 10; sx < hz.width; sx += 30) {
                    ctx.beginPath();
                    ctx.moveTo(screenX + sx, hz.pistonY + 40);
                    ctx.lineTo(screenX + sx + 10, hz.pistonY + 40);
                    ctx.lineTo(screenX + sx, hz.pistonY + 40 + hz.height);
                    ctx.lineTo(screenX + sx - 10, hz.pistonY + 40 + hz.height);
                    ctx.closePath();
                    ctx.fill();
                }
            }
            ctx.restore();
        });
    }

    drawDeathWarnings() {
        const ctx = this.ctx;
        this.activeWarnings.forEach(rec => {
            // Draw Warning indicator in middle of screen
            ctx.save();
            ctx.font = 'bold 20px "Outfit", "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Flashing logic
            const flash = Math.floor(Date.now() / 250) % 2 === 0;
            if (flash) {
                ctx.fillStyle = '#ff1111';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                
                const textY = 110;
                ctx.strokeText(rec.text, LOGICAL_WIDTH / 2, textY);
                ctx.fillText(rec.text, LOGICAL_WIDTH / 2, textY);
                
                // Draw hazard symbol
                ctx.fillStyle = '#ffcc00';
                ctx.font = '28px sans-serif';
                ctx.fillText('⚠️', LOGICAL_WIDTH / 2 - 190, textY);
            }
            ctx.restore();
        });
    }

    drawUI() {
        const ctx = this.ctx;
        
        // 1. Top Panel (Score, High Score, Lives)
        ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, 45);
        ctx.strokeStyle = '#222244';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 45);
        ctx.lineTo(LOGICAL_WIDTH, 45);
        ctx.stroke();
        
        ctx.font = '16px "Outfit", "Inter", sans-serif';
        ctx.fillStyle = '#88aaff';
        ctx.fillText(`SCORE: ${this.score}`, 20, 28);
        ctx.fillText(`HI-SCORE: ${this.highScore}`, 200, 28);
        ctx.fillText(`STAGE: ${this.stage}`, 420, 28);
        
        // Lives (Draw Vanguard Ships as markers)
        ctx.fillText(`LIVES:`, 600, 28);
        ctx.fillStyle = '#00ffcc';
        for (let i = 0; i < this.lives; i++) {
            ctx.fillRect(660 + i * 22, 17, 14, 10);
            ctx.beginPath();
            ctx.moveTo(674 + i * 22, 17);
            ctx.lineTo(679 + i * 22, 22);
            ctx.lineTo(674 + i * 22, 27);
            ctx.fill();
        }
        
        // Difficulty Rank indicator (Progress bar)
        ctx.fillStyle = '#555555';
        ctx.fillRect(800, 20, 120, 10);
        ctx.fillStyle = this.rank > 2.2 ? '#ff1111' : (this.rank > 1.6 ? '#ffaa00' : '#00ffcc');
        ctx.fillRect(800, 20, 120 * ((this.rank - 1) / 2.0), 10);
        ctx.font = '10px "Inter", sans-serif';
        ctx.fillText(`RANK: ${this.rank.toFixed(2)}`, 800, 15);
        
        // 2. Gradius Style Power Up Selection Bar at Bottom
        if (this.player && !this.player.dead) {
            const barWidth = 700;
            const cellWidth = barWidth / 7;
            const barX = (LOGICAL_WIDTH - barWidth) / 2;
            const barY = LOGICAL_HEIGHT - 35;
            
            ctx.fillStyle = 'rgba(5, 5, 10, 0.9)';
            ctx.fillRect(barX, barY, barWidth, 25);
            ctx.strokeStyle = '#222244';
            ctx.strokeRect(barX, barY, barWidth, 25);
            
            for (let i = 0; i < 7; i++) {
                const isHighlighted = (this.player.capsuleCount % 8) === (i + 1);
                
                if (isHighlighted) {
                    ctx.fillStyle = '#ffaa00';
                    ctx.fillRect(barX + i * cellWidth + 2, barY + 2, cellWidth - 4, 21);
                    ctx.fillStyle = '#000000';
                } else {
                    ctx.fillStyle = '#111122';
                    ctx.fillRect(barX + i * cellWidth + 2, barY + 2, cellWidth - 4, 21);
                    ctx.fillStyle = '#88aaff';
                }
                
                ctx.font = 'bold 11px "Outfit", "Inter", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(PowerUpNames[i], barX + i * cellWidth + cellWidth / 2, barY + 12);
            }
        }
        
        // 3. Stage Boss HP Bar
        if (this.boss && !this.boss.dead) {
            const percent = Math.max(0, this.boss.hp / this.boss.maxHp);
            const w = 400;
            const bx = (LOGICAL_WIDTH - w) / 2;
            const by = 60;
            
            ctx.fillStyle = '#222222';
            ctx.fillRect(bx, by, w, 15);
            
            // Glow effect
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ff3333';
            ctx.fillStyle = '#ff1111';
            ctx.fillRect(bx + 2, by + 2, (w - 4) * percent, 11);
            ctx.restore();
            
            ctx.strokeStyle = '#ffffff';
            ctx.strokeRect(bx, by, w, 15);
            
            ctx.font = 'bold 12px "Outfit", "Inter", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('AEGIS THREAT IDENTIFIED', LOGICAL_WIDTH / 2, by - 6);
        }
        
        // 4. Overlaid state screens
        if (this.state === GameState.TITLE) {
            this.drawTitleScreen(ctx);
        } else if (this.state === GameState.INSTRUCTIONS) {
            this.drawInstructionsScreen(ctx);
        } else if (this.state === GameState.BOSS_WARNING) {
            this.drawBossWarningOverlay(ctx);
        } else if (this.state === GameState.GAMEOVER) {
            this.drawGameOverScreen(ctx);
        } else if (this.state === GameState.ALL_CLEAR) {
            this.drawAllClearScreen(ctx);
        }
        
        // Mobile layout virtual joystick drawing if touch is active
        if (this.isMobile && this.touchStartPos && this.touchCurrentPos) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 3;
            
            // Draw outer boundaries
            ctx.beginPath();
            ctx.arc(this.touchStartPos.x, this.touchStartPos.y, this.virtualJoyRadius, 0, Math.PI*2);
            ctx.stroke();
            
            // Draw inner thumb stick
            ctx.fillStyle = '#00ffcc';
            ctx.beginPath();
            ctx.arc(this.touchCurrentPos.x, this.touchCurrentPos.y, 20, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        }
    }

    drawTitleScreen(ctx) {
        ctx.fillStyle = 'rgba(6, 6, 12, 0.9)';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffcc';
        
        ctx.font = 'bold 46px "Outfit", "Inter", sans-serif';
        ctx.fillStyle = '#00ffcc';
        ctx.textAlign = 'center';
        ctx.fillText('AEGIS VANGUARD', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 50);
        ctx.restore();
        
        ctx.font = 'italic 16px "Outfit", "Inter", sans-serif';
        ctx.fillStyle = '#ff007f';
        ctx.fillText('Chronicles of the Ion Void', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 15);
        
        ctx.font = 'bold 15px "Inter", sans-serif';
        ctx.fillStyle = '#ffffff';
        
        const flash = Math.floor(Date.now() / 350) % 2 === 0;
        if (flash) {
            ctx.fillText('PRESS ENTER / SPACE / TAP TO START', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 60);
        }
        
        ctx.font = '12px "Inter", sans-serif';
        ctx.fillStyle = '#88aaff';
        ctx.fillText('DEVELOPED BY DEEPMIND ADVANCED CODING AGENTS', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 60);
    }

    drawInstructionsScreen(ctx) {
        ctx.fillStyle = 'rgba(6, 6, 12, 0.95)';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        
        ctx.font = 'bold 24px "Outfit", sans-serif';
        ctx.fillStyle = '#00ffcc';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION PROTOCOL', LOGICAL_WIDTH / 2, 80);
        
        ctx.font = '14px "Inter", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        const lx = LOGICAL_WIDTH / 2 - 250;
        
        ctx.fillText('■ PC CONTROLS:', lx, 140);
        ctx.fillStyle = '#88aaff';
        ctx.fillText('- Move: WASD or Arrow Keys', lx + 20, 165);
        ctx.fillText('- Fire Primary: SPACEBAR (Hold to Autofire)', lx + 20, 190);
        ctx.fillText('- Power Select: SHIFT or ENTER (Activates highlighted bar cell)', lx + 20, 215);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText('■ POWER-UPS (Collect Red Capsules):', lx, 255);
        ctx.fillStyle = '#88aaff';
        ctx.fillText('1. SPEED: Multiplies movement throttle', lx + 20, 280);
        ctx.fillText('2. MISSILE: Slides downward and scans walls', lx + 20, 305);
        ctx.fillText('3. DOUBLE/SPREAD/LASER: Mutual-exclusive weapon modifications', lx + 20, 330);
        ctx.fillText('4. OPTION: Spawns up to 4 follow drones that mimic fires', lx + 20, 355);
        ctx.fillText('5. SHIELD: Absorbs 3 direct hits', lx + 20, 380);
        
        ctx.fillStyle = '#00ffcc';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE / ENTER TO DEPLOY', LOGICAL_WIDTH / 2, 450);
    }

    drawBossWarningOverlay(ctx) {
        // Red flashing background warning
        const active = Math.floor(Date.now() / 150) % 2 === 0;
        if (active) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
            ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        }
        
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff1111';
        ctx.font = 'bold 36px "Outfit", sans-serif';
        ctx.fillStyle = '#ff1111';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ WARNING ⚠️', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 30);
        ctx.fillText('HIGH-LEVEL SIGNATURE DETECTED', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 20);
        ctx.restore();
    }

    drawGameOverScreen(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        
        ctx.font = 'bold 42px "Outfit", sans-serif';
        ctx.fillStyle = '#ff1111';
        ctx.textAlign = 'center';
        ctx.fillText('VANGUARD INOPERABLE', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 40);
        
        ctx.font = '16px "Inter", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`TOTAL SCORE ACQUIRED: ${this.score}`, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 10);
        ctx.fillText('REPLAY SAVED. LEARN FROM DEFEAT ADAPTATION SYSTEM.', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 45);
        
        const flash = Math.floor(Date.now() / 300) % 2 === 0;
        if (flash) {
            ctx.font = 'bold 18px "Inter", sans-serif';
            ctx.fillStyle = '#00ffcc';
            ctx.fillText('PRESS R / ENTER / TAP TO RESPAWN', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 100);
        }
    }

    drawAllClearScreen(ctx) {
        ctx.fillStyle = 'rgba(6, 12, 12, 0.9)';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffcc';
        ctx.font = 'bold 46px "Outfit", sans-serif';
        ctx.fillStyle = '#00ffcc';
        ctx.textAlign = 'center';
        ctx.fillText('GALAXY PRESERVED', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 50);
        ctx.restore();
        
        ctx.font = '16px "Inter", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`ULTIMATE HIGH SCORE: ${this.score}`, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 10);
        ctx.fillText('AEGIS DRONE THREAT EXTERMINATED', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 40);
        
        ctx.font = '14px "Inter", sans-serif';
        ctx.fillStyle = '#88aaff';
        ctx.fillText('THANK YOU FOR PLAYING AEGIS VANGUARD!', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 80);
        
        ctx.font = '16px "Inter", sans-serif';
        ctx.fillStyle = '#ffaa00';
        ctx.fillText('PRESS ENTER TO RETURN TO TITLE', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 140);
    }
}

// Player Class
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 54;
        this.h = 24;
        this.dead = false;
        
        // Stats & Levels
        this.speedLevel = 0;
        this.hasMissile = false;
        this.weaponMode = 'normal'; // normal, double, spread, laser
        this.options = []; // Array of Option entities
        this.shieldHp = 0;
        
        // Movement mechanics
        this.bankAngle = 0; // for engine rotation rendering
        this.prevCoords = []; // Trail history for Options: Queue of {x,y}
        
        // Bullet firing control
        this.fireCooldown = 0;
        this.capsuleCount = 0;
        this.invulnFrames = 60; // Spawn invuln
    }

    getBoundingBox() {
        return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
    }

    update(game) {
        if (this.dead) return;
        
        if (this.invulnFrames > 0) this.invulnFrames--;
        
        // Calculate Speed
        const speed = 4.0 + (this.speedLevel * 1.5);
        let dx = 0;
        let dy = 0;
        
        // Handle input (Keyboard)
        if (Keys.isPressed('w') || Keys.isPressed('arrowup')) dy = -1;
        if (Keys.isPressed('s') || Keys.isPressed('arrowdown')) dy = 1;
        if (Keys.isPressed('a') || Keys.isPressed('arrowleft')) dx = -1;
        if (Keys.isPressed('d') || Keys.isPressed('arrowright')) dx = 1;
        
        // Handle input (Mobile touch joysticks)
        if (game.isMobile && game.touchStartPos && game.touchCurrentPos) {
            const tx = game.touchCurrentPos.x - game.touchStartPos.x;
            const ty = game.touchCurrentPos.y - game.touchStartPos.y;
            const dist = Math.sqrt(tx*tx + ty*ty);
            
            if (dist > 5) {
                dx = tx / dist;
                dy = ty / dist;
                
                // cap speed to joystick pull ratio
                const multiplier = Math.min(1.0, dist / game.virtualJoyRadius);
                dx *= multiplier;
                dy *= multiplier;
            }
        }
        
        // Move & Clamp
        this.x += dx * speed;
        this.y += dy * speed;
        
        // Keep inside boundary (Top panel is 45px, Bottom panel is 45px)
        this.x = Math.max(30, Math.min(LOGICAL_WIDTH - 30, this.x));
        this.y = Math.max(65, Math.min(LOGICAL_HEIGHT - 65, this.y));
        
        // Banking angle animation
        const targetBank = dy * 15; // Max 15 degrees tilt
        this.bankAngle += (targetBank - this.bankAngle) * 0.15;
        
        // Record trail for Options
        this.prevCoords.unshift({ x: this.x, y: this.y });
        if (this.prevCoords.length > 200) {
            this.prevCoords.pop();
        }
        
        // Options follow logic
        this.updateOptions();
        
        // Auto-firing logic
        if (this.fireCooldown > 0) this.fireCooldown--;
        
        if (Keys.isPressed('space') || Keys.isPressed(' ')) {
            this.fire(game);
        }
        
        // Shift key activates powerup selection
        if (Keys.isPressed('shift') || Keys.isPressed('enter')) {
            this.activatePowerUp(game);
            // Throttle selection triggers to avoid rapid double-activation
            Keys.pressed['shift'] = false;
            Keys.pressed['enter'] = false;
        }
        
        // Engine particles pulsing
        if (Math.random() < 0.8) {
            const ex = this.x - this.w / 2;
            const ey = this.y + (Math.random() - 0.5) * 6;
            game.particles.push(new Particle(ex, ey, -3 - Math.random()*2, (Math.random()-0.5)*1, 3, '#00ffff', 0.8, 0.05));
        }
    }

    updateTrailsOnly() {
        this.prevCoords.unshift({ x: this.x, y: this.y });
        if (this.prevCoords.length > 200) {
            this.prevCoords.pop();
        }
        this.updateOptions();
    }

    updateOptions() {
        this.options.forEach((opt, idx) => {
            // Options lag behind player by 25 frames each
            const trailIdx = (idx + 1) * 20;
            if (this.prevCoords[trailIdx]) {
                opt.x = this.prevCoords[trailIdx].x;
                opt.y = this.prevCoords[trailIdx].y;
            } else {
                opt.x = this.x;
                opt.y = this.y;
            }
        });
    }

    fire(game) {
        if (this.fireCooldown > 0) return;
        
        this.fireCooldown = (this.weaponMode === 'laser') ? 4 : 8;
        game.triggerSFX(this.weaponMode === 'double' ? 'double' : (this.weaponMode === 'laser' ? 'double' : 'laser'));
        
        // Main Fire patterns
        const px = this.x + 20;
        const py = this.y;
        
        if (this.weaponMode === 'normal') {
            game.bullets.push(new Bullet(px, py, 12, 0, 'normal', 1));
        } 
        else if (this.weaponMode === 'double') {
            game.bullets.push(new Bullet(px, py, 12, 0, 'normal', 1));
            game.bullets.push(new Bullet(px, py - 6, 10, -5, 'double', 0.8));
        } 
        else if (this.weaponMode === 'spread') {
            game.bullets.push(new Bullet(px, py, 12, 0, 'normal', 1));
            game.bullets.push(new Bullet(px, py, 10, -4, 'spread', 0.7));
            game.bullets.push(new Bullet(px, py, 10, 4, 'spread', 0.7));
        } 
        else if (this.weaponMode === 'laser') {
            game.bullets.push(new Bullet(px, py, 20, 0, 'laser', 2));
        }
        
        // Ground Missiles
        if (this.hasMissile) {
            game.triggerSFX('missile');
            game.bullets.push(new Bullet(this.x, this.y + 8, 4, 3, 'missile', 1.5));
        }
        
        // Options fire!
        this.options.forEach(opt => {
            if (this.weaponMode === 'normal') {
                game.bullets.push(new Bullet(opt.x, opt.y, 12, 0, 'normal', 1));
            } 
            else if (this.weaponMode === 'double') {
                game.bullets.push(new Bullet(opt.x, opt.y, 12, 0, 'normal', 1));
                game.bullets.push(new Bullet(opt.x, opt.y - 6, 10, -5, 'double', 0.8));
            } 
            else if (this.weaponMode === 'spread') {
                game.bullets.push(new Bullet(opt.x, opt.y, 12, 0, 'normal', 1));
                game.bullets.push(new Bullet(opt.x, opt.y, 10, -4, 'spread', 0.7));
                game.bullets.push(new Bullet(opt.x, opt.y, 10, 4, 'spread', 0.7));
            } 
            else if (this.weaponMode === 'laser') {
                game.bullets.push(new Bullet(opt.x, opt.y, 20, 0, 'laser', 2));
            }
            
            if (this.hasMissile) {
                game.bullets.push(new Bullet(opt.x, opt.y + 8, 4, 3, 'missile', 1.5));
            }
        });
        
        // Spawning gun nozzle muzzle flash particles
        game.particles.push(new Particle(px, py, 2, 0, 8, '#ffffff', 0.9, 0.2));
    }

    collectCapsule(game) {
        this.capsuleCount++;
        game.triggerSFX('capsule');
    }

    activatePowerUp(game) {
        const selectedIndex = (this.capsuleCount % 8) - 1;
        if (selectedIndex < 0) return;
        
        game.triggerSFX('power_activate');
        
        switch (selectedIndex) {
            case PowerUpType.SPEED:
                if (this.speedLevel < 5) this.speedLevel++;
                break;
            case PowerUpType.MISSILE:
                this.hasMissile = true;
                break;
            case PowerUpType.DOUBLE:
                this.weaponMode = 'double';
                break;
            case PowerUpType.SPREAD:
                this.weaponMode = 'spread';
                break;
            case PowerUpType.LASER:
                this.weaponMode = 'laser';
                break;
            case PowerUpType.OPTION:
                if (this.options.length < 4) {
                    this.options.push({ x: this.x, y: this.y });
                }
                break;
            case PowerUpType.SHIELD:
                this.shieldHp = 3;
                break;
        }
        
        // Reset capsule highlight state
        this.capsuleCount = 0;
    }

    draw(ctx) {
        // Blinking if invulnerable
        if (this.invulnFrames > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
            return;
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.bankAngle * Math.PI / 180);
        
        // Ghost trail rendering (only when moving fast/banking)
        if (Math.abs(this.bankAngle) > 2) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(-this.w/2 - 10, -this.h/2 - 2, this.w, this.h);
            ctx.restore();
        }

        // Draw Player Sprite (either chromakeyed canvas or procedural fallback)
        if (!Assets.fallbackActive && Assets.canvases['player']) {
            ctx.drawImage(
                Assets.canvases['player'], 
                -this.w/2, 
                -this.h/2, 
                this.w, 
                this.h
            );
        } else {
            // Procedural Fighter (Sleek sci-fi neon fighter)
            ctx.fillStyle = '#00ffcc';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            
            ctx.beginPath();
            ctx.moveTo(-this.w/2, -4);
            ctx.lineTo(-this.w/2 + 10, -10);
            ctx.lineTo(this.w/2 - 15, -4);
            ctx.lineTo(this.w/2, 0);
            ctx.lineTo(this.w/2 - 15, 4);
            ctx.lineTo(-this.w/2 + 10, 10);
            ctx.lineTo(-this.w/2, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Cockpit canopy glow
            ctx.fillStyle = '#ff007f';
            ctx.fillRect(5, -3, 8, 6);
        }
        ctx.restore();
        
        // Draw Options
        this.options.forEach(opt => {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ff5500';
            ctx.fillStyle = '#ff8800';
            
            ctx.beginPath();
            ctx.arc(opt.x, opt.y, 8, 0, Math.PI*2);
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        });
        
        // Draw Shield
        if (this.shieldHp > 0) {
            ctx.save();
            ctx.shadowBlur = 10 + Math.random() * 5;
            ctx.shadowColor = '#00ffff';
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.4 + this.shieldHp * 0.2})`;
            ctx.lineWidth = 4;
            
            ctx.beginPath();
            // Draw a protective arc ahead of the player
            ctx.arc(this.x, this.y, 35, -Math.PI / 2.5, Math.PI / 2.5);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// Enemy Class
class Enemy {
    constructor(x, y, type, isCarrier) {
        this.x = x;
        this.y = y;
        this.type = type; // scout, heavy
        this.isCarrier = isCarrier; // Capsule dropper
        this.active = true;
        
        // Basic parameters
        this.w = 40;
        this.h = 32;
        this.hp = 1;
        this.scoreValue = 100;
        
        this.vx = -2.5;
        this.vy = 0;
        this.time = Math.random() * 100;
        this.shootTimer = Math.random() * 100;
        this.isRearAssault = false;
        
        if (this.type === 'scout') {
            this.w = 36;
            this.h = 24;
            this.hp = 1;
            this.vx = -4.0;
            this.scoreValue = 150;
        } else if (this.type === 'heavy') {
            this.w = 64;
            this.h = 48;
            this.hp = 5;
            this.vx = -1.2;
            this.scoreValue = 400;
        }
    }

    getBoundingBox() {
        return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
    }

    update(game) {
        if (!this.active) return;
        
        this.time += 0.05;
        this.shootTimer++;
        
        // Adjusted enemy movement speed by game difficulty rank
        const rankSpeedMultiplier = 1.0 + (game.rank - 1.0) * 0.2;
        
        // Movement behavior patterns
        if (this.type === 'scout') {
            // Wavy sine movement
            this.y += Math.sin(this.time) * 2 * rankSpeedMultiplier;
            this.x += this.vx * rankSpeedMultiplier;
        } else if (this.type === 'heavy') {
            // Straight slow movement with minor homing shift
            if (game.player && !game.player.dead) {
                const diffY = game.player.y - this.y;
                if (Math.abs(diffY) > 10) {
                    this.y += Math.sign(diffY) * 0.4 * rankSpeedMultiplier;
                }
            }
            this.x += this.vx * rankSpeedMultiplier;
        } else {
            // Carrier or basic: loop
            this.x += this.vx * rankSpeedMultiplier;
        }
        
        // Shooting bullets (Aggression scales with difficulty rank)
        const fireChance = 160 - (game.rank * 30);
        if (this.shootTimer % Math.floor(fireChance) === 0 && this.x > 50 && this.x < LOGICAL_WIDTH) {
            this.shoot(game);
        }
        
        // Engine exhaust glow particle
        if (Math.random() < 0.2) {
            game.particles.push(new Particle(this.x + this.w/2, this.y, 2, (Math.random()-0.5)*1, 2.5, '#ff3300', 0.8, 0.05));
        }
    }

    shoot(game) {
        if (!game.player || game.player.dead) return;
        
        // Aim at player
        const dx = game.player.x - this.x;
        const dy = game.player.y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        const bulletSpeed = (this.type === 'heavy' ? 3.5 : 5.0) * (1.0 + (game.rank - 1.0) * 0.25);
        
        if (dist > 50) {
            const vx = (dx / dist) * bulletSpeed;
            const vy = (dy / dist) * bulletSpeed;
            
            if (this.type === 'heavy') {
                // Shoot a 3-bullet spread
                game.enemyBullets.push(new Bullet(this.x - 20, this.y, vx, vy, 'enemy', 1));
                game.enemyBullets.push(new Bullet(this.x - 20, this.y, vx * 0.9 + vy * 0.1, vy * 0.9 - vx * 0.1, 'enemy', 1));
                game.enemyBullets.push(new Bullet(this.x - 20, this.y, vx * 0.9 - vy * 0.1, vy * 0.9 + vx * 0.1, 'enemy', 1));
            } else {
                // Single bullet
                game.enemyBullets.push(new Bullet(this.x - 10, this.y, vx, vy, 'enemy', 1));
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Carrier glow aura
        if (this.isCarrier) {
            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffaa00';
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.w / 2 + 5, 0, Math.PI*2);
            ctx.stroke();
            ctx.restore();
        }

        const spriteName = this.type === 'heavy' ? 'enemy_heavy' : 'enemy_scout';
        
        if (!Assets.fallbackActive && Assets.canvases[spriteName]) {
            // Draw generated sprite
            ctx.drawImage(
                Assets.canvases[spriteName], 
                -this.w/2, 
                -this.h/2, 
                this.w, 
                this.h
            );
        } else {
            // Procedural styling
            ctx.strokeStyle = this.isCarrier ? '#ffaa00' : (this.type === 'heavy' ? '#ff3333' : '#e0c030');
            ctx.fillStyle = this.type === 'heavy' ? '#3a1111' : '#222211';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            if (this.type === 'scout') {
                ctx.moveTo(-this.w/2, 0);
                ctx.lineTo(this.w/2, -this.h/2);
                ctx.lineTo(this.w/2 - 10, 0);
                ctx.lineTo(this.w/2, this.h/2);
            } else {
                // Heavy blocky tank spaceship
                ctx.rect(-this.w/2, -this.h/2, this.w, this.h);
                // Turrets
                ctx.fillRect(-this.w/2 - 10, -10, 10, 20);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}

// Power Up Capsule Class
class PowerUpCapsule {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = -1.2;
        this.active = true;
        this.time = 0;
    }

    update() {
        this.x += this.vx;
        this.time += 0.15;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        
        // Alternating red and blue flashing glow aura
        const color = Math.floor(this.time) % 2 === 0 ? '#ff1111' : '#007fff';
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        
        ctx.beginPath();
        // Capsule oval shape
        ctx.ellipse(this.x, this.y, 12, 7, 0, 0, Math.PI*2);
        ctx.fill();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}

// Bullet / Laser / Missile Class
class Bullet {
    constructor(x, y, vx, vy, type, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.type = type; // normal, double, spread, laser, missile, enemy
        this.damage = damage;
        this.active = true;
        this.trail = [];
    }

    getBoundingBox() {
        if (this.type === 'laser') {
            return { x: this.x, y: this.y - 6, w: LOGICAL_WIDTH - this.x, h: 12 };
        } else if (this.type === 'missile') {
            return { x: this.x - 8, y: this.y - 4, w: 16, h: 8 };
        }
        return { x: this.x - 6, y: this.y - 3, w: 12, h: 6 };
    }

    update() {
        if (!this.active) return;
        
        // Keep trail path for glows
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 5) this.trail.shift();
        
        if (this.type === 'laser') {
            // Laser is a continuous ray originating from gun nozzle, travels instantly
            this.x += this.vx;
        } 
        else if (this.type === 'missile') {
            // Missile drops down, slides along walls/floors
            this.x += this.vx;
            this.y += this.vy;
            
            // Check ground boundary slide
            if (this.y >= LOGICAL_HEIGHT - 55) {
                this.y = LOGICAL_HEIGHT - 55;
                this.vy = 0; // slide horizontally
                this.vx = 7.0; // speed up when sliding
            }
        } 
        else {
            this.x += this.vx;
            this.y += this.vy;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        
        if (this.type === 'enemy') {
            ctx.shadowColor = '#ff003c';
            ctx.fillStyle = '#ff3366';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4, 0, Math.PI*2);
            ctx.fill();
        } 
        else if (this.type === 'laser') {
            // Multi-layered beam
            ctx.shadowColor = '#00ffff';
            ctx.strokeStyle = '#00bbff';
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(LOGICAL_WIDTH, this.y);
            ctx.stroke();
            
            // Outer white inner beam
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(LOGICAL_WIDTH, this.y);
            ctx.stroke();
        } 
        else if (this.type === 'missile') {
            // Drawn as small wedge
            ctx.shadowColor = '#ffaa00';
            ctx.fillStyle = '#ffaa00';
            ctx.fillRect(this.x - 8, this.y - 3, 12, 6);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(this.x + 2, this.y - 2, 4, 4);
        } 
        else { // Normal, Double, Spread (Player)
            ctx.shadowColor = '#00ffcc';
            ctx.fillStyle = '#00ffcc';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, 7, 3, 0, 0, Math.PI*2);
            ctx.fill();
            
            // Draw trail
            if (this.trail.length > 1) {
                ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(this.trail[0].x, this.trail[0].y);
                ctx.lineTo(this.x, this.y);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

// Dynamic Particle Engine Class
class Particle {
    constructor(x, y, vx, vy, size, color, alpha = 1.0, decay = 0.03, type = 'spark') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.color = color;
        this.alpha = alpha;
        this.decay = decay;
        this.type = type; // spark, fire, smoke, shockwave
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if (this.type === 'fire') {
            this.size *= 0.96; // shrinking
            this.vy -= 0.05; // float up slightly
        } else if (this.type === 'smoke') {
            this.size *= 1.02; // expanding cloud
            this.vy -= 0.02;
        } else if (this.type === 'shockwave') {
            this.size += 4; // rapidly growing ring
        }
        
        this.alpha -= this.decay;
        if (this.alpha <= 0 || this.size <= 0.1) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        
        if (this.type === 'shockwave') {
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.color;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.stroke();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// Stage Boss Class
class Boss {
    constructor(stage) {
        this.stage = stage;
        this.type = stage; // 1, 2, 3
        this.maxHp = 60 + stage * 40;
        this.hp = this.maxHp;
        this.dead = false;
        
        // Base positioning
        this.x = LOGICAL_WIDTH + 200; // flies in from right
        this.targetX = LOGICAL_WIDTH - 180;
        this.y = LOGICAL_HEIGHT / 2;
        this.w = 160;
        this.h = 160;
        
        this.time = 0;
        this.hitFlashTimer = 0;
        this.flashColor = '#ffffff';
        this.shootTimer = 0;
        
        // Boss 1 specific structures: 4 rotating orbit shields
        this.shields = [];
        if (this.type === 1) {
            for (let i = 0; i < 4; i++) {
                this.shields.push({
                    angle: i * (Math.PI / 2),
                    hp: 15,
                    active: true,
                    x: 0,
                    y: 0,
                    w: 24,
                    h: 24,
                    getBoundingBox() {
                        return { x: this.x - this.w/2, y: this.y - this.h/2, w: this.w, h: this.h };
                    }
                });
            }
        }
        
        // Boss 3 specific structures: panel flaps open/close
        this.panelOpen = false;
        this.panelTimer = 0;
    }

    getBoundingBox() {
        return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
    }

    getCoreBoundingBox() {
        // Boss core weak points
        if (this.type === 1) {
            // Glowing red eye at center-left
            return { x: this.x - 65, y: this.y - 25, w: 50, h: 50 };
        } else if (this.type === 2) {
            // Blue weak core in middle
            return { x: this.x - 30, y: this.y - 20, w: 40, h: 40 };
        } else {
            // Purple core hidden between closing panels
            return { x: this.x - 15, y: this.y - 20, w: 50, h: 40 };
        }
    }

    getShellBoundingBoxes() {
        // Return armored structures which are hitboxes but block core damage
        if (this.type === 1) {
            // Outer hull (except core)
            return [
                { x: this.x - 40, y: this.y - 80, w: 100, h: 50 },
                { x: this.x - 40, y: this.y + 30, w: 100, h: 50 },
                { x: this.x + 10, y: this.y - 40, w: 50, h: 80 }
            ];
        } else if (this.type === 2) {
            // Segmented armor hulls
            return [
                { x: this.x - 80, y: this.y - 70, w: 160, h: 40 },
                { x: this.x - 80, y: this.y + 30, w: 160, h: 40 }
            ];
        } else {
            // Splitting flaps
            const flapOffset = this.panelOpen ? 25 : 0;
            return [
                { x: this.x - 70, y: this.y - 75 - flapOffset, w: 140, h: 55 },
                { x: this.x - 70, y: this.y + 20 + flapOffset, w: 140, h: 55 }
            ];
        }
    }

    isCoreVulnerable() {
        if (this.type === 3) {
            // Boss 3 core only vulnerable when open
            return this.panelOpen;
        }
        return true; // Boss 1 core is always open (but guarded by orbits)
    }

    damageCore(amount, game) {
        this.hp -= amount;
        this.hitFlashTimer = 5;
        this.flashColor = '#ff1111'; // Red hit flash for core damage
        
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            game.triggerSFX('explosion_boss');
            game.screenShake(15, 60);
        }
    }

    damageShell(game) {
        this.hitFlashTimer = 5;
        this.flashColor = '#ffffff'; // White hit flash for armored hit
        game.triggerSFX('shield_hit');
    }

    update(game) {
        if (this.dead) return;
        
        this.time += 0.05;
        this.shootTimer++;
        
        if (this.hitFlashTimer > 0) this.hitFlashTimer--;
        
        // Intro movement
        if (this.x > this.targetX) {
            this.x -= 1.0;
        } else {
            // Floating hovering movement
            this.y = LOGICAL_HEIGHT / 2 + Math.sin(this.time) * 40;
        }
        
        // Attack pattern updates
        const difficultyFactor = game.rank;
        
        if (this.type === 1) {
            // Shield rotation
            this.shields.forEach(sh => {
                sh.angle += 0.04 * difficultyFactor;
                sh.x = this.x + Math.cos(sh.angle) * 75;
                sh.y = this.y + Math.sin(sh.angle) * 75;
            });
            
            // Core shooting ring waves
            if (this.shootTimer % Math.floor(120 / difficultyFactor) === 0) {
                game.triggerSFX('laser');
                for (let a = 0; a < 8; a++) {
                    const angle = a * (Math.PI / 4) + (this.time * 0.2);
                    const vx = Math.cos(angle) * 3.5;
                    const vy = Math.sin(angle) * 3.5;
                    game.enemyBullets.push(new Bullet(this.x - 40, this.y, vx, vy, 'enemy', 1));
                }
            }
        } 
        else if (this.type === 2) {
            // Aimed burst fires
            if (this.shootTimer % Math.floor(90 / difficultyFactor) === 0) {
                game.triggerSFX('laser');
                if (game.player && !game.player.dead) {
                    const dx = game.player.x - this.x;
                    const dy = game.player.y - this.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    const vx = (dx / dist) * 4.5;
                    const vy = (dy / dist) * 4.5;
                    
                    // 3-way burst
                    game.enemyBullets.push(new Bullet(this.x - 70, this.y - 30, vx, vy, 'enemy', 1));
                    game.enemyBullets.push(new Bullet(this.x - 70, this.y + 30, vx, vy, 'enemy', 1));
                }
            }
        } 
        else if (this.type === 3) {
            this.panelTimer++;
            
            // Flap door toggle pattern (every 4 seconds)
            if (this.panelTimer % 240 === 0) {
                this.panelOpen = !this.panelOpen;
                game.triggerSFX('power_activate');
            }
            
            if (this.panelOpen) {
                // Charge up warning particles
                if (this.panelTimer % 3 === 0) {
                    game.particles.push(new Particle(this.x - 20, this.y, -3 - Math.random()*5, (Math.random()-0.5)*4, 4, '#aa00ff', 0.9, 0.05));
                }
                
                // Shoot massive laser stream (Stage 3 heavy attack)
                if (this.panelTimer % 60 === 0) {
                    game.triggerSFX('laser');
                    // Multi line laser blast forward
                    for (let l = -2; l <= 2; l++) {
                        game.enemyBullets.push(new Bullet(this.x - 20, this.y + l*10, -8, 0, 'enemy', 1));
                    }
                }
            } else {
                // Closed state fires homing missiles
                if (this.shootTimer % Math.floor(100 / difficultyFactor) === 0) {
                    game.triggerSFX('missile');
                    if (game.player && !game.player.dead) {
                        const dy = game.player.y > this.y ? 2.5 : -2.5;
                        game.enemyBullets.push(new Bullet(this.x - 30, this.y - 40, -3.5, dy, 'enemy', 1));
                        game.enemyBullets.push(new Bullet(this.x - 30, this.y + 40, -3.5, dy, 'enemy', 1));
                    }
                }
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Hit flash logic override
        const flashActive = this.hitFlashTimer > 0;
        if (flashActive) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.flashColor;
        }

        const spriteName = `boss${this.stage}`;
        
        if (!Assets.fallbackActive && Assets.canvases[spriteName]) {
            // Apply hit flash to canvas context
            if (flashActive) {
                ctx.fillStyle = this.flashColor;
                ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
            } else {
                ctx.drawImage(
                    Assets.canvases[spriteName], 
                    -this.w/2, 
                    -this.h/2, 
                    this.w, 
                    this.h
                );
            }
        } else {
            // Draw Procedural Boss (Glowing retro cyber structure)
            ctx.strokeStyle = flashActive ? this.flashColor : (this.type === 1 ? '#ff3333' : (this.type === 2 ? '#3399ff' : '#cc33ff'));
            ctx.fillStyle = flashActive ? this.flashColor : 'rgba(10, 10, 20, 0.9)';
            ctx.lineWidth = 3;
            
            if (this.type === 1) {
                // Sphere Core shape
                ctx.beginPath();
                ctx.arc(0, 0, 60, 0, Math.PI*2);
                ctx.fill();
                ctx.stroke();
                
                // Red glowing eye core
                ctx.fillStyle = '#ff1111';
                ctx.beginPath();
                ctx.arc(-35, 0, 18, 0, Math.PI*2);
                ctx.fill();
            } 
            else if (this.type === 2) {
                // Dreadnought block
                ctx.beginPath();
                ctx.moveTo(-60, -40);
                ctx.lineTo(60, -60);
                ctx.lineTo(80, 0);
                ctx.lineTo(60, 60);
                ctx.lineTo(-60, 40);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                
                // Blue core
                ctx.fillStyle = '#00aaff';
                ctx.beginPath();
                ctx.arc(-10, 0, 20, 0, Math.PI*2);
                ctx.fill();
            } 
            else {
                // Flagship with moving hull panels
                const flapOffset = this.panelOpen ? 25 : 0;
                
                // Draw Inner exposed singularity
                ctx.save();
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#bb00ff';
                ctx.fillStyle = '#ee55ff';
                ctx.beginPath();
                ctx.arc(0, 0, 25, 0, Math.PI*2);
                ctx.fill();
                ctx.restore();
                
                // Top flap
                ctx.beginPath();
                ctx.rect(-70, -60 - flapOffset, 140, 50);
                ctx.fill();
                ctx.stroke();
                
                // Bottom flap
                ctx.beginPath();
                ctx.rect(-70, 10 + flapOffset, 140, 50);
                ctx.fill();
                ctx.stroke();
            }
        }
        ctx.restore();
        
        // Draw orbital shields (Boss 1 specific)
        if (this.type === 1) {
            this.shields.forEach(sh => {
                if (sh.active) {
                    ctx.save();
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#00ffcc';
                    ctx.fillStyle = '#00ffcc';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(sh.x, sh.y, 12, 0, Math.PI*2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            });
        }
    }
}

// Initialize on window load
window.addEventListener('load', () => {
    const game = new GameController('gameCanvas');
    window.gameController = game; // Expose for visual automated tests
    
    // Load assets
    loadAssets(() => {
        console.log("Assets system ready.");
        game.start();
    });
});
