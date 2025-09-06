// --- Módulo para la detección automática de sprites en una imagen ---
// Exporta una función que recibe el canvas y la tolerancia, y devuelve un array de frames detectados.

export function detectSpritesFromImage(imageElement, tolerance) {
    return new Promise((resolve, reject) => {
        try {
            const w = imageElement.naturalWidth;
            const h = imageElement.naturalHeight;
            if (w === 0 || h === 0) {
                resolve([]);
                return;
            }
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = w;
            tempCanvas.height = h;
            tempCtx.drawImage(imageElement, 0, 0);
            const imageData = tempCtx.getImageData(0, 0, w, h);
            const data = imageData.data;
            const visited = new Uint8Array(w * h);
            const newFrames = [];

            // Obtener color de fondo basado en las esquinas
            const bgColors = [];
            const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
            corners.forEach(([x, y]) => {
                const i = (y * w + x) * 4;
                bgColors.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
            });
            const colorCounts = {};
            bgColors.forEach(color => {
                const key = color.join(',');
                colorCounts[key] = (colorCounts[key] || 0) + 1;
            });
            const mostCommonColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b).split(',').map(Number);
            const [bgR, bgG, bgB, bgA] = mostCommonColor;

            const isBackgroundColor = (index) => {
                const r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3];
                if (a === 0) return true;
                if (bgA < 255 && a > 0) return false;
                return (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)) <= tolerance;
            };

            const minSpriteSize = 4;

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x);
                    if (visited[i] || isBackgroundColor(i * 4)) continue;
                    const queue = [[x, y]];
                    visited[i] = 1;
                    let minX = x, minY = y, maxX = x, maxY = y;
                    let pixelCount = 0;

                    while (queue.length > 0) {
                        const [cx, cy] = queue.shift();
                        minX = Math.min(minX, cx);
                        minY = Math.min(minY, cy);
                        maxX = Math.max(maxX, cx);
                        maxY = Math.max(maxY, cy);
                        pixelCount++;
                        const neighbors = [[cx, cy - 1], [cx, cy + 1], [cx - 1, cy], [cx + 1, cy]];
                        for (const [nx, ny] of neighbors) {
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                const ni = (ny * w + nx);
                                if (!visited[ni] && !isBackgroundColor(ni * 4)) {
                                    visited[ni] = 1;
                                    queue.push([nx, ny]);
                                }
                            }
                        }
                    }

                    if (pixelCount >= minSpriteSize) {
                        const newId = newFrames.length;
                        newFrames.push({
                            id: newId,
                            name: `sprite_${newId}`,
                            rect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
                            type: 'simple'
                        });
                    }
                }
            }

            resolve(newFrames);
        } catch (error) {
            reject(error);
        }
    });
}
