// ========================================
// SECRET RAYCAST MINI-GAME - LIEBI
// Wolfenstein/Doom-style textured raycaster: procedural texture atlas,
// pixel-art sprites, sliding doors, secret push-wall, projectiles,
// exploding barrels, mouse look, and a Doom status bar with reactive face.
// ========================================
let liebiGameCleanup = null;

const LIEBI_MAP_TEMPLATE = [
    '############################',
    '#P...A...#c....#.......1...#',
    '#.######.#.##..D..#######..#',
    '#....h.#.#..#..#..#.....#.S#',
    '#####..#.D..#..#..#..3..#..#',
    '#c..#..#.####..####.....##R#',
    '#...#..1....#.B.2..###..#.X#',
    '#.#.######..#......#.#..####',
    '#.#..M...#..########.#.....#',
    '#.####...D.....c.....#..A..#',
    '#....#...#..#######..####..#',
    '#.2..######.#.....#.....#.%#',
    '#...B....1..#..K..D..M..#.h#',
    '#.#####..####..2..#######..#',
    '#.#...#..#..#.....#....1...#',
    '#.#.V.D..#..#######..###.#.#',
    '#.#...#..D........#..#W#.#.#',
    '#.##.##..########.#..#.#.#.#',
    '#..1.....#....3.B.D....#...#',
    '#...####.#........#####.##.#',
    '#.A.#..#.....##2...........#',
    '############################'
];
// Legend: P start, # wall (auto-textured), c circuit wall, h hazard wall,
// % secret push-wall, D door, R red-locked door, X exit pad,
// A ammo, M medkit, V armor, W shotgun, K red key, S data shard,
// B barrel, 1 guard, 2 drone, 3 specter.

/* ---------------- procedural pixel assets ---------------- */
let liebiAtlas = null;

function liebiMakeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

// Build a 64x64 texture from a painter callback working on a 16x16 grid.
function liebiTexture(paint) {
    const c = liebiMakeCanvas(64, 64);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    paint(g, (x, y, w, h, color) => {
        g.fillStyle = color;
        g.fillRect(x * 4, y * 4, w * 4, h * 4);
    });
    return c;
}

// Build a sprite canvas from ASCII pixel art ('.' or ' ' = transparent).
function liebiSpriteArt(rows, palette, scale = 4) {
    const h = rows.length, w = rows[0].length;
    const c = liebiMakeCanvas(w * scale, h * scale);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const ch = rows[y][x];
            if (ch === '.' || ch === ' ') continue;
            g.fillStyle = palette[ch] || '#f0f';
            g.fillRect(x * scale, y * scale, scale, scale);
        }
    }
    return c;
}

function liebiNoise(g, px, color, count, seed) {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
        g.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), px, px);
    }
}

function buildLiebiAtlas() {
    if (liebiAtlas) return liebiAtlas;

    /* ---- wall textures (64x64) ---- */
    const tech = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#4a5258');
        for (let y = 0; y < 16; y += 8) p(0, y, 16, 1, '#2c3236');
        for (let i = 0; i < 16; i += 8) p(i, 0, 1, 16, '#3a4146');
        p(1, 1, 6, 6, '#565f66'); p(9, 1, 6, 6, '#565f66');
        p(1, 9, 6, 6, '#565f66'); p(9, 9, 6, 6, '#565f66');
        [[2, 2], [6, 2], [2, 6], [6, 6], [10, 2], [14, 2], [10, 6], [14, 6],
         [2, 10], [6, 10], [2, 14], [6, 14], [10, 10], [14, 10], [10, 14], [14, 14]]
            .forEach(([x, y]) => p(x, y, 1, 1, '#1e2326'));
        liebiNoise(g, 2, 'rgba(0,0,0,0.18)', 60, 7);
        liebiNoise(g, 1, 'rgba(255,255,255,0.05)', 50, 13);
    });

    const bunker = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#5d5a52');
        for (let y = 0; y < 16; y += 4) {
            p(0, y, 16, 1, '#3a3833');
            const off = (y / 4) % 2 ? 4 : 0;
            for (let x = off; x < 16; x += 8) p(x, y, 1, 4, '#3a3833');
        }
        liebiNoise(g, 2, 'rgba(0,0,0,0.22)', 90, 3);
        liebiNoise(g, 1, 'rgba(255,255,255,0.06)', 40, 11);
    });

    const hazard = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#46443c');
        for (let y = 0; y < 16; y += 4) p(0, y, 16, 1, '#2b2a25');
        g.fillStyle = '#b08a00';
        for (let i = -4; i < 20; i += 4) {
            g.beginPath();
            g.moveTo(i * 4, 64); g.lineTo((i + 2) * 4, 64); g.lineTo((i + 6) * 4, 40); g.lineTo((i + 4) * 4, 40);
            g.closePath(); g.fill();
        }
        p(0, 9, 16, 1, '#1c1b18');
        liebiNoise(g, 2, 'rgba(0,0,0,0.25)', 70, 5);
    });

    const circuit = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#10241a');
        p(0, 0, 16, 1, '#0a1810'); p(0, 15, 16, 1, '#0a1810');
        g.strokeStyle = '#1f8a3c';
        g.lineWidth = 2;
        let s = 21;
        const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
        for (let i = 0; i < 9; i++) {
            g.beginPath();
            let x = Math.floor(rnd() * 16) * 4, y = Math.floor(rnd() * 16) * 4;
            g.moveTo(x, y);
            for (let k = 0; k < 3; k++) {
                if (rnd() > 0.5) x = Math.floor(rnd() * 16) * 4; else y = Math.floor(rnd() * 16) * 4;
                g.lineTo(x, y);
            }
            g.stroke();
            g.fillStyle = '#39ff14';
            g.fillRect(x - 1, y - 1, 4, 4);
        }
        p(4, 5, 8, 5, '#06140c');
        p(5, 6, 6, 1, '#39ff14');
        p(5, 8, 4, 1, '#1f8a3c');
    });

    const pipes = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#3c4146');
        [[1, '#5a4a3a', '#7a6650'], [6, '#46525a', '#5e707a'], [11, '#4a4a52', '#62626e']].forEach(([x, dark, light]) => {
            p(x, 0, 3, 16, dark);
            p(x, 0, 1, 16, light);
            p(x, 3, 3, 1, '#22262a'); p(x, 10, 3, 1, '#22262a');
        });
        liebiNoise(g, 1, 'rgba(0,0,0,0.2)', 60, 17);
    });

    const doorTex = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#3f5a66');
        p(0, 0, 1, 16, '#23333a'); p(15, 0, 1, 16, '#23333a');
        p(7, 0, 2, 16, '#16262c');
        for (let y = 2; y < 16; y += 4) { p(1, y, 6, 1, '#54707c'); p(9, y, 6, 1, '#54707c'); }
        p(2, 7, 3, 2, '#b08a00'); p(11, 7, 3, 2, '#b08a00');
        liebiNoise(g, 1, 'rgba(0,0,0,0.18)', 40, 23);
    });

    const doorRed = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#5a2626');
        p(0, 0, 1, 16, '#301212'); p(15, 0, 1, 16, '#301212');
        p(7, 0, 2, 16, '#1c0a0a');
        for (let y = 2; y < 16; y += 4) { p(1, y, 6, 1, '#7a3a3a'); p(9, y, 6, 1, '#7a3a3a'); }
        p(3, 6, 2, 4, '#ff3030'); p(11, 6, 2, 4, '#ff3030');
        p(5, 1, 6, 2, '#1c0a0a');
        p(6, 1, 4, 2, '#ff8080');
        liebiNoise(g, 1, 'rgba(0,0,0,0.2)', 40, 29);
    });

    const secretTex = liebiTexture((g) => {
        g.drawImage(bunker, 0, 0);
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(30, 4); g.lineTo(34, 22); g.lineTo(28, 40); g.lineTo(33, 60);
        g.stroke();
    });

    const exitTex = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#2c3236');
        p(1, 1, 14, 14, '#11331a');
        p(2, 2, 12, 12, '#06140c');
        p(4, 6, 8, 4, '#0a3a16');
        g.fillStyle = '#39ff14';
        g.font = 'bold 13px monospace';
        g.textAlign = 'center';
        g.fillText('EXIT', 32, 36);
        p(7, 1, 2, 1, '#39ff14');
    });

    const floorTex = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#2e3338');
        for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x += 8) {
            p(x, y, 8, 1, '#212529'); p(x, y, 1, 8, '#212529');
            p(x + 1, y + 1, 1, 1, '#454c52');
            p(x + 6, y + 6, 1, 1, '#454c52');
        }
        liebiNoise(g, 2, 'rgba(0,0,0,0.2)', 80, 31);
    });

    const ceilTex = liebiTexture((g, p) => {
        p(0, 0, 16, 16, '#191c20');
        for (let y = 0; y < 16; y += 4) p(0, y, 16, 1, '#101216');
        for (let x = 0; x < 16; x += 4) p(x, 0, 1, 16, '#101216');
        p(5, 5, 6, 2, '#3a3f2a');
        p(6, 5, 4, 1, '#8a8a4a');
        liebiNoise(g, 1, 'rgba(0,0,0,0.25)', 50, 37);
    });

    /* ---- enemy sprites ---- */
    const guardPal = {
        k: '#10141a', a: '#2a3440', b: '#3c4a5a', v: '#39ff14', s: '#7a8694',
        g: '#23282e', f: '#ffb000', r: '#ff3030', w: '#e8e8e8'
    };
    const guardWalk1 = liebiSpriteArt([
        '.....kkkkk......',
        '....kbbbbbk.....',
        '....kbvvvbk.....',
        '....kbbbbbk.....',
        '.....kaaak......',
        '...kkaaaaakk....',
        '..kbaaaaaaabk...',
        '..kba.aaa.abk...',
        '..kskaaaaakgk...',
        '..ksk.aaa.kggk..',
        '....kaa.aak.....',
        '....kaa.aak.....',
        '....ka...ak.....',
        '...kaa...aak....',
        '...kk.....kk....',
        '..kkk.....kkk...'
    ], guardPal);
    const guardWalk2 = liebiSpriteArt([
        '.....kkkkk......',
        '....kbbbbbk.....',
        '....kbvvvbk.....',
        '....kbbbbbk.....',
        '.....kaaak......',
        '...kkaaaaakk....',
        '..kbaaaaaaabk...',
        '..kba.aaa.abk...',
        '..kgkaaaaaksk...',
        '.kggk.aaa.ksk...',
        '....kaa.aak.....',
        '....kaa.aak.....',
        '....ka...ak.....',
        '....ka...aak....',
        '....kk....kk....',
        '...kkk....kkk...'
    ], guardPal);
    const guardFire = liebiSpriteArt([
        '.....kkkkk......',
        '....kbbbbbk.....',
        '....kbrvrbk.....',
        '....kbbbbbk.....',
        '.....kaaak......',
        '...kkaaaaakk....',
        '..kbaaaaaaabk...',
        'ffkba.aaa.abk...',
        'wfgggaaaaakgk...',
        'ffk...aaa.kggk..',
        '....kaa.aak.....',
        '....kaa.aak.....',
        '....ka...ak.....',
        '...kaa...aak....',
        '...kk.....kk....',
        '..kkk.....kkk...'
    ], guardPal);
    const guardPain = liebiSpriteArt([
        '......kkkkk.....',
        '.....kbbbbbk....',
        '.....kbrrrbk....',
        '.....kbbbbbk....',
        '......kaaak.....',
        '....kkaaaaakk...',
        '...kbaaaaaaabk..',
        '..rkba.aaa.abk..',
        '.rrkskaaaaakgk..',
        '..r.sk.aaa.kgk..',
        '.....kaa.aak....',
        '....kaa..aak....',
        '....ka....ak....',
        '...kaa....aak...',
        '...kk......kk...',
        '..kkk......kkk..'
    ], guardPal);
    const guardDie1 = liebiSpriteArt([
        '................',
        '................',
        '......kkkkk.....',
        '.....kbbbbbk....',
        '.....kbrrrbk....',
        '....kkbbbbbkk...',
        '...kbaaaaaaabk..',
        '..rkba.aaa.abkr.',
        '.rrkskaaaaakgkr.',
        '..rsk..aaa..kg..',
        '....kaa..aak....',
        '...kaa....aak...',
        '...ka......ak...',
        '..kaa......aak..',
        '..kk........kk..',
        '.kkk........kkk.'
    ], guardPal);
    const guardCorpse = liebiSpriteArt([
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '......rr........',
        '..rrkkkkkkrr....',
        '.rkbbaaaabbkr...',
        'rkkaaaaaaaakkrr.',
        '.kkkkkkkkkkkkk..',
        '..r..rr..r......'
    ], guardPal);

    const dronePal = { k: '#0a0e12', m: '#3c4a55', l: '#5a6e7c', r: '#ff3030', v: '#39ff14', p: '#88a0b0' };
    const drone1 = liebiSpriteArt([
        '................',
        '................',
        '..pp........pp..',
        '.pppp..kk..pppp.',
        '..pp.kkmmkk.pp..',
        '....kmmmmmmk....',
        '...kmmlmmllmk...',
        '...kmlrrrrlmk...',
        '...kmmrrrrmmk...',
        '...kmmllmmllk...',
        '....kmmmmmmk....',
        '.....kkmmkk.....',
        '......kvvk......',
        '.......kk.......',
        '................',
        '................'
    ], dronePal);
    const drone2 = liebiSpriteArt([
        '................',
        '................',
        'pp............pp',
        'pppp...kk...pppp',
        '.pp..kkmmkk..pp.',
        '....kmmmmmmk....',
        '...kmmlmmllmk...',
        '...kmlrrrrlmk...',
        '...kmmrrrrmmk...',
        '...kmmllmmllk...',
        '....kmmmmmmk....',
        '.....kkmmkk.....',
        '......kvvk......',
        '.......kk.......',
        '................',
        '................'
    ], dronePal);
    const droneCorpse = liebiSpriteArt([
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '....k..kk..k....',
        '...kmkkmmkkmk...',
        '..kmmmmlmmmmk...',
        '.kkkkkkkkkkkkk..',
        '................'
    ], dronePal);

    const icPal = { c: '#31f5e5', d: '#1a8a80', k: '#06201e', w: '#d8fffa' };
    const ic1 = liebiSpriteArt([
        '................',
        '......ccc.......',
        '.....cdddc......',
        '....cdwdwdc.....',
        '....cdddddc.....',
        '.....cdddc......',
        '....ccdddcc.....',
        '...cdcdddcdc....',
        '..cd.cdddc.dc...',
        '..c..cdddc..c...',
        '.....cdddc......',
        '....cdddddc.....',
        '....cd.ddd.c....',
        '.....c.dd.c.....',
        '......c..c......',
        '................'
    ], icPal);
    const ic2 = liebiSpriteArt([
        '................',
        '......ccc.......',
        '.....cdddc......',
        '....cdwdwdc.....',
        '....cdddddc.....',
        '.....cdddc......',
        '...cccdddccc....',
        '..cd.cdddc.dc...',
        '.cd..cdddc..dc..',
        '.....cdddc......',
        '....cdddddc.....',
        '....cd.ddd.c....',
        '.....c.dd.c.....',
        '......c..c......',
        '.......cc.......',
        '................'
    ], icPal);
    const icCorpse = liebiSpriteArt([
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '......c..c......',
        '....cd.cc.dc....',
        '...c.dcddcd.c...',
        '....c.c..c.c....',
        '................'
    ], icPal);

    /* ---- pickups & props ---- */
    const medkit = liebiSpriteArt([
        '................', '................', '................', '................',
        '................', '................',
        '...kkkkkkkkkk...',
        '..kwwwwwwwwwwk..',
        '..kwwwwrrwwwwk..',
        '..kwwwrrrrwwwk..',
        '..kwwwwrrwwwwk..',
        '..kwwwwwwwwwwk..',
        '..kkkkkkkkkkkk..',
        '................', '................', '................'
    ], { k: '#101418', w: '#e8e8e8', r: '#ff3030' });
    const ammoBox = liebiSpriteArt([
        '................', '................', '................', '................',
        '................', '................', '................',
        '....kkkkkkkk....',
        '...kggggggggk...',
        '...kgffffffgk...',
        '...kgffffffgk...',
        '...kggggggggk...',
        '...kkkkkkkkkk...',
        '................', '................', '................'
    ], { k: '#101418', g: '#4a4434', f: '#ffb000' });
    const armorVest = liebiSpriteArt([
        '................', '................', '................', '................',
        '....kk....kk....',
        '...kvvk..kvvk...',
        '...kvvkkkkvvk...',
        '...kvvvvvvvvk...',
        '...kvvvvvvvvk...',
        '...kvgvvvvgvk...',
        '...kvvvvvvvvk...',
        '....kvvvvvvk....',
        '....kkkkkkkk....',
        '................', '................', '................'
    ], { k: '#101418', v: '#1f8a3c', g: '#39ff14' });
    const keycard = liebiSpriteArt([
        '................', '................', '................', '................',
        '................', '................',
        '....kkkkkkkk....',
        '....krrrrrrk....',
        '....krwwrrrk....',
        '....krrrrrrk....',
        '....krrkkrrk....',
        '....krrrrrrk....',
        '....kkkkkkkk....',
        '................', '................', '................'
    ], { k: '#101418', r: '#ff3030', w: '#ffffff' });
    const shard = liebiSpriteArt([
        '................', '................', '................',
        '.......c........',
        '......cwc.......',
        '.....cwwdc......',
        '.....cwddc......',
        '....cwwdddc.....',
        '....cwdddxc.....',
        '.....cdddc......',
        '.....cddxc......',
        '......cdc.......',
        '.......c........',
        '................', '................', '................'
    ], { c: '#31f5e5', w: '#d8fffa', d: '#1a9a90', x: '#0a4a44' });
    const shotgunPickup = liebiSpriteArt([
        '................', '................', '................', '................',
        '................', '................', '................',
        'kk..............',
        'kskkkkkkkkkkkk..',
        '.kssssssssssssk.',
        '..kkkkkwwkkkkkk.',
        '......kwwk......',
        '......kkkk......',
        '................', '................', '................'
    ], { k: '#101418', s: '#6a7682', w: '#4a3a26' });
    const barrel = liebiSpriteArt([
        '................', '................', '................',
        '.....kkkkkk.....',
        '....kggggggk....',
        '...kgggggggik...',
        '...kgyyyyygik...',
        '...kgggggggik...',
        '...kgggggggik...',
        '...kgyyyyygik...',
        '...kgggggggik...',
        '...kgggggggik...',
        '....kggggggk....',
        '.....kkkkkk.....',
        '................', '................'
    ], { k: '#101418', g: '#3a5a3a', i: '#28402a', y: '#b08a00' });
    const bolt = liebiSpriteArt([
        '................', '................', '................', '................',
        '................', '................',
        '......cc........',
        '....ccwwcc......',
        '...cwwwwwwc.....',
        '....ccwwcc......',
        '......cc........',
        '................',
        '................', '................', '................', '................'
    ], { c: '#31f5e5', w: '#ffffff' });

    /* ---- weapon viewmodels (24 cols, scale 6 => 144x96) ---- */
    const wpPal = { k: '#0c1014', g: '#2c343c', l: '#4a565e', h: '#c8a080', d: '#8a6a50', f: '#ffd040', o: '#ff8000' };
    const pistolIdle = liebiSpriteArt([
        '........................',
        '........................',
        '........................',
        '..........kk............',
        '..........kgk...........',
        '..........kggk..........',
        '..........kglgk.........',
        '..........kglgk.........',
        '.........kkgggkk........',
        '........khkgggkhk.......',
        '........khhgggkhh.......',
        '.......khhhkgkhhhk......',
        '.......khhhhhhhhhk......',
        '......khhhhhhhhhhk......',
        '......khhhhhhhhhhk......',
        '......hhhhhhhhhhhh......'
    ], wpPal, 6);
    const pistolFire = liebiSpriteArt([
        '..........ff............',
        '.........ffof...........',
        '........fofffof.........',
        '.........ffkff..........',
        '..........kgk...........',
        '..........kggk..........',
        '..........kglgk.........',
        '..........kglgk.........',
        '.........kkgggkk........',
        '........khkgggkhk.......',
        '........khhgggkhh.......',
        '.......khhhkgkhhhk......',
        '.......khhhhhhhhhk......',
        '......khhhhhhhhhhk......',
        '......khhhhhhhhhhk......',
        '......hhhhhhhhhhhh......'
    ], wpPal, 6);
    const shotgunIdle = liebiSpriteArt([
        '........................',
        '........................',
        '.........kkkk...........',
        '........kllllk..........',
        '........klgglk..........',
        '........klgglk..........',
        '........klgglk..........',
        '........kggggk..........',
        '.......kkggggkk.........',
        '......kdkggggkdk........',
        '......kddggggddk........',
        '.....kdddkggkdddk.......',
        '.....kddddddddddk.......',
        '....kddddddddddddk......',
        '....kddddddddddddk......',
        '....dddddddddddddd......'
    ], wpPal, 6);
    const shotgunFire = liebiSpriteArt([
        '........ffffff..........',
        '.......fofoofof.........',
        '......foffffffof........',
        '.......ffkkkkff.........',
        '........kllllk..........',
        '........klgglk..........',
        '........klgglk..........',
        '........kggggk..........',
        '.......kkggggkk.........',
        '......kdkggggkdk........',
        '......kddggggddk........',
        '.....kdddkggkdddk.......',
        '.....kddddddddddk.......',
        '....kdddddddddddk.......',
        '....kddddddddddddk......',
        '....dddddddddddddd......'
    ], wpPal, 6);

    liebiAtlas = {
        wallSets: { '#': [tech, bunker, pipes], c: [circuit], h: [hazard], '%': [secretTex], D: [doorTex], R: [doorRed], E: [exitTex] },
        floorTex, ceilTex,
        sprites: {
            guard: { walk: [guardWalk1, guardWalk2], fire: guardFire, pain: guardPain, die: [guardDie1, guardCorpse], corpse: guardCorpse },
            drone: { walk: [drone1, drone2], fire: drone2, pain: drone1, die: [droneCorpse, droneCorpse], corpse: droneCorpse },
            ic: { walk: [ic1, ic2], fire: ic2, pain: ic1, die: [icCorpse, icCorpse], corpse: icCorpse },
            pickups: { A: ammoBox, M: medkit, V: armorVest, K: keycard, S: shard, W: shotgunPickup },
            barrel, bolt
        },
        weapons: {
            pistol: { idle: pistolIdle, fire: pistolFire },
            shotgun: { idle: shotgunIdle, fire: shotgunFire }
        }
    };
    return liebiAtlas;
}

