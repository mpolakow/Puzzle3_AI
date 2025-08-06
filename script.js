const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const resetButton = document.getElementById('resetButton');
const rotateLeftButton = document.getElementById('rotateLeft');
const rotateRightButton = document.getElementById('rotateRight');
const toolButtons = document.querySelectorAll('.tool-btn');
const messageBox = document.getElementById('message-box');

// --- Game Configuration ---
const gridSize = 16;
const isoTileWidth = 64;
const isoTileHeight = 32;
const heightStep = isoTileHeight / 2; // Pixel height of one level

canvas.width = (gridSize + 1) * isoTileWidth;
canvas.height = (gridSize * isoTileHeight / 2) + 400; // Extra height for tall maps

// --- Tile & Object Definitions ---
const TILE_TYPES = {
    GRASS: { id: 0, top: '#68d391', side: '#48bb78' },
    WATER: { id: 1, top: '#4299e1', side: '#3182ce' },
    STONE: { id: 2, top: '#a0aec0', side: '#718096' },
    SAND: { id: 3, top: '#f6e05e', side: '#ecc94b' },
};

const OBJECT_TYPES = {
    fountain: { symbol: '?', effect: 'raise_water' },
    excavator: { symbol: '??', effect: 'lower_terrain' },
    obelisk: { symbol: '??', effect: 'raise_terrain' },
    tree: { symbol: '??', effect: 'spread_grass' },
};

let map = [];
let objects = [];
let selectedTool = null;
let hoveredTile = null; // To store coordinates of the hovered tile
let lastUpdateTime = 0;
const updateInterval = 500; // ms
let rotation = 0; // 0: 0 deg, 1: 90 deg, 2: 180 deg, 3: 270 deg

// --- Coordinate Conversion ---

function getRotatedCoords(x, y) {
    switch (rotation) {
        case 0: return { x, y }; // 0 degrees
        case 1: return { x: gridSize - 1 - y, y: x }; // 90 degrees
        case 2: return { x: gridSize - 1 - x, y: gridSize - 1 - y }; // 180 degrees
        case 3: return { x: y, y: gridSize - 1 - x }; // 270 degrees
        default: return { x, y };
    }
}

function getInverseRotatedCoords(x, y) {
    switch (rotation) {
        case 0: return { x, y }; // 0 degrees
        case 1: return { x: y, y: gridSize - 1 - x }; // Inverse 90 degrees
        case 2: return { x: gridSize - 1 - x, y: gridSize - 1 - y }; // Inverse 180 degrees
        case 3: return { x: gridSize - 1 - y, y: x }; // Inverse 270 degrees
        default: return { x, y };
    }
}

function isoToScreen(x, y) {
    const screenX = (x - y) * (isoTileWidth / 2) + (canvas.width / 2) - (isoTileWidth / 2);
    const screenY = (x + y) * (isoTileHeight / 2);
    return { x: screenX, y: screenY };
}

function screenToIso(mouseX, mouseY) {
    const adjustedMouseY = mouseY - 100; // Adjust for canvas top offset

    // Iterate through the grid from front to back to respect draw order
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            // Get the actual map coordinates for this screen grid position
            const mapCoords = getRotatedCoords(x, y);
            const tile = map[mapCoords.y][mapCoords.x];
            const screenPos = isoToScreen(x, y);
            const tileY = screenPos.y - tile.height * heightStep;

            // Simple check if the mouse is within the general area of the tile
            if (
                mouseX >= screenPos.x &&
                mouseX <= screenPos.x + isoTileWidth &&
                adjustedMouseY >= tileY - isoTileHeight &&
                adjustedMouseY <= tileY + isoTileHeight
            ) {
                 // More precise diamond check
                const dx = mouseX - (screenPos.x + isoTileWidth / 2);
                const dy = adjustedMouseY - tileY;

                const transformedX = (dx / (isoTileWidth / 2)) + (dy / (isoTileHeight / 2));
                const transformedY = (dy / (isoTileHeight / 2)) - (dx / (isoTileWidth / 2));

                if (Math.abs(transformedX) < 1 && Math.abs(transformedY) < 1) {
                    return mapCoords; // Return the actual map coordinates
                }
            }
        }
    }

    return null;
}

// --- Game Logic ---

