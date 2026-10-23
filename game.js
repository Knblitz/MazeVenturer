/**
 * MAZE VENTURER: THE EXPEDITION
 * Upgraded with Single-Use Consumable Power Orbs & Continuous Movement
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const mctx = miniCanvas.getContext('2d');
const pIconCanvas = document.getElementById('playerIconCanvas');
const pctx = pIconCanvas.getContext('2d');

const RADIUS = 10; 
const VIEW_SIZE = (RADIUS * 2) + 1; 
const TILE_SIZE = 32;
const GRID_W = 55;
const GRID_H = 43;

// Movement speed configuration (delay in ms between steps when holding keys)
const MOVE_SPEED_DELAY = 120; 

canvas.width = VIEW_SIZE * TILE_SIZE; 
canvas.height = VIEW_SIZE * TILE_SIZE;

const TILE_MAP = {
    PATH: [4, 1], Wall: [0, 1], Key: [1, 4], Enemy: [2, 2], SkillItem: [0, 0],
    Gate: { Closed: [1, 1], Open: [1, 2] },
    Player: { Empty: [2, 0], Key: [2, 1] },
    Wall_TL: [4, 0], Wall_T: [2, 4], Wall_TR: [1, 3], Wall_L: [3, 0], Wall_R: [3, 1],
    Wall_BL: [3, 2], Wall_B: [3, 3], Wall_BR: [3, 4], 
    Wall_ITL: [0, 3], Wall_ITR: [0, 4], Wall_IBL: [0, 2], Wall_IBR: [1, 0]
};

// Skill Definitions
const SKILL_TYPES = [
    { id: 'dash', name: 'PULSE DASH', code: '⚡ DASH' },
    { id: 'decoy', name: 'DECOY FLARE', code: '💥 DECOY' },
    { id: 'radar', name: 'RADAR PING', code: '📡 RADAR' },
    { id: 'cloak', name: 'SHADOW CLOAK', code: '👻 CLOAK' }
];

let currentLevel = 1, totalScore = 0, levelTime = 300;
let maze, player, enemies = [], decoy = null;
let isGameOver = false, isPaused = false;
let timerInterval = null;
let lastMoveDir = { x: 0, y: -1 };

// Held Key Tracking State
const keysHeld = {};
let moveInterval = null;

const bgMusic = new Audio('adventure_ST.mp3');
bgMusic.loop = true;
let musicStarted = false;

const tileset = new Image();
tileset.src = 'tileset.png'; 

tileset.onload = () => {
    const action = localStorage.getItem('maze_action');
    if (action === 'continue') {
        const saved = JSON.parse(localStorage.getItem('maze_venturer_save'));
        if (saved) { currentLevel = saved.level; totalScore = saved.score; }
    }
    initGame();
};

function initGame() {
    isGameOver = false; isPaused = false; decoy = null;
    maze = generateStrictMaze(GRID_W, GRID_H);
    player = { 
        x: 2, y: 2, hasKey: false, 
        skill: null, skillReady: false, skillActive: false,
        cloakUntil: 0, radarUntil: 0 
    };
    
    const numEnemies = 2 + Math.floor(currentLevel / 2);
    enemies = [];
    for(let i=0; i<numEnemies; i++) {
        let ex, ey;
        do { 
            ex = Math.floor(Math.random() * (GRID_W-4)) + 2; 
            ey = Math.floor(Math.random() * (GRID_H-4)) + 2; 
        } while(maze[ey][ex] !== 0 || (Math.abs(ex-player.x) + Math.abs(ey-player.y) < 10));
        enemies.push({ x: ex, y: ey, state: 'patrol' });
    }

    levelTime = 300;
    document.getElementById('levelDisplay').innerText = `DEPTH: FLOOR ${currentLevel}`;
    document.getElementById('scoreDisplay').innerText = `SCORE: ${totalScore.toString().padStart(5, '0')}`;
    startTimer(); startMovementLoop(); updatePlayerUI(); updateSkillUI(); render();
}

function generateStrictMaze(w, h) {
    let m = Array.from({ length: h }, () => Array(w).fill(1));
    let stack = [{x: 2, y: 2}]; 
    m[2][2] = 0;

    while (stack.length > 0) {
        let curr = stack[stack.length - 1];
        let dirs = [
            {x:0, y:-3, sx:0, sy:-1}, {x:0, y:3, sx:0, sy:1},
            {x:-3, y:0, sx:-1, sy:0}, {x:3, y:0, sx:1, sy:0}
        ].sort(() => Math.random() - 0.5);

        let found = false;
        for(let d of dirs) {
            let nx = curr.x + d.x, ny = curr.y + d.y;
            if (nx > 1 && nx < w-2 && ny > 1 && ny < h-2 && m[ny][nx] === 1) {
                m[ny][nx] = 0; 
                m[curr.y + d.sy][curr.x + d.sx] = 0; 
                m[curr.y + (d.sy*2)][curr.x + (d.sx*2)] = 0;
                stack.push({x: nx, y: ny}); 
                found = true; 
                break;
            }
        }
        if (!found) stack.pop();
    }

    for (let y = 2; y < h - 3; y += 3) {
        for (let x = 2; x < w - 3; x += 3) {
            if (Math.random() < 0.2) { 
                let horizontal = Math.random() < 0.5;
                if (horizontal) { m[y][x+1] = 0; m[y][x+2] = 0; }
                else { m[y+1][x] = 0; m[y+2][x] = 0; }
            }
        }
    }

    let chamberCoords = [];
    for (let i = 0; i < 4; i++) {
        let rx = 2 + (Math.floor(Math.random() * ((w-5)/3)) * 3);
        let ry = 2 + (Math.floor(Math.random() * ((h-5)/3)) * 3);
        for(let y = ry; y < ry+4; y++) {
            for(let x = rx; x < rx+4; x++) {
                if (x > 1 && x < w-2 && y > 1 && y < h-2) m[y][x] = 0;
            }
        }
        chamberCoords.push({x: rx+1, y: ry+1});
    }

    let distMap = Array.from({ length: h }, () => Array(w).fill(-1));
    let queue = [{x: 2, y: 2, d: 0}]; 
    distMap[2][2] = 0;
    let far = [];

    while(queue.length > 0) {
        let {x, y, d} = queue.shift();
        if (d > 40) far.push({x, y, d});
        for(let [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            let nx=x+dx, ny=y+dy;
            if(nx>=0 && nx<w && ny>=0 && ny<h && m[ny][nx]===0 && distMap[ny][nx]===-1) {
                distMap[ny][nx] = d+1; 
                queue.push({x:nx, y:ny, d:d+1});
            }
        }
    }
    
    far.sort((a,b) => b.d - a.d);
    if (far.length > 5) {
        let gate = far[0];
        let key = far[Math.floor(far.length * 0.7)];
        m[gate.y][gate.x] = 2; 
        m[key.y][key.x] = 3;
    }

    if (chamberCoords.length > 0) {
        let s1 = chamberCoords[0];
        m[s1.y][s1.x] = 4;
        if (chamberCoords.length > 2) {
            let s2 = chamberCoords[2];
            m[s2.y][s2.x] = 4;
        }
    }

    return m;
}

function getWallTile(x, y) {
    const isP = (tx, ty) => (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) ? false : maze[ty][tx] !== 1;
    const N = isP(x, y-1), S = isP(x, y+1), W = isP(x-1, y), E = isP(x+1, y);
    const TR = isP(x+1, y-1), TL = isP(x-1, y-1), BR = isP(x+1, y+1), BL = isP(x-1, y+1);

    if (N && W) return TILE_MAP.Wall_TL;
    if (N && E) return TILE_MAP.Wall_TR;
    if (S && W) return TILE_MAP.Wall_BL;
    if (S && E) return TILE_MAP.Wall_BR;
    
    if (!N && !S && !W && !E) {
        if (TR) return TILE_MAP.Wall_IBL;
        if (TL) return TILE_MAP.Wall_IBR;
        if (BR) return TILE_MAP.Wall_ITL;
        if (BL) return TILE_MAP.Wall_ITR;
    }

    if (N) return TILE_MAP.Wall_T; if (S) return TILE_MAP.Wall_B;
    if (W) return TILE_MAP.Wall_L; if (E) return TILE_MAP.Wall_R;
    
    return TILE_MAP.Wall;
}

function drawPowerOrb(sx, sy) {
    let px = (sx * TILE_SIZE) + (TILE_SIZE / 2);
    let py = (sy * TILE_SIZE) + (TILE_SIZE / 2);
    let pulse = Math.sin(Date.now() / 200) * 2;

    let grad = ctx.createRadialGradient(px, py, 2, px, py, 14 + pulse);
    grad.addColorStop(0, 'rgba(0, 242, 255, 1)');
    grad.addColorStop(0.5, 'rgba(0, 242, 255, 0.4)');
    grad.addColorStop(1, 'rgba(0, 242, 255, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, 14 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
}

function render() {
    if (isPaused || isGameOver) return;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let ox = player.x - RADIUS, oy = player.y - RADIUS;

    for (let r = 0; r < VIEW_SIZE; r++) {
        for (let c = 0; c < VIEW_SIZE; c++) {
            let mx = ox + c, my = oy + r;
            drawTile(TILE_MAP.PATH, c, r);
            if (mx >= 0 && mx < GRID_W && my >= 0 && my < GRID_H) {
                const v = maze[my][mx];
                if (v === 1) drawTile(getWallTile(mx, my), c, r);
                else if (v === 2) drawTile(TILE_MAP.Gate.Closed, c, r);
                else if (v === 3) drawTile(TILE_MAP.Key, c, r);
                else if (v === 4) drawPowerOrb(c, r);
                
                if (decoy && decoy.x === mx && decoy.y === my) {
                    ctx.fillStyle = "#f9d423";
                    ctx.fillRect(c*TILE_SIZE+8, r*TILE_SIZE+8, 16, 16);
                }
                
                enemies.forEach(e => { if(e.x === mx && e.y === my) drawTile(TILE_MAP.Enemy, c, r); });
            } else {
                drawTile(TILE_MAP.Wall, c, r);
            }
        }
    }
    
    if (Date.now() < player.cloakUntil) ctx.globalAlpha = 0.4;
    drawTile(player.hasKey ? TILE_MAP.Player.Key : TILE_MAP.Player.Empty, RADIUS, RADIUS);
    ctx.globalAlpha = 1.0;

    drawMinimap();
}

function drawTile(coords, sx, sy) {
    ctx.drawImage(tileset, coords[1]*16, coords[0]*16, 16, 16, sx*TILE_SIZE, sy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

function drawMinimap() {
    mctx.fillStyle = "#05050a"; 
    mctx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
    
    let sw = miniCanvas.width / GRID_W; 
    let sh = miniCanvas.height / GRID_H;
    
    for(let y = 0; y < GRID_H; y++) {
        for(let x = 0; x < GRID_W; x++) {
            if(maze[y][x] === 1) { 
                mctx.fillStyle = "#16213e"; 
                mctx.fillRect(x * sw, y * sh, sw, sh); 
            }
            else if(maze[y][x] === 2) { 
                mctx.fillStyle = "#ff00ff"; 
                mctx.fillRect(x * sw, y * sh, sw, sh); 
            }
            else if(maze[y][x] === 3) { 
                mctx.fillStyle = "#ffff00"; 
                mctx.fillRect(x * sw, y * sh, sw, sh); 
            }
            else if(maze[y][x] === 4 || Date.now() < player.radarUntil) {
                if (maze[y][x] === 4) {
                    mctx.fillStyle = "#00f2ff"; 
                    mctx.fillRect(x * sw, y * sh, sw, sh); 
                }
            }
        }
    }

    if (decoy) {
        mctx.fillStyle = "#f9d423";
        mctx.fillRect(decoy.x * sw, decoy.y * sh, sw, sh);
    }

    mctx.fillStyle = "#e94560"; 
    enemies.forEach(en => {
        mctx.beginPath();
        mctx.arc((en.x * sw) + (sw / 2), (en.y * sh) + (sh / 2), sw, 0, Math.PI * 2);
        mctx.fill();
    });

    mctx.fillStyle = "#ffffff"; 
    mctx.fillRect(player.x * sw, player.y * sh, sw, sh);
}

// --- HELD-KEY MOVEMENT SYSTEM ---

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { togglePause(); return; }
    if (isGameOver || isPaused) return;
    if (!musicStarted) { bgMusic.play(); musicStarted = true; }
    
    if (e.code === 'Space') {
        activateSkill();
        return;
    }

    const key = e.key.toLowerCase();

    if (key === 'w' || key === 'arrowup') keysHeld['up'] = true;
    if (key === 's' || key === 'arrowdown') keysHeld['down'] = true;
    if (key === 'a' || key === 'arrowleft') keysHeld['left'] = true;
    if (key === 'd' || key === 'arrowright') keysHeld['right'] = true;
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') delete keysHeld['up'];
    if (key === 's' || key === 'arrowdown') delete keysHeld['down'];
    if (key === 'a' || key === 'arrowleft') delete keysHeld['left'];
    if (key === 'd' || key === 'arrowright') delete keysHeld['right'];
});

function startMovementLoop() {
    if (moveInterval) clearInterval(moveInterval);
    moveInterval = setInterval(() => {
        if (isGameOver || isPaused) return;
        processHeldMovement();
    }, MOVE_SPEED_DELAY);
}

function processHeldMovement() {
    let dx = 0, dy = 0;

    if (keysHeld['up']) dy -= 1;
    else if (keysHeld['down']) dy += 1;
    else if (keysHeld['left']) dx -= 1;
    else if (keysHeld['right']) dx += 1;

    if (dx === 0 && dy === 0) return;

    lastMoveDir = { x: dx, y: dy };
    let nx = player.x + dx, ny = player.y + dy;

    if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
        const t = maze[ny][nx];
        if (t === 2 && player.hasKey) handleWin();
        else if (t !== 1 && t !== 2) {
            if (t === 3) { player.hasKey = true; maze[ny][nx] = 0; updatePlayerUI(); }
            else if (t === 4) { pickUpSkill(); maze[ny][nx] = 0; }
            
            player.x = nx; player.y = ny;
            updateEnemies(); checkCollision(); render();
        }
    }
}

// --- CONSUMABLE SKILL LOGIC ---

function pickUpSkill() {
    const randomSkill = SKILL_TYPES[Math.floor(Math.random() * SKILL_TYPES.length)];
    player.skill = randomSkill;
    player.skillReady = true;
    updateSkillUI();
}

function activateSkill() {
    if (!player.skill || !player.skillReady) return;

    const sk = player.skill.id;

    if (sk === 'dash') {
        let dx = player.x + (lastMoveDir.x * 2);
        let dy = player.y + (lastMoveDir.y * 2);
        if (dx > 1 && dx < GRID_W - 1 && dy > 1 && dy < GRID_H - 1 && maze[dy][dx] !== 1) {
            player.x = dx; player.y = dy;
        }
    } else if (sk === 'decoy') {
        decoy = { x: player.x, y: player.y };
        setTimeout(() => { decoy = null; render(); }, 5000);
    } else if (sk === 'radar') {
        player.radarUntil = Date.now() + 6000;
    } else if (sk === 'cloak') {
        player.cloakUntil = Date.now() + 4000;
    }

    // CONSUME MODULE ON USE
    player.skill = null;
    player.skillReady = false;
    player.skillActive = false;

    updateSkillUI();
    render();
}

function updateSkillUI() {
    const card = document.getElementById('skillCard');
    const icon = document.getElementById('skillIcon');
    const name = document.getElementById('skillName');
    const prompt = document.getElementById('skillPrompt');
    const cdBar = document.getElementById('skillCooldown');

    if (!card) return;

    if (!player.skill) {
        card.className = "skill-card empty";
        icon.innerText = "NONE";
        name.innerText = "NO MODULE";
        prompt.innerText = "SEARCH CHAMBERS";
        if (cdBar) cdBar.style.width = "0%";
    } else if (player.skillReady) {
        card.className = "skill-card ready";
        icon.innerText = player.skill.code;
        name.innerText = player.skill.name;
        prompt.innerText = "PRESS [SPACE]";
        if (cdBar) cdBar.style.width = "100%";
    }
}

function getBfsNextStep(startX, startY, targetX, targetY) {
    if (startX === targetX && startY === targetY) return { x: startX, y: startY };
    
    let queue = [{ x: startX, y: startY, path: [] }];
    let visited = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
    visited[startY][startX] = true;
    
    while (queue.length > 0) {
        let curr = queue.shift();
        
        if (curr.x === targetX && curr.y === targetY) {
            return curr.path[0] || { x: startX, y: startY };
        }
        
        let dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5);
        for (let [dx, dy] of dirs) {
            let nx = curr.x + dx, ny = curr.y + dy;
            if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && !visited[ny][nx]) {
                if (maze[ny][nx] !== 1 && maze[ny][nx] !== 2) {
                    visited[ny][nx] = true;
                    queue.push({ x: nx, y: ny, path: [...curr.path, { x: nx, y: ny }] });
                }
            }
        }
    }
    return { x: startX, y: startY };
}

function updateEnemies() {
    let activeStalkers = 0;
    let isCloaked = Date.now() < player.cloakUntil;

    enemies.forEach(en => {
        let target = decoy ? decoy : (isCloaked ? null : player);

        if (target) {
            let dist = Math.abs(target.x - en.x) + Math.abs(target.y - en.y);
            if (dist <= 10 || decoy) {
                en.state = 'chase';
                if (!decoy) activeStalkers++;
            } else {
                en.state = 'patrol';
            }
        } else {
            en.state = 'patrol';
        }

        if (en.state === 'chase' && target) {
            let nextStep = getBfsNextStep(en.x, en.y, target.x, target.y);
            en.x = nextStep.x; en.y = nextStep.y;
        } else {
            if (Math.random() < 0.3) {
                let randomDirs = [[0,1], [0,-1], [1,0], [-1,0]];
                let d = randomDirs[Math.floor(Math.random() * randomDirs.length)];
                let nx = en.x + d[0], ny = en.y + d[1];
                if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && maze[ny][nx] !== 1 && maze[ny][nx] !== 2) {
                    en.x = nx; en.y = ny;
                }
            }
        }
    });

    const threatElem = document.getElementById('threatDisplay');
    if (threatElem) {
        threatElem.innerText = `${activeStalkers} STALKER${activeStalkers === 1 ? '' : 'S'}`;
        threatElem.className = activeStalkers > 0 ? 'hazard-alert' : '';
    }
}

function checkCollision() {
    if (Date.now() < player.cloakUntil) return;
    enemies.forEach(en => { if(en.x === player.x && en.y === player.y) handleDeath(); });
}

function togglePause() {
    isPaused = !isPaused;
    document.getElementById('pauseOverlay').style.display = isPaused ? 'flex' : 'none';
    if (!isPaused) render();
}

function updateVolume(v) { bgMusic.volume = v; }
function toggleMute() { bgMusic.muted = !bgMusic.muted; }
function goToMenu() { window.location.href = 'index.html'; }

function saveAndExit() { 
    localStorage.setItem('maze_venturer_save', JSON.stringify({ level: currentLevel, score: totalScore }));
    localStorage.setItem('maze_venturer_last', totalScore);
    const best = parseInt(localStorage.getItem('maze_venturer_best') || 0);
    if (totalScore > best) localStorage.setItem('maze_venturer_best', totalScore);
    goToMenu(); 
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!isGameOver && !isPaused) {
            levelTime--;
            if (levelTime <= 0) handleDeath();
            const m = Math.floor(levelTime/60), s = levelTime%60;
            const timerDisplay = document.getElementById('timerDisplay');
            if(timerDisplay) timerDisplay.innerText = `TIME: ${m}:${s.toString().padStart(2,'0')}`;
        }
    }, 1000);
}

function handleWin() {
    isGameOver = true; clearInterval(timerInterval); if (moveInterval) clearInterval(moveInterval);
    const earned = Math.floor((1000 + (levelTime * 15)) * (1 + currentLevel * 0.1));
    totalScore += earned;
    const breakdown = document.getElementById('scoreBreakdown');
    if (breakdown) breakdown.innerHTML = `FLOOR CLEAR: ${earned}`;
    localStorage.setItem('maze_venturer_save', JSON.stringify({ level: currentLevel, score: totalScore }));
    document.getElementById('winOverlay').style.display = 'flex';
}

function handleDeath() {
    isGameOver = true; clearInterval(timerInterval); if (moveInterval) clearInterval(moveInterval);
    localStorage.setItem('maze_venturer_last', totalScore);
    const best = parseInt(localStorage.getItem('maze_venturer_best') || 0);
    if (totalScore > best) localStorage.setItem('maze_venturer_best', totalScore);
    localStorage.removeItem('maze_venturer_save');
    document.getElementById('deathOverlay').style.display = 'flex';
}

function nextLevel() { currentLevel++; initGame(); document.getElementById('winOverlay').style.display = 'none'; }

function updatePlayerUI() {
    pctx.fillStyle = "#9fb471"; pctx.fillRect(0,0,80,80);
    const c = player.hasKey ? TILE_MAP.Player.Key : TILE_MAP.Player.Empty;
    pctx.drawImage(tileset, c[1]*16, c[0]*16, 16, 16, 0,0,80,80);

    const keyStatusElem = document.getElementById('keyStatus');
    if (keyStatusElem) {
        keyStatusElem.innerText = player.hasKey ? "GATE KEY SECURED" : "UNARMED";
        keyStatusElem.style.color = player.hasKey ? "#ffff00" : "#aaa";
    }
}

function updateMenuScores() {
    const best = localStorage.getItem('maze_venturer_best') || 0;
    const last = localStorage.getItem('maze_venturer_last') || 0;
    const bestElem = document.getElementById('highScoreDisplay');
    const lastElem = document.getElementById('lastScoreDisplay');
    if (bestElem) bestElem.innerText = `BEST SCORE: ${best}`;
    if (lastElem) lastElem.innerText = `LAST RUN: ${last}`;
}
window.onload = updateMenuScores;
