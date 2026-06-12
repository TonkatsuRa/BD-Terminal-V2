// ========================================
// SECRET RAYCAST MINI-GAME - LIEBI
// ========================================
let liebiGameCleanup = null;

const LIEBI_MAP_TEMPLATE = [
    '########################',
    '#P..A....#......1......#',
    '#.####...#.#######.###.#',
    '#....#...D.....#...#...#',
    '####.#.#######.#.###.#.#',
    '#....#.....1...#.....#.#',
    '#.#########.#######.##.#',
    '#.....M...#.....A...#..#',
    '#.#####.#.###D#####.#.##',
    '#.#...#.#.....#...#....#',
    '#.#...#.#.#####...####.#',
    '#.#...#.....#.#...#..#.#',
    '#.#########.#.#####..#.#',
    '#.....2.....#....KR.X#.#',
    '#####.###########.####.#',
    '#...#.....VW....#......#',
    '#.#.#####.#####.######.#',
    '#.#.....#...3...#S.....#',
    '#...A...#.......#..M...#',
    '########################'
];

const LIEBI_ASSET_SOURCES = {
    pistols: 'https://opengameart.org/sites/default/files/pistols.png',
    shotguns: 'https://opengameart.org/sites/default/files/shotguns.png',
    neonpunk: 'https://opengameart.org/sites/default/files/neonpunk.png',
    armor: 'https://opengameart.org/sites/default/files/armor.png',
    enemyC: 'https://opengameart.org/sites/default/files/enemy_type_c_spritesheet_64x64x16.png',
    enemyD: 'https://opengameart.org/sites/default/files/enemy_type_d_spritesheet_64x64x8.png',
    wallChip: 'https://opengameart.org/sites/default/files/scifi_bg_chip2.png'
};

let liebiAssetCache = null;

function getLiebiAssets() {
    if (liebiAssetCache) return liebiAssetCache;
    const images = {};
    Object.entries(LIEBI_ASSET_SOURCES).forEach(([key, url]) => {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = url;
        images[key] = img;
    });
    liebiAssetCache = {
        images,
        ready(key) {
            const img = images[key];
            return Boolean(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
        }
    };
    return liebiAssetCache;
}

function liebiElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createLiebiGameOverlay() {
    const overlay = liebiElement('div', 'liebi-overlay');
    overlay.id = 'liebiOverlay';
    overlay.tabIndex = -1;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'liebiTitle');

    const shell = liebiElement('div', 'liebi-shell');
    const topbar = liebiElement('div', 'liebi-topbar');
    const title = liebiElement('div', 'liebi-title glow', 'ARES BLACKSITE SIM // LIEBI');
    title.id = 'liebiTitle';
    const objective = liebiElement('div', 'liebi-objective', 'OBJECTIVE: KEYCARD / DATA SHARD / EXIT');
    const closeButton = liebiElement('button', 'liebi-close glow', '[ ESC EXIT ]');
    closeButton.type = 'button';
    closeButton.id = 'liebiClose';
    topbar.append(title, objective, closeButton);

    const stage = liebiElement('div', 'liebi-stage');
    const canvasWrap = liebiElement('div', 'liebi-canvas-wrap');
    const canvas = document.createElement('canvas');
    canvas.id = 'liebiCanvas';
    canvas.width = 360;
    canvas.height = 220;
    canvas.setAttribute('aria-label', 'Retro raycast security breach simulation');
    canvasWrap.appendChild(canvas);

    const modal = liebiElement('div', 'liebi-modal');
    modal.id = 'liebiModal';
    const modalCard = liebiElement('div', 'liebi-modal-card');
    const modalTitle = liebiElement('div', 'liebi-modal-title glow');
    modalTitle.id = 'liebiModalTitle';
    const modalText = liebiElement('div', 'liebi-modal-text');
    modalText.id = 'liebiModalText';
    const actions = liebiElement('div', 'liebi-actions');
    const restartButton = liebiElement('button', 'liebi-action', 'RESTART SIM');
    restartButton.type = 'button';
    restartButton.id = 'liebiRestart';
    const exitButton = liebiElement('button', 'liebi-action secondary', 'EXIT');
    exitButton.type = 'button';
    exitButton.id = 'liebiExit';
    actions.append(restartButton, exitButton);
    modalCard.append(modalTitle, modalText, actions);
    modal.appendChild(modalCard);
    canvasWrap.appendChild(modal);

    const hud = liebiElement('div', 'liebi-hud');
    const healthPanel = liebiPanel('HEALTH', 'liebiHealth', true);
    const armorPanel = liebiPanel('ARMOR', 'liebiArmor', true);
    const ammoPanel = liebiPanel('AMMO', 'liebiAmmo');
    const weaponPanel = liebiPanel('WEAPON', 'liebiWeapon');
    const shardPanel = liebiPanel('SHARD', 'liebiShard');
    const keyPanel = liebiPanel('KEY', 'liebiKey');
    const scorePanel = liebiPanel('SCORE', 'liebiScore');
    const statusPanel = liebiPanel('STATUS', 'liebiStatus', false, true);
    hud.append(healthPanel, armorPanel, ammoPanel, weaponPanel, shardPanel, keyPanel, scorePanel, statusPanel);
    stage.append(canvasWrap, hud);

    const footer = liebiElement('div', 'liebi-footer');
    const controls = liebiElement('div', 'liebi-controls', 'W/S MOVE | A/D TURN | Q/E STRAFE | SPACE FIRE | F USE | 1/2 WEAPON | M MAP | ESC EXIT');
    const footerStatus = liebiElement('div', 'liebi-controls', 'SINGLE LEVEL: BLACKSITE SUBLEVEL 03');
    footer.append(controls, footerStatus);

    shell.append(topbar, stage, footer);
    overlay.appendChild(shell);
    return overlay;
}

function liebiPanel(label, id, hasBar = false, wide = false) {
    const panel = liebiElement('div', wide ? 'liebi-panel wide' : 'liebi-panel');
    panel.appendChild(liebiElement('div', 'liebi-label', label));
    if (hasBar) {
        const bar = liebiElement('div', 'liebi-bar');
        const fill = liebiElement('div', 'liebi-bar-fill');
        fill.id = `${id}Bar`;
        bar.appendChild(fill);
        panel.appendChild(bar);
    }
    const value = liebiElement('div', 'liebi-value');
    value.id = id;
    panel.appendChild(value);
    return panel;
}

function createLiebiGameState() {
    const map = LIEBI_MAP_TEMPLATE.map(row => row.split(''));
    const pickups = [];
    const enemies = [];
    let exit = { x: 20.5, y: 13.5 };
    let start = { x: 1.6, y: 1.6, angle: 0.05 };

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            const tile = map[y][x];
            if (tile === 'P') {
                start = { x: x + 0.5, y: y + 0.5, angle: 0.05 };
                map[y][x] = '.';
            } else if (tile === 'A' || tile === 'M' || tile === 'S' || tile === 'K' || tile === 'V' || tile === 'W') {
                pickups.push({ x: x + 0.5, y: y + 0.5, type: tile, taken: false, pulse: (x + y) * 0.37 });
                map[y][x] = '.';
            } else if (tile === '1' || tile === '2' || tile === '3') {
                enemies.push(createLiebiEnemy(tile, x + 0.5, y + 0.5));
                map[y][x] = '.';
            } else if (tile === 'X') {
                exit = { x: x + 0.5, y: y + 0.5 };
            }
        }
    }

    return {
        map,
        pickups,
        exit,
        player: {
            x: start.x,
            y: start.y,
            angle: start.angle,
            health: 100,
            armor: 0,
            ammo: 26,
            shells: 0,
            weapon: 'pistol',
            weapons: { pistol: true, shotgun: false },
            shard: false,
            redKey: false,
            score: 0,
            kills: 0
        },
        enemies,
        totalEnemies: enemies.length,
        keys: new Set(),
        minimap: true,
        lastShot: 0,
        muzzle: 0,
        damageFlash: 0,
        recoil: 0,
        message: 'BREACH SIM READY. FIND KEYCARD AND SHARD.',
        messageUntil: 0,
        exitWarnAt: 0,
        won: false,
        lost: false
    };
}

function createLiebiEnemy(tile, x, y) {
    if (tile === '2') {
        return { x, y, type: 'drone', hp: 5, maxHp: 5, speed: 0.66, damage: 11, attackRange: 1.05, attackDelay: 850, lastAttack: 0, hitFlash: 0, dead: false, alert: false };
    }
    if (tile === '3') {
        return { x, y, type: 'ic', hp: 7, maxHp: 7, speed: 0.43, damage: 15, attackRange: 5.4, attackDelay: 1450, lastAttack: 0, hitFlash: 0, dead: false, alert: false };
    }
    return { x, y, type: 'guard', hp: 4, maxHp: 4, speed: 0.58, damage: 8, attackRange: 3.9, attackDelay: 1200, lastAttack: 0, hitFlash: 0, dead: false, alert: false };
}

function liebiTileAt(game, x, y) {
    const row = game.map[y];
    if (!row || x < 0 || x >= row.length) return '#';
    return row[x] || '#';
}

function liebiSetTile(game, x, y, tile) {
    if (game.map[y] && x >= 0 && x < game.map[y].length) game.map[y][x] = tile;
}

function liebiIsBlocking(game, x, y) {
    const tile = liebiTileAt(game, Math.floor(x), Math.floor(y));
    return tile === '#' || tile === 'D' || tile === 'R';
}

function liebiCanOccupy(game, x, y) {
    const radius = 0.18;
    return !liebiIsBlocking(game, x - radius, y - radius) &&
        !liebiIsBlocking(game, x + radius, y - radius) &&
        !liebiIsBlocking(game, x - radius, y + radius) &&
        !liebiIsBlocking(game, x + radius, y + radius);
}

function liebiTryMoveEntity(game, entity, dx, dy) {
    const nextX = entity.x + dx;
    const nextY = entity.y + dy;
    if (liebiCanOccupy(game, nextX, entity.y)) entity.x = nextX;
    if (liebiCanOccupy(game, entity.x, nextY)) entity.y = nextY;
}

function normalizeAngle(angle) {
    while (angle < -Math.PI) angle += Math.PI * 2;
    while (angle > Math.PI) angle -= Math.PI * 2;
    return angle;
}

function liebiCastRay(game, angle) {
    const player = game.player;
    const rayDirX = Math.cos(angle) || 0.0001;
    const rayDirY = Math.sin(angle) || 0.0001;
    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);

    const deltaDistX = Math.abs(1 / rayDirX);
    const deltaDistY = Math.abs(1 / rayDirY);
    const stepX = rayDirX < 0 ? -1 : 1;
    const stepY = rayDirY < 0 ? -1 : 1;
    let sideDistX = rayDirX < 0 ? (player.x - mapX) * deltaDistX : (mapX + 1 - player.x) * deltaDistX;
    let sideDistY = rayDirY < 0 ? (player.y - mapY) * deltaDistY : (mapY + 1 - player.y) * deltaDistY;
    let side = 0;
    let tile = '.';

    for (let i = 0; i < 36; i++) {
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
        }

        tile = liebiTileAt(game, mapX, mapY);
        if (tile === '#' || tile === 'D' || tile === 'R') break;
    }

    const distance = side === 0
        ? (mapX - player.x + (1 - stepX) / 2) / rayDirX
        : (mapY - player.y + (1 - stepY) / 2) / rayDirY;
    let wallX = side === 0
        ? player.y + distance * rayDirY
        : player.x + distance * rayDirX;
    wallX -= Math.floor(wallX);

    return {
        distance: Math.max(0.001, Math.abs(distance)),
        tile,
        side,
        mapX,
        mapY,
        wallX
    };
}

function liebiLineOfSight(game, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(distance / 0.12));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (liebiIsBlocking(game, x1 + dx * t, y1 + dy * t)) return false;
    }
    return true;
}

function liebiColor(base, shade) {
    const factor = Math.max(0.08, Math.min(1, shade));
    return `rgb(${Math.round(base[0] * factor)}, ${Math.round(base[1] * factor)}, ${Math.round(base[2] * factor)})`;
}

function liebiSfx(kind) {
    if (!AudioEngine.canPlay()) return;
    if (kind === 'shot') {
        AudioEngine.sequence([
            { type: 'square', frequency: 58, endFrequency: 34, duration: 0.09, gain: 0.09, filterFrequency: 150, attack: 0.002, throttleKey: 'liebiShot', minInterval: 0.08 },
            { type: 'triangle', frequency: 29, duration: 0.12, gain: 0.035, filterFrequency: 80, startOffset: 0.015 }
        ]);
    } else if (kind === 'hit') {
        AudioEngine.tone({ type: 'sawtooth', frequency: 72, endFrequency: 46, duration: 0.08, gain: 0.07, filterFrequency: 160, throttleKey: 'liebiHit', minInterval: 0.04 });
    } else if (kind === 'hurt') {
        AudioEngine.errorBuzz();
    } else if (kind === 'pickup') {
        AudioEngine.sequence([
            { type: 'triangle', frequency: 82, duration: 0.06, gain: 0.058, filterFrequency: 180 },
            { type: 'triangle', frequency: 118, duration: 0.08, gain: 0.05, filterFrequency: 220, startOffset: 0.06 }
        ]);
    } else if (kind === 'door') {
        AudioEngine.tone({ type: 'square', frequency: 48, endFrequency: 62, duration: 0.1, gain: 0.05, filterFrequency: 150, throttleKey: 'liebiDoor', minInterval: 0.2 });
    } else if (kind === 'locked') {
        AudioEngine.sequence([
            { type: 'sawtooth', frequency: 44, endFrequency: 31, duration: 0.12, gain: 0.06, filterFrequency: 120, throttleKey: 'liebiLocked', minInterval: 0.22 },
            { type: 'square', frequency: 31, duration: 0.08, gain: 0.03, filterFrequency: 90, startOffset: 0.05 }
        ]);
    } else if (kind === 'shotgun') {
        AudioEngine.sequence([
            { type: 'square', frequency: 42, endFrequency: 24, duration: 0.15, gain: 0.11, filterFrequency: 130, throttleKey: 'liebiShotgun', minInterval: 0.25 },
            { type: 'triangle', frequency: 25, duration: 0.18, gain: 0.045, filterFrequency: 75, startOffset: 0.02 }
        ]);
    } else if (kind === 'win') {
        AudioEngine.successTone();
    }
}