function generateMap() {
    map = [];
    for (let y = 0; y < gridSize; y++) {
        map[y] = [];
        for (let x = 0; x < gridSize; x++) {
            const height = Math.floor(Math.random() * 2) + 1;
            map[y][x] = { type: TILE_TYPES.GRASS.id, height: height };
        }
    }
    const lakeY = Math.floor(gridSize / 2);
    const lakeX = Math.floor(gridSize / 2);
    for(let i = -2; i <= 2; i++) {
        for(let j = -2; j <= 2; j++) {
            if(Math.abs(i) + Math.abs(j) < 3 && map[lakeY+i] && map[lakeY+i][lakeX+j]) {
                map[lakeY+i][lakeX+j] = { type: TILE_TYPES.WATER.id, height: 0 };
            }
        }
    }
}

function drawTile(x, y) {
    const rotated = getRotatedCoords(x, y);
    const tile = map[rotated.y][rotated.x];
    const screenPos = isoToScreen(x, y);
    const tileY = screenPos.y - tile.height * heightStep;

    const tileInfo = Object.values(TILE_TYPES).find(t => t.id === tile.type);
    if (!tileInfo) return;

    // To calculate shadows/sides correctly, we need to check neighbors in the *rotated* screen orientation
    const rightNeighborRotated = x < gridSize - 1 ? getRotatedCoords(x + 1, y) : null;
    const bottomNeighborRotated = y < gridSize - 1 ? getRotatedCoords(x, y + 1) : null;

    const rightNeighbor = rightNeighborRotated ? map[rightNeighborRotated.y][rightNeighborRotated.x] : null;
    const bottomNeighbor = bottomNeighborRotated ? map[bottomNeighborRotated.y][bottomNeighborRotated.x] : null;

    // The side wall along the screen's X-axis direction (visually the "left" side of the tile)
    const heightDiffX = rightNeighbor ? tile.height - rightNeighbor.height : tile.height;
     if (heightDiffX > 0) {
         ctx.fillStyle = tileInfo.side;
         ctx.beginPath();
         ctx.moveTo(screenPos.x, tileY);
         ctx.lineTo(screenPos.x, tileY + heightDiffX * heightStep);
         ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY + isoTileHeight / 2 + heightDiffX * heightStep);
         ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY + isoTileHeight / 2);
         ctx.closePath();
         ctx.fill();
    }

    // The side wall along the screen's Y-axis direction (visually the "right" side of the tile)
    const heightDiffY = bottomNeighbor ? tile.height - bottomNeighbor.height : tile.height;
    if (heightDiffY > 0) {
        ctx.fillStyle = tileInfo.side;
        ctx.beginPath();
        ctx.moveTo(screenPos.x + isoTileWidth, tileY);
        ctx.lineTo(screenPos.x + isoTileWidth, tileY + heightDiffY * heightStep);
        ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY + isoTileHeight / 2 + heightDiffY * heightStep);
        ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY + isoTileHeight / 2);
        ctx.closePath();
        ctx.fill();
    }


    // Top face
    ctx.fillStyle = tileInfo.top;
    ctx.beginPath();
    ctx.moveTo(screenPos.x, tileY);
    ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY + isoTileHeight / 2);
    ctx.lineTo(screenPos.x + isoTileWidth, tileY);
    ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY - isoTileHeight / 2);
    ctx.closePath();
    ctx.fill();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(0, 100);

    // Draw tiles
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            drawTile(x, y);
        }
    }

    // Draw highlight on top of the hovered tile
    if (hoveredTile) {
        // We need to find the screen position of the hovered tile
        // by iterating through the grid and finding the matching original coordinates.
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const rotated = getRotatedCoords(x, y);
                if (rotated.x === hoveredTile.x && rotated.y === hoveredTile.y) {
                    const tile = map[hoveredTile.y][hoveredTile.x];
                    const screenPos = isoToScreen(x, y);
                    const tileY = screenPos.y - tile.height * heightStep;

                    ctx.strokeStyle = '#f6e05e'; // Bright yellow
                    ctx.lineWidth = 3;
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath();
                    ctx.moveTo(screenPos.x, tileY);
                    ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY + isoTileHeight / 2);
                    ctx.lineTo(screenPos.x + isoTileWidth, tileY);
                    ctx.lineTo(screenPos.x + isoTileWidth / 2, tileY - isoTileHeight / 2);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.globalAlpha = 1.0; // Reset alpha
                    break;
                }
            }
        }
    }


    // Draw objects
    ctx.font = `${isoTileHeight * 0.9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
     for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const rotated = getRotatedCoords(x, y);
            const obj = objects.find(o => o.x === rotated.x && o.y === rotated.y);
            if (obj) {
                 const objectInfo = OBJECT_TYPES[obj.type];
                 const tile = map[rotated.y][rotated.x];
                 const screenPos = isoToScreen(x, y);
                 const objY = screenPos.y - tile.height * heightStep;
                 if (objectInfo) {
                    ctx.fillText(objectInfo.symbol, screenPos.x + isoTileWidth / 2, objY);
                 }
            }
        }
    }
    ctx.restore();
}

function updateMap() {
    const changes = [];
    objects.forEach(obj => {
        const tile = map[obj.y][obj.x];
        getNeighbors(obj.x, obj.y).forEach(n => {
            const neighborTile = map[n.y][n.x];
            if (obj.effect === 'raise_terrain' && neighborTile.height < tile.height + 2) {
                changes.push({ x: n.x, y: n.y, height: neighborTile.height + 1 });
            }
            if (obj.effect === 'lower_terrain' && neighborTile.height > 0) {
                changes.push({ x: n.x, y: n.y, height: neighborTile.height - 1 });
            }
            if (obj.effect === 'raise_water' && neighborTile.type !== TILE_TYPES.WATER.id) {
                 changes.push({ x: n.x, y: n.y, type: TILE_TYPES.WATER.id, height: tile.height });
            }
            if (obj.effect === 'spread_grass' && neighborTile.type !== TILE_TYPES.GRASS.id) {
                 changes.push({ x: n.x, y: n.y, type: TILE_TYPES.GRASS.id });
            }
        });
    });

    changes.forEach(c => {
        if(c.height !== undefined) map[c.y][c.x].height = c.height;
        if(c.type !== undefined) map[c.y][c.x].type = c.type;
    });
}

function getNeighbors(x, y) {
    const neighbors = [];
    const directions = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
    directions.forEach(dir => {
        const newX = x + dir.dx;
        const newY = y + dir.dy;
        if (newX >= 0 && newX < gridSize && newY >= 0 && newY < gridSize) {
            neighbors.push({ x: newX, y: newY });
        }
    });
    return neighbors;
}

function gameLoop(timestamp) {
    // Update game logic at a fixed interval
    if (timestamp - lastUpdateTime > updateInterval) {
        updateMap();
        lastUpdateTime = timestamp;
    }
    // Draw every frame for smooth animations and hover effects
    draw();
    requestAnimationFrame(gameLoop);
}

function showMessage(text, duration = 2000) {
    messageBox.textContent = text;
    messageBox.classList.add('show');
    setTimeout(() => { messageBox.classList.remove('show'); }, duration);
}

// --- Event Handlers ---

function handleCanvasMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    hoveredTile = screenToIso(mouseX, mouseY);
}

function handleCanvasMouseLeave(event) {
    hoveredTile = null;
}

function handleCanvasClick(event) {
    // Use the already calculated hoveredTile for clicking
    if (!selectedTool) {
        showMessage("Select a tool first!");
        return;
    }
    if (hoveredTile) {
        const { x, y } = hoveredTile;
        const existingObject = objects.find(obj => obj.x === x && obj.y === y);
        if (existingObject) {
            showMessage("There's already an object here!");
            return;
        }
        const objectInfo = OBJECT_TYPES[selectedTool];
        objects.push({ x, y, type: selectedTool, effect: objectInfo.effect });
    }
}

function handleToolSelect(event) {
    const button = event.currentTarget;
    const tool = button.dataset.tool;
    if (selectedTool === tool) {
        selectedTool = null;
        button.classList.remove('selected');
    } else {
        toolButtons.forEach(btn => btn.classList.remove('selected'));
        selectedTool = tool;
        button.classList.add('selected');
        showMessage(`${tool.charAt(0).toUpperCase() + tool.slice(1)} selected!`);
    }
}

function resetGame() {
    objects = [];
    selectedTool = null;
    hoveredTile = null;
    toolButtons.forEach(btn => btn.classList.remove('selected'));
    generateMap();
}

// --- Initialization ---
canvas.addEventListener('click', handleCanvasClick);
canvas.addEventListener('mousemove', handleCanvasMouseMove);
canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
resetButton.addEventListener('click', resetGame);
rotateLeftButton.addEventListener('click', () => {
    rotation = (rotation - 1 + 4) % 4;
});
rotateRightButton.addEventListener('click', () => {
    rotation = (rotation + 1) % 4;
});
toolButtons.forEach(button => {
    button.addEventListener('click', handleToolSelect);
});

resetGame();
requestAnimationFrame(gameLoop);
