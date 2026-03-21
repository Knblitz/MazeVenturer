/**
 * MAZE VENTURER: THE EXPEDITION
 * Strict 2-Tile Wall Thickness Edition
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const mctx = miniCanvas.getContext('2d');
const pIconCanvas = document.getElementById('playerIconCanvas');
const pctx = pIconCanvas.getContext('2d');

// Constants & Config
const RADIUS = 10; 
const VIEW_SIZE = (RADIUS * 2) + 1; 
const TILE_SIZE = 32;
const GRID_W = 55; // Fits (2 + 3*17) = 53
const GRID_H = 43; // Fits (2 + 3*13) = 41

canvas.width = VIEW_SIZE * TILE_SIZE; 
canvas.height = VIEW_SIZE * TILE_SIZE;

const TILE_MAP = {
    PATH: [4, 1], Wall: [0, 1], Key: [1, 4], Enemy: [2, 2],
    Gate: { Closed: [1, 1], Open: [1, 2] },
    Player: { Empty: [2, 0], Key: [2, 1] },
    Wall_TL: [4, 0], Wall_T: [2, 4], Wall_TR: [1, 3], Wall_L: [3, 0], Wall_R: [3, 1],
    Wall_BL: [3, 2], Wall_B: [3, 3], Wall_BR: [3, 4], 
    Wall_ITL: [0, 3], Wall_ITR: [0, 4], Wall_IBL: [0, 2], Wall_IBR: [1, 0]
};

// Game State
let currentLevel = 1, totalScore = 0, levelTime = 300;
let maze, player, enemies = [];
let isGameOver = false, isPaused = false;
let timerInterval = null;

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

// --- CORE ENGINE ---

function initGame() {
    isGameOver = false; isPaused = false;
    maze = generateStrictMaze(GRID_W, GRID_H);
    player = { x: 2, y: 2, hasKey: false };
    
    const numEnemies = 2 + Math.floor(currentLevel / 2);
    enemies = [];
    for(let i=0; i<numEnemies; i++) {
        let ex, ey;
        do { 
            ex = Math.floor(Math.random() * (GRID_W-4)) + 2; 
            ey = Math.floor(Math.random() * (GRID_H-4)) + 2; 
        } while(maze[ey][ex] !== 0 || (Math.abs(ex-player.x) + Math.abs(ey-player.y) < 10));
        enemies.push({ x: ex, y: ey });
    }

    levelTime = 300;
    document.getElementById('levelDisplay').innerText = `DEPTH: FLOOR ${currentLevel}`;
    document.getElementById('scoreDisplay').innerText = `SCORE: ${totalScore.toString().padStart(5, '0')}`;
    startTimer(); updatePlayerUI(); render();
}

function generateStrictMaze(w, h) {
    let m = Array.from({ length: h }, () => Array(w).fill(1));
    
    // Valid path nodes are at (2+3k, 2+3j)
    let stack = [{x: 2, y: 2}]; 
    m[2][2] = 0;

    // 1. Recursive Backtracker with 3-tile step
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
                // Carve the 3-tile path (1 node + 2 connectors)
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

    // 2. Braiding: Create loops by removing 2-tile wall segments between existing nodes
    for (let y = 2; y < h - 3; y += 3) {
        for (let x = 2; x < w - 3; x += 3) {
            if (Math.random() < 0.2) { // 20% chance to attempt a shortcut
                let horizontal = Math.random() < 0.5;
                if (horizontal) {
                    // Remove 2 walls between (x,y) and (x+3,y)
                    m[y][x+1] = 0; m[y][x+2] = 0;
                } else {
                    // Remove 2 walls between (x,y) and (x,y+3)
                    m[y+1][x] = 0; m[y+2][x] = 0;
                }
            }
        }
    }

    // 3. Chambers: Clear 2x2 cell areas (4 nodes + connectors)
    for (let i = 0; i < 4; i++) {
        let rx = 2 + (Math.floor(Math.random() * ((w-5)/3)) * 3);
        let ry = 2 + (Math.floor(Math.random() * ((h-5)/3)) * 3);
        // Clearing a 4x4 area starting from a node ensures 2-tile wall surrounds
        for(let y = ry; y < ry+4; y++) {
            for(let x = rx; x < rx+4; x++) {
                if (x > 1 && x < w-2 && y > 1 && y < h-2) m[y][x] = 0;
            }
        }
    }

    // 4. BFS for Distance-based Objectives
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
    return m;
}

// --- RENDERING & WALL LOGIC ---

function getWallTile(x, y) {
    const isP = (tx, ty) => (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) ? false : maze[ty][tx] !== 1;
    
    const N = isP(x, y-1), S = isP(x, y+1), W = isP(x-1, y), E = isP(x+1, y);
    const TR = isP(x+1, y-1), TL = isP(x-1, y-1), BR = isP(x+1, y+1), BL = isP(x-1, y+1);

    // Standard Outer Corners
    if (N && W) return TILE_MAP.Wall_TL;
    if (N && E) return TILE_MAP.Wall_TR;
    if (S && W) return TILE_MAP.Wall_BL;
    if (S && E) return TILE_MAP.Wall_BR;
    
    // Inner Corners (Path at diagonals)
    if (!N && !S && !W && !E) {
        if (TR) return TILE_MAP.Wall_IBL;
        if (TL) return TILE_MAP.Wall_IBR;
        if (BR) return TILE_MAP.Wall_ITL;
        if (BL) return TILE_MAP.Wall_ITR;
    }

    // Straight Edges
    if (N) return TILE_MAP.Wall_T; if (S) return TILE_MAP.Wall_B;
    if (W) return TILE_MAP.Wall_L; if (E) return TILE_MAP.Wall_R;
    
    return TILE_MAP.Wall;
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
                enemies.forEach(e => { if(e.x === mx && e.y === my) drawTile(TILE_MAP.Enemy, c, r); });
            } else {
                drawTile(TILE_MAP.Wall, c, r);
            }
        }
    }
    drawTile(player.hasKey ? TILE_MAP.Player.Key : TILE_MAP.Player.Empty, RADIUS, RADIUS);
    drawMinimap();
}

function drawTile(coords, sx, sy) {
    ctx.drawImage(tileset, coords[1]*16, coords[0]*16, 16, 16, sx*TILE_SIZE, sy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
}
function drawMinimap() {
    // Clear and draw background
    mctx.fillStyle = "#05050a"; 
    mctx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
    
    let sw = miniCanvas.width / GRID_W; 
    let sh = miniCanvas.height / GRID_H;
    
    for(let y = 0; y < GRID_H; y++) {
        for(let x = 0; x < GRID_W; x++) {
            if(maze[y][x] === 1) { 
                mctx.fillStyle = "#16213e"; // Wall color
                mctx.fillRect(x * sw, y * sh, sw, sh); 
            }
            else if(maze[y][x] === 2) { 
                mctx.fillStyle = "#ff00ff"; // Gate
                mctx.fillRect(x * sw, y * sh, sw, sh); 
            }
            else if(maze[y][x] === 3) { 
                mctx.fillStyle = "#ffff00"; // Key
                mctx.fillRect(x * sw, y * sh, sw, sh); 
            }
        }
    }

    // NEW: Draw Enemies on Radar (Red dots)
    mctx.fillStyle = "#e94560"; 
    enemies.forEach(en => {
        mctx.beginPath();
        mctx.arc((en.x * sw) + (sw / 2), (en.y * sh) + (sh / 2), sw, 0, Math.PI * 2);
        mctx.fill();
    });

    // Draw Player (White dot)
    mctx.fillStyle = "#ffffff"; 
    mctx.fillRect(player.x * sw, player.y * sh, sw, sh);
}

// --- LOGIC & INPUT ---

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { togglePause(); return; }
    if (isGameOver || isPaused) return;
    if (!musicStarted) { bgMusic.play(); musicStarted = true; }
    
    let nx = player.x, ny = player.y;
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') ny--;
    else if (k === 's' || e.key === 'ArrowDown') ny++;
    else if (k === 'a' || e.key === 'ArrowLeft') nx--;
    else if (k === 'd' || e.key === 'ArrowRight') nx++;
    
    if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
        const t = maze[ny][nx];
        if (t === 2 && player.hasKey) handleWin();
        else if (t !== 1 && t !== 2) {
            if (t === 3) { player.hasKey = true; maze[ny][nx] = 0; updatePlayerUI(); }
            player.x = nx; player.y = ny;
            updateEnemies(); checkCollision(); render();
        }
    }
});

function togglePause() {
    isPaused = !isPaused;
    document.getElementById('pauseOverlay').style.display = isPaused ? 'flex' : 'none';
    if (!isPaused) render();
}

function updateVolume(v) { bgMusic.volume = v; }
function toggleMute() { bgMusic.muted = !bgMusic.muted; }
function goToMenu() { window.location.href = 'index.html'; }

// --- UPDATED SAVE & EXIT ---
function saveAndExit() { 
    // 1. Save progress for the "Resume Run" button
    localStorage.setItem('maze_venturer_save', JSON.stringify({
        level: currentLevel, 
        score: totalScore
    }));

    // 2. Update "Last Run" and "Best Score" so the home screen reflects current progress
    localStorage.setItem('maze_venturer_last', totalScore);
    
    const best = parseInt(localStorage.getItem('maze_venturer_best') || 0);
    if (totalScore > best) {
        localStorage.setItem('maze_venturer_best', totalScore);
    }

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

function updateEnemies() {
    enemies.forEach(en => {
        // AI "Intelligence" check - only moves on some turns to give player a chance
        if (Math.random() < 0.4) {
            let dx = player.x - en.x;
            let dy = player.y - en.y;

            // Determine primary and secondary directions to "intercept"
            let moveX = Math.sign(dx);
            let moveY = Math.sign(dy);

            // Attempt to "Cut Off": If in a chamber or corridor, 
            // prioritize the axis where the player is furthest away to block the path.
            let axisToPrioritize = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';

            let moved = false;

            if (axisToPrioritize === 'x') {
                if (maze[en.y][en.x + moveX] === 0) {
                    en.x += moveX;
                    moved = true;
                } else if (maze[en.y + moveY][en.x] === 0) {
                    en.y += moveY;
                    moved = true;
                }
            } else {
                if (maze[en.y + moveY][en.x] === 0) {
                    en.y += moveY;
                    moved = true;
                } else if (maze[en.y][en.x + moveX] === 0) {
                    en.x += moveX;
                    moved = true;
                }
            }

            // If stuck (hitting a wall), take a random step to "unstick"
            if (!moved) {
                let randomDirs = [[0,1], [0,-1], [1,0], [-1,0]];
                let d = randomDirs[Math.floor(Math.random() * 4)];
                if (maze[en.y + d[1]][en.x + d[0]] === 0) {
                    en.x += d[0];
                    en.y += d[1];
                }
            }
        }
    });
}

function checkCollision() {
    enemies.forEach(en => { if(en.x === player.x && en.y === player.y) handleDeath(); });
}

// --- REFINED SCORING SYSTEM ---

function handleWin() {
    isGameOver = true; 
    clearInterval(timerInterval);
    
    // Logic: 1000 base + (Time Left * 15) * Floor Multiplier
    const earned = Math.floor((1000 + (levelTime * 15)) * (1 + currentLevel * 0.1));
    totalScore += earned;
    
    const breakdown = document.getElementById('scoreBreakdown');
    if (breakdown) breakdown.innerHTML = `FLOOR CLEAR: ${earned}`;
    
    // We save here so if they refresh, their score is safe
    localStorage.setItem('maze_venturer_save', JSON.stringify({ level: currentLevel, score: totalScore }));
    
    document.getElementById('winOverlay').style.display = 'flex';
}

function handleDeath() {
    isGameOver = true; 
    clearInterval(timerInterval);
    
    localStorage.setItem('maze_venturer_last', totalScore);
    const best = parseInt(localStorage.getItem('maze_venturer_best') || 0);
    if (totalScore > best) localStorage.setItem('maze_venturer_best', totalScore);
    
    // Remove the save because the run is over
    localStorage.removeItem('maze_venturer_save');
    document.getElementById('deathOverlay').style.display = 'flex';
}

// Ensure the score display is updated during gameplay
function renderScore() {
    const scoreElem = document.getElementById('scoreDisplay');
    if (scoreElem) {
        scoreElem.innerText = `SCORE: ${totalScore.toString().padStart(6, '0')}`;
    }
}

function nextLevel() { currentLevel++; initGame(); document.getElementById('winOverlay').style.display = 'none'; }

function updatePlayerUI() {
    pctx.fillStyle = "#9fb471"; pctx.fillRect(0,0,80,80);
    const c = player.hasKey ? TILE_MAP.Player.Key : TILE_MAP.Player.Empty;
    pctx.drawImage(tileset, c[1]*16, c[0]*16, 16, 16, 0,0,80,80);
}


function updateMenuScores() {
    const best = localStorage.getItem('maze_venturer_best') || 0;
    const last = localStorage.getItem('maze_venturer_last') || 0;
    document.getElementById('highScoreDisplay').innerText = `BEST SCORE: ${best}`;
    document.getElementById('lastScoreDisplay').innerText = `LAST RUN: ${last}`;
}
window.onload = updateMenuScores;