/* ---------------- overlay DOM ---------------- */
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
    canvas.width = 384;
    canvas.height = 240;
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

    stage.append(canvasWrap);

    const footer = liebiElement('div', 'liebi-footer');
    const controls = liebiElement('div', 'liebi-controls', 'CLICK = MOUSE LOOK | WASD MOVE | ←/→ TURN | SPACE/CLICK FIRE | F USE | 1/2 WEAPON | M MAP | ESC EXIT');
    const footerStatus = liebiElement('div', 'liebi-controls', 'BLACKSITE SUBLEVEL 03 // FIND THE RED KEY + DATA SHARD');
    footer.append(controls, footerStatus);

    shell.append(topbar, stage, footer);
    overlay.appendChild(shell);
    return overlay;
}

/* ---------------- sfx ---------------- */
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
        AudioEngine.sequence([
            { type: 'square', frequency: 42, endFrequency: 66, duration: 0.34, gain: 0.05, filterFrequency: 140, throttleKey: 'liebiDoor', minInterval: 0.3 },
            { type: 'sawtooth', frequency: 30, duration: 0.3, gain: 0.02, filterFrequency: 90, startOffset: 0.04 }
        ]);
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
    } else if (kind === 'boom') {
        AudioEngine.sequence([
            { type: 'sawtooth', frequency: 60, endFrequency: 18, duration: 0.5, gain: 0.12, filterFrequency: 120, throttleKey: 'liebiBoom', minInterval: 0.2 },
            { type: 'triangle', frequency: 30, endFrequency: 14, duration: 0.6, gain: 0.06, filterFrequency: 70, startOffset: 0.03 }
        ]);
    } else if (kind === 'plasma') {
        AudioEngine.tone({ type: 'sawtooth', frequency: 220, endFrequency: 90, duration: 0.18, gain: 0.045, filterFrequency: 420, throttleKey: 'liebiPlasma', minInterval: 0.12 });
    } else if (kind === 'secret') {
        AudioEngine.sequence([
            { type: 'triangle', frequency: 70, duration: 0.1, gain: 0.06, filterFrequency: 200 },
            { type: 'triangle', frequency: 95, duration: 0.1, gain: 0.055, filterFrequency: 220, startOffset: 0.1 },
            { type: 'triangle', frequency: 130, duration: 0.16, gain: 0.05, filterFrequency: 260, startOffset: 0.2 }
        ]);
    } else if (kind === 'win') {
        AudioEngine.successTone();
    }
}

function closeLiebiGame() {
    if (liebiGameCleanup) liebiGameCleanup();
}