function closeLiebiGame() {
    if (liebiGameCleanup) liebiGameCleanup();
}

function startLiebiGame() {
    if (liebiGameCleanup || document.getElementById('liebiOverlay')) return;

    const overlay = createLiebiGameOverlay();
    document.body.appendChild(overlay);
    overlay.focus();

    const canvas = overlay.querySelector('#liebiCanvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
        overlay.remove();
        return;
    }
    ctx.imageSmoothingEnabled = false;

    const ui = {
        health: overlay.querySelector('#liebiHealth'),
        healthBar: overlay.querySelector('#liebiHealthBar'),
        armor: overlay.querySelector('#liebiArmor'),
        armorBar: overlay.querySelector('#liebiArmorBar'),
        ammo: overlay.querySelector('#liebiAmmo'),
        weapon: overlay.querySelector('#liebiWeapon'),
        shard: overlay.querySelector('#liebiShard'),
        key: overlay.querySelector('#liebiKey'),
        score: overlay.querySelector('#liebiScore'),
        status: overlay.querySelector('#liebiStatus'),
        close: overlay.querySelector('#liebiClose'),
        modal: overlay.querySelector('#liebiModal'),
        modalTitle: overlay.querySelector('#liebiModalTitle'),
        modalText: overlay.querySelector('#liebiModalText'),
        restart: overlay.querySelector('#liebiRestart'),
        exit: overlay.querySelector('#liebiExit')
    };

    const game = createLiebiGameState();
    const width = canvas.width;
    const height = canvas.height;
    const fov = Math.PI / 3;
    const liebiFontFamily = getComputedStyle(document.body).fontFamily;
    const liebiAssets = getLiebiAssets();
    const zBuffer = new Float32Array(width);
    let frameId = null;
    let lastTime = 0;
    let hudCache = '';
    let closed = false;

    function setMessage(text, duration = 1800) {
        game.message = text;
        game.messageUntil = performance.now() + duration;
        updateHud(true);
    }

    function finishGame(won) {
        if (game.won || game.lost) return;
        game.won = won;
        game.lost = !won;
        ui.modal.classList.add('active');
        ui.modalTitle.textContent = won ? 'EXTRACTION COMPLETE' : 'SIMULATION FAILED';
        ui.modalText.textContent = won
            ? `Data shard recovered. Hostiles neutralized ${game.player.kills}/${game.totalEnemies}. Score ${game.player.score}.`
            : 'Personnel asset neutralized. Ares recommends improved obedience and faster reflexes.';
        liebiSfx(won ? 'win' : 'hurt');
        updateHud(true);
    }

    function useNearby() {
        const player = game.player;
        const tx = Math.floor(player.x + Math.cos(player.angle) * 1.05);
        const ty = Math.floor(player.y + Math.sin(player.angle) * 1.05);
        const tile = liebiTileAt(game, tx, ty);
        if (tile === 'D') {
            liebiSetTile(game, tx, ty, '.');
            player.score += 15;
            liebiSfx('door');
            setMessage('SECURITY DOOR OVERRIDE ACCEPTED');
        } else if (tile === 'R') {
            if (player.redKey) {
                liebiSetTile(game, tx, ty, '.');
                player.score += 80;
                liebiSfx('door');
                setMessage('RED KEYCARD ACCEPTED. EXIT ROUTE OPEN.', 2200);
            } else {
                liebiSfx('locked');
                setMessage('RED SECURITY LOCK: KEYCARD REQUIRED', 1500);
            }
        } else {
            setMessage('NO USABLE SURFACE IN RANGE', 650);
        }
    }

    function handlePickups() {
        const player = game.player;
        game.pickups.forEach(pickup => {
            if (pickup.taken || Math.hypot(pickup.x - player.x, pickup.y - player.y) > 0.45) return;
            pickup.taken = true;
            liebiSfx('pickup');
            if (pickup.type === 'A') {
                player.ammo += 12;
                player.score += 40;
                setMessage('PISTOL AMMO CACHE ACQUIRED');
            } else if (pickup.type === 'M') {
                player.health = Math.min(100, player.health + 32);
                player.score += 30;
                setMessage('DOCWAGON FIELD PATCH APPLIED');
            } else if (pickup.type === 'S') {
                player.shard = true;
                player.score += 500;
                setMessage('DATA SHARD SECURED. PROCEED TO EXIT.', 2600);
            } else if (pickup.type === 'K') {
                player.redKey = true;
                player.score += 220;
                setMessage('RED SECURITY KEYCARD ACQUIRED', 2200);
            } else if (pickup.type === 'V') {
                player.armor = Math.min(100, player.armor + 65);
                player.score += 70;
                setMessage('ARMOR VEST SEALED');
            } else if (pickup.type === 'W') {
                player.weapons.shotgun = true;
                player.weapon = 'shotgun';
                player.shells += 8;
                player.score += 180;
                liebiSfx('shotgun');
                setMessage('ARES ROOM-BROOM SHOTGUN ONLINE', 2400);
            }
        });
    }

    function checkExit(now) {
        const player = game.player;
        if (liebiTileAt(game, Math.floor(player.x), Math.floor(player.y)) !== 'X') return;
        if (player.shard && player.redKey) {
            player.score += 1000 + player.health * 3 + player.armor * 2 + player.kills * 120;
            finishGame(true);
        } else if (now - game.exitWarnAt > 1200) {
            game.exitWarnAt = now;
            const missing = [];
            if (!player.shard) missing.push('DATA SHARD');
            if (!player.redKey) missing.push('RED KEYCARD');
            setMessage(`EXIT LOCKED: ${missing.join(' / ')} REQUIRED`);
            liebiSfx('locked');
        }
    }

    function activeWeaponConfig() {
        if (game.player.weapon === 'shotgun' && game.player.weapons.shotgun) {
            return { id: 'shotgun', name: 'ROOM-BROOM', ammoKey: 'shells', cost: 1, damage: 5, range: 6.4, delay: 620, cone: 0.22, pelletTargets: 3 };
        }
        return { id: 'pistol', name: 'ARES PREDATOR', ammoKey: 'ammo', cost: 1, damage: 2, range: 9, delay: 240, cone: 0.085, pelletTargets: 1 };
    }

    function switchWeapon(id) {
        if (id === 'shotgun' && !game.player.weapons.shotgun) {
            setMessage('SHOTGUN NOT ACQUIRED', 900);
            liebiSfx('locked');
            return;
        }
        game.player.weapon = id;
        setMessage(`${activeWeaponConfig().name} SELECTED`, 800);
        updateHud(true);
    }

    function applyPlayerDamage(amount, source) {
        const player = game.player;
        const armorBlock = Math.min(player.armor, Math.ceil(amount * 0.55));
        player.armor -= armorBlock;
        player.health = Math.max(0, player.health - (amount - armorBlock));
        game.damageFlash = 0.42;
        setMessage(source, 900);
        liebiSfx('hurt');
        if (player.health <= 0) finishGame(false);
    }

    function shoot(now) {
        const player = game.player;
        const weapon = activeWeaponConfig();
        if (game.won || game.lost || now - game.lastShot < weapon.delay) return;
        if (player[weapon.ammoKey] < weapon.cost) {
            setMessage('WEAPON DRY');
            AudioEngine.errorBuzz();
            game.lastShot = now;
            return;
        }

        player[weapon.ammoKey] -= weapon.cost;
        game.lastShot = now;
        game.muzzle = weapon.id === 'shotgun' ? 0.22 : 0.12;
        game.recoil = weapon.id === 'shotgun' ? 0.35 : 0.16;
        liebiSfx(weapon.id === 'shotgun' ? 'shotgun' : 'shot');

        const targets = [];
        game.enemies.forEach(enemy => {
            if (enemy.dead) return;
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const distance = Math.hypot(dx, dy);
            const angle = Math.abs(normalizeAngle(Math.atan2(dy, dx) - player.angle));
            const tolerance = weapon.cone + Math.min(0.16, 0.18 / Math.max(1, distance));
            if (distance < weapon.range && angle < tolerance && liebiLineOfSight(game, player.x, player.y, enemy.x, enemy.y)) {
                targets.push({ enemy, distance, angle });
            }
        });
        targets.sort((a, b) => a.distance - b.distance);

        if (!targets.length) {
            setMessage('ROUND IMPACT: NO TARGET LOCK', 750);
            return;
        }

        let killed = 0;
        targets.slice(0, weapon.pelletTargets).forEach((targetInfo, index) => {
            const target = targetInfo.enemy;
            const falloff = weapon.id === 'shotgun' ? Math.max(0.45, 1 - targetInfo.distance / 9 - index * 0.12) : 1;
            const damage = Math.max(1, Math.round(weapon.damage * falloff));
            target.hp -= damage;
            target.hitFlash = 0.18;
            target.alert = true;
            player.score += 35 + damage * 12;
            if (target.hp <= 0 && !target.dead) {
                target.dead = true;
                killed++;
                player.kills++;
                player.score += target.type === 'ic' ? 260 : (target.type === 'drone' ? 190 : 150);
            }
        });

        liebiSfx('hit');
        setMessage(killed ? `${killed} HOSTILE${killed === 1 ? '' : 'S'} NEUTRALIZED` : 'TARGET ARMOR BREACHED', killed ? 1400 : 700);
    }

    function updateGame(delta, now) {
        if (game.won || game.lost) return;
        const player = game.player;
        const turnSpeed = 2.45;
        const moveSpeed = 2.25;
        const strafeSpeed = 1.85;

        if (game.keys.has('a')) player.angle -= turnSpeed * delta;
        if (game.keys.has('d')) player.angle += turnSpeed * delta;
        player.angle = normalizeAngle(player.angle);

        let forward = 0;
        let strafe = 0;
        if (game.keys.has('w')) forward += 1;
        if (game.keys.has('s')) forward -= 1;
        if (game.keys.has('e')) strafe += 1;
        if (game.keys.has('q')) strafe -= 1;

        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        const dx = (cos * forward * moveSpeed + Math.cos(player.angle + Math.PI / 2) * strafe * strafeSpeed) * delta;
        const dy = (sin * forward * moveSpeed + Math.sin(player.angle + Math.PI / 2) * strafe * strafeSpeed) * delta;
        if (dx || dy) liebiTryMoveEntity(game, player, dx, dy);

        handlePickups();
        checkExit(now);

        game.damageFlash = Math.max(0, game.damageFlash - delta * 2.8);
        game.muzzle = Math.max(0, game.muzzle - delta);
        game.recoil = Math.max(0, game.recoil - delta * 2.4);
        game.enemies.forEach(enemy => {
            enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
            if (enemy.dead) return;

            const enemyDx = player.x - enemy.x;
            const enemyDy = player.y - enemy.y;
            const distance = Math.hypot(enemyDx, enemyDy);
            const canSee = distance < 8.8 && liebiLineOfSight(game, enemy.x, enemy.y, player.x, player.y);
            if (canSee) enemy.alert = true;
            if (!enemy.alert) return;

            if (distance > enemy.attackRange * 0.78) {
                liebiTryMoveEntity(game, enemy, (enemyDx / distance) * enemy.speed * delta, (enemyDy / distance) * enemy.speed * delta);
            }

            if (canSee && distance <= enemy.attackRange && now - enemy.lastAttack > enemy.attackDelay) {
                enemy.lastAttack = now;
                applyPlayerDamage(enemy.damage, enemy.type === 'ic' ? 'IC SPIKE DETECTED' : (enemy.type === 'drone' ? 'DRONE IMPACT TRAUMA' : 'SECURITY BURST IMPACT'));
            }
        });
    }

    function drawWalls() {
        const ceilingGradient = ctx.createLinearGradient(0, 0, 0, height / 2);
        ceilingGradient.addColorStop(0, '#0b1024');
        ceilingGradient.addColorStop(0.58, '#050713');
        ceilingGradient.addColorStop(1, '#020402');
        ctx.fillStyle = ceilingGradient;
        ctx.fillRect(0, 0, width, height / 2);
        const floorGradient = ctx.createLinearGradient(0, height / 2, 0, height);
        floorGradient.addColorStop(0, '#03100c');
        floorGradient.addColorStop(1, '#000100');
        ctx.fillStyle = floorGradient;
        ctx.fillRect(0, height / 2, width, height / 2);

        for (let y = Math.floor(height / 2); y < height; y += 8) {
            const alpha = (y - height / 2) / (height / 2);
            ctx.fillStyle = `rgba(32, 194, 14, ${0.025 + alpha * 0.035})`;
            ctx.fillRect(0, y, width, 1);
        }

        for (let x = 0; x < width; x++) {
            const rayAngle = game.player.angle - fov / 2 + (x / width) * fov;
            const ray = liebiCastRay(game, rayAngle);
            const corrected = ray.distance * Math.cos(rayAngle - game.player.angle);
            zBuffer[x] = corrected;
            const wallHeight = Math.min(height * 1.7, height / corrected);
            const y = Math.floor(height / 2 - wallHeight / 2);
            const shade = Math.max(0.15, 1 - corrected / 11) * (ray.side ? 0.74 : 1);
            const base = ray.tile === 'R' ? [255, 51, 51] : (ray.tile === 'D' ? [255, 176, 0] : [32, 194, 14]);
            const drawHeight = Math.ceil(wallHeight);
            const wallTop = y;
            if (ray.tile === '#' && liebiAssets.ready('wallChip')) {
                const texture = liebiAssets.images.wallChip;
                const texX = Math.max(0, Math.min(texture.naturalWidth - 1, Math.floor(ray.wallX * texture.naturalWidth)));
                ctx.drawImage(texture, texX, 0, 1, texture.naturalHeight, x, wallTop, 1, drawHeight);
                ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, 0.58 - shade * 0.42)})`;
                ctx.fillRect(x, wallTop, 1, drawHeight);
                ctx.fillStyle = `rgba(32, 194, 14, ${0.05 * shade})`;
                ctx.fillRect(x, wallTop, 1, drawHeight);
            } else {
                ctx.fillStyle = liebiColor(base, shade);
                ctx.fillRect(x, wallTop, 1, drawHeight);
            }
            if (ray.tile === 'D' || ray.tile === 'R') {
                const band = Math.floor(ray.wallX * 8) % 2 === 0;
                ctx.fillStyle = band ? `rgba(0, 0, 0, ${0.25 + (1 - shade) * 0.25})` : `rgba(255, 255, 255, ${0.045 * shade})`;
                ctx.fillRect(x, wallTop, 1, drawHeight);
            }
            if (x % 7 === 0) {
                ctx.fillStyle = `rgba(0, 212, 170, ${0.08 * shade})`;
                ctx.fillRect(x, wallTop, 1, drawHeight);
            }
        }
    }

    function drawSpriteFrame(image, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (!image || !image.naturalWidth || !image.naturalHeight) return false;
        const sourceX = Math.max(0, Math.min(image.naturalWidth - 1, sx));
        const sourceY = Math.max(0, Math.min(image.naturalHeight - 1, sy));
        const sourceW = Math.max(1, Math.min(sw, image.naturalWidth - sourceX));
        const sourceH = Math.max(1, Math.min(sh, image.naturalHeight - sourceY));
        ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, dx, dy, dw, dh);
        return true;
    }

    function drawEnemySprite(enemy, screenX, screenY, size, now) {
        const half = size / 2;
        const frameSeed = Math.floor(now / 140 + enemy.x * 2 + enemy.y);
        if ((enemy.type === 'drone' || enemy.type === 'ic') && liebiAssets.ready(enemy.type === 'ic' ? 'enemyD' : 'enemyC')) {
            const sheetKey = enemy.type === 'ic' ? 'enemyD' : 'enemyC';
            const sheet = liebiAssets.images[sheetKey];
            const cols = enemy.type === 'ic' ? 8 : 8;
            const frameCount = enemy.type === 'ic' ? 8 : 16;
            const frame = frameSeed % frameCount;
            const sx = (frame % cols) * 64;
            const sy = Math.floor(frame / cols) * 64;
            ctx.save();
            ctx.globalAlpha = enemy.hitFlash > 0 ? 0.68 : 0.98;
            if (enemy.hitFlash > 0) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(screenX - half * 0.72, screenY - half * 0.72, size * 0.95, size * 0.95);
            }
            drawSpriteFrame(sheet, sx, sy, 64, 64, screenX - half, screenY - half, size, size);
            ctx.restore();
            return;
        }

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.globalAlpha = enemy.hitFlash > 0 ? 1 : 0.94;
        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : (enemy.type === 'ic' ? '#150016' : (enemy.type === 'guard' ? '#141008' : '#07110b'));
        ctx.strokeStyle = enemy.type === 'ic' ? '#ff00ff' : (enemy.type === 'guard' ? '#ffb000' : '#ff3333');
        ctx.lineWidth = Math.max(1, size / 36);
        if (enemy.type === 'ic') {
            ctx.beginPath();
            ctx.moveTo(0, -half);
            ctx.lineTo(half * 0.75, 0);
            ctx.lineTo(0, half);
            ctx.lineTo(-half * 0.75, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffb000';
            ctx.fillRect(-size * 0.16, -size * 0.05, size * 0.32, size * 0.1);
        } else if (enemy.type === 'guard') {
            ctx.fillRect(-half * 0.34, -half * 0.72, size * 0.68, size * 0.9);
            ctx.strokeRect(-half * 0.34, -half * 0.72, size * 0.68, size * 0.9);
            ctx.fillStyle = '#20c20e';
            ctx.fillRect(-half * 0.22, -half * 0.52, size * 0.44, size * 0.08);
            ctx.strokeStyle = '#ff3333';
            ctx.beginPath();
            ctx.moveTo(half * 0.25, -half * 0.12);
            ctx.lineTo(half * 0.78, half * 0.08);
            ctx.stroke();
        } else {
            ctx.fillRect(-half * 0.72, -half * 0.55, size * 0.72, size * 0.72);
            ctx.strokeRect(-half * 0.72, -half * 0.55, size * 0.72, size * 0.72);
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(-half * 0.52, -half * 0.31, size * 0.34, size * 0.08);
            ctx.strokeStyle = '#00d4aa';
            ctx.beginPath();
            ctx.moveTo(-half * 0.72, half * 0.05);
            ctx.lineTo(-half, half * 0.32);
            ctx.moveTo(0, half * 0.05);
            ctx.lineTo(half * 0.28, half * 0.32);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawPickupSprite(pickup, screenX, screenY, size, now) {
        const pulse = 0.82 + Math.sin(now * 0.004 + pickup.pulse) * 0.18;
        const drawSize = size * pulse;
        ctx.save();
        ctx.translate(screenX, screenY);
        const pickupColor = {
            S: '#ffb000',
            M: '#ff3333',
            K: '#ff3333',
            V: '#20c20e',
            W: '#ffb000',
            A: '#00d4aa'
        }[pickup.type] || '#00d4aa';
        const pickupLabel = {
            S: 'DATA',
            M: '+',
            K: 'KEY',
            V: 'ARM',
            W: 'SG',
            A: 'AMMO'
        }[pickup.type] || 'ITEM';
        const sprite = {
            A: ['pistols', 64, 0, 32, 32],
            W: ['shotguns', 0, 0, 64, 32],
            K: ['neonpunk', 0, 0, 32, 32],
            S: ['neonpunk', 32, 0, 32, 32],
            V: ['armor', 0, 0, 32, 32],
            M: ['neonpunk', 64, 0, 32, 32]
        }[pickup.type];
        ctx.strokeStyle = pickupColor;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        if (sprite && liebiAssets.ready(sprite[0])) {
            const image = liebiAssets.images[sprite[0]];
            const [sheetKey, sx, sy, sw, sh] = sprite;
            const spriteSize = drawSize * (pickup.type === 'W' ? 0.96 : 0.78);
            drawSpriteFrame(image, sx, sy, sw, sh, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
        } else {
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = `${Math.max(8, Math.floor(drawSize * 0.36))}px ${liebiFontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pickupLabel, 0, 0);
        }
        ctx.restore();
    }

    function drawExitSprite(now) {
        const dx = game.exit.x - game.player.x;
        const dy = game.exit.y - game.player.y;
        drawBillboard({ x: game.exit.x, y: game.exit.y }, 0.42, (screenX, screenY, size) => {
            ctx.save();
            ctx.translate(screenX, screenY);
            const exitOpen = game.player.shard && game.player.redKey;
            ctx.strokeStyle = exitOpen ? '#20c20e' : '#8b6914';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
            ctx.globalAlpha = Math.max(0.55, 0.9 - Math.hypot(dx, dy) * 0.04);
            ctx.strokeRect(-size / 2, -size / 2, size, size);
            ctx.fillRect(-size / 2, -size / 2, size, size);
            ctx.fillStyle = exitOpen ? '#20c20e' : '#ffb000';
            ctx.font = `${Math.max(7, Math.floor(size * 0.25))}px ${liebiFontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(exitOpen ? 'EXIT' : 'LOCK', 0, Math.sin(now * 0.005) * 2);
            ctx.restore();
        });
    }

    function drawBillboard(sprite, sizeScale, drawCallback) {
        const dx = sprite.x - game.player.x;
        const dy = sprite.y - game.player.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 0.2) return;
        const angle = normalizeAngle(Math.atan2(dy, dx) - game.player.angle);
        if (Math.abs(angle) > fov / 2 + 0.25) return;
        const screenX = (0.5 + angle / fov) * width;
        const size = Math.min(120, Math.max(8, (height / distance) * sizeScale));
        const screenY = height / 2 + size * 0.2;
        const bufferIndex = Math.max(0, Math.min(width - 1, Math.floor(screenX)));
        if (distance > zBuffer[bufferIndex] + 0.15) return;
        drawCallback(screenX, screenY, size, distance);
    }

    function drawSprites(now) {
        const sprites = [];
        game.pickups.forEach(pickup => {
            if (!pickup.taken) sprites.push({ kind: 'pickup', item: pickup, dist: Math.hypot(pickup.x - game.player.x, pickup.y - game.player.y) });
        });
        game.enemies.forEach(enemy => {
            if (!enemy.dead) sprites.push({ kind: 'enemy', item: enemy, dist: Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) });
        });
        sprites.sort((a, b) => b.dist - a.dist);
        sprites.forEach(sprite => {
            drawBillboard(sprite.item, sprite.kind === 'enemy' ? 0.76 : 0.36, (screenX, screenY, size) => {
                if (sprite.kind === 'enemy') drawEnemySprite(sprite.item, screenX, screenY, size, now);
                else drawPickupSprite(sprite.item, screenX, screenY, size, now);
            });
        });
        drawExitSprite(now);
    }

    function drawWeapon() {
        const bob = Math.sin(performance.now() * 0.008) * 1.5 + game.recoil * 12;
        const shotgun = game.player.weapon === 'shotgun' && game.player.weapons.shotgun;
        const weaponSheet = shotgun ? 'shotguns' : 'pistols';
        const weaponImage = liebiAssets.images[weaponSheet];
        if (liebiAssets.ready(weaponSheet)) {
            const spriteWidth = shotgun ? 96 : 72;
            const spriteHeight = shotgun ? 48 : 42;
            const sx = shotgun ? 0 : 0;
            const sy = 0;
            ctx.save();
            ctx.shadowColor = shotgun ? '#ffb000' : '#20c20e';
            ctx.shadowBlur = 4;
            drawSpriteFrame(weaponImage, sx, sy, shotgun ? 96 : 64, 32, width / 2 - spriteWidth / 2, height - spriteHeight - 2 + bob, spriteWidth, spriteHeight);
            ctx.restore();
            if (game.muzzle > 0) {
                ctx.fillStyle = '#ffb000';
                ctx.beginPath();
                ctx.moveTo(width / 2 + (shotgun ? 44 : 32), height - spriteHeight + bob);
                ctx.lineTo(width / 2 + (shotgun ? 68 : 48), height - spriteHeight - 9 + bob);
                ctx.lineTo(width / 2 + (shotgun ? 57 : 39), height - spriteHeight + 13 + bob);
                ctx.fill();
            }
            return;
        }

        ctx.fillStyle = '#050505';
        ctx.fillRect(width / 2 - (shotgun ? 42 : 28), height - 38 + bob, shotgun ? 84 : 56, 38);
        ctx.strokeStyle = shotgun ? '#ffb000' : '#20c20e';
        ctx.strokeRect(width / 2 - (shotgun ? 38 : 24), height - 34 + bob, shotgun ? 76 : 48, 30);
        ctx.fillStyle = '#1a2c1a';
        ctx.fillRect(width / 2 - (shotgun ? 28 : 14), height - 50 + bob, shotgun ? 56 : 28, 26);
        ctx.strokeStyle = '#00d4aa';
        ctx.strokeRect(width / 2 - (shotgun ? 28 : 14), height - 50 + bob, shotgun ? 56 : 28, 26);
        if (game.muzzle > 0) {
            ctx.fillStyle = '#ffb000';
            ctx.beginPath();
            ctx.moveTo(width / 2, height - 58 + bob);
            ctx.lineTo(width / 2 - (shotgun ? 28 : 14), height - (shotgun ? 92 : 80) + bob);
            ctx.lineTo(width / 2 + (shotgun ? 30 : 15), height - (shotgun ? 88 : 77) + bob);
            ctx.fill();
        }
    }

    function drawMinimap() {
        if (!game.minimap) return;
        const scale = 4;
        const ox = 8;
        const oy = 8;
        ctx.save();
        ctx.globalAlpha = 0.84;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.66)';
        ctx.fillRect(ox - 3, oy - 3, game.map[0].length * scale + 6, game.map.length * scale + 6);
        for (let y = 0; y < game.map.length; y++) {
            for (let x = 0; x < game.map[y].length; x++) {
                const tile = game.map[y][x];
                if (tile === '#') ctx.fillStyle = '#176d12';
                else if (tile === 'D') ctx.fillStyle = '#8b6914';
                else if (tile === 'R') ctx.fillStyle = '#a32020';
                else if (tile === 'X') ctx.fillStyle = '#00d4aa';
                else ctx.fillStyle = 'rgba(32,194,14,0.12)';
                ctx.fillRect(ox + x * scale, oy + y * scale, scale - 1, scale - 1);
            }
        }
        game.enemies.forEach(enemy => {
            if (enemy.dead) return;
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(ox + enemy.x * scale - 1, oy + enemy.y * scale - 1, 2, 2);
        });
        ctx.fillStyle = '#ffb000';
        ctx.beginPath();
        ctx.arc(ox + game.player.x * scale, oy + game.player.y * scale, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffb000';
        ctx.beginPath();
        ctx.moveTo(ox + game.player.x * scale, oy + game.player.y * scale);
        ctx.lineTo(ox + (game.player.x + Math.cos(game.player.angle) * 1.2) * scale, oy + (game.player.y + Math.sin(game.player.angle) * 1.2) * scale);
        ctx.stroke();
        ctx.restore();
    }

    function drawCrosshair() {
        ctx.save();
        ctx.strokeStyle = game.player.weapon === 'shotgun' ? 'rgba(255,176,0,0.72)' : 'rgba(32,194,14,0.72)';
        ctx.lineWidth = 1;
        const cx = Math.floor(width / 2);
        const cy = Math.floor(height / 2);
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx - 2, cy);
        ctx.moveTo(cx + 2, cy);
        ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx, cy - 2);
        ctx.moveTo(cx, cy + 2);
        ctx.lineTo(cx, cy + 6);
        ctx.stroke();
        ctx.restore();
    }

    function renderGame(now) {
        drawWalls();
        drawSprites(now);
        drawCrosshair();
        drawWeapon();
        drawMinimap();

        if (now < game.messageUntil) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
            ctx.fillRect(0, 0, width, 16);
            ctx.fillStyle = '#ffb000';
            ctx.font = `8px ${liebiFontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(game.message, width / 2, 8);
        }

        if (game.damageFlash > 0) {
            ctx.fillStyle = `rgba(255, 51, 51, ${Math.min(0.32, game.damageFlash)})`;
            ctx.fillRect(0, 0, width, height);
        }
    }

    function updateHud(force = false) {
        const player = game.player;
        const liveEnemies = game.enemies.filter(enemy => !enemy.dead).length;
        const status = game.won ? 'EXTRACTED' : (game.lost ? 'FLATLINED' : (nowStatus() || 'RUNNING'));
        const message = performance.now() < game.messageUntil ? game.message : status;
        const weapon = activeWeaponConfig();
        const key = `${player.health}|${player.armor}|${player.ammo}|${player.shells}|${player.weapon}|${player.weapons.shotgun}|${player.shard}|${player.redKey}|${player.score}|${player.kills}|${liveEnemies}|${message}|${game.minimap}|${game.won}|${game.lost}`;
        if (!force && key === hudCache) return;
        hudCache = key;
        ui.health.textContent = `${String(player.health).padStart(3, '0')}%`;
        ui.healthBar.style.transform = `scaleX(${Math.max(0, player.health) / 100})`;
        ui.armor.textContent = `${String(player.armor).padStart(3, '0')}%`;
        ui.armorBar.style.transform = `scaleX(${Math.max(0, player.armor) / 100})`;
        ui.ammo.textContent = `P:${String(player.ammo).padStart(2, '0')} S:${String(player.shells).padStart(2, '0')}`;
        ui.weapon.textContent = weapon.name;
        ui.shard.textContent = player.shard ? 'SECURED' : 'MISSING';
        ui.key.textContent = player.redKey ? 'RED OK' : 'NO KEY';
        ui.score.textContent = String(player.score).padStart(5, '0');
        ui.status.textContent = `${message}\nKILLS: ${player.kills}/${game.totalEnemies}  HOSTILES: ${liveEnemies}\nMINIMAP: ${game.minimap ? 'ON' : 'OFF'}`;
    }

    function nowStatus() {
        if (!game.player.weapons.shotgun) return 'FIND ARMORY CACHE';
        if (!game.player.redKey) return 'FIND RED KEYCARD';
        if (!game.player.shard) return 'RECOVER DATA SHARD';
        return 'UNLOCK EXIT AND EXTRACT';
    }

    function gameLoop(timestamp = 0) {
        if (closed) return;
        if (document.hidden) {
            lastTime = timestamp;
            frameId = requestAnimationFrame(gameLoop);
            return;
        }

        const delta = lastTime ? Math.min(0.05, Math.max(0, (timestamp - lastTime) / 1000)) : 0.016;
        lastTime = timestamp;
        updateGame(delta, timestamp);
        renderGame(timestamp);
        updateHud();
        frameId = requestAnimationFrame(gameLoop);
    }

    function handleKeyDown(event) {
        const key = event.key.toLowerCase();
        const handled = ['w', 'a', 's', 'd', 'q', 'e', 'f', 'm', '1', '2', 'escape'].includes(key) || event.code === 'Space';
        if (!handled) return;
        event.preventDefault();
        event.stopPropagation();

        if (key === 'escape') {
            closeLiebiGame();
            return;
        }
        if (key === 'f' && !event.repeat) {
            useNearby();
            return;
        }
        if (key === 'm' && !event.repeat) {
            game.minimap = !game.minimap;
            updateHud(true);
            return;
        }
        if (key === '1' && !event.repeat) {
            switchWeapon('pistol');
            return;
        }
        if (key === '2' && !event.repeat) {
            switchWeapon('shotgun');
            return;
        }
        if (event.code === 'Space') {
            if (!event.repeat) shoot(performance.now());
            return;
        }
        game.keys.add(key);
    }

    function handleKeyUp(event) {
        game.keys.delete(event.key.toLowerCase());
    }

    function cleanup() {
        if (closed) return;
        closed = true;
        if (frameId) cancelAnimationFrame(frameId);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        ui.close.removeEventListener('click', closeLiebiGame);
        ui.exit.removeEventListener('click', closeLiebiGame);
        ui.restart.removeEventListener('click', restart);
        overlay.remove();
        liebiGameCleanup = null;
    }

    function restart() {
        cleanup();
        setTimeout(startLiebiGame, 60);
    }

    liebiGameCleanup = cleanup;
    ui.close.addEventListener('click', closeLiebiGame);
    ui.exit.addEventListener('click', closeLiebiGame);
    ui.restart.addEventListener('click', restart);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    AudioEngine.bootBeep();
    setMessage('BLACKSITE BREACH SIMULATION STARTED', 1800);
    renderGame(performance.now());
    updateHud(true);
    frameId = requestAnimationFrame(gameLoop);
}

// ========================================
// SECRET MINI-GAME
// ========================================
function loadGameHighScores() {
    try {
        const storedScores = JSON.parse(localStorage.getItem('rocketGameScores') || '[]');
        return Array.isArray(storedScores) ? storedScores : [];
    } catch (error) {
        return [];
    }
}

function saveGameHighScores() {
    try {
        localStorage.setItem('rocketGameScores', JSON.stringify(gameHighScores));
    } catch (error) {}
}

function cleanScoreName(name) {
    return String(name || 'PILOT')
        .replace(/[^\w -]/g, '')
        .trim()
        .slice(0, 10)
        .toUpperCase() || 'PILOT';
}

let gameHighScores = loadGameHighScores();

function startMiniGame() {
    if (document.getElementById('gameOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'gameOverlay';
    overlay.innerHTML = `
        <style>
            #gameOverlay {
                position: fixed; inset: 0; background: #000; z-index: 500;
                display: grid;
                grid-template-rows: auto minmax(0, 1fr) auto;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 8px 14px;
                padding: 12px clamp(12px, 2vw, 28px);
                font-family: var(--terminal-font, "Courier New", monospace);
                box-sizing: border-box;
                overflow: hidden;
            }
            #gameTop { grid-column: 1 / 3; display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
            #gameTitle { color: #ffb000; font-size: clamp(16px, 2.2vh, 26px); text-shadow: 0 0 10px rgba(255, 176, 0, 0.5); letter-spacing: 0.12em; }
            #gameUI { color: #20c20e; font-size: clamp(11px, 1.7vh, 18px); display: flex; gap: clamp(10px, 2vw, 28px); flex-wrap: wrap; }
            #gameUI .hud-amber { color: #ffb000; }
            #gameUI .hud-cyan { color: #00d4aa; }
            #gameUI .hud-red { color: #ff4040; }
            #gameStage { position: relative; min-width: 0; min-height: 0; display: grid; place-items: center; }
            #gameCanvas { border: 2px solid #20c20e; box-shadow: 0 0 30px rgba(32, 194, 14, 0.5); background: #000; max-width: 100%; max-height: 100%; }
            #leaderboard {
                align-self: center;
                background: rgba(0, 20, 0, 0.8); border: 1px solid #20c20e; padding: clamp(8px, 1.6vh, 18px) 14px;
                color: #20c20e; width: clamp(150px, 14vw, 220px); max-height: 100%; overflow: hidden;
                font-size: clamp(10px, 1.5vh, 14px);
            }
            #leaderboard h3 { color: #ffb000; margin: 0 0 0.7em; text-align: center; font-size: 1.05em; }
            #leaderboard ol { margin: 0; padding-left: 1.8em; }
            #leaderboard li { margin: 0.32em 0; white-space: nowrap; }
            .score-name { color: #00d4aa; }
            .score-value { color: #ffb000; float: right; }
            #gameInstructions { grid-column: 1 / 3; color: #8a8; font-size: clamp(10px, 1.5vh, 15px); text-align: center; letter-spacing: 0.05em; }
            #gameInstructions b { color: #20c20e; font-weight: 400; }
            #gameOver {
                display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.95); border: 2px solid #ffb000; padding: clamp(16px, 3vh, 40px) clamp(20px, 3vw, 48px);
                text-align: center; z-index: 10; max-width: 90%;
            }
            #gameOver h2 { color: #ffb000; font-size: clamp(18px, 3vh, 30px); margin: 0 0 0.5em; }
            #gameOver .final-score { color: #20c20e; font-size: clamp(26px, 5vh, 46px); margin: 0.4em 0; }
            #gameOver p { color: #888; margin: 0.6em 0; }
            #gameOver input { background: #0a0a15; border: 1px solid #20c20e; color: #20c20e; font-family: inherit; font-size: clamp(14px, 2vh, 20px); padding: 8px 16px; margin: 8px; text-align: center; width: 200px; }
            #gameOver button { background: #20c20e; border: none; color: #000; font-family: inherit; font-size: clamp(12px, 1.8vh, 17px); padding: 10px 24px; margin: 8px; cursor: pointer; }
            #gameOver button:hover { background: #39ff14; }
            #gameOver button.secondary { background: transparent; border: 1px solid #888; color: #888; }
        </style>
        <div id="gameTop">
            <div id="gameTitle">◈ ARES STRIKE VECTOR ◈</div>
            <div id="gameUI">
                <span>SCORE <span class="hud-amber" id="scoreDisplay">0</span></span>
                <span>HI <span class="hud-cyan" id="hiDisplay">0</span></span>
                <span>WAVE <span class="hud-amber" id="waveDisplay">1</span></span>
                <span>SHIPS <span class="hud-red" id="livesDisplay">▲▲▲</span></span>
                <span>GUN <span class="hud-cyan" id="gunDisplay">I</span></span>
            </div>
        </div>
        <div id="gameStage"><canvas id="gameCanvas" width="860" height="520"></canvas>
            <div id="gameOver">
                <h2 id="gameOverTitle">SIGNAL LOST</h2>
                <div class="final-score" id="finalScore">0</div>
                <p>Enter your callsign:</p>
                <input type="text" id="playerName" maxlength="10" placeholder="PILOT"><br>
                <button id="submitScoreBtn">SUBMIT SCORE</button>
                <button class="secondary" id="exitGameBtn">EXIT</button>
            </div>
        </div>
        <div id="leaderboard"><h3>◆ HIGH SCORES ◆</h3><ol id="scoreList"></ol></div>
        <div id="gameInstructions"><b>←↑↓→</b>/<b>WASD</b> move &nbsp;|&nbsp; <b>SPACE</b> hold to fire &nbsp;|&nbsp; <b>P</b> pause &nbsp;|&nbsp; <b>ESC</b> exit &nbsp;—&nbsp; grab <b>[W]</b>eapon <b>[S]</b>peed <b>[O]</b>ption <b>[E]</b>shield <b>[X]</b>bomb pods</div>
    `;
    document.body.appendChild(overlay);

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) {
        overlay.remove();
        if (typeof print === 'function') print('STRIKE VECTOR ABORTED: no 2D canvas support.', 't-red');
        return;
    }

    // Fit the fixed game resolution into the available stage (CSS scaling).
    const W = canvas.width, H = canvas.height;
    function fitCanvas() {
        const stage = document.getElementById('gameStage');
        if (!stage) return;
        const scale = Math.min(stage.clientWidth / W, stage.clientHeight / H, 1.35);
        canvas.style.width = `${Math.floor(W * Math.max(0.4, scale))}px`;
        canvas.style.height = `${Math.floor(H * Math.max(0.4, scale))}px`;
    }
    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    /* ---------------- state ---------------- */
    const hud = {
        score: document.getElementById('scoreDisplay'),
        hi: document.getElementById('hiDisplay'),
        wave: document.getElementById('waveDisplay'),
        lives: document.getElementById('livesDisplay'),
        gun: document.getElementById('gunDisplay')
    };
    const GUN_LABELS = ['I', 'II', 'III', 'IV', 'MAX'];
    let score = 0, lives = 3, wave = 0, gameOver = false, paused = false, closing = false;
    let shots = [], enemyShots = [], enemies = [], powerups = [], particles = [], options = [];
    let spawnQueue = [], waveBannerT = 0, betweenWavesT = 1.2, boss = null, shake = 0, flashT = 0;
    let lastTime = 0, gameFrame = null, fireHeld = false, fireCooldown = 0, time = 0;
    const keys = {};

    const ship = {
        x: 90, y: H / 2, r: 9, speed: 280, gun: 0, shield: 0,
        inv: 2.2, trail: []
    };
    const stars = Array.from({ length: 110 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        speed: 22 + Math.random() * 120, size: Math.random() * 1.8 + 0.4
    }));

    /* ---------------- audio blips ---------------- */
    function blip(freq, endFreq, dur, gain, type) {
        if (!AudioEngine.canPlay()) return;
        try {
            const c = AudioEngine.ctx;
            const osc = c.createOscillator(), g = c.createGain();
            osc.connect(g); g.connect(c.destination);
            osc.type = type || 'square';
            osc.frequency.setValueAtTime(freq, c.currentTime);
            if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), c.currentTime + dur);
            g.gain.setValueAtTime(gain || 0.05, c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
            osc.start(); osc.stop(c.currentTime + dur + 0.02);
        } catch (_) {}
    }
    const sfx = {
        fire: () => blip(420, 120, 0.07, 0.028, 'square'),
        hit: () => blip(180, 60, 0.08, 0.05, 'sawtooth'),
        boom: () => { blip(120, 28, 0.28, 0.07, 'sawtooth'); blip(60, 24, 0.4, 0.05, 'triangle'); },
        power: () => { blip(330, 660, 0.12, 0.05, 'triangle'); blip(660, 990, 0.14, 0.04, 'triangle'); },
        hurt: () => { blip(220, 40, 0.4, 0.09, 'sawtooth'); },
        boss: () => { blip(55, 110, 0.7, 0.07, 'sawtooth'); },
        bomb: () => { blip(400, 30, 0.6, 0.09, 'sawtooth'); }
    };

    /* ---------------- helpers ---------------- */
    function rand(a, b) { return a + Math.random() * (b - a); }
    function addScore(n) {
        score += n;
        hud.score.textContent = score;
        if (score > hiScore()) hud.hi.textContent = score;
    }
    function hiScore() { return gameHighScores.length ? Number(gameHighScores[0].score) || 0 : 0; }
    function burst(x, y, color, count, speed) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2, v = rand(20, speed || 160);
            particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.7), color });
        }
    }
    function updateLivesHud() { hud.lives.textContent = '▲'.repeat(Math.max(0, lives)) || '—'; }
    function updateGunHud() {
        hud.gun.textContent = GUN_LABELS[ship.gun] + (ship.shield > 0 ? ` ◯${ship.shield}` : '') + (options.length ? ` +${options.length}` : '');
    }

    /* ---------------- enemies & waves ---------------- */
    // type: hp, radius, score, color, behavior
    function makeEnemy(type, y) {
        const e = { type, x: W + 40, y: y ?? rand(50, H - 50), t: 0, dead: false, flash: 0 };
        if (type === 'scout') Object.assign(e, { hp: 1, r: 11, pts: 50, vx: -rand(150, 210), amp: rand(8, 26), om: rand(2, 4) });
        else if (type === 'weaver') Object.assign(e, { hp: 1, r: 12, pts: 80, vx: -rand(110, 150), amp: rand(60, 120), om: rand(1.6, 2.6) });
        else if (type === 'diver') Object.assign(e, { hp: 2, r: 12, pts: 120, vx: -rand(170, 220), dive: false });
        else if (type === 'gunner') Object.assign(e, { hp: 3, r: 15, pts: 150, vx: -rand(55, 75), gunT: rand(0.6, 1.4) });
        else if (type === 'tank') Object.assign(e, { hp: 8, r: 22, pts: 300, vx: -rand(35, 50), gunT: rand(1.2, 2) });
        else if (type === 'carrier') Object.assign(e, { hp: 4, r: 16, pts: 200, vx: -rand(70, 95), amp: rand(30, 60), om: 1.2, drop: true });
        e.y0 = e.y;
        return e;
    }

    function queueWave(n) {
        wave = n;
        hud.wave.textContent = wave;
        waveBannerT = 1.8;
        spawnQueue = [];
        if (n % 4 === 0) { // boss wave
            spawnQueue.push({ at: 2.2, boss: true });
            return;
        }
        const k = Math.min(1 + (n - 1) * 0.18, 2.6); // difficulty scale
        let t = 0.8;
        const pattern = n % 4;
        const groups = 4 + Math.min(n, 6);
        for (let g = 0; g < groups; g++) {
            const y = rand(60, H - 60);
            if (pattern === 1 || g % 3 === 0) {
                for (let i = 0; i < Math.round(3 * k); i++) spawnQueue.push({ at: t + i * 0.22, type: 'scout', y });
            } else if (pattern === 2 || g % 3 === 1) {
                for (let i = 0; i < Math.round(2 * k); i++) spawnQueue.push({ at: t + i * 0.3, type: 'weaver', y: rand(60, H - 60) });
                if (g % 2) spawnQueue.push({ at: t + 0.5, type: 'diver' });
            } else {
                spawnQueue.push({ at: t, type: 'gunner' });
                if (n > 2) spawnQueue.push({ at: t + 0.4, type: 'tank' });
                spawnQueue.push({ at: t + 0.8, type: 'diver' });
            }
            t += rand(1.6, 2.3) / Math.sqrt(k);
        }
        // One carrier (power-up mule) per wave, two on later waves.
        spawnQueue.push({ at: t * 0.45, type: 'carrier' });
        if (n >= 5) spawnQueue.push({ at: t * 0.85, type: 'carrier' });
        spawnQueue.sort((a, b) => a.at - b.at);
    }

    function spawnBoss() {
        const tier = Math.floor(wave / 4);
        boss = {
            x: W + 120, y: H / 2, r: 52, t: 0, phase: 0, phaseT: 0,
            hp: 50 + tier * 35, hpMax: 50 + tier * 35, tier,
            gunT: 1, ringT: 3.2, entered: false, flash: 0
        };
        sfx.boss();
    }

    function enemyFire(x, y, speed, spreadCount, aimed) {
        const baseAngle = aimed ? Math.atan2(ship.y - y, ship.x - x) : Math.PI;
        const n = spreadCount || 1;
        for (let i = 0; i < n; i++) {
            const a = baseAngle + (i - (n - 1) / 2) * 0.22;
            enemyShots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4 });
        }
    }

    /* ---------------- power-ups ---------------- */
    const POWER_TYPES = ['W', 'W', 'S', 'O', 'E', 'X']; // weapon weighted
    function dropPowerup(x, y, forceType) {
        const type = forceType || POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
        powerups.push({ x, y, type, t: 0 });
    }
    function applyPowerup(p) {
        sfx.power();
        burst(p.x, p.y, '#ffb000', 14, 120);
        if (p.type === 'W') {
            if (ship.gun < 4) ship.gun++;
            else addScore(300);
        } else if (p.type === 'S') {
            ship.speed = Math.min(430, ship.speed + 35);
            if (ship.speed >= 430) addScore(200);
        } else if (p.type === 'O') {
            if (options.length < 2) options.push({ x: ship.x - 30, y: ship.y, hist: [] });
            else addScore(300);
        } else if (p.type === 'E') {
            ship.shield = Math.min(3, ship.shield + 1);
        } else if (p.type === 'X') {
            smartBomb();
        }
        updateGunHud();
    }
    function smartBomb() {
        sfx.bomb();
        flashT = 0.32;
        shake = 14;
        enemyShots = [];
        enemies.forEach(e => {
            e.hp -= 6;
            e.flash = 0.2;
            if (e.hp <= 0) killEnemy(e, false);
        });
        enemies = enemies.filter(e => !e.dead);
        if (boss && boss.entered) {
            boss.hp -= 8;
            boss.flash = 0.25;
        }
    }

    /* ---------------- combat ---------------- */
    function playerFire(dt) {
        fireCooldown -= dt;
        if (!fireHeld || fireCooldown > 0) return;
        const g = ship.gun;
        const cadence = [0.24, 0.21, 0.19, 0.16, 0.14][g];
        fireCooldown = cadence;
        sfx.fire();
        const emit = (x, y) => {
            const dmg = g >= 4 ? 2 : 1;
            shots.push({ x: x + 14, y, vx: 560, vy: 0, dmg });
            if (g >= 1) shots.push({ x: x + 10, y: y - 9, vx: 560, vy: 0, dmg: 1 });
            if (g >= 1) shots.push({ x: x + 10, y: y + 9, vx: 560, vy: 0, dmg: 1 });
            if (g >= 2) shots.push({ x: x + 6, y, vx: 530, vy: -110, dmg: 1 });
            if (g >= 2) shots.push({ x: x + 6, y, vx: 530, vy: 110, dmg: 1 });
            if (g >= 3) shots.push({ x: x - 6, y, vx: -480, vy: 0, dmg: 1 }); // rear gun
        };
        emit(ship.x, ship.y);
        options.forEach(o => emit(o.x, o.y));
    }

    function killEnemy(e, withDrop = true) {
        if (e.dead) return;
        e.dead = true;
        addScore(e.pts);
        sfx.boom();
        burst(e.x, e.y, e.type === 'carrier' ? '#ffb000' : '#39ff14', 16, 180);
        shake = Math.max(shake, 5);
        if (e.drop) dropPowerup(e.x, e.y);
        else if (withDrop && Math.random() < 0.07) dropPowerup(e.x, e.y);
    }

    function hitPlayer() {
        if (ship.inv > 0 || gameOver) return;
        if (ship.shield > 0) {
            ship.shield--;
            ship.inv = 1.2;
            sfx.hit();
            burst(ship.x, ship.y, '#00d4aa', 18, 200);
            updateGunHud();
            return;
        }
        lives--;
        updateLivesHud();
        sfx.hurt();
        burst(ship.x, ship.y, '#ff4040', 30, 260);
        shake = 16;
        // Death tax: lose some upgrades but never everything (keeps it fun).
        ship.gun = Math.max(0, ship.gun - 1);
        ship.speed = Math.max(280, ship.speed - 35);
        options = options.slice(0, Math.max(0, options.length - 1));
        updateGunHud();
        if (lives <= 0) {
            endGame();
            return;
        }
        ship.inv = 2.4;
        ship.x = 90;
        ship.y = H / 2;
    }

    function endGame() {
        gameOver = true;
        document.getElementById('finalScore').textContent = score;
        document.getElementById('gameOverTitle').textContent = boss ? 'SIGNAL LOST // BOSS ACTIVE' : 'SIGNAL LOST';
        document.getElementById('gameOver').style.display = 'block';
        const input = document.getElementById('playerName');
        if (input) { input.value = ''; input.focus(); }
    }

    /* ---------------- update ---------------- */
    function update(dt) {
        time += dt;
        if (waveBannerT > 0) waveBannerT -= dt;
        if (flashT > 0) flashT -= dt;
        if (shake > 0) shake = Math.max(0, shake - dt * 40);
        if (ship.inv > 0) ship.inv -= dt;

        // movement
        let dx = 0, dy = 0;
        if (keys.ArrowUp || keys.w || keys.W) dy -= 1;
        if (keys.ArrowDown || keys.s || keys.S) dy += 1;
        if (keys.ArrowLeft || keys.a || keys.A) dx -= 1;
        if (keys.ArrowRight || keys.d || keys.D) dx += 1;
        const norm = dx && dy ? 0.7071 : 1;
        ship.x = Math.max(20, Math.min(W * 0.6, ship.x + dx * ship.speed * norm * dt));
        ship.y = Math.max(16, Math.min(H - 16, ship.y + dy * ship.speed * norm * dt));

        // option drones trail the ship (Gradius style)
        ship.trail.unshift({ x: ship.x, y: ship.y });
        if (ship.trail.length > 40) ship.trail.pop();
        options.forEach((o, i) => {
            const lag = (i + 1) * 13;
            const p = ship.trail[Math.min(lag, ship.trail.length - 1)] || ship;
            o.x += (p.x - 34 - o.x) * Math.min(1, dt * 10);
            o.y += (p.y - o.y) * Math.min(1, dt * 10);
        });

        playerFire(dt);

        // stars
        stars.forEach(s => {
            s.x -= s.speed * dt;
            if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
        });

        // wave spawning
        if (!boss) {
            if (!spawnQueue.length && !enemies.length) {
                betweenWavesT -= dt;
                if (betweenWavesT <= 0) {
                    queueWave(wave + 1);
                    betweenWavesT = 1.2;
                }
            }
            const elapsed = time;
            if (!spawnQueue.waveStart) spawnQueue.waveStart = elapsed;
            while (spawnQueue.length && elapsed - spawnQueue.waveStart >= spawnQueue[0].at) {
                const job = spawnQueue.shift();
                if (job.boss) spawnBoss();
                else enemies.push(makeEnemy(job.type, job.y));
            }
            if (!spawnQueue.length) delete spawnQueue.waveStart;
        }

        // enemies
        const speedScale = 1 + Math.min(wave * 0.03, 0.45);
        enemies.forEach(e => {
            e.t += dt;
            if (e.flash > 0) e.flash -= dt;
            if (e.type === 'scout' || e.type === 'weaver' || e.type === 'carrier') {
                e.x += e.vx * speedScale * dt;
                e.y = e.y0 + Math.sin(e.t * e.om) * e.amp;
            } else if (e.type === 'diver') {
                e.x += e.vx * speedScale * dt;
                if (!e.dive && e.x < W * 0.72) e.dive = true;
                if (e.dive) e.y += Math.sign(ship.y - e.y) * Math.min(170, Math.abs(ship.y - e.y) * 3) * dt;
            } else {
                e.x += e.vx * speedScale * dt;
                e.gunT -= dt;
                if (e.gunT <= 0 && e.x < W - 30 && e.x > ship.x + 60) {
                    e.gunT = e.type === 'tank' ? rand(1.6, 2.4) : rand(1.2, 2);
                    enemyFire(e.x - e.r, e.y, 170 + wave * 6, e.type === 'tank' ? 3 : 1, true);
                }
            }
        });
        enemies = enemies.filter(e => !e.dead && e.x > -60 && e.y > -80 && e.y < H + 80);

        // boss
        if (boss) {
            boss.t += dt;
            if (boss.flash > 0) boss.flash -= dt;
            if (!boss.entered) {
                boss.x -= 60 * dt;
                if (boss.x <= W - 130) boss.entered = true;
            } else {
                boss.y = H / 2 + Math.sin(boss.t * 0.7) * (H / 2 - 90);
                boss.phaseT += dt;
                boss.gunT -= dt;
                boss.ringT -= dt;
                if (boss.gunT <= 0) {
                    boss.gunT = Math.max(0.5, 1.1 - boss.tier * 0.12);
                    enemyFire(boss.x - boss.r, boss.y, 200 + boss.tier * 25, 3, true);
                }
                if (boss.ringT <= 0) {
                    boss.ringT = Math.max(2.2, 3.6 - boss.tier * 0.3);
                    const n = 10 + boss.tier * 2;
                    for (let i = 0; i < n; i++) {
                        const a = (i / n) * Math.PI * 2 + boss.t;
                        enemyShots.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 4 });
                    }
                    // escort scouts
                    if (enemies.length < 4) {
                        enemies.push(makeEnemy('scout', boss.y - 60));
                        enemies.push(makeEnemy('scout', boss.y + 60));
                    }
                }
            }
            if (boss.hp <= 0) {
                addScore(2000 + boss.tier * 1000);
                burst(boss.x, boss.y, '#ffb000', 60, 320);
                burst(boss.x, boss.y, '#ff4040', 40, 260);
                shake = 24;
                sfx.boom();
                dropPowerup(boss.x - 40, boss.y, 'W');
                dropPowerup(boss.x - 40, boss.y + 30, Math.random() < 0.5 ? 'O' : 'E');
                boss = null;
                enemyShots = [];
            }
        }

        // player shots
        shots.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; });
        shots = shots.filter(s => s.x > -30 && s.x < W + 30 && s.y > -20 && s.y < H + 20);
        shots = shots.filter(s => {
            for (const e of enemies) {
                const d2 = (s.x - e.x) ** 2 + (s.y - e.y) ** 2;
                if (d2 < (e.r + 4) ** 2) {
                    e.hp -= s.dmg;
                    e.flash = 0.12;
                    sfx.hit();
                    if (e.hp <= 0) killEnemy(e);
                    return false;
                }
            }
            if (boss && boss.entered) {
                const d2 = (s.x - boss.x) ** 2 + (s.y - boss.y) ** 2;
                if (d2 < (boss.r + 4) ** 2) {
                    boss.hp -= s.dmg;
                    boss.flash = 0.1;
                    sfx.hit();
                    return false;
                }
            }
            return true;
        });
        enemies = enemies.filter(e => !e.dead);

        // enemy shots & collisions with player
        enemyShots.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; });
        enemyShots = enemyShots.filter(s => s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20);
        for (const s of enemyShots) {
            if ((s.x - ship.x) ** 2 + (s.y - ship.y) ** 2 < (ship.r + s.r) ** 2) {
                s.x = -999;
                hitPlayer();
                break;
            }
        }
        for (const e of enemies) {
            if ((e.x - ship.x) ** 2 + (e.y - ship.y) ** 2 < (e.r + ship.r) ** 2) {
                e.hp = 0;
                killEnemy(e, false);
                hitPlayer();
                break;
            }
        }
        if (boss && boss.entered && (boss.x - ship.x) ** 2 + (boss.y - ship.y) ** 2 < (boss.r + ship.r) ** 2) {
            hitPlayer();
        }
        enemies = enemies.filter(e => !e.dead);

        // power-ups drift left, bobbing
        powerups.forEach(p => { p.t += dt; p.x -= 55 * dt; p.y += Math.sin(p.t * 3) * 18 * dt; });
        powerups = powerups.filter(p => {
            if ((p.x - ship.x) ** 2 + (p.y - ship.y) ** 2 < (16 + ship.r) ** 2) {
                applyPowerup(p);
                return false;
            }
            return p.x > -30;
        });

        // particles
        particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
        particles = particles.filter(p => p.life > 0);
    }

    /* ---------------- draw ---------------- */
    function drawShip(x, y, small) {
        ctx.save();
        ctx.translate(x, y);
        const sc = small ? 0.55 : 1;
        ctx.scale(sc, sc);
        if (!small && ship.inv > 0 && Math.floor(time * 12) % 2) ctx.globalAlpha = 0.35;
        // engine flame
        ctx.fillStyle = '#ffb000';
        ctx.beginPath();
        ctx.moveTo(-14, -4); ctx.lineTo(-22 - Math.random() * 8, 0); ctx.lineTo(-14, 4);
        ctx.fill();
        // hull
        ctx.fillStyle = small ? '#00d4aa' : '#39ff14';
        ctx.beginPath();
        ctx.moveTo(16, 0); ctx.lineTo(-10, -9); ctx.lineTo(-14, -3); ctx.lineTo(-14, 3); ctx.lineTo(-10, 9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0a3';
        ctx.fillRect(-8, -2, 10, 4);
        if (!small && ship.shield > 0) {
            ctx.strokeStyle = `rgba(0, 212, 170, ${0.5 + Math.sin(time * 6) * 0.25})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 19 + ship.shield * 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawEnemy(e) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const colors = { scout: '#ff4040', weaver: '#ff7b3d', diver: '#ff40a0', gunner: '#ffb000', tank: '#ff5050', carrier: '#ffd24a' };
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : colors[e.type] || '#ff4040';
        ctx.strokeStyle = ctx.fillStyle;
        if (e.type === 'tank') {
            ctx.fillRect(-e.r, -e.r * 0.7, e.r * 2, e.r * 1.4);
            ctx.fillStyle = '#601010';
            ctx.fillRect(-e.r * 0.4, -e.r * 0.3, e.r * 0.8, e.r * 0.6);
        } else if (e.type === 'gunner') {
            ctx.beginPath();
            ctx.arc(0, 0, e.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, Math.PI * 2); ctx.fill();
        } else if (e.type === 'carrier') {
            ctx.beginPath();
            ctx.moveTo(-e.r, 0); ctx.lineTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 0, 1);
        } else {
            ctx.beginPath();
            ctx.moveTo(-e.r, 0); ctx.lineTo(e.r * 0.8, -e.r * 0.8); ctx.lineTo(e.r * 0.3, 0); ctx.lineTo(e.r * 0.8, e.r * 0.8);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function drawBoss() {
        if (!boss) return;
        ctx.save();
        ctx.translate(boss.x, boss.y);
        const base = boss.flash > 0 ? '#ffffff' : '#ff3030';
        ctx.fillStyle = base;
        ctx.strokeStyle = base;
        ctx.lineWidth = 3;
        // layered hull
        ctx.beginPath();
        ctx.moveTo(-boss.r, 0);
        ctx.lineTo(-boss.r * 0.3, -boss.r);
        ctx.lineTo(boss.r, -boss.r * 0.55);
        ctx.lineTo(boss.r * 0.7, 0);
        ctx.lineTo(boss.r, boss.r * 0.55);
        ctx.lineTo(-boss.r * 0.3, boss.r);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
        // core
        ctx.fillStyle = boss.flash > 0 ? '#fff' : '#ffb000';
        ctx.beginPath();
        ctx.arc(-boss.r * 0.25, 0, 12 + Math.sin(boss.t * 5) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // health bar
        const bw = W * 0.5, bx = (W - bw) / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx - 2, 10, bw + 4, 14);
        ctx.strokeStyle = '#ff3030';
        ctx.strokeRect(bx - 2, 10, bw + 4, 14);
        ctx.fillStyle = '#ff3030';
        ctx.fillRect(bx, 12, bw * Math.max(0, boss.hp / boss.hpMax), 10);
        ctx.fillStyle = '#ffb000';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`HOSTILE COMMAND UNIT MK-${boss.tier}`, W / 2, 34);
    }

    function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
        ctx.fillStyle = '#000';
        ctx.fillRect(-20, -20, W + 40, H + 40);

        // starfield
        stars.forEach(s => {
            ctx.fillStyle = s.speed > 90 ? '#3a6' : '#234';
            ctx.fillRect(s.x, s.y, s.size + s.speed * 0.01, s.size);
        });
        // grid floor flavor
        ctx.strokeStyle = 'rgba(32, 194, 14, 0.07)';
        ctx.lineWidth = 1;
        for (let i = 0; i < W; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }

        powerups.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            const pulse = 1 + Math.sin(p.t * 5) * 0.12;
            ctx.scale(pulse, pulse);
            const colors = { W: '#ffb000', S: '#39ff14', O: '#00d4aa', E: '#31a8ff', X: '#ff4040' };
            ctx.strokeStyle = colors[p.type];
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = colors[p.type];
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.type, 0, 1);
            ctx.restore();
        });

        shots.forEach(s => {
            ctx.fillStyle = s.dmg > 1 ? '#aef' : '#fff';
            ctx.fillRect(s.x - 6, s.y - (s.dmg > 1 ? 2 : 1), 12, s.dmg > 1 ? 4 : 2);
        });
        enemyShots.forEach(s => {
            ctx.fillStyle = '#ff6060';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        });

        enemies.forEach(drawEnemy);
        drawBoss();
        options.forEach(o => drawShip(o.x, o.y, true));
        if (!gameOver) drawShip(ship.x, ship.y, false);
        particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life * 2);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
            ctx.globalAlpha = 1;
        });

        // wave banner
        if (waveBannerT > 0 && !boss) {
            ctx.fillStyle = `rgba(255, 176, 0, ${Math.min(1, waveBannerT)})`;
            ctx.font = 'bold 26px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(wave % 4 === 0 ? `!! COMMAND UNIT INBOUND !!` : `WAVE ${wave}`, W / 2, H / 2 - 60);
        }
        if (flashT > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashT * 1.6})`;
            ctx.fillRect(-20, -20, W + 40, H + 40);
        }
        if (paused && !gameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ffb000';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('// PAUSED //', W / 2, H / 2);
        }

        // scanlines
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        for (let i = 0; i < H; i += 3) ctx.fillRect(0, i, W, 1);
        ctx.restore();
    }

    /* ---------------- loop & input ---------------- */
    function gameLoop(ts) {
        if (closing || !document.getElementById('gameOverlay')) return;
        if (!lastTime) lastTime = ts;
        const dt = Math.min(0.05, (ts - lastTime) / 1000);
        lastTime = ts;
        if (!paused && !gameOver) update(dt);
        draw();
        gameFrame = requestAnimationFrame(gameLoop);
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') { closeGame(); return; }
        if (gameOver) return; // let the form take input
        keys[e.key] = true;
        if (e.key === ' ') { e.preventDefault(); fireHeld = true; }
        if (e.key === 'p' || e.key === 'P') paused = !paused;
    }
    function handleKeyUp(e) {
        keys[e.key] = false;
        if (e.key === ' ') fireHeld = false;
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    function updateLeaderboard() {
        const list = document.getElementById('scoreList');
        if (!list) return;
        list.textContent = '';
        if (gameHighScores.length === 0) {
            const empty = document.createElement('li');
            empty.style.color = '#666';
            empty.textContent = 'No scores yet';
            list.appendChild(empty);
            return;
        }
        gameHighScores.slice(0, 10).forEach(scoreEntry => {
            const item = document.createElement('li');
            const name = document.createElement('span');
            const value = document.createElement('span');
            name.className = 'score-name';
            value.className = 'score-value';
            name.textContent = cleanScoreName(scoreEntry.name);
            value.textContent = String(Number(scoreEntry.score) || 0);
            item.appendChild(name);
            item.appendChild(value);
            list.appendChild(item);
        });
    }

    window.submitScore = function () {
        const name = cleanScoreName(document.getElementById('playerName').value);
        gameHighScores.push({ name, score });
        gameHighScores.sort((a, b) => b.score - a.score);
        gameHighScores = gameHighScores.slice(0, 10);
        saveGameHighScores();
        updateLeaderboard();
        document.getElementById('gameOver').style.display = 'none';
        closeGame();
        setTimeout(() => startMiniGame(), 120);
    };

    window.closeGame = function () {
        closing = true;
        if (gameFrame) {
            cancelAnimationFrame(gameFrame);
            gameFrame = null;
        }
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('resize', fitCanvas);
        const node = document.getElementById('gameOverlay');
        if (node) node.remove();
    };

    document.getElementById('submitScoreBtn').addEventListener('click', () => window.submitScore());
    document.getElementById('exitGameBtn').addEventListener('click', () => window.closeGame());

    updateLeaderboard();
    hud.hi.textContent = hiScore();
    updateLivesHud();
    updateGunHud();
    queueWave(1);
    gameFrame = requestAnimationFrame(gameLoop);
}

function initHologram() {
    if (hologramStarted) return;
    const canvas = document.getElementById('hologramCanvas');
    if (!canvas) return;
    const panel = canvas.closest('.hologram-panel, .facility-overview-card');
    if (!panel || getComputedStyle(panel).display === 'none') return;
    hologramStarted = true;

    const ctx = canvas.getContext('2d');
    let width = 0, height = 0;
    let renderTimer = null;
    let pixelRatio = 1;
    let lastFrameTime = 0;

    function getHologramFrameMs() {
        return effectsFrameMs(33, 82, 150);
    }
    
    function resize() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
            const targetWidth = Math.max(1, Math.round(rect.width * pixelRatio));
            const targetHeight = Math.max(1, Math.round(rect.height * pixelRatio));
            if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
            }
            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            width = rect.width;
            height = rect.height;
        } else {
            width = 0;
            height = 0;
        }
    }
    resize();
    window.addEventListener('resize', resize);

    function queueHologramFrame(delay = getHologramFrameMs()) {
        if (renderTimer || !canvas.isConnected) return;
        renderTimer = setTimeout(() => {
            renderTimer = null;
            requestAnimationFrame(render);
        }, delay);
    }
    
    const facility = {
        rooms: [
            { x: -30, y: 0, z: -20, w: 60, h: 18, d: 40 },
            { x: -45, y: 0, z: -12, w: 15, h: 12, d: 24 },
            { x: 30, y: 0, z: -12, w: 15, h: 12, d: 24 },
            { x: -10, y: 18, z: -10, w: 20, h: 20, d: 20 },
            { x: -38, y: -10, z: -25, w: 76, h: 10, d: 50 }
        ],
        doors: [
            { x: -3, y: 0, z: 20, w: 6, h: 10 },
            { x: -30, y: 0, z: 0, w: 5, h: 8 },
            { x: 30, y: 0, z: 0, w: 5, h: 8 }
        ]
    };
    
    let angle = 0;
    
    function project(x, y, z, rot) {
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const rx = x * cos - z * sin, rz = x * sin + z * cos;
        return { x: (rx - rz) * 0.8, y: (rx + rz) * 0.3 - y * 0.8 };
    }
    
    function drawBox(box, rot, color, alpha) {
        const { x, y, z, w, h, d } = box;
        const v = [[x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d],[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]];
        const p = v.map(pt => project(pt[0], pt[1], pt[2], rot));
        const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        edges.forEach(([a,b]) => { ctx.moveTo(p[a].x, p[a].y); ctx.lineTo(p[b].x, p[b].y); });
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    
    function drawDoor(door, rot, useGlow = true) {
        const { x, y, z, w, h } = door;
        const v = [[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]];
        const p = v.map(pt => project(pt[0], pt[1], pt[2], rot));
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 1;
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = useGlow ? 3 : 0;
        ctx.beginPath();
        p.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    function render(timestamp = 0) {
        if (!canvas.isConnected) return;
        if (!document.body.classList.contains('terminal-ready')) {
            lastFrameTime = 0;
            queueHologramFrame(600);
            return;
        }
        if (document.hidden) {
            lastFrameTime = 0;
            queueHologramFrame(600);
            return;
        }
        if (document.body.classList.contains('terminal-map-active')) {
            lastFrameTime = 0;
            queueHologramFrame(3000);
            return;
        }
        if (width <= 0 || height <= 0) {
            resize();
            lastFrameTime = 0;
            queueHologramFrame(600);
            return;
        }
        if (!AppState.networkOnline) {
            lastFrameTime = 0;
            ctx.fillStyle = 'rgba(3, 10, 3, 0.72)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(255, 48, 48, 0.72)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('NET OFFLINE', width / 2, height / 2);
            queueHologramFrame(1000);
            return;
        }
        if (!AppState.connectedSiteId) {
            lastFrameTime = 0;
            ctx.fillStyle = 'rgba(3, 10, 3, 0.72)';
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = 'rgba(255, 173, 0, 0.42)';
            ctx.lineWidth = 1;
            ctx.strokeRect(8, 8, Math.max(1, width - 16), Math.max(1, height - 16));
            ctx.fillStyle = 'rgba(255, 173, 0, 0.82)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('BRE SITE LINK REQUIRED', width / 2, height / 2 - 5);
            ctx.fillStyle = 'rgba(0, 212, 255, 0.64)';
            ctx.fillText('CONNECT SITE FOR OVERVIEW', width / 2, height / 2 + 10);
            queueHologramFrame(1000);
            return;
        }

        const delta = lastFrameTime ? Math.min(66, timestamp - lastFrameTime) : getHologramFrameMs();
        lastFrameTime = timestamp;
        
        ctx.fillStyle = 'rgba(3, 10, 3, 0.42)';
        ctx.fillRect(0, 0, width, height);
        ctx.save();
        const projectionScale = Math.max(0.72, Math.min(1.35, Math.min(width / 138, height / 88)));
        ctx.translate(width / 2, height / 2 + height * 0.08);
        ctx.scale(projectionScale, projectionScale);
        
        // Grid
        ctx.strokeStyle = '#20c20e';
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        for (let i = -3; i <= 3; i++) {
            let p1 = project(i * 12, -10, -36, angle), p2 = project(i * 12, -10, 36, angle);
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
            let p3 = project(-36, -10, i * 12, angle), p4 = project(36, -10, i * 12, angle);
            ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Facility
        const useGlow = !document.body.classList.contains('low-power');
        ctx.shadowColor = '#20c20e';
        ctx.shadowBlur = useGlow ? 3 : 0;
        facility.rooms.forEach((room, i) => drawBox(room, angle, '#20c20e', i === 4 ? 0.18 : 0.58));
        facility.doors.forEach(door => drawDoor(door, angle, useGlow));
        ctx.restore();
        
        if (prefersReducedMotion) return;

        angle += 0.0038 * (delta / 16.7);
        queueHologramFrame();
    }
    
    queueHologramFrame(100);
}

// ========================================
// CASINO GAME - DER FETTE
// ========================================
function startCasinoGame() {
    var overlay = document.createElement('div');
    overlay.id = 'casinoOverlay';
    overlay.innerHTML = '<style>' +
        '#casinoOverlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0a0a0a; z-index: 500; display: flex; font-family: var(--terminal-font); color: #20c20e; }' +
        '.casino-left { flex: 2; display: flex; flex-direction: column; padding: 20px; border-right: 2px solid #20c20e; }' +
        '.casino-right { flex: 1; display: flex; flex-direction: column; padding: 20px; align-items: center; }' +
        '.casino-title { text-align: center; font-size: 28px; color: #ffb000; text-shadow: 0 0 10px #ffb000; margin-bottom: 10px; }' +
        '.casino-subtitle { text-align: center; font-size: 14px; color: #666; margin-bottom: 20px; }' +
        '.slot-machine { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }' +
        '.slot-frame { border: 3px solid #ffb000; padding: 20px; background: rgba(0, 20, 0, 0.5); box-shadow: 0 0 30px rgba(255, 176, 0, 0.3), inset 0 0 50px rgba(0,0,0,0.5); }' +
        '.slot-reels { display: flex; gap: 10px; margin-bottom: 20px; }' +
        '.slot-reel { width: 100px; height: 180px; border: 2px solid #20c20e; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 14px; overflow: hidden; position: relative; }' +
        '.reel-symbol { white-space: pre; line-height: 1.1; text-align: center; padding: 5px; }' +
        '.slot-info { display: flex; justify-content: space-between; width: 100%; margin-bottom: 15px; font-size: 18px; }' +
        '.credits { color: #00d4aa; } .bet { color: #ffb000; }' +
        '.win-display { text-align: center; font-size: 24px; color: #ff3333; height: 30px; text-shadow: 0 0 10px #ff3333; }' +
        '.slot-buttons { display: flex; gap: 10px; margin-top: 15px; }' +
        '.slot-btn { padding: 15px 30px; font-family: var(--terminal-font); font-size: 18px; border: 2px solid; background: rgba(0, 30, 0, 0.8); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s; }' +
        '.slot-btn:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 0 15px currentColor; }' +
        '.slot-btn:disabled { opacity: 0.5; cursor: not-allowed; }' +
        '.slot-btn.spin { color: #20c20e; border-color: #20c20e; }' +
        '.slot-btn.bet-btn { color: #ffb000; border-color: #ffb000; }' +
        '.slot-btn.exit { color: #ff3333; border-color: #ff3333; }' +
        '.paytable { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }' +
        '.paytable-title { color: #ffb000; margin-bottom: 5px; }' +
        '.jackpot-display { font-size: 20px; color: #ff00ff; text-shadow: 0 0 15px #ff00ff; margin-bottom: 10px; animation: jackpotPulse 1s ease-in-out infinite; }' +
        '@keyframes jackpotPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }' +
        '.orc-container { flex: 1; display: flex; flex-direction: column; align-items: center; }' +
        '.orc-title { color: #ff3333; font-size: 18px; margin-bottom: 10px; }' +
        '.orc-portrait { white-space: pre; font-size: 10px; line-height: 1.0; color: #20c20e; margin-bottom: 15px; }' +
        '.speech-bubble { background: rgba(0, 30, 0, 0.8); border: 2px solid #ff3333; border-radius: 10px; padding: 15px; max-width: 280px; position: relative; margin-top: 10px; }' +
        '.speech-bubble::before { content: ""; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 10px solid #ff3333; }' +
        '.speech-text { color: #ff3333; font-size: 14px; text-align: center; min-height: 60px; }' +
        '.casino-instructions { color: #444; font-size: 12px; text-align: center; margin-top: auto; }' +
        '.winning { animation: winFlash 0.3s ease-in-out 5; }' +
        '@keyframes winFlash { 0%, 100% { background: rgba(0, 50, 0, 0.5); } 50% { background: rgba(255, 176, 0, 0.3); } }' +
        '</style>' +
        '<div class="casino-left">' +
        '<div class="casino-title">★ SHADOWRUN SLOTS ★</div>' +
        '<div class="casino-subtitle">Der Fette\'s Lucky Machine</div>' +
        '<div class="slot-machine">' +
        '<div class="jackpot-display">◆ JACKPOT: <span id="jackpotAmount">10000</span>¥ ◆</div>' +
        '<div class="slot-frame">' +
        '<div class="slot-info"><span class="credits">CREDITS: <span id="creditDisplay">1000</span>¥</span><span class="bet">BET: <span id="betDisplay">10</span>¥</span></div>' +
        '<div class="slot-reels"><div class="slot-reel" id="reel1"><div class="reel-symbol"></div></div><div class="slot-reel" id="reel2"><div class="reel-symbol"></div></div><div class="slot-reel" id="reel3"><div class="reel-symbol"></div></div></div>' +
        '<div class="win-display" id="winDisplay"></div>' +
        '<div class="slot-buttons"><button class="slot-btn bet-btn" id="betBtn">BET +10</button><button class="slot-btn spin" id="spinBtn">◆ SPIN ◆</button><button class="slot-btn exit" onclick="closeCasino()">EXIT</button></div>' +
        '</div>' +
        '<div class="paytable"><div class="paytable-title">═══ PAYOUTS ═══</div><div>DRAGON x3 = JACKPOT! | SKULL x3 = 50x</div><div>GHOST x3 = 25x | GUN x3 = 15x</div><div>STIM x3 = 10x | NUYEN x3 = 8x</div><div>DICE x3 = 5x | Any 2 Match = 2x</div></div>' +
        '</div></div>' +
        '<div class="casino-right"><div class="orc-container"><div class="orc-title">◆ DER FETTE ◆</div><div class="orc-portrait" id="orcPortrait"></div><div class="speech-bubble"><div class="speech-text" id="orcSpeech">Step right up, chummer! Let\'s see what you got...</div></div></div><div class="casino-instructions">SPACE = Spin | +/- = Change Bet | ESC = Exit</div></div>';
    document.body.appendChild(overlay);
    
    // Game state
    var credits = 1000;
    var bet = 10;
    var jackpot = 10000;
    var spinning = false;
    
    // Symbols with ASCII art
    var symbols = [
        { name: 'dragon', weight: 2, art: "  /\\_/\\\n ( o.o )\n  > ^ <\n /|   |\\\n/_|   |_\\\nDRAGON" },
        { name: 'skull', weight: 4, art: "  ___\n /o o\\\n \\ - /\n  |||\n /|||\\\n SKULL" },
        { name: 'ghost', weight: 6, art: "  .-.\n (o o)\n | O |\n |   |\n '~~~'\n GHOST" },
        { name: 'gun', weight: 8, art: "    _\n  _/ |\n |__/|\n    ||\n   _||_\n  ARES" },
        { name: 'stim', weight: 10, art: "  ___\n |[+]|\n |   |\n |___|\n   |\n STIM" },
        { name: 'nuyen', weight: 12, art: "  ___\n /   \\\n| ¥¥¥ |\n \\___/\n  |||\n NUYEN" },
        { name: 'dice', weight: 15, art: " .---.\n/o   |\n|  o |\n|   o/\n'---'\n DICE" },
        { name: 'chip', weight: 18, art: "  ___\n [|||]\n |CPU|\n [|||]\n  ---\n CHIP" }
    ];
    
    // Build weighted array
    var weightedSymbols = [];
    symbols.forEach(function(s) {
        for (var i = 0; i < s.weight; i++) weightedSymbols.push(s);
    });
    
    // Orc ASCII portrait frames
    var orcFrames = [
        "      ,---.\n     /o   o\\\n    |   _   |\n   /| (___) |\\\n  / |       | \\\n |  |~~---~~|  |\n |  | |\\/| |  |\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'",
        "      ,---.\n     /o   o\\\n    |  \\_/  |\n   /| (___) |\\\n  / |       | \\\n |  |~~---~~|  |\n |  | |\\/| |  |\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'",
        "      ,---.\n     /-   o\\\n    |   _   |\n   /| (___) |\\\n  / |       | \\\n |  |~~---~~|  |\n |  | |\\/| |  |\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'"
    ];
    
    // 150 Shadowrun-themed insults
    var insults = [
        "Another day, another sucker loses their nuyen to Der Fette!",
        "You call that luck? I've seen better odds in a toxic spirit's lair!",
        "Keep spinning, chummer. My credstick needs padding!",
        "That's the spirit! The spirit of LOSING!",
        "Your dice rolling is almost as bad as your life choices!",
        "I've seen ghouls with better luck than you!",
        "Maybe try a different career, like being a speed bump!",
        "The house always wins, and I AM the house, omae!",
        "Your nuyen is crying tears of joy... in MY pocket!",
        "Even a technomancer couldn't compile luck this bad!",
        "You're making me rich! Well, richer!",
        "That spin was sadder than a wet troll in winter!",
        "Keep those credits flowing, like blood from a runner!",
        "Your luck stat must be in the negatives!",
        "I've seen better outcomes in BTL nightmares!",
        "The shadows are laughing at you, chummer!",
        "Another donation to the Fat One's retirement fund!",
        "You gamble like a corp exec manages - POORLY!",
        "Is that sweat or just the smell of defeat?",
        "My grandma slots better, and she's been dead 20 years!",
        "You're the reason casinos exist!",
        "That sound? It's your credstick weeping!",
        "Even Aztechnology couldn't sacrifice enough for your luck!",
        "I'm going to name my yacht after you... 'The Sucker'!",
        "Your spins are worse than DocWagon response times!",
        "I've seen better luck from a cursed artifact!",
        "Keep going! My third mansion won't buy itself!",
        "You must have pissed off every luck spirit in Seattle!",
        "That was beautiful... beautifully bad!",
        "The algorithm thanks you for your generous donation!",
        "Even riggers crash less than your luck!",
        "Your karma must be in the toilet!",
        "I'm laughing all the way to the offshore account!",
        "Maybe stick to your day job... if you have one!",
        "That spin had the grace of a drunk troll!",
        "You're funding my next chrome upgrade!",
        "The Matrix has seen your luck... it's embarrassed!",
        "You fight like you gamble - badly!",
        "Every spin brings me closer to that island!",
        "Your luck's flatter than a pancake in a press!",
        "I've seen wage slaves with more luck!",
        "That was almost as sad as corporate middle management!",
        "You're the gift that keeps on giving... TO ME!",
        "The spirits of fortune have abandoned you completely!",
        "Even a newbie decker has better luck!",
        "My credstick is getting fat, like me!",
        "You should have stayed in the barrens!",
        "That spin was rougher than Redmond streets!",
        "Your luck called - it's not coming back!",
        "I've seen ghouls luckier at finding meat!",
        "The shadows reject your gambling attempts!",
        "You're making my accountant very happy!",
        "Even toxic shamans have better fortune!",
        "That was pathetic, and I love it!",
        "Your nuyen is now MY nuyen, chummer!",
        "I've seen deckers brick with more style!",
        "The house doesn't just win, it DOMINATES!",
        "Your grandmother gambles better, from her grave!",
        "That spin was deader than a ghoul's lunch!",
        "Even Knight Errant couldn't protect your credits!",
        "You must really hate money!",
        "The only jackpot you'll hit is POVERTY!",
        "I'm going to frame this losing streak!",
        "Your luck is so bad, it's almost impressive!",
        "Even bug spirits wouldn't possess that luck!",
        "Keep it up! My kids need college funds!",
        "That spin was colder than an ice mage's heart!",
        "You gamble like Lone Star investigates - terribly!",
        "The odds weren't in your favor... obviously!",
        "Even a blind troll could do better!",
        "Your luck's worse than a runner's retirement plan!",
        "I'm getting fatter just watching you lose!",
        "That was embarrassing, even for you!",
        "The machine laughs at your misfortune!",
        "You couldn't win if the game was rigged FOR you!",
        "Even magical luck couldn't save those spins!",
        "Your credits are migrating to a better home - MINE!",
        "I've seen better luck in a cursed corp building!",
        "The only thing you're winning is my respect... for losing!",
        "You should take up a safer hobby, like grenade juggling!",
        "Even a street sam with no cyber would do better!",
        "Your luck is an endangered species... extinct!",
        "That spin was sadder than a troll's love life!",
        "Keep donating to the Church of Der Fette!",
        "I'm composing a symphony called 'Your Failure'!",
        "You're the reason I can afford real krill!",
        "That was worse than getting caught by DocWagon debt collectors!",
        "Your luck is so bad, fixers won't work with you!",
        "Even a Chicago runner has better odds!",
        "I've seen mages geek themselves with more dignity!",
        "The algorithm REALLY doesn't like you!",
        "You couldn't hit a jackpot with a targeting laser!",
        "Your spinning technique needs... everything!",
        "Even sewer-dwelling ghouls have more luck!",
        "That spin was rougher than BTL withdrawal!",
        "I love watching dreams die, one spin at a time!",
        "Your credstick is thinner than a rigger's patience!",
        "Even corp security shoots better than you gamble!",
        "The machine hungers for your failure... NOM NOM!",
        "You're like a wage slave, but less lucky!",
        "That was beautiful... if you're a masochist!",
        "Your karma debt must be astronomical!",
        "Even toxic waste has better vibes than your luck!",
        "I'm going to build a statue with your lost nuyen!",
        "You gamble like a trog dances - clumsily!",
        "The spirits whisper 'loser' when you spin!",
        "Your luck couldn't power a dead commlink!",
        "Even extracted scientists have more freedom than your luck!",
        "That spin was deader than old Seattle!",
        "Keep going, my personal zoo needs exotic animals!",
        "You couldn't win with loaded dice!",
        "Your luck is like a decker without a deck - USELESS!",
        "Even Halloweeners have better aim than your luck!",
        "The machine feeds on your tears!",
        "You're funding my solid gold toilet!",
        "That was worse than a milk run gone wrong!",
        "Your luck stat is a cautionary tale!",
        "Even go-gangers crash less than your hopes!",
        "I've seen corpse caddies with more vitality!",
        "The only run you're completing is running out of credits!",
        "Your spins are like drek... awful!",
        "Even a BTL addict has better decision making!",
        "Keep it up, my retirement planet won't buy itself!",
        "You gamble like a newbie with no fixer!",
        "That spin was sadder than a squatter's life!",
        "Your luck died harder than cyberzombies!",
        "Even blood mages sacrifice less than you!",
        "The machine demands more sacrifice!",
        "You're making history... in LOSING!",
        "Your luck couldn't jumpstart a dead credstick!",
        "Even pixies have more substance than your luck!",
        "That was rougher than a bunraku parlor!",
        "I'm writing my memoirs: 'How Suckers Made Me Rich'!",
        "Your gambling is worse than your fashion sense!",
        "Even infected runners have better survival odds!",
        "The only extraction happening is of your nuyen!",
        "You couldn't win if Lady Luck was your fixer!",
        "Your spins are making spirits weep!",
        "Even a dragon's hoard isn't growing as fast as mine!",
        "That was more tragic than a failed run!",
        "Your luck is the real cautionary tale!",
        "Even megacorp lawyers have more soul than your luck!",
        "I'm laughing so hard, my tusks hurt!",
        "The machine has spoken: YOU LOSE!",
        "Your credits are in a better place now... MY POCKET!",
        "You gamble like you've never seen nuyen before!",
        "Even CFD victims have better coordination!",
        "That spin was smoother than sandpaper!",
        "Keep going! I need to gild my bathroom!",
        "Your luck is an urban legend of failure!",
        "Even tempo addicts have better highs than your wins!"
    ];
    
    // Initialize orc
    var orcPortrait = document.getElementById('orcPortrait');
    var orcFrame = 0;
    var orcTimer = null;
    orcPortrait.textContent = orcFrames[0];
    
    // Animate orc
    orcTimer = setInterval(function() {
        orcFrame = (orcFrame + 1) % orcFrames.length;
        if (orcPortrait) orcPortrait.textContent = orcFrames[orcFrame];
    }, 500);
    
    // Initialize reels
    var reels = [
        document.getElementById('reel1').querySelector('.reel-symbol'),
        document.getElementById('reel2').querySelector('.reel-symbol'),
        document.getElementById('reel3').querySelector('.reel-symbol')
    ];
    
    var results = [
        weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)],
        weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)],
        weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)]
    ];
    
    reels.forEach(function(reel, i) {
        reel.textContent = results[i].art;
        reel.style.color = '#20c20e';
    });
    
    function updateDisplays() {
        document.getElementById('creditDisplay').textContent = credits;
        document.getElementById('betDisplay').textContent = bet;
        document.getElementById('jackpotAmount').textContent = jackpot;
    }
    
    function getInsult() {
        return insults[Math.floor(Math.random() * insults.length)];
    }
    
    function showOrcMessage(msg) {
        document.getElementById('orcSpeech').textContent = msg;
    }
    
    async function spin() {
        if (spinning || credits < bet) {
            if (credits < bet) {
                showOrcMessage("HAHAHAHA! You're BROKE! Get out of my casino, you pathetic worm!");
            }
            return;
        }
        
        spinning = true;
        credits -= bet;
        jackpot += Math.floor(bet * 0.1);
        updateDisplays();
        document.getElementById('winDisplay').textContent = '';
        document.getElementById('spinBtn').disabled = true;
        
        // Play spin sound
        if (AudioEngine.canPlay()) {
            for (var i = 0; i < 10; i++) {
                (function(idx) {
                    setTimeout(function() {
                        if (!AudioEngine.canPlay()) return;
                        var osc = AudioEngine.ctx.createOscillator();
                        var gain = AudioEngine.ctx.createGain();
                        osc.connect(gain);
                        gain.connect(AudioEngine.destination());
                        osc.frequency.value = 100 + Math.random() * 300;
                        osc.type = 'square';
                        gain.gain.setValueAtTime(0.05, AudioEngine.ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.001, AudioEngine.ctx.currentTime + 0.05);
                        osc.start();
                        osc.stop(AudioEngine.ctx.currentTime + 0.05);
                    }, idx * 50);
                })(i);
            }
        }
        
        // Spin animation for each reel
        var finalResults = [];
        for (var r = 0; r < 3; r++) {
            var reel = reels[r];
            var spins = 10 + r * 5;
            
            for (var s = 0; s < spins; s++) {
                await new Promise(function(resolve) { setTimeout(resolve, 50 + s * 5); });
                var randomSym = weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)];
                reel.textContent = randomSym.art;
                reel.style.color = '#20c20e';
            }
            
            var finalSym = weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)];
            finalResults.push(finalSym);
            reel.textContent = finalSym.art;
            
            if (AudioEngine.canPlay()) {
                var osc = AudioEngine.ctx.createOscillator();
                var gain = AudioEngine.ctx.createGain();
                osc.connect(gain);
                gain.connect(AudioEngine.destination());
                osc.frequency.value = 150;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.1, AudioEngine.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, AudioEngine.ctx.currentTime + 0.1);
                osc.start();
                osc.stop(AudioEngine.ctx.currentTime + 0.1);
            }
        }
        
        // Check results
        var names = finalResults.map(function(s) { return s.name; });
        var winAmount = 0;
        var winMsg = '';
        
        if (names[0] === names[1] && names[1] === names[2]) {
            switch(names[0]) {
                case 'dragon':
                    winAmount = jackpot;
                    winMsg = '★★★ JACKPOT!!! ★★★';
                    showOrcMessage("IMPOSSIBLE! THE JACKPOT?! You... you... THIS MACHINE IS BROKEN!");
                    jackpot = 10000;
                    break;
                case 'skull':
                    winAmount = bet * 50;
                    winMsg = '☠☠☠ TRIPLE SKULLS! 50x ☠☠☠';
                    showOrcMessage("Skulls?! You got lucky, punk! Don't let it go to your empty head!");
                    break;
                case 'ghost':
                    winAmount = bet * 25;
                    winMsg = 'TRIPLE GHOSTS! 25x';
                    showOrcMessage("Ghosts... fitting for someone who's about to be financially dead!");
                    break;
                case 'gun':
                    winAmount = bet * 15;
                    winMsg = 'TRIPLE ARES! 15x';
                    showOrcMessage("Armed and slightly less poor! Don't get cocky!");
                    break;
                case 'stim':
                    winAmount = bet * 10;
                    winMsg = 'TRIPLE STIMS! 10x';
                    showOrcMessage("Stims! You'll need them after I'm done with your wallet!");
                    break;
                case 'nuyen':
                    winAmount = bet * 8;
                    winMsg = 'TRIPLE NUYEN! 8x';
                    showOrcMessage("Some nuyen back... temporary setback for Der Fette!");
                    break;
                case 'dice':
                    winAmount = bet * 5;
                    winMsg = 'TRIPLE DICE! 5x';
                    showOrcMessage("Lucky dice! But luck always runs out, chummer!");
                    break;
                case 'chip':
                    winAmount = bet * 3;
                    winMsg = 'TRIPLE CHIPS! 3x';
                    showOrcMessage("Chips! Barely worth my time, but enjoy your crumbs!");
                    break;
            }
            reels.forEach(function(r) { r.parentElement.classList.add('winning'); });
            setTimeout(function() { reels.forEach(function(r) { r.parentElement.classList.remove('winning'); }); }, 1500);
        } else if (names[0] === names[1] || names[1] === names[2] || names[0] === names[2]) {
            winAmount = bet * 2;
            winMsg = 'PAIR! 2x';
            showOrcMessage(getInsult());
        } else {
            showOrcMessage(getInsult());
        }
        
        if (winAmount > 0) {
            credits += winAmount;
            document.getElementById('winDisplay').textContent = winMsg + ' +' + winAmount + ' nuyen';
            if (AudioEngine.canPlay()) {
                [200, 300, 400, 500].forEach(function(freq, i) {
                    setTimeout(function() {
                        if (!AudioEngine.canPlay()) return;
                        var osc = AudioEngine.ctx.createOscillator();
                        var gain = AudioEngine.ctx.createGain();
                        osc.connect(gain);
                        gain.connect(AudioEngine.destination());
                        osc.frequency.value = freq;
                        osc.type = 'sine';
                        gain.gain.setValueAtTime(0.1, AudioEngine.ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.001, AudioEngine.ctx.currentTime + 0.15);
                        osc.start();
                        osc.stop(AudioEngine.ctx.currentTime + 0.15);
                    }, i * 100);
                });
            }
        }
        
        updateDisplays();
        spinning = false;
        document.getElementById('spinBtn').disabled = false;
    }
    
    function changeBet(delta) {
        bet = Math.max(10, Math.min(100, bet + delta));
        updateDisplays();
    }
    
    document.getElementById('spinBtn').addEventListener('click', spin);
    document.getElementById('betBtn').addEventListener('click', function() { changeBet(10); });
    
    function handleCasinoKeys(e) {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            spin();
        } else if (e.key === '+' || e.key === '=') {
            changeBet(10);
        } else if (e.key === '-' || e.key === '_') {
            changeBet(-10);
        } else if (e.key === 'Escape') {
            closeCasino();
        }
    }
    
    document.addEventListener('keydown', handleCasinoKeys);
    
    window.closeCasino = function() {
        document.removeEventListener('keydown', handleCasinoKeys);
        if (orcTimer) {
            clearInterval(orcTimer);
            orcTimer = null;
        }
        var overlay = document.getElementById('casinoOverlay');
        if (overlay) overlay.remove();
    };
    
    updateDisplays();
}