// ============================================================
// startLiebiGame — Wolfenstein / Doom-style textured raycaster
// Depends on buildLiebiAtlas(), createLiebiGameOverlay(),
// liebiSfx(), and closeLiebiGame() from liebi-part1.
// ============================================================
function startLiebiGame() {
    if (liebiGameCleanup || document.getElementById('liebiOverlay')) return;

    const atlas = buildLiebiAtlas();
    const overlay = createLiebiGameOverlay();
    document.body.appendChild(overlay);
    overlay.focus();

    const canvas = document.getElementById('liebiCanvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    // ── Layout ──────────────────────────────────────────────
    const W = 384, H = 240;
    const VH = 196;             // 3-D view height
    const HUD_Y = VH;           // HUD starts here
    const HUD_H = H - VH;       // 44 px HUD strip

    // ── Projection ──────────────────────────────────────────
    // Classic Wolf3D feel: ~66° horizontal FOV
    const PLANE_LEN = 0.68;     // camera-plane half-length ≈ tan(34°)

    // ── State ───────────────────────────────────────────────
    let map, player, enemies, doors, barrels, projectiles, pickups, exitPos;
    let won = false, lost = false;
    let frameId = 0, lastTime = 0;
    let damageFlash = 0;  // red vignette timer (ms)
    let muzzleFlash = 0;  // bright flash timer (ms)
    let recoil = 0;       // weapon bob Y
    let weaponBob = 0;
    let showMap = false;
    let message = '', messageUntil = 0;

    // ── Map parsing ─────────────────────────────────────────
    function initState() {
        const src = LIEBI_MAP_TEMPLATE.map(r => r.split(''));
        pickups = []; enemies = []; doors = []; barrels = []; projectiles = [];
        player = {
            x: 2, y: 2, angle: 0.05,
            health: 100, armor: 0, ammo: 30, shells: 0,
            weapon: 'pistol', weapons: { pistol: true, shotgun: false },
            shard: false, redKey: false, score: 0, kills: 0
        };
        exitPos = null;
        won = false; lost = false;
        damageFlash = 0; muzzleFlash = 0; recoil = 0;

        for (let r = 0; r < src.length; r++) {
            for (let c = 0; c < src[r].length; c++) {
                const t = src[r][c];
                if (t === 'P') {
                    player.x = c + 0.5; player.y = r + 0.5;
                    src[r][c] = '.';
                } else if ('AMVWKS'.includes(t)) {
                    pickups.push({ x: c + 0.5, y: r + 0.5, type: t, taken: false, pulse: (c + r) * 0.37 });
                    src[r][c] = '.';
                } else if ('123'.includes(t)) {
                    enemies.push(newEnemy(t, c + 0.5, r + 0.5));
                    src[r][c] = '.';
                } else if (t === 'D' || t === 'R') {
                    doors.push({ mx: c, my: r, type: t, anim: 0, opening: false, closing: false, timer: 0 });
                    // keep 'D'/'R' in map for raycaster
                } else if (t === 'B') {
                    barrels.push({ x: c + 0.5, y: r + 0.5, exploded: false, exTimer: 0 });
                    src[r][c] = '.';
                } else if (t === 'X') {
                    exitPos = { x: c + 0.5, y: r + 0.5 };
                }
            }
        }
        map = src;
        setMsg('BLACKSITE BREACH INITIATED — FIND RED KEY + DATA SHARD, REACH EXIT', 4500);
    }
    initState();

    // ── Helpers ─────────────────────────────────────────────
    function tileAt(wx, wy) {
        const row = map[Math.floor(wy)];
        if (!row) return '#';
        return row[Math.floor(wx)] || '#';
    }
    function getDoor(mx, my) {
        return doors.find(d => d.mx === mx && d.my === my) || null;
    }
    function isSolid(wx, wy) {
        const t = tileAt(wx, wy);
        if (t === '.' || t === 'X') return false;
        if (t === 'D' || t === 'R') {
            const d = getDoor(Math.floor(wx), Math.floor(wy));
            return !d || d.anim < 1.0;
        }
        return true;
    }
    function setMsg(txt, dur) { message = txt; messageUntil = performance.now() + dur; }

    // ── Enemy factory ───────────────────────────────────────
    function newEnemy(t, x, y) {
        const base = { x, y, angle: Math.random() * 6.28, dead: false, alert: false,
                        hitFlash: 0, walkFrame: 0, walkTimer: 300, lastAtk: 0 };
        if (t === '2') return { ...base, type: 'drone', hp: 5,  maxHp: 5,  speed: 1.0, damage: 12, range: 5.5, atkDelay: 1100 };
        if (t === '3') return { ...base, type: 'ic',    hp: 8,  maxHp: 8,  speed: 0.6, damage: 18, range: 9.0, atkDelay: 1600 };
        return             { ...base, type: 'guard', hp: 4,  maxHp: 4,  speed: 0.85, damage: 9, range: 4.5, atkDelay: 1400 };
    }

    // ── Input ────────────────────────────────────────────────
    const keysDown = {};
    let pointerLocked = false;
    let lastShot = 0;

    const GAME_KEYS = new Set(['w','s','a','d','q','e','f','m',' ','1','2',
                                'arrowup','arrowdown','arrowleft','arrowright']);
    function onKeyDown(e) {
        if (e.key === 'Escape') { closeGame(); return; }
        const k = e.key.toLowerCase();
        keysDown[k] = true;
        if (GAME_KEYS.has(k)) e.preventDefault();
        if (k === 'm') { showMap = !showMap; return; }
        if (k === '1') { player.weapon = 'pistol'; }
        if (k === '2' && player.weapons.shotgun) { player.weapon = 'shotgun'; }
        if (k === ' ') { tryShoot(); }
        if (k === 'f') { tryUse(); }
    }
    function onKeyUp(e) { keysDown[e.key.toLowerCase()] = false; }

    canvas.addEventListener('click', () => {
        if (!pointerLocked) { canvas.requestPointerLock(); return; }
        tryShoot();
    });
    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousemove', e => {
        if (pointerLocked) player.angle += e.movementX * 0.0030;
    });

    // ── Shooting ─────────────────────────────────────────────
    function tryShoot() {
        if (won || lost) return;
        const now = performance.now();
        const delay = player.weapon === 'shotgun' ? 750 : 400;
        if (now - lastShot < delay) return;
        const ammoKey = player.weapon === 'shotgun' ? 'shells' : 'ammo';
        if (player[ammoKey] <= 0) { setMsg('OUT OF AMMO', 1200); liebiSfx('locked'); return; }
        player[ammoKey]--;
        lastShot = now;
        muzzleFlash = 130;
        recoil = 1.0;
        liebiSfx(player.weapon === 'shotgun' ? 'shotgun' : 'shot');

        const pellets = player.weapon === 'shotgun' ? 3 : 1;
        for (let p = 0; p < pellets; p++) {
            const spread = player.weapon === 'shotgun' ? (Math.random() - 0.5) * 0.14 : 0;
            const hit = bulletTrace(player.x, player.y, player.angle + spread);
            if (!hit) continue;
            if (hit.type === 'enemy') {
                const dmg = player.weapon === 'shotgun'
                    ? 16 + Math.floor(Math.random() * 14)
                    : 10 + Math.floor(Math.random() * 8);
                damageEnemy(hit.obj, dmg);
            } else if (hit.type === 'barrel') {
                explodeBarrel(hit.obj);
            }
        }
    }

    function bulletTrace(sx, sy, ang) {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        let x = sx, y = sy;
        for (let step = 0; step < 120; step++) {
            x += dx * 0.15; y += dy * 0.15;
            for (const e of enemies) {
                if (!e.dead && dist2(e.x, e.y, x, y) < 0.22) return { type: 'enemy', obj: e };
            }
            for (const b of barrels) {
                if (!b.exploded && dist2(b.x, b.y, x, y) < 0.18) return { type: 'barrel', obj: b };
            }
            if (isSolid(x, y)) return null;
        }
        return null;
    }

    function dist2(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

    // ── Enemy damage ─────────────────────────────────────────
    function damageEnemy(e, dmg) {
        if (e.dead) return;
        e.hp -= dmg; e.hitFlash = 160; e.alert = true;
        liebiSfx('hit');
        if (e.hp <= 0) {
            e.dead = true; e.hp = 0;
            player.score += e.type === 'guard' ? 100 : e.type === 'drone' ? 200 : 350;
            player.kills++;
        }
    }

    // ── Barrels ──────────────────────────────────────────────
    function explodeBarrel(barrel, _chain) {
        if (barrel.exploded) return;
        barrel.exploded = true; barrel.exTimer = 450;
        liebiSfx('boom');
        damageFlash = Math.min(255, damageFlash + 70);
        const RADIUS = 2.6;
        enemies.forEach(e => {
            const d = dist2(e.x, e.y, barrel.x, barrel.y);
            if (d < RADIUS) damageEnemy(e, Math.floor(44 * (1 - d / RADIUS)));
        });
        barrels.forEach(b => {
            if (!b.exploded && dist2(b.x, b.y, barrel.x, barrel.y) < RADIUS)
                setTimeout(() => explodeBarrel(b, true), 100 + Math.random() * 180);
        });
        const pd = dist2(player.x, player.y, barrel.x, barrel.y);
        if (pd < RADIUS) hurtPlayer(Math.floor(35 * (1 - pd / RADIUS)));
    }

    // ── Player damage ────────────────────────────────────────
    function hurtPlayer(dmg) {
        if (won) return;
        let eff = dmg;
        if (player.armor > 0) {
            const abs = Math.min(player.armor, Math.floor(dmg * 0.5));
            player.armor -= abs; eff = dmg - abs;
        }
        player.health = Math.max(0, player.health - eff);
        damageFlash = Math.min(255, damageFlash + 90);
        liebiSfx('hurt');
        if (player.health <= 0) { lost = true; setTimeout(() => showEndModal(false), 600); }
    }

    // ── Use / interact ───────────────────────────────────────
    function tryUse() {
        if (won || lost) return;
        const fx = player.x + Math.cos(player.angle), fy = player.y + Math.sin(player.angle);
        const mx = Math.floor(fx), my = Math.floor(fy);
        const door = getDoor(mx, my);
        if (door) {
            if (door.type === 'R' && !player.redKey) { setMsg('RED KEYCARD REQUIRED', 1800); liebiSfx('locked'); return; }
            if (!door.opening && door.anim < 1.0) { door.opening = true; door.closing = false; liebiSfx('door'); }
            return;
        }
        // Secret push-wall
        if (tileAt(fx, fy) === '%') {
            map[my][mx] = '.';
            liebiSfx('secret');
            player.score += 500;
            setMsg('SECRET AREA DISCOVERED! +500 PTS', 2500);
        }
    }

    // ── Enemy AI ─────────────────────────────────────────────
    function hasLOS(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const steps = Math.ceil(Math.hypot(dx, dy) / 0.2);
        for (let i = 1; i < steps; i++) {
            if (isSolid(x1 + dx * i / steps, y1 + dy * i / steps)) return false;
        }
        return true;
    }

    function updateEnemies(dt, now) {
        for (const e of enemies) {
            if (e.hitFlash > 0) e.hitFlash -= dt;
            if (e.dead) continue;

            const dx = player.x - e.x, dy = player.y - e.y;
            const d = Math.hypot(dx, dy);

            if (!e.alert && d < 12 && hasLOS(e.x, e.y, player.x, player.y)) e.alert = true;
            if (!e.alert) continue;

            // Move
            if (d > 0.85) {
                const spd = e.speed * dt / 1000;
                const nx = e.x + (dx / d) * spd, ny = e.y + (dy / d) * spd;
                if (!isSolid(nx, e.y)) e.x = nx;
                if (!isSolid(e.x, ny)) e.y = ny;
            }

            // Walk animation
            e.walkTimer -= dt;
            if (e.walkTimer <= 0) { e.walkFrame ^= 1; e.walkTimer = 280; }

            // Attack
            if (d < e.range && now - e.lastAtk > e.atkDelay) {
                e.lastAtk = now;
                if (e.type === 'ic') {
                    // Ranged projectile
                    const ang = Math.atan2(dy, dx);
                    projectiles.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 4.5, vy: Math.sin(ang) * 4.5, dmg: e.damage, age: 0 });
                    liebiSfx('plasma');
                } else if (hasLOS(e.x, e.y, player.x, player.y)) {
                    hurtPlayer(e.damage);
                }
            }
        }
    }

    // ── Doors ────────────────────────────────────────────────
    function updateDoors(dt, now) {
        for (const d of doors) {
            if (d.opening) {
                d.anim = Math.min(1, d.anim + dt / 480);
                if (d.anim >= 1) { d.opening = false; d.timer = now + 5000; }
            } else if (d.anim >= 1 && now > d.timer && !d.closing) {
                const blocked =
                    dist2(player.x, player.y, d.mx + 0.5, d.my + 0.5) < 1.1 ||
                    enemies.some(e => !e.dead && dist2(e.x, e.y, d.mx + 0.5, d.my + 0.5) < 1.1);
                if (!blocked) d.closing = true;
            } else if (d.closing) {
                d.anim = Math.max(0, d.anim - dt / 480);
                if (d.anim <= 0) { d.closing = false; }
            }
        }
    }

    // ── Projectiles ──────────────────────────────────────────
    function updateProjectiles(dt) {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.age += dt;
            if (p.age > 3000) { projectiles.splice(i, 1); continue; }
            p.x += p.vx * dt / 1000;
            p.y += p.vy * dt / 1000;
            if (isSolid(p.x, p.y)) { projectiles.splice(i, 1); continue; }
            if (dist2(p.x, p.y, player.x, player.y) < 0.4) {
                hurtPlayer(p.dmg);
                projectiles.splice(i, 1);
            }
        }
    }

    // ── Pickups ──────────────────────────────────────────────
    function checkPickups() {
        for (const pk of pickups) {
            if (pk.taken || dist2(pk.x, pk.y, player.x, player.y) > 0.72) continue;
            pk.taken = true;
            liebiSfx('pickup');
            switch (pk.type) {
                case 'A': player.ammo  = Math.min(99, player.ammo + 12);  setMsg('AMMO PACK +12', 1000);              player.score += 10;  break;
                case 'M': player.health= Math.min(100,player.health + 25); setMsg('MEDKIT +25 HEALTH', 1200);          player.score += 25;  break;
                case 'V': player.armor = Math.min(100,player.armor + 30);  setMsg('ARMOR VEST +30', 1200);             player.score += 25;  break;
                case 'W': player.weapons.shotgun = true; player.shells = Math.min(50,player.shells+14);
                          player.weapon = 'shotgun';     setMsg('SHOTGUN ACQUIRED!', 2200);                            player.score += 100; break;
                case 'K': player.redKey = true;                            setMsg('RED KEYCARD OBTAINED', 2200);       player.score += 200; break;
                case 'S': player.shard  = true;                            setMsg('DATA SHARD RECOVERED — REACH EXIT!', 3500); player.score += 500; break;
            }
        }
    }

    // ── Exit check ───────────────────────────────────────────
    function checkExit() {
        if (!exitPos || won || lost) return;
        if (!player.shard || !player.redKey) return;
        if (dist2(player.x, player.y, exitPos.x, exitPos.y) > 1.1) return;
        won = true; player.score += 1000;
        liebiSfx('win');
        setMsg('MISSION COMPLETE — BLACKSITE SECURED', 4000);
        setTimeout(() => showEndModal(true), 1200);
    }

    // ── Player movement ──────────────────────────────────────
    function updatePlayer(dt) {
        if (won || lost) return;
        const spd = 2.8 * dt / 1000;
        const trn = 2.1 * dt / 1000;
        const MARGIN = 0.28;

        if (keysDown['arrowleft']  || keysDown['q']) player.angle -= trn;
        if (keysDown['arrowright'] || keysDown['e']) player.angle += trn;

        const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
        let mx = 0, my = 0;
        if (keysDown['w'] || keysDown['arrowup'])   { mx += cos * spd; my += sin * spd; }
        if (keysDown['s'] || keysDown['arrowdown']) { mx -= cos * spd; my -= sin * spd; }
        if (keysDown['a']) { mx += sin * spd;  my -= cos * spd; }
        if (keysDown['d']) { mx -= sin * spd;  my += cos * spd; }

        if (!isSolid(player.x + mx + Math.sign(mx) * MARGIN, player.y)) player.x += mx;
        if (!isSolid(player.x, player.y + my + Math.sign(my) * MARGIN)) player.y += my;
    }

    // ── Z-buffer ─────────────────────────────────────────────
    const zBuf = new Float32Array(W);

    // ── Texture helper ───────────────────────────────────────
    function getWallTex(tile, mx, my) {
        const ws = atlas.wallSets;
        if (tile === 'D') return ws['D'][0];
        if (tile === 'R') return ws['R'][0];
        if (tile === 'c') return ws['c'][0];
        if (tile === 'h') return ws['h'][0];
        if (tile === '%') return ws['%'][0];
        // Vary default '#' wall by position for visual variety
        const idx = (mx * 3 + my * 7) % ws['#'].length;
        return ws['#'][idx];
    }

    // ── 3-D Renderer ─────────────────────────────────────────
    function render3D() {
        // Ceiling
        const cg = ctx.createLinearGradient(0, 0, 0, VH / 2);
        cg.addColorStop(0, '#06080a'); cg.addColorStop(1, '#12181e');
        ctx.fillStyle = cg; ctx.fillRect(0, 0, W, VH / 2);
        // Floor
        const fg = ctx.createLinearGradient(0, VH / 2, 0, VH);
        fg.addColorStop(0, '#161a1e'); fg.addColorStop(1, '#080a0c');
        ctx.fillStyle = fg; ctx.fillRect(0, VH / 2, W, VH / 2);

        const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
        const plX = -dirY * PLANE_LEN, plY = dirX * PLANE_LEN;

        for (let col = 0; col < W; col++) {
            const camX = 2 * col / W - 1;
            const rdX = dirX + plX * camX, rdY = dirY + plY * camX;

            let mapX = Math.floor(player.x), mapY = Math.floor(player.y);
            const ddX = rdX === 0 ? 1e30 : Math.abs(1 / rdX);
            const ddY = rdY === 0 ? 1e30 : Math.abs(1 / rdY);
            const stX = rdX < 0 ? -1 : 1, stY = rdY < 0 ? -1 : 1;
            let sdX = rdX < 0 ? (player.x - mapX) * ddX : (mapX + 1 - player.x) * ddX;
            let sdY = rdY < 0 ? (player.y - mapY) * ddY : (mapY + 1 - player.y) * ddY;

            let side = 0, hitTile = '.', doorAnim = 0;
            for (let guard = 0; guard < 64; guard++) {
                if (sdX < sdY) { sdX += ddX; mapX += stX; side = 0; }
                else           { sdY += ddY; mapY += stY; side = 1; }
                const row = map[mapY];
                if (!row) { hitTile = '#'; break; }
                hitTile = row[mapX] || '#';
                if (hitTile === '.' || hitTile === 'X') continue;
                if (hitTile === 'D' || hitTile === 'R') {
                    const d = getDoor(mapX, mapY);
                    if (d && d.anim >= 1.0) continue;   // open door — pass through
                    doorAnim = d ? d.anim : 0;
                }
                break;
            }

            const perp = Math.max(0.05,
                side === 0 ? sdX - ddX : sdY - ddY);
            zBuf[col] = perp;

            // Wall height in screen pixels
            const wallH = Math.floor(VH / perp);
            const wallTop = Math.floor(VH / 2 - wallH / 2);
            const wallBot = wallTop + wallH;
            const drawTop = Math.max(0, wallTop);
            const drawBot = Math.min(VH - 1, wallBot);
            const dstH = drawBot - drawTop;
            if (dstH <= 0) continue;

            // Texture U coordinate
            let wallX = side === 0
                ? player.y + perp * rdY
                : player.x + perp * rdX;
            wallX -= Math.floor(wallX);
            let texU = Math.floor(wallX * 64) & 63;
            // Prevent texture mirroring on certain sides
            if (side === 0 && rdX > 0) texU = 63 - texU;
            if (side === 1 && rdY < 0) texU = 63 - texU;

            // Texture V range (handles partially-open doors and close-up clips)
            const texVStart = Math.floor((drawTop - wallTop) / wallH * 64);
            const texVEnd   = Math.min(64, Math.ceil((drawBot - wallTop) / wallH * 64));
            const srcH = Math.max(1, texVEnd - texVStart);

            // Sliding door: source Y shifts downward as door opens
            const doorShift = Math.floor(doorAnim * 64);
            const srcYBase = texVStart + doorShift;
            const srcYClamped = Math.min(63, srcYBase);
            const srcHClamped = Math.min(64 - srcYClamped, srcH);
            if (srcHClamped <= 0) continue;

            const tex = getWallTex(hitTile, mapX, mapY);
            ctx.globalAlpha = 1;
            ctx.drawImage(tex, texU, srcYClamped, 1, srcHClamped, col, drawTop, 1, dstH);

            // Side-wall shade + distance fog
            const shadeFactor = side === 1 ? 0.55 : 1.0;
            const fog = Math.max(0, 1.0 - perp / 13);
            const darkness = (1 - fog * shadeFactor);
            if (darkness > 0.05) {
                ctx.fillStyle = `rgba(6,8,10,${darkness * 0.82})`;
                ctx.fillRect(col, drawTop, 1, dstH);
            }
        }
        ctx.globalAlpha = 1;
    }

    // ── Sprite renderer ──────────────────────────────────────
    function spriteTexFor(item) {
        const sp = atlas.sprites;
        if (item._pickup)   return sp.pickups[item.type] || null;
        if (item._bolt)     return sp.bolt;
        if (item._barrel)   return item.exploded ? null : sp.barrel;
        // Enemy
        const es = sp[item.type];
        if (!es) return null;
        if (item.dead)         return es.corpse;
        if (item.hitFlash > 0) return es.pain;
        return es.walk[item.walkFrame & 1];
    }

    function renderSprites() {
        const list = [];
        enemies.forEach(e => {
            const dx = e.x - player.x, dy = e.y - player.y;
            list.push({ x: e.x, y: e.y, distSq: dx * dx + dy * dy, src: e });
        });
        barrels.forEach(b => {
            if (!b.exploded || b.exTimer > 0) {
                b._barrel = true;
                const dx = b.x - player.x, dy = b.y - player.y;
                list.push({ x: b.x, y: b.y, distSq: dx * dx + dy * dy, src: b });
            }
        });
        pickups.forEach(pk => {
            if (pk.taken) return;
            pk._pickup = true;
            const dx = pk.x - player.x, dy = pk.y - player.y;
            list.push({ x: pk.x, y: pk.y, distSq: dx * dx + dy * dy, src: pk });
        });
        projectiles.forEach(pr => {
            pr._bolt = true;
            const dx = pr.x - player.x, dy = pr.y - player.y;
            list.push({ x: pr.x, y: pr.y, distSq: dx * dx + dy * dy, src: pr });
        });

        // Farthest first
        list.sort((a, b) => b.distSq - a.distSq);

        const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
        const plX = -dirY * PLANE_LEN, plY = dirX * PLANE_LEN;
        const invDet = 1 / (plX * dirY - plY * dirX);

        for (const s of list) {
            const tex = spriteTexFor(s.src);
            if (!tex) continue;

            const dx = s.x - player.x, dy = s.y - player.y;
            const txX = invDet * ( dirY * dx - dirX * dy);
            const txY = invDet * (-plY  * dx + plX  * dy);
            if (txY < 0.15) continue; // behind player

            const scX = Math.floor((W / 2) * (1 + txX / txY));
            const sprH = Math.abs(Math.floor(VH / txY));
            const sprW = sprH;

            const dsy = Math.max(0, Math.floor(VH / 2 - sprH / 2));
            const dey = Math.min(VH - 1, Math.floor(VH / 2 + sprH / 2));
            const dsx = Math.max(0, Math.floor(scX - sprW / 2));
            const dex = Math.min(W - 1, Math.floor(scX + sprW / 2));
            const dh  = dey - dsy;
            if (dh <= 0 || dex < 0 || dsx >= W) continue;

            // Distance fog on sprites
            const fog = Math.max(0.18, 1.0 - txY / 13);
            ctx.globalAlpha = fog;

            for (let sx = dsx; sx <= dex; sx++) {
                if (txY > zBuf[sx]) continue; // behind a wall
                const tu = Math.floor(((sx - (scX - sprW / 2)) / sprW) * 64);
                if (tu < 0 || tu >= 64) continue;
                ctx.drawImage(tex, tu, 0, 1, 64, sx, dsy, 1, dh);
            }
            ctx.globalAlpha = 1;
        }
    }

    // ── Weapon viewmodel ─────────────────────────────────────
    function renderWeapon() {
        const wname = player.weapon;
        const wp = atlas.weapons[wname];
        if (!wp) return;

        const tex = muzzleFlash > 0 ? wp.fire : wp.idle;
        weaponBob += won || lost ? 0 : 0.055;
        const bobY  = Math.sin(weaponBob) * 3.5;
        recoil *= 0.84; if (recoil < 0.005) recoil = 0;

        // Weapon sprite: 144 × 96 (pistol), centered slightly right
        const wx = Math.floor(W / 2 - 72 + (wname === 'pistol' ? 22 : 8));
        const wy = Math.floor(VH - 96 + bobY + recoil * 14);
        ctx.drawImage(tex, wx, wy);

        if (muzzleFlash > 0) muzzleFlash -= 18;
    }

    // ── HUD ──────────────────────────────────────────────────
    function renderHUD() {
        // Background
        ctx.fillStyle = '#1c1812'; ctx.fillRect(0, HUD_Y, W, HUD_H);
        ctx.fillStyle = '#3a3020'; ctx.fillRect(0, HUD_Y, W, 1);

        // ── LEFT: health + armor ─────────────────────────────
        const hpPct = player.health / 100;
        const apPct = player.armor  / 100;

        ctx.font = '7px monospace'; ctx.textAlign = 'left';
        ctx.fillStyle = '#888'; ctx.fillText('HLTH', 4, HUD_Y + 9);

        // HP bar bg
        ctx.fillStyle = '#2a0808'; ctx.fillRect(4, HUD_Y + 11, 58, 6);
        // HP bar fill
        ctx.fillStyle = hpPct > 0.5 ? '#39ff14' : hpPct > 0.25 ? '#ffb000' : '#ff2222';
        ctx.fillRect(4, HUD_Y + 11, Math.floor(58 * hpPct), 6);

        ctx.fillStyle = '#e8e8e8'; ctx.font = 'bold 11px monospace';
        ctx.fillText(player.health, 4, HUD_Y + 27);

        // Armor
        ctx.fillStyle = '#888'; ctx.font = '7px monospace';
        ctx.fillText('ARMR', 36, HUD_Y + 9);
        ctx.fillStyle = '#082040'; ctx.fillRect(36, HUD_Y + 11, 34, 6);
        ctx.fillStyle = '#4488ff'; ctx.fillRect(36, HUD_Y + 11, Math.floor(34 * apPct), 6);
        ctx.fillStyle = '#8ab4ff'; ctx.font = 'bold 11px monospace';
        ctx.fillText(player.armor, 36, HUD_Y + 27);

        // ── CENTER: face portrait ────────────────────────────
        drawHUDFace(W / 2 - 16, HUD_Y + 2, 32, HUD_H - 4);

        // ── RIGHT: ammo + indicators ─────────────────────────
        const ammoVal   = player.weapon === 'shotgun' ? player.shells : player.ammo;
        const ammoLabel = player.weapon === 'shotgun' ? 'SHLL' : 'AMMO';

        ctx.textAlign = 'right'; ctx.font = '7px monospace';
        ctx.fillStyle = '#888'; ctx.fillText(ammoLabel, W - 4, HUD_Y + 9);
        ctx.fillStyle = ammoVal > 5 ? '#ffb000' : '#ff3030';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(ammoVal, W - 4, HUD_Y + 27);

        // Key / Shard indicators (small squares)
        let indX = W - 72;
        if (player.redKey) {
            ctx.fillStyle = '#aa2222'; ctx.fillRect(indX, HUD_Y + 30, 14, 10);
            ctx.fillStyle = '#ff8888'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
            ctx.fillText('KEY', indX + 7, HUD_Y + 38);
            indX += 18;
        }
        if (player.shard) {
            ctx.fillStyle = '#1a7a72'; ctx.fillRect(indX, HUD_Y + 30, 14, 10);
            ctx.fillStyle = '#31f5e5'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
            ctx.fillText('SHD', indX + 7, HUD_Y + 38);
        }

        // Score + kills (bottom-right corner, tiny)
        ctx.fillStyle = '#44556a'; ctx.font = '7px monospace'; ctx.textAlign = 'right';
        ctx.fillText(`${player.score}PTS  K:${player.kills}`, W - 4, HUD_Y + 39);

        ctx.textAlign = 'left';
    }

    function drawHUDFace(x, y, w, h) {
        const hp = player.health;
        const hurt = damageFlash > 80;
        const dying = hp < 25;

        ctx.fillStyle = hurt ? '#3a1010' : dying ? '#2a1808' : '#242018';
        ctx.fillRect(x, y, w, h);

        const skin = hurt ? '#c06060' : dying ? '#9a7050' : '#c8906a';
        const eye  = hurt ? '#ff1818' : dying ? '#cc7700' : '#39ff14';

        // face
        const cx = x + w / 2, cy = y + h / 2;
        ctx.fillStyle = skin;
        ctx.fillRect(cx - 10, cy - 11, 20, 22);
        // helmet/hair
        ctx.fillStyle = '#1e2830';
        ctx.fillRect(cx - 10, cy - 14, 20, 5);
        // eyes
        ctx.fillStyle = eye;
        ctx.fillRect(cx - 8, cy - 5, 5, 4);
        ctx.fillRect(cx + 3, cy - 5, 5, 4);
        // pupils
        ctx.fillStyle = '#000810';
        ctx.fillRect(cx - 6, cy - 4, 2, 2);
        ctx.fillRect(cx + 5, cy - 4, 2, 2);
        // nose
        ctx.fillStyle = dying ? '#7a5040' : '#b07858';
        ctx.fillRect(cx - 1, cy, 3, 3);
        // mouth
        if (hurt) {
            ctx.fillStyle = '#1a0606'; ctx.fillRect(cx - 6, cy + 5, 12, 4);
            ctx.fillStyle = '#cc3333'; ctx.fillRect(cx - 5, cy + 6, 10, 2);
        } else if (dying) {
            ctx.fillStyle = '#1a0606'; ctx.fillRect(cx - 4, cy + 5, 8, 3);
            ctx.fillStyle = '#996644'; ctx.fillRect(cx - 3, cy + 6, 6, 1);
        } else {
            ctx.fillStyle = '#1a0606'; ctx.fillRect(cx - 6, cy + 5, 12, 3);
        }
        // Border
        ctx.strokeStyle = hurt ? '#661010' : '#2a2218';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    }

    // ── Automap ───────────────────────────────────────────────
    function renderAutomap() {
        ctx.fillStyle = 'rgba(4,6,8,0.88)';
        ctx.fillRect(0, 0, W, VH);

        const CELL = 5;
        const rows = map.length, cols = map[0].length;
        const ox = Math.floor((W - cols * CELL) / 2);
        const oy = Math.floor((VH - rows * CELL) / 2);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const t = map[r][c];
                let col = null;
                if (t === '#')  col = '#384852';
                else if (t === 'D')  col = '#b08a00';
                else if (t === 'R')  col = '#aa2222';
                else if (t === 'c')  col = '#1a4a28';
                else if (t === 'h')  col = '#4a3a14';
                else if (t === '%')  col = '#2a3640';
                else if (t === 'X')  col = '#39ff14';
                else if (t === '.')  col = '#0c1014';
                if (col) { ctx.fillStyle = col; ctx.fillRect(ox + c * CELL, oy + r * CELL, CELL, CELL); }
            }
        }
        // Enemies
        enemies.forEach(e => {
            if (!e.dead) {
                ctx.fillStyle = '#ff3030';
                ctx.fillRect(ox + (e.x - 0.2) * CELL, oy + (e.y - 0.2) * CELL, CELL * 0.4, CELL * 0.4);
            }
        });
        // Pickups
        pickups.forEach(pk => {
            if (!pk.taken) {
                ctx.fillStyle = pk.type === 'K' ? '#ff4444' : pk.type === 'S' ? '#31f5e5' : '#ffb000';
                ctx.fillRect(ox + (pk.x - 0.2) * CELL, oy + (pk.y - 0.2) * CELL, CELL * 0.4, CELL * 0.4);
            }
        });
        // Barrels
        barrels.forEach(b => {
            if (!b.exploded) {
                ctx.fillStyle = '#39aa39';
                ctx.fillRect(ox + (b.x - 0.2) * CELL, oy + (b.y - 0.2) * CELL, CELL * 0.4, CELL * 0.4);
            }
        });
        // Player arrow
        const px = ox + player.x * CELL, py = oy + player.y * CELL;
        ctx.fillStyle = '#39ff14';
        ctx.beginPath(); ctx.arc(px, py, CELL * 0.5, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(player.angle) * CELL * 2, py + Math.sin(player.angle) * CELL * 2);
        ctx.stroke();

        // Legend overlay
        ctx.fillStyle = 'rgba(6,10,14,0.85)'; ctx.fillRect(0, VH - 16, W, 16);
        ctx.fillStyle = '#39ff14'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
        ctx.fillText('M = CLOSE MAP', W / 2, VH - 5);
        ctx.textAlign = 'left';
    }

    // ── Screen effects ───────────────────────────────────────
    function renderEffects(now) {
        if (damageFlash > 0) {
            ctx.fillStyle = `rgba(160,0,0,${damageFlash / 680})`;
            ctx.fillRect(0, 0, W, VH);
            damageFlash = Math.max(0, damageFlash - 7);
        }
        if (muzzleFlash > 0) {
            ctx.fillStyle = `rgba(255,230,160,${muzzleFlash / 300})`;
            ctx.fillRect(0, 0, W, VH);
        }
        if (message && now < messageUntil) {
            ctx.fillStyle = 'rgba(4,8,12,0.75)';
            ctx.fillRect(0, 0, W, 17);
            ctx.fillStyle = '#39ff14'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
            ctx.fillText(message, W / 2, 12);
            ctx.textAlign = 'left';
        }
    }

    // ── End modal ────────────────────────────────────────────
    function showEndModal(didWin) {
        const modal = document.getElementById('liebiModal');
        const mtitle = document.getElementById('liebiModalTitle');
        const mtext  = document.getElementById('liebiModalText');
        if (!modal) return;
        modal.style.display = 'flex';
        mtitle.textContent = didWin ? 'MISSION COMPLETE' : 'AGENT DOWN';
        mtext.textContent  = didWin
            ? `BLACKSITE SECURED // SCORE: ${player.score} | KILLS: ${player.kills}`
            : `SIMULATION FAILURE // SCORE: ${player.score} | KILLS: ${player.kills}`;
    }

    // ── Game loop ────────────────────────────────────────────
    function gameLoop(now) {
        const dt = Math.min(80, now - (lastTime || now));
        lastTime = now;

        if (!won && !lost) {
            updatePlayer(dt);
            updateEnemies(dt, now);
            updateDoors(dt, now);
            updateProjectiles(dt);
            checkPickups();
            checkExit();
        }

        if (showMap) {
            renderAutomap();
        } else {
            render3D();
            renderSprites();
            renderWeapon();
            renderEffects(now);
        }
        renderHUD();

        // Barrel explosion flash
        barrels.forEach(b => { if (b.exTimer > 0) b.exTimer -= dt; });

        frameId = requestAnimationFrame(gameLoop);
    }

    // ── Cleanup ──────────────────────────────────────────────
    function closeGame() {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        const el = document.getElementById('liebiOverlay');
        if (el) el.remove();
        liebiGameCleanup = null;
    }

    // ── Wire up controls ─────────────────────────────────────
    function restart() { closeGame(); setTimeout(startLiebiGame, 60); }

    liebiGameCleanup = closeGame;

    const elClose   = document.getElementById('liebiClose');
    const elExit    = document.getElementById('liebiExit');
    const elRestart = document.getElementById('liebiRestart');
    if (elClose)   elClose.addEventListener('click', closeLiebiGame);
    if (elExit)    elExit.addEventListener('click', closeLiebiGame);
    if (elRestart) elRestart.addEventListener('click', restart);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Hide modal initially
    const modal = document.getElementById('liebiModal');
    if (modal) modal.style.display = 'none';

    AudioEngine.bootBeep();
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
        // Late-game armor: everything but scouts gains hp as waves climb.
        if (type !== 'scout') e.hp += Math.floor(wave / 4);
        // From wave 3, scouts strafe; from wave 5, weavers fire aimed shots.
        if (type === 'scout' && wave >= 3) e.gunT = rand(1.2, 2.6);
        if (type === 'weaver' && wave >= 5) e.gunT = rand(1.4, 2.8);
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
        const k = Math.min(1 + (n - 1) * 0.22, 3.4); // difficulty scale
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
        // One carrier (power-up mule) per wave; a bonus one every 3rd wave late.
        spawnQueue.push({ at: t * 0.5, type: 'carrier' });
        if (n >= 6 && n % 3 === 0) spawnQueue.push({ at: t * 0.9, type: 'carrier' });
        spawnQueue.sort((a, b) => a.at - b.at);
    }

    function spawnBoss() {
        const tier = Math.floor(wave / 4);
        boss = {
            x: W + 120, y: H / 2, r: 52, t: 0, phase: 0, phaseT: 0,
            hp: 70 + tier * 45, hpMax: 70 + tier * 45, tier,
            gunT: 1, ringT: 3.2, entered: false, flash: 0
        };
        sfx.boss();
    }

    function bulletSpeed() { return Math.min(330, 190 + wave * 9); }
    function enemyFire(x, y, speed, spreadCount, aimed) {
        const baseAngle = aimed ? Math.atan2(ship.y - y, ship.x - x) : Math.PI;
        const n = spreadCount || 1;
        for (let i = 0; i < n; i++) {
            const a = baseAngle + (i - (n - 1) / 2) * 0.22;
            enemyShots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4 });
        }
    }

    /* ---------------- power-ups ---------------- */
    const POWER_TYPES = ['W', 'S', 'O', 'E', 'X'];
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
            ship.speed = Math.min(400, ship.speed + 30);
            if (ship.speed >= 400) addScore(200);
        } else if (p.type === 'O') {
            if (options.length < 2) options.push({ x: ship.x - 30, y: ship.y, hist: [] });
            else addScore(300);
        } else if (p.type === 'E') {
            if (ship.shield < 2) ship.shield++;
            else addScore(200);
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
        const cadence = [0.26, 0.24, 0.22, 0.2, 0.18][g];
        fireCooldown = cadence;
        sfx.fire();
        // I: single / II: twin / III: twin + rear / IV: spread / MAX: heavy spread + rear
        const emit = (x, y) => {
            const dmg = g >= 4 ? 2 : 1;
            if (g === 0) {
                shots.push({ x: x + 14, y, vx: 560, vy: 0, dmg: 1 });
            } else {
                shots.push({ x: x + 12, y: y - 6, vx: 560, vy: 0, dmg });
                shots.push({ x: x + 12, y: y + 6, vx: 560, vy: 0, dmg: 1 });
            }
            if (g >= 3) shots.push({ x: x + 6, y, vx: 530, vy: -105, dmg: 1 });
            if (g >= 3) shots.push({ x: x + 6, y, vx: 530, vy: 105, dmg: 1 });
            if (g === 2 || g >= 4) shots.push({ x: x - 6, y, vx: -480, vy: 0, dmg: 1 }); // rear gun
        };
        emit(ship.x, ship.y);
        // Option drones carry a single forward gun — support, not a second ship.
        options.forEach(o => shots.push({ x: o.x + 12, y: o.y, vx: 560, vy: 0, dmg: 1 }));
    }

    function killEnemy(e, withDrop = true) {
        if (e.dead) return;
        e.dead = true;
        addScore(e.pts);
        sfx.boom();
        if (e.type === 'tank' && wave >= 6 && withDrop) {
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                enemyShots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 115, vy: Math.sin(a) * 115, r: 4 });
            }
        }
        burst(e.x, e.y, e.type === 'carrier' ? '#ffb000' : '#39ff14', 16, 180);
        shake = Math.max(shake, 5);
        if (e.drop) dropPowerup(e.x, e.y);
        else if (withDrop && Math.random() < 0.04) dropPowerup(e.x, e.y);
    }

    function hitPlayer() {
        if (ship.inv > 0 || gameOver) return;
        if (ship.shield > 0) {
            ship.shield--;
            ship.inv = 1.0;
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
        // Death tax: a real setback, but never back to zero from full power.
        ship.gun = Math.max(0, ship.gun - 2);
        ship.speed = Math.max(280, ship.speed - 70);
        options = options.slice(0, Math.max(0, options.length - 1));
        updateGunHud();
        if (lives <= 0) {
            endGame();
            return;
        }
        ship.inv = 2.2;
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
                    if (wave > 0) addScore(50 * wave); // wave-clear bonus
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
        const speedScale = 1 + Math.min(wave * 0.05, 0.9);
        enemies.forEach(e => {
            e.t += dt;
            if (e.flash > 0) e.flash -= dt;
            if (e.type === 'scout' || e.type === 'weaver' || e.type === 'carrier') {
                e.x += e.vx * speedScale * dt;
                e.y = e.y0 + Math.sin(e.t * e.om) * e.amp;
                if (e.gunT !== undefined && e.x < W - 60 && e.x > ship.x + 80) {
                    e.gunT -= dt;
                    if (e.gunT <= 0) {
                        e.gunT = rand(1.6, 3);
                        if (e.type === 'scout') enemyShots.push({ x: e.x - e.r, y: e.y, vx: -(240 + wave * 6), vy: 0, r: 3 });
                        else enemyFire(e.x - e.r, e.y, bulletSpeed(), 1, true);
                    }
                }
            } else if (e.type === 'diver') {
                e.x += e.vx * speedScale * dt;
                if (!e.dive && e.x < W * 0.72) e.dive = true;
                if (e.dive) e.y += Math.sign(ship.y - e.y) * Math.min(200 + wave * 4, Math.abs(ship.y - e.y) * 3.4) * dt;
            } else {
                e.x += e.vx * speedScale * dt;
                e.gunT -= dt;
                if (e.gunT <= 0 && e.x < W - 30 && e.x > ship.x + 60) {
                    e.gunT = e.type === 'tank' ? rand(1.6, 2.4) : rand(1.2, 2);
                    enemyFire(e.x - e.r, e.y, bulletSpeed(), e.type === 'tank' ? 4 : 2, true);
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
                const enraged = boss.hp < boss.hpMax * 0.4;
                if (boss.gunT <= 0) {
                    boss.gunT = Math.max(0.4, 0.95 - boss.tier * 0.1) * (enraged ? 0.6 : 1);
                    enemyFire(boss.x - boss.r, boss.y, 220 + boss.tier * 30, enraged ? 5 : 3, true);
                }
                if (boss.ringT <= 0) {
                    boss.ringT = Math.max(1.8, 3.2 - boss.tier * 0.3) * (enraged ? 0.75 : 1);
                    const n = 12 + boss.tier * 3;
                    const v = 140 + boss.tier * 10;
                    for (let i = 0; i < n; i++) {
                        const a = (i / n) * Math.PI * 2 + boss.t;
                        enemyShots.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 4 });
                    }
                    // escorts
                    if (enemies.length < 6) {
                        enemies.push(makeEnemy('scout', boss.y - 60));
                        enemies.push(makeEnemy('scout', boss.y + 60));
                        if (boss.tier >= 2) enemies.push(makeEnemy('diver', boss.y));
                    }
                }
            }
            if (boss.hp <= 0) {
                addScore(2000 + boss.tier * 1000);
                burst(boss.x, boss.y, '#ffb000', 60, 320);
                burst(boss.x, boss.y, '#ff4040', 40, 260);
                shake = 24;
                sfx.boom();
                dropPowerup(boss.x - 40, boss.y, ship.gun < 2 ? 'W' : undefined);
                dropPowerup(boss.x - 40, boss.y + 30);
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
    if (document.getElementById('casinoOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'casinoOverlay';
    overlay.innerHTML = '<style>' +
        '#casinoOverlay { position: fixed; inset: 0; background: #0a0a0a; z-index: 500; display: flex; font-family: var(--terminal-font); color: #20c20e; overflow: auto; }' +
        '#casinoOverlay.shake { animation: casinoShake 0.4s; }' +
        '@keyframes casinoShake { 0%,100% { transform: none; } 20% { transform: translate(-6px,3px); } 40% { transform: translate(5px,-4px); } 60% { transform: translate(-4px,-2px); } 80% { transform: translate(3px,4px); } }' +
        '.casino-left { flex: 2; display: flex; flex-direction: column; padding: 16px; border-right: 2px solid #20c20e; min-width: 0; align-items: center; }' +
        '.casino-right { flex: 1; display: flex; flex-direction: column; padding: 16px; align-items: center; min-width: 280px; }' +
        '.casino-title { text-align: center; font-size: 24px; color: #ffb000; text-shadow: 0 0 10px #ffb000; }' +
        '.casino-subtitle { text-align: center; font-size: 12px; color: #666; margin: 3px 0 8px; }' +
        '.slot-machine { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 0; }' +
        '.jackpot-display { font-size: 18px; color: #ff00ff; text-shadow: 0 0 15px #ff00ff; margin-bottom: 6px; animation: jackpotPulse 1s ease-in-out infinite; text-align: center; }' +
        '@keyframes jackpotPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }' +
        /* fixed-width cabinet: nothing inside may change the footprint */
        '.slot-frame { width: 560px; box-sizing: border-box; border: 3px solid #ffb000; padding: 12px 16px; background: rgba(0, 20, 0, 0.5); box-shadow: 0 0 30px rgba(255, 176, 0, 0.3), inset 0 0 50px rgba(0,0,0,0.5); }' +
        '.marquee { height: 8px; margin: -4px 0 10px; background: repeating-linear-gradient(90deg, #ffb000 0 10px, #331f00 10px 20px); animation: marqueeRoll 0.8s linear infinite; opacity: 0.85; }' +
        '@keyframes marqueeRoll { from { background-position: 0 0; } to { background-position: 20px 0; } }' +
        '.bank-line { text-align: center; font-size: 15px; color: #ff3333; margin-bottom: 6px; }' +
        '.bank-bar { height: 7px; border: 1px solid #ff3333; margin: 0 0 10px; }' +
        '.bank-fill { height: 100%; background: #ff3333; box-shadow: 0 0 8px #ff3333; transition: width 0.5s; }' +
        '.slot-info { display: flex; justify-content: space-between; gap: 14px; width: 100%; margin-bottom: 8px; font-size: 15px; }' +
        '.credits { color: #00d4aa; } .bet { color: #ffb000; }' +
        '.slot-reels { display: flex; gap: 8px; margin-bottom: 6px; justify-content: center; }' +
        '.reel-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }' +
        '.slot-reel { width: 92px; height: 132px; box-sizing: border-box; border: 2px solid #20c20e; background: linear-gradient(180deg, #000 0%, #041104 50%, #000 100%); display: flex; align-items: center; justify-content: center; font-size: 11px; overflow: hidden; position: relative; }' +
        '.slot-reel::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,0.25) 3px 4px); pointer-events: none; }' +
        '.slot-reel.held { border-color: #00d4aa; box-shadow: 0 0 14px #00d4aa; }' +
        '.slot-reel.hot { border-color: #ff3333; box-shadow: 0 0 18px #ff3333; animation: hotReel 0.25s ease-in-out infinite; }' +
        '@keyframes hotReel { 0%,100% { border-color: #ff3333; } 50% { border-color: #ffb000; } }' +
        '.reel-symbol { white-space: pre; line-height: 1.05; text-align: center; transition: filter 0.1s; }' +
        '.slot-reel.spinning .reel-symbol { filter: blur(1.5px); opacity: 0.75; }' +
        '.slot-reel.stopped .reel-symbol { animation: reelBounce 0.22s ease-out; }' +
        '@keyframes reelBounce { 0% { transform: translateY(-10px); } 60% { transform: translateY(3px); } 100% { transform: none; } }' +
        '.sym-dragon { color: #ff00ff; } .sym-skull { color: #ff3333; } .sym-ghost { color: #9ad9ff; } .sym-gun { color: #ffb000; } .sym-stim { color: #ff6699; } .sym-nuyen { color: #ffd700; } .sym-dice { color: #00d4aa; } .sym-chip { color: #20c20e; }' +
        '.hold-btn { font-family: var(--terminal-font); font-size: 11px; width: 92px; box-sizing: border-box; padding: 3px 0; background: rgba(0,30,0,0.8); color: #333; border: 1px solid #333; cursor: default; }' +
        '.hold-btn.offer { color: #00d4aa; border-color: #00d4aa; cursor: pointer; animation: jackpotPulse 0.8s ease-in-out infinite; }' +
        '.hold-btn.on { color: #000; background: #00d4aa; border-color: #00d4aa; cursor: pointer; animation: none; }' +
        '.win-display { text-align: center; font-size: 18px; color: #ffb000; height: 26px; line-height: 26px; text-shadow: 0 0 10px #ffb000; margin-top: 4px; white-space: nowrap; overflow: hidden; }' +
        '.heat-line { text-align: center; font-size: 12px; height: 18px; line-height: 18px; color: #ff6633; }' +
        '.slot-buttons { display: flex; gap: 8px; margin-top: 8px; justify-content: center; }' +
        '.slot-btn { padding: 10px 18px; font-family: var(--terminal-font); font-size: 15px; border: 2px solid; background: rgba(0, 30, 0, 0.8); cursor: pointer; transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s; }' +
        '.slot-btn:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 0 15px currentColor; }' +
        '.slot-btn:disabled { opacity: 0.35; cursor: not-allowed; }' +
        '.slot-btn.spin { color: #20c20e; border-color: #20c20e; }' +
        '.slot-btn.bet-btn { color: #ffb000; border-color: #ffb000; }' +
        '.slot-btn.exit { color: #ff3333; border-color: #ff3333; }' +
        '.slot-btn.gamble-btn { color: #ff00ff; border-color: #ff00ff; padding: 7px 14px; font-size: 13px; }' +
        /* gamble panel is ALWAYS in the layout at fixed size; it only dims */
        '.gamble-panel { width: 560px; box-sizing: border-box; margin-top: 10px; border: 2px solid #ff00ff; padding: 8px 14px; text-align: center; background: rgba(30,0,30,0.5); height: 118px; opacity: 0.3; transition: opacity 0.2s; }' +
        '.gamble-panel.open { opacity: 1; box-shadow: 0 0 18px rgba(255,0,255,0.35); }' +
        '.gamble-title { color: #ff00ff; font-size: 13px; margin-bottom: 4px; }' +
        '.gamble-card { font-size: 24px; color: #fff; text-shadow: 0 0 12px #ff00ff; height: 30px; line-height: 30px; }' +
        '.gamble-buttons { display: flex; gap: 8px; justify-content: center; margin-top: 6px; }' +
        '.paytable { margin-top: 10px; font-size: 10px; color: #666; text-align: center; line-height: 1.5; width: 560px; }' +
        '.paytable-title { color: #ffb000; margin-bottom: 2px; }' +
        '.orc-container { flex: 1; display: flex; flex-direction: column; align-items: center; min-height: 0; }' +
        '.orc-title { color: #ff3333; font-size: 16px; margin-bottom: 4px; }' +
        '.orc-mood { font-size: 11px; margin-bottom: 6px; letter-spacing: 2px; height: 14px; }' +
        '.orc-mood.smug { color: #20c20e; } .orc-mood.annoyed { color: #ffb000; } .orc-mood.sweating { color: #ff6633; } .orc-mood.panic { color: #ff3333; animation: jackpotPulse 0.5s infinite; }' +
        '.orc-stage { position: relative; width: 280px; height: 216px; box-sizing: border-box; border: 2px solid #20c20e; background: #000; overflow: hidden; margin-bottom: 10px; box-shadow: 0 0 18px rgba(32,194,14,0.25), inset 0 0 24px rgba(0,0,0,0.6); }' +
        '.orc-img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12%; display: block; transform-origin: 50% 90%; animation: orcBreathe 4.2s ease-in-out infinite; filter: saturate(0.95) contrast(1.05); }' +
        '@keyframes orcBreathe { 0%, 100% { transform: scale(1) translateY(0); } 50% { transform: scale(1.02) translateY(-2px); } }' +
        '.orc-scan { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 2px, transparent 2px 4px); mix-blend-mode: multiply; }' +
        '.orc-roll { position: absolute; left: 0; right: 0; height: 34px; top: -40px; pointer-events: none; background: linear-gradient(180deg, transparent, rgba(120,255,160,0.10), transparent); animation: orcRoll 5.5s linear infinite; }' +
        '@keyframes orcRoll { from { top: -40px; } to { top: 216px; } }' +
        '.orc-tint { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 30%, transparent 45%, rgba(0,10,0,0.55) 100%); }' +
        '.orc-stage.mood-annoyed .orc-img { filter: saturate(1.15) contrast(1.08) sepia(0.15); animation-duration: 3.2s; }' +
        '.orc-stage.mood-sweating .orc-img { filter: saturate(1.3) contrast(1.12) hue-rotate(-14deg) brightness(1.05); animation-duration: 2.2s; }' +
        '.orc-stage.mood-sweating { animation: orcJitter 0.6s linear infinite; }' +
        '.orc-stage.mood-panic .orc-img { filter: saturate(1.6) contrast(1.2) hue-rotate(-32deg) brightness(1.12); animation-duration: 1.4s; }' +
        '.orc-stage.mood-panic { animation: orcJitter 0.22s linear infinite; border-color: #ff3333; box-shadow: 0 0 22px rgba(255,51,51,0.4); }' +
        '.orc-stage.mood-panic .orc-roll { animation-duration: 1.6s; background: linear-gradient(180deg, transparent, rgba(255,80,80,0.14), transparent); }' +
        '@keyframes orcJitter { 0%,100% { transform: translate(0,0); } 25% { transform: translate(1px,-1px); } 50% { transform: translate(-1px,1px); } 75% { transform: translate(1px,1px); } }' +
        '.orc-stage.talking .orc-img { animation: orcTalk 0.22s ease-in-out infinite alternate; }' +
        '@keyframes orcTalk { from { transform: scale(1.015) translateY(-1px); filter: brightness(1.1) saturate(1.1); } to { transform: scale(1) translateY(1px); } }' +
        '.orc-stage.glitching .orc-img { animation: orcGlitch 0.24s steps(2) 1; }' +
        '@keyframes orcGlitch { 0% { transform: translateX(3px) skewX(2deg); filter: hue-rotate(60deg) saturate(2); } 34% { transform: translateX(-4px); filter: invert(0.15) hue-rotate(-40deg); } 67% { transform: translateX(2px) skewX(-1.5deg); filter: saturate(2.2) brightness(1.3); } 100% { transform: none; } }' +
        '.orc-stage.cheer { animation: orcCheer 0.5s ease-out 1; }' +
        '@keyframes orcCheer { 0% { transform: translateY(0); } 35% { transform: translateY(-7px) scale(1.02); } 70% { transform: translateY(2px); } 100% { transform: none; } }' +
        '.orc-stage.hit { animation: casinoShake 0.45s; }' +
        '.orc-stage.hit::after { content: ""; position: absolute; inset: 0; background: rgba(255,51,51,0.22); animation: orcHitFade 0.6s forwards; pointer-events: none; }' +
        '@keyframes orcHitFade { to { opacity: 0; } }' +
        '.orc-portrait { white-space: pre; font-size: 10px; line-height: 1.0; color: #20c20e; display: none; position: absolute; inset: 0; align-items: center; justify-content: center; background: #000; }' +
        '.orc-stage.ascii-fallback .orc-portrait { display: flex; }' +
        '.orc-stage.ascii-fallback .orc-img { display: none; }' +
        '.orc-stage.ascii-fallback.mood-sweating .orc-portrait { color: #ff6633; }' +
        '.orc-stage.ascii-fallback.mood-panic .orc-portrait { color: #ff3333; }' +
        '.speech-bubble { background: rgba(0, 30, 0, 0.8); border: 2px solid #ff3333; border-radius: 10px; padding: 10px; width: 280px; box-sizing: border-box; position: relative; margin-top: 4px; }' +
        '.speech-bubble::before { content: ""; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 10px solid #ff3333; }' +
        '.speech-text { color: #ff3333; font-size: 12px; text-align: center; height: 74px; overflow: hidden; }' +
        '.casino-stats { color: #555; font-size: 10px; text-align: center; margin-top: 8px; height: 14px; }' +
        '.casino-instructions { color: #444; font-size: 10px; text-align: center; margin-top: auto; line-height: 1.6; }' +
        '.winning { animation: winFlash 0.3s ease-in-out 5; }' +
        '@keyframes winFlash { 0%, 100% { background: rgba(0, 50, 0, 0.5); } 50% { background: rgba(255, 176, 0, 0.3); } }' +
        '.casino-end { position: absolute; inset: 0; background: rgba(0,0,0,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; text-align: center; }' +
        '.casino-end pre { font-size: 13px; line-height: 1.15; margin-bottom: 16px; }' +
        '.casino-end.win pre { color: #ffb000; text-shadow: 0 0 14px #ffb000; }' +
        '.casino-end.lose pre { color: #ff3333; text-shadow: 0 0 14px #ff3333; }' +
        '.casino-end .end-text { font-size: 14px; color: #ccc; max-width: 520px; margin-bottom: 20px; line-height: 1.5; }' +
        '</style>' +
        '<div class="casino-left">' +
        '<div class="casino-title">★ SHADOWRUN SLOTS DELUXE ★</div>' +
        '<div class="casino-subtitle">Der Fette\'s five-reel money furnace — clean him out, if you can</div>' +
        '<div class="slot-machine">' +
        '<div class="jackpot-display">◆ JACKPOT: <span id="jackpotAmount">4000</span>¥ ◆</div>' +
        '<div class="slot-frame">' +
        '<div class="marquee"></div>' +
        '<div class="bank-line">DER FETTE\'S BANK: <span id="bankDisplay">12000</span>¥</div>' +
        '<div class="bank-bar"><div class="bank-fill" id="bankFill" style="width:100%"></div></div>' +
        '<div class="slot-info"><span class="credits">CREDITS: <span id="creditDisplay">1000</span>¥</span><span class="bet">BET: <span id="betDisplay">25</span>¥</span></div>' +
        '<div class="slot-reels" id="slotReels"></div>' +
        '<div class="win-display" id="winDisplay"></div>' +
        '<div class="heat-line" id="heatLine"></div>' +
        '<div class="slot-buttons">' +
        '<button class="slot-btn bet-btn" id="betDownBtn">BET −</button>' +
        '<button class="slot-btn spin" id="spinBtn">◆ SPIN ◆</button>' +
        '<button class="slot-btn bet-btn" id="betUpBtn">BET +</button>' +
        '<button class="slot-btn exit" onclick="closeCasino()">EXIT</button>' +
        '</div>' +
        '</div>' +
        '<div class="gamble-panel" id="gamblePanel">' +
        '<div class="gamble-title">DOUBLE-OR-NOTHING — POT: <span id="gamblePot">0</span>¥ <span id="gambleHint">(win something first, chummer)</span></div>' +
        '<div class="gamble-card" id="gambleCard">[ ? ]</div>' +
        '<div class="gamble-buttons">' +
        '<button class="slot-btn gamble-btn" id="gambleHiBtn" disabled>▲ HIGHER [H]</button>' +
        '<button class="slot-btn gamble-btn" id="gambleLoBtn" disabled>▼ LOWER [L]</button>' +
        '<button class="slot-btn gamble-btn" id="gambleCollectBtn" disabled>◆ COLLECT [C]</button>' +
        '</div>' +
        '</div>' +
        '<div class="paytable"><div class="paytable-title">═══ PAYOUTS (match anywhere: ×3 / ×4 / ×5 of a kind) ═══</div>' +
        '<div>SKULL 20/80/300 | GHOST 10/40/150 | ARES 6/24/90 | STIM 4/16/60</div>' +
        '<div>NUYEN 3/12/40 | DICE 2.5/10/30 | CHIP 2/8/25 | DRAGON ×2 = 4x, ×3+ = JACKPOT (more dragons = bigger cut)</div>' +
        '<div>3 wins in a row = HEAT bonus | HOLD offers: lock up to 4 reels and chase — held pairs pay nothing</div>' +
        '</div>' +
        '</div></div>' +
        '<div class="casino-right">' +
        '<div class="orc-container">' +
        '<div class="orc-title">◆ DER FETTE ◆</div>' +
        '<div class="orc-mood smug" id="orcMood">SMUG</div>' +
        '<div class="orc-stage mood-smug" id="orcStage">' +
        '<img class="orc-img" id="orcImg" src="assets/casino/Der-Fette.jpg" alt="Der Fette, orc casino boss">' +
        '<div class="orc-scan"></div><div class="orc-roll"></div><div class="orc-tint"></div>' +
        '<pre class="orc-portrait" id="orcPortrait"></pre>' +
        '</div>' +
        '<div class="speech-bubble"><div class="speech-text" id="orcSpeech">Five reels now, chummer! Five times the ways to lose! Step right up!</div></div>' +
        '<div class="casino-stats" id="casinoStats"></div>' +
        '</div>' +
        '<div class="casino-instructions">SPACE = Spin / Collect | +/− = Bet | 1-5 = Hold (when offered)<br>H/L = Higher/Lower | C = Collect | ESC = Exit<br>Drain his bank to 0 and the machine is yours.</div>' +
        '</div>';
    document.body.appendChild(overlay);

    // ── Game state ──────────────────────────────────────────
    var REEL_COUNT = 5;
    var credits = 1000;
    var bet = 25;
    var bank = 12000;
    var BANK_MAX = 12000;
    var jackpot = 4000;
    var spinning = false;
    var gameOver = false;
    var heat = 0;
    var holds = [false, false, false, false, false];
    var holdsOffered = false;
    var lastSymbols = [null, null, null, null, null];
    var pot = 0;
    var gambleCardValue = 0;
    var gambleSteps = 0;
    var gambleActive = false;
    var stats = { spins: 0, biggestWin: 0 };
    var best = { banksBroken: 0, biggestWin: 0 };
    try { best = Object.assign(best, JSON.parse(localStorage.getItem('casinoBest') || '{}')); } catch (err) {}

    // ── Symbols: compact art for the 5-reel cabinet ─────────
    // mults = payout multiplier for 3 / 4 / 5 of a kind (anywhere)
    var symbols = [
        { name: 'dragon', weight: 2,  mults: [0, 0, 0],        art: " /\\___/\\\n( >o.o< )\n \\  ^  /\n ~/###\\~\n DRAGON" },
        { name: 'skull',  weight: 4,  mults: [20, 80, 300],    art: "  _____\n / o o \\\n |  ^  |\n \\ === /\n  SKULL" },
        { name: 'ghost',  weight: 6,  mults: [10, 40, 150],    art: "  .---.\n ( o o )\n |  ~  |\n '~^~^~'\n  GHOST" },
        { name: 'gun',    weight: 8,  mults: [6, 24, 90],      art: "  ____\n | -- \\_\n |____ |\n    |__|\n  ARES" },
        { name: 'stim',   weight: 10, mults: [4, 16, 60],      art: "  ____\n | ++ |\n |    |\n |____|\n  STIM" },
        { name: 'nuyen',  weight: 12, mults: [3, 12, 40],      art: "  ____\n / ¥¥ \\\n | ¥¥ |\n \\____/\n NUYEN" },
        { name: 'dice',   weight: 15, mults: [2.5, 10, 30],    art: " .----.\n| o  o |\n|  o   |\n'----'\n  DICE" },
        { name: 'chip',   weight: 18, mults: [2, 8, 25],       art: "  ____\n [||||]\n |CPU |\n [||||]\n  CHIP" }
    ];
    var weightedSymbols = [];
    symbols.forEach(function (s) { for (var i = 0; i < s.weight; i++) weightedSymbols.push(s); });
    function randomSymbol() { return weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)]; }

    // build the five reels
    var reelsHost = document.getElementById('slotReels');
    var reels = [];
    var holdBtns = [];
    for (var ri = 0; ri < REEL_COUNT; ri++) {
        var wrap = document.createElement('div');
        wrap.className = 'reel-wrap';
        wrap.innerHTML = '<div class="slot-reel" id="reel' + (ri + 1) + '"><div class="reel-symbol"></div></div>' +
            '<button class="hold-btn" id="hold' + (ri + 1) + '">HOLD [' + (ri + 1) + ']</button>';
        reelsHost.appendChild(wrap);
        reels.push(wrap.querySelector('.reel-symbol'));
        holdBtns.push(wrap.querySelector('.hold-btn'));
    }
    function paintReel(idx, sym) {
        reels[idx].textContent = sym.art;
        reels[idx].className = 'reel-symbol sym-' + sym.name;
    }

    // ── Der Fette: portrait, moods, lines ──────────────────
    var orcFramesBase = [
        "      ,---.\n     /o   o\\\n    |   _   |\n   /| (___) |\\\n  / |       | \\\n |  |~~---~~|  |\n |  | |\\/| |  |\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'",
        "      ,---.\n     /o   o\\\n    |  \\_/  |\n   /| (___) |\\\n  / |       | \\\n |  |~~---~~|  |\n |  | |\\/| |  |\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'",
        "      ,---.\n     /-   o\\\n    |   _   |\n   /| (___) |\\\n  / |       | \\\n |  |~~---~~|  |\n |  | |\\/| |  |\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'"
    ];
    var orcFramesSweat = [
        "   .  ,---. ,\n     /o   o\\\n    |  ___  |\n   /| (   ) |\\\n  / |  ~~~  | \\\n |  |~~---~~|  |\n .  | |\\/| |  ,\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'",
        "   ,  ,---. .\n     /O   O\\\n    |  ___  |\n   /| (   ) |\\\n  / |  ~~~  | \\\n |  |~~---~~|  |\n ,  | |\\/| |  .\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'"
    ];
    var orcFramesPanic = [
        "  ., ,---. ,.\n     /O   O\\\n    |  ___  |\n   /| (@@@) |\\\n  / | ~~!~~ | \\\n |  |~~---~~|  |\n., .| |\\/| |. ,.\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'",
        "  ,. ,---. .,\n     /@   @\\\n    |  ___  |\n   /| (@@@) |\\\n  / | ~~!~~ | \\\n |  |~~---~~|  |\n,. .| |\\/| |. .,\n/___|_|  |_|___\\\n|    BOSS    |\n|   \\\\__//   |\n'----'  '----'"
    ];

    var INSULTS = [
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

    var sweatLines = [
        "Okay, okay. Beginner's luck. It happens. It HAPPENS.",
        "You're counting cards, aren't you? You can't count cards on a SLOT MACHINE!",
        "That machine was calibrated yesterday. CALIBRATED!",
        "Look, chummer, how about a free drink and we call it a night?",
        "My accountant is going to hear about this. Loudly.",
        "You know what? Laugh it up. The house ALWAYS recovers.",
        "Is it hot in here? It feels hot in here. TURN DOWN THE HEAT!",
        "I've thrown runners out for less. Prettier ones, too.",
        "That's... that's coming out of the security budget.",
        "Quit while you're ahead, omae. I say that as a FRIEND.",
        "Do you have ANY idea what krill costs these days?!",
        "The machine's just warming up. It gets MEANER. I swear it does."
    ];
    var panicLines = [
        "STOP. WINNING. That's not a request, that's a BUSINESS PLAN!",
        "SECURITY! Sec— wait, I fired security to save money. DREK!",
        "My yacht. My beautiful, unpaid-for yacht...",
        "You're a technomancer! ADMIT IT! NOBODY is this lucky!",
        "I'll give you 500¥ right now to walk away. 600! FINAL OFFER!",
        "This is extortion! This is robbery! This is... LEGAL?! HOW?!",
        "The pit boss is crying. I'M the pit boss. I'M CRYING.",
        "Do you take payment plans? Asking for me. For ME!",
        "I knew I should have rigged this thing HARDER!",
        "My tusks are sweating. TUSKS DON'T EVEN SWEAT!",
        "Please. I have a family. Well, a lizard. HE DEPENDS ON ME!"
    ];
    var bigWinLines = [
        "WHAT?! That machine is DEFECTIVE! DEFECTIVE I SAY!",
        "No no no NO! Do you know how long I saved for that?!",
        "I felt that one in my credstick. OW.",
        "That's it, I'm switching to honest work. ...HAHAHA. No.",
        "Somewhere, an accountant just fainted. MINE."
    ];
    var smallWinLines = [
        "Crumbs. You won CRUMBS. I spill more than that at lunch!",
        "Enjoy it, chummer. Rent's due eventually.",
        "A win! Adorable. The machine's just playing with its food.",
        "Pfft. I make that back every time you blink.",
        "Small payout, smaller victory. Spin again, sucker."
    ];
    var gambleTauntLines = [
        "Double or nothing? NOW you're speaking my language!",
        "Hehehe... the card never lies. Except when I want it to.",
        "Greed! I LOVE it! It's how I got this magnificent body!",
        "Go on. One more double. What could POSSIBLY go wrong?",
        "The pot grows... and so does my appetite. HIGHER OR LOWER?!"
    ];
    var gambleWinLines = [
        "LUCKY. CARD. That's all that was!",
        "Fine! FINE! Take it! The deck's a traitor!",
        "Who taught you cards?! A dragon?!"
    ];
    var gambleLoseLines = [
        "AHAHAHA! The pot returns to papa! DELICIOUS!",
        "And THAT is why the house always wins, chummer!",
        "Ohhh, so close! Actually no, not close at all! HAHA!"
    ];

    var orcPortrait = document.getElementById('orcPortrait');
    var orcStage = document.getElementById('orcStage');
    var orcImg = document.getElementById('orcImg');
    var asciiFallback = false;
    orcImg.addEventListener('error', function () {
        asciiFallback = true;
        orcStage.classList.add('ascii-fallback');
    });
    var orcFrame = 0;
    var talkTimeout = null;
    // Ticker: cycles ASCII frames in fallback mode; otherwise fires the
    // occasional CRT glitch burst so the portrait never sits still.
    var orcTimer = setInterval(function () {
        if (asciiFallback) {
            var frames = moodFrames();
            orcFrame = (orcFrame + 1) % frames.length;
            if (orcPortrait) orcPortrait.textContent = frames[orcFrame];
            return;
        }
        var glitchChance = mood() === 'panic' ? 0.22 : mood() === 'sweating' ? 0.12 : 0.05;
        if (Math.random() < glitchChance && orcStage) {
            orcStage.classList.add('glitching');
            setTimeout(function () { orcStage.classList.remove('glitching'); }, 260);
        }
    }, 450);
    function orcReact(kind) {
        if (!orcStage) return;
        orcStage.classList.remove('cheer', 'hit');
        void orcStage.offsetWidth; // restart the animation
        orcStage.classList.add(kind);
        setTimeout(function () { orcStage.classList.remove(kind); }, 650);
    }

    for (var si = 0; si < REEL_COUNT; si++) {
        lastSymbols[si] = randomSymbol();
        paintReel(si, lastSymbols[si]);
    }

    // ── Audio helpers ───────────────────────────────────────
    function blip(freq, dur, type, gain, delay) {
        if (!AudioEngine.canPlay()) return;
        setTimeout(function () {
            if (!AudioEngine.canPlay()) return;
            var osc = AudioEngine.ctx.createOscillator();
            var g = AudioEngine.ctx.createGain();
            osc.connect(g);
            g.connect(AudioEngine.destination());
            osc.frequency.value = freq;
            osc.type = type || 'square';
            g.gain.setValueAtTime(gain || 0.06, AudioEngine.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, AudioEngine.ctx.currentTime + (dur || 0.06));
            osc.start();
            osc.stop(AudioEngine.ctx.currentTime + (dur || 0.06));
        }, delay || 0);
    }
    function winTune(big) {
        var seq = big ? [262, 330, 392, 523, 659, 784, 1047] : [330, 415, 494, 659];
        seq.forEach(function (f, i) { blip(f, 0.14, 'sine', 0.09, i * 90); });
    }
    function loseThud() { blip(120, 0.2, 'sawtooth', 0.05); blip(80, 0.25, 'sawtooth', 0.05, 120); }

    // ── Mood ────────────────────────────────────────────────
    function mood() {
        var ratio = bank / BANK_MAX;
        if (ratio > 0.85) return 'smug';
        if (ratio > 0.5) return 'annoyed';
        if (ratio > 0.2) return 'sweating';
        return 'panic';
    }
    function moodFrames() {
        var m = mood();
        if (m === 'sweating') return orcFramesSweat;
        if (m === 'panic') return orcFramesPanic;
        return orcFramesBase;
    }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function say(msg) {
        document.getElementById('orcSpeech').textContent = msg;
        if (orcStage && !asciiFallback) {
            orcStage.classList.add('talking');
            if (talkTimeout) clearTimeout(talkTimeout);
            talkTimeout = setTimeout(function () { orcStage.classList.remove('talking'); }, 1000);
        }
    }
    function mockLine() {
        var m = mood();
        if (m === 'panic') return pick(panicLines);
        if (m === 'sweating') return Math.random() < 0.5 ? pick(sweatLines) : pick(INSULTS);
        return pick(INSULTS);
    }

    // ── Displays ────────────────────────────────────────────
    function updateDisplays() {
        document.getElementById('creditDisplay').textContent = credits;
        document.getElementById('betDisplay').textContent = bet;
        document.getElementById('jackpotAmount').textContent = jackpot;
        document.getElementById('bankDisplay').textContent = Math.max(0, bank);
        document.getElementById('bankFill').style.width = Math.max(0, Math.min(100, (bank / BANK_MAX) * 100)) + '%';
        var moodEl = document.getElementById('orcMood');
        var m = mood();
        moodEl.textContent = { smug: 'SMUG', annoyed: 'ANNOYED', sweating: 'SWEATING', panic: 'PANICKING' }[m];
        moodEl.className = 'orc-mood ' + m;
        if (orcStage) {
            orcStage.classList.remove('mood-smug', 'mood-annoyed', 'mood-sweating', 'mood-panic');
            orcStage.classList.add('mood-' + m);
        }
        var heatLine = document.getElementById('heatLine');
        if (heat >= 5) heatLine.textContent = '▲▲▲ HEAT ×2 — wins doubled! ▲▲▲';
        else if (heat >= 3) heatLine.textContent = '▲▲ HEAT ×1.5 — streak bonus live ▲▲';
        else if (heat === 2) heatLine.textContent = '▲ one more win lights the heat ▲';
        else heatLine.textContent = '';
        document.getElementById('casinoStats').textContent =
            'spins: ' + stats.spins + ' | best win: ' + Math.max(stats.biggestWin, best.biggestWin) + '¥ | banks broken: ' + best.banksBroken;
        holdBtns.forEach(function (btn, idx) {
            btn.className = 'hold-btn' + (holds[idx] ? ' on' : holdsOffered ? ' offer' : '');
        });
        var canAct = gambleActive && !gameOver;
        document.getElementById('gambleHiBtn').disabled = !canAct;
        document.getElementById('gambleLoBtn').disabled = !canAct;
        document.getElementById('gambleCollectBtn').disabled = !canAct;
        document.getElementById('gambleHint').textContent = gambleActive ? '' : '(win something first, chummer)';
    }

    // ── Holds ───────────────────────────────────────────────
    function toggleHold(idx) {
        if (!holdsOffered || spinning || gambleActive || gameOver) return;
        if (!holds[idx] && holds.filter(Boolean).length >= REEL_COUNT - 1) {
            say("You have to spin SOMETHING, chummer! One reel stays live!");
            return;
        }
        holds[idx] = !holds[idx];
        blip(holds[idx] ? 660 : 330, 0.07, 'square', 0.05);
        updateDisplays();
    }
    holdBtns.forEach(function (btn, idx) { btn.addEventListener('click', function () { toggleHold(idx); }); });

    function heatMultiplier() { return heat >= 5 ? 2 : heat >= 3 ? 1.5 : 1; }

    function payFromBank(amount) {
        credits += amount;
        bank -= amount;
        stats.biggestWin = Math.max(stats.biggestWin, amount);
        if (amount > best.biggestWin) { best.biggestWin = amount; saveBest(); }
        if (bank <= 0) endGame(true);
    }
    function saveBest() {
        try { localStorage.setItem('casinoBest', JSON.stringify(best)); } catch (err) {}
    }

    // ── Spin ────────────────────────────────────────────────
    async function spin() {
        if (spinning || gambleActive || gameOver) return;
        if (credits < bet) {
            say("HAHAHAHA! You're BROKE! The door's that way, you pathetic worm!");
            if (credits < 10) endGame(false);
            return;
        }

        spinning = true;
        stats.spins++;
        credits -= bet;
        bank += bet;
        jackpot += Math.max(1, Math.floor(bet * 0.2));
        var chasing = holds.some(Boolean);
        document.getElementById('winDisplay').textContent = chasing ? 'CHASING…' : '';
        document.getElementById('spinBtn').disabled = true;
        updateDisplays();

        for (var t = 0; t < 8; t++) blip(100 + Math.random() * 300, 0.05, 'square', 0.04, t * 55);

        var finalResults = lastSymbols.slice();
        var freeReels = [];
        for (var fr = 0; fr < REEL_COUNT; fr++) if (!holds[fr]) { freeReels.push(fr); reels[fr].parentElement.classList.add('spinning'); }

        for (var fi = 0; fi < freeReels.length; fi++) {
            var r = freeReels[fi];

            // Anticipation: last free reel runs hot when 3+ already match
            var isLast = fi === freeReels.length - 1;
            var counts = {};
            for (var ci = 0; ci < REEL_COUNT; ci++) {
                if (ci !== r && (holds[ci] || freeReels.indexOf(ci) < fi)) {
                    counts[finalResults[ci].name] = (counts[finalResults[ci].name] || 0) + 1;
                }
            }
            var bestCount = 0;
            Object.keys(counts).forEach(function (n) { bestCount = Math.max(bestCount, counts[n]); });
            var teasing = isLast && bestCount >= 3;
            var spinsN = 6 + fi * 4 + (teasing ? 12 : 0);
            if (teasing) {
                reels[r].parentElement.classList.add('hot');
                blip(880, 0.3, 'sine', 0.07);
            }

            for (var s = 0; s < spinsN; s++) {
                await new Promise(function (resolve) { setTimeout(resolve, 40 + s * (teasing ? 7 : 5)); });
                paintReel(r, randomSymbol());
            }

            finalResults[r] = randomSymbol();
            paintReel(r, finalResults[r]);
            reels[r].parentElement.classList.remove('spinning', 'hot');
            reels[r].parentElement.classList.add('stopped');
            (function (el) { setTimeout(function () { el.classList.remove('stopped'); }, 250); })(reels[r].parentElement);
            blip(150 + fi * 20, 0.1, 'sine', 0.08);
        }
        lastSymbols = finalResults;

        // ── Evaluate: best N-of-a-kind anywhere across 5 reels ──
        var tally = {};
        finalResults.forEach(function (s) { tally[s.name] = (tally[s.name] || 0) + 1; });
        var dragons = tally.dragon || 0;
        var bestName = null;
        var bestN = 0;
        var bestValue = 0;
        Object.keys(tally).forEach(function (n) {
            if (n === 'dragon') return;
            var count = tally[n];
            if (count < 3) return;
            var sym = symbols.find(function (s) { return s.name === n; });
            var value = sym.mults[Math.min(count, 5) - 3];
            if (value > bestValue) { bestValue = value; bestName = n; bestN = count; }
        });

        var winAmount = 0;
        var winMsg = '';

        if (dragons >= 3) {
            var cut = dragons === 3 ? 1 : dragons === 4 ? 1.5 : 2;
            winAmount = Math.floor(jackpot * cut);
            winMsg = '★★★ ' + dragons + ' DRAGONS — JACKPOT' + (cut > 1 ? ' ×' + cut : '') + '!!! ★★★';
            say("IMPOSSIBLE! THE JACKPOT?! THIS MACHINE IS BROKEN! *sobbing* BROKEN!");
            jackpot = 4000;
        } else if (bestN >= 3) {
            winAmount = Math.floor(bet * bestValue);
            var kindLabel = bestN === 5 ? 'FIVE OF A KIND' : bestN === 4 ? 'FOUR OF A KIND' : 'THREE OF A KIND';
            winMsg = kindLabel + ' — ' + bestName.toUpperCase() + '! ' + bestValue + 'x!';
            say(winAmount >= bet * 15 ? pick(bigWinLines) : pick(smallWinLines));
        } else if (dragons === 2 && !chasing) {
            winAmount = bet * 4;
            winMsg = 'TWIN DRAGONS! 4x!';
            say("Two dragons?! Don't you DARE find a third!");
        } else {
            winMsg = chasing ? 'CHASE MISSED!' : '';
            say(mockLine());
        }

        if (winAmount > 0) {
            var mult = heatMultiplier();
            if (mult > 1) {
                winAmount = Math.floor(winAmount * mult);
                winMsg += ' (HEAT ×' + mult + ')';
            }
            heat++;
            winTune(winAmount >= bet * 10);
            if (winAmount >= bet * 10) {
                overlay.classList.add('shake');
                setTimeout(function () { overlay.classList.remove('shake'); }, 450);
                orcReact('hit');
            }
            if (bestN >= 3 || dragons >= 3) {
                reels.forEach(function (rl, idx) {
                    if (dragons >= 3 ? finalResults[idx].name === 'dragon' : finalResults[idx].name === bestName) {
                        rl.parentElement.classList.add('winning');
                    }
                });
                setTimeout(function () { reels.forEach(function (rl) { rl.parentElement.classList.remove('winning'); }); }, 1500);
            }
        } else {
            heat = 0;
            loseThud();
            if (Math.random() < 0.3) orcReact('cheer');
        }

        holds = [false, false, false, false, false];
        holdsOffered = false;
        if (winAmount === 0 && !gameOver && Math.random() < 0.45) {
            holdsOffered = true;
            document.getElementById('winDisplay').textContent = '— HOLD OFFERED: lock reels (1-5), then spin —';
        }

        if (winAmount > 0) {
            document.getElementById('winDisplay').textContent = winMsg + ' +' + winAmount + '¥';
            openGamble(winAmount);
        } else if (!holdsOffered) {
            document.getElementById('winDisplay').textContent = winMsg;
        }

        spinning = false;
        document.getElementById('spinBtn').disabled = gambleActive;
        updateDisplays();
        if (credits < 10 && !gambleActive && !gameOver) endGame(false);
    }

    // ── Gamble (double or nothing, ties lose) ───────────────
    function cardLabel(v) { return v === 14 ? 'A' : v === 13 ? 'K' : v === 12 ? 'Q' : v === 11 ? 'J' : String(v); }
    function drawCard() { return 2 + Math.floor(Math.random() * 13); }

    function openGamble(amount) {
        pot = amount;
        gambleSteps = 0;
        gambleActive = true;
        gambleCardValue = drawCard();
        document.getElementById('gamblePanel').classList.add('open');
        document.getElementById('gamblePot').textContent = pot;
        document.getElementById('gambleCard').textContent = '[ ' + cardLabel(gambleCardValue) + ' ]';
        document.getElementById('spinBtn').disabled = true;
        say(pick(gambleTauntLines));
        updateDisplays();
    }
    function closeGamble() {
        gambleActive = false;
        pot = 0;
        document.getElementById('gamblePanel').classList.remove('open');
        document.getElementById('gambleCard').textContent = '[ ? ]';
        document.getElementById('gamblePot').textContent = '0';
        document.getElementById('spinBtn').disabled = false;
        updateDisplays();
    }
    function collectPot() {
        if (!gambleActive) return;
        var amount = pot;
        closeGamble();
        payFromBank(amount);
        document.getElementById('winDisplay').textContent = 'COLLECTED +' + amount + '¥';
        blip(523, 0.12, 'sine', 0.08);
        blip(659, 0.15, 'sine', 0.08, 110);
        updateDisplays();
    }
    function gambleGuess(higher) {
        if (!gambleActive || gameOver) return;
        var next = drawCard();
        document.getElementById('gambleCard').textContent = '[ ' + cardLabel(gambleCardValue) + ' ] → [ ' + cardLabel(next) + ' ]';
        var won = higher ? next > gambleCardValue : next < gambleCardValue;
        if (won) {
            pot *= 2;
            gambleSteps++;
            gambleCardValue = next;
            document.getElementById('gamblePot').textContent = pot;
            winTune(false);
            if (gambleSteps >= 4 || pot >= bank + credits) {
                say("ENOUGH! Take it! TAKE IT AND GET AWAY FROM MY MACHINE!");
                collectPot();
            } else {
                say(pick(gambleWinLines) + ' ' + pick(gambleTauntLines));
            }
        } else {
            say(pick(gambleLoseLines));
            loseThud();
            heat = 0;
            document.getElementById('winDisplay').textContent = 'GAMBLE LOST — ' + pot + '¥ back to the house';
            closeGamble();
            if (credits < 10) endGame(false);
        }
    }

    // ── End states ──────────────────────────────────────────
    function endGame(playerWon) {
        if (gameOver) return;
        gameOver = true;
        spinning = false;
        gambleActive = false;
        var end = document.createElement('div');
        end.className = 'casino-end ' + (playerWon ? 'win' : 'lose');
        if (playerWon) {
            best.banksBroken++;
            saveBest();
            end.innerHTML = '<pre>' +
                ' ██████╗██╗     ███████╗ █████╗ ███╗   ██╗███████╗██████╗ \n' +
                '██╔════╝██║     ██╔════╝██╔══██╗████╗  ██║██╔════╝██╔══██╗\n' +
                '██║     ██║     █████╗  ███████║██╔██╗ ██║█████╗  ██║  ██║\n' +
                '██║     ██║     ██╔══╝  ██╔══██║██║╚██╗██║██╔══╝  ██║  ██║\n' +
                '╚██████╗███████╗███████╗██║  ██║██║ ╚████║███████╗██████╔╝\n' +
                ' ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═════╝ \n' +
                '            OUT — DER FETTE IS BUSTED</pre>' +
                '<div class="end-text">You drained every last nuyen out of his five-reel money furnace. Der Fette flips the table, screams something about "audited spirits", and waddles into the night. You walk out with ' + credits + '¥ and the best story in the sprawl.<br><br>Banks broken so far: ' + best.banksBroken + '</div>' +
                '<div class="slot-buttons"><button class="slot-btn spin" id="casinoAgainBtn">REMATCH</button><button class="slot-btn exit" onclick="closeCasino()">WALK AWAY</button></div>';
            say("NOOOOO! MY BEAUTIFUL MONEY! GET OUT! GET OUT AND NEVER COME BACK!");
            winTune(true);
            overlay.classList.add('shake');
        } else {
            end.innerHTML = '<pre>' +
                '██████╗ ██████╗  ██████╗ ██╗  ██╗███████╗\n' +
                '██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝\n' +
                '██████╔╝██████╔╝██║   ██║█████╔╝ █████╗  \n' +
                '██╔══██╗██╔══██╗██║   ██║██╔═██╗ ██╔══╝  \n' +
                '██████╔╝██║  ██║╚██████╔╝██║  ██╗███████╗\n' +
                '╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝</pre>' +
                '<div class="end-text">Der Fette pockets your last nuyen, licks a tusk, and has the bouncer-drone show you the door. "Come back when you find more money to lose, chummer!"<br><br>Spins survived: ' + stats.spins + '</div>' +
                '<div class="slot-buttons"><button class="slot-btn spin" id="casinoAgainBtn">BORROW 1000¥ (TRY AGAIN)</button><button class="slot-btn exit" onclick="closeCasino()">SLINK AWAY</button></div>';
            say("And STAY broke! AHAHAHAHA!");
            loseThud();
        }
        overlay.appendChild(end);
        var again = document.getElementById('casinoAgainBtn');
        if (again) again.addEventListener('click', function () { closeCasino(); setTimeout(startCasinoGame, 80); });
    }

    // ── Bets, buttons, keys ─────────────────────────────────
    var BET_STEPS = [10, 25, 50, 100, 250];
    function changeBet(dir) {
        if (spinning || gambleActive || gameOver) return;
        var idx = BET_STEPS.indexOf(bet);
        if (idx < 0) idx = 1;
        idx = Math.max(0, Math.min(BET_STEPS.length - 1, idx + dir));
        bet = BET_STEPS[idx];
        blip(440 + idx * 60, 0.05, 'square', 0.04);
        updateDisplays();
    }

    document.getElementById('spinBtn').addEventListener('click', spin);
    document.getElementById('betUpBtn').addEventListener('click', function () { changeBet(1); });
    document.getElementById('betDownBtn').addEventListener('click', function () { changeBet(-1); });
    document.getElementById('gambleHiBtn').addEventListener('click', function () { gambleGuess(true); });
    document.getElementById('gambleLoBtn').addEventListener('click', function () { gambleGuess(false); });
    document.getElementById('gambleCollectBtn').addEventListener('click', collectPot);

    function handleCasinoKeys(e) {
        var k = e.key.toLowerCase();
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (gambleActive) { collectPot(); return; }
            spin();
        } else if (e.key === '+' || e.key === '=') changeBet(1);
        else if (e.key === '-' || e.key === '_') changeBet(-1);
        else if (k >= '1' && k <= '5') toggleHold(Number(k) - 1);
        else if (k === 'h' && gambleActive) gambleGuess(true);
        else if (k === 'l' && gambleActive) gambleGuess(false);
        else if (k === 'c' && gambleActive) collectPot();
        else if (e.key === 'Escape') closeCasino();
    }
    document.addEventListener('keydown', handleCasinoKeys);

    window.closeCasino = function () {
        document.removeEventListener('keydown', handleCasinoKeys);
        if (orcTimer) { clearInterval(orcTimer); orcTimer = null; }
        if (gambleActive && pot > 0) { credits += pot; pot = 0; } // never eat an uncollected pot on exit
        var el = document.getElementById('casinoOverlay');
        if (el) el.remove();
    };

    updateDisplays();
}
