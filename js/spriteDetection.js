// --- Módulo Mejorado para la Detección Automática de Sprites ---
// Versión optimizada con mejor manejo de errores, documentación y configuraciones avanzadas.

/**
 * Configuración por defecto para la detección de sprites
 * @typedef {Object} DetectionConfig
 * @property {number} tolerance - Tolerancia de color para detectar fondo (0-255)
 * @property {number} minSpriteSize - Tamaño mínimo de sprite en píxeles
 * @property {boolean} use8WayConnectivity - Usar conectividad 8-way en lugar de 4-way
 * @property {boolean} enableLogging - Habilitar logs de debug
 */

/** @type {DetectionConfig} */
const DEFAULT_CONFIG = {
    tolerance: 10,
    minSpriteSize: 4,
    use8WayConnectivity: false,
    enableLogging: false
};

/**
 * Detecta sprites automáticamente en una imagen usando flood fill
 * @param {HTMLImageElement} imageElement - Elemento de imagen a procesar
 * @param {Partial<DetectionConfig>} config - Configuración opcional
 * @returns {Promise<Array>} Array de frames detectados
 * @throws {Error} Si hay errores de validación o procesamiento
 */
export function detectSpritesFromImage(imageElement, config = {}) {
    return new Promise((resolve, reject) => {
        try {
            // Validación de parámetros
            validateInputs(imageElement, config);

            const finalConfig = { ...DEFAULT_CONFIG, ...config };
            const { tolerance, minSpriteSize, use8WayConnectivity, enableLogging } = finalConfig;

            if (enableLogging) console.log('Iniciando detección de sprites...');

            const w = imageElement.naturalWidth;
            const h = imageElement.naturalHeight;

            if (w === 0 || h === 0) {
                resolve([]);
                return;
            }

            // Crear canvas temporal
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = w;
            tempCanvas.height = h;
            tempCtx.drawImage(imageElement, 0, 0);

            const imageData = tempCtx.getImageData(0, 0, w, h);
            const data = imageData.data;
            const visited = new Uint8Array(w * h);

            // Detectar color de fondo
            const bgColor = detectBackgroundColor(data, w, h);
            if (enableLogging) console.log('Color de fondo detectado:', bgColor);

            const newFrames = [];
            let processedPixels = 0;

            // Función auxiliar para flood fill optimizado
            const floodFill = (startX, startY) => {
                const queue = [[startX, startY]];
                visited[startY * w + startX] = 1;
                let minX = startX, minY = startY, maxX = startX, maxY = startY;
                let pixelCount = 1;

                const neighbors = use8WayConnectivity
                    ? [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]]
                    : [[-1,0], [1,0], [0,-1], [0,1]];

                while (queue.length > 0) {
                    const [cx, cy] = queue.shift();
                    minX = Math.min(minX, cx);
                    minY = Math.min(minY, cy);
                    maxX = Math.max(maxX, cx);
                    maxY = Math.max(maxY, cy);

                    for (const [dx, dy] of neighbors) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            const ni = ny * w + nx;
                            if (!visited[ni] && !isBackgroundColor(data, ni * 4, bgColor, tolerance)) {
                                visited[ni] = 1;
                                queue.push([nx, ny]);
                                pixelCount++;
                            }
                        }
                    }
                }

                return { minX, minY, maxX, maxY, pixelCount };
            };

            // Procesar imagen
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    if (visited[i] || isBackgroundColor(data, i * 4, bgColor, tolerance)) continue;

                    const result = floodFill(x, y);
                    processedPixels += result.pixelCount;

                    if (result.pixelCount >= minSpriteSize) {
                        const newId = newFrames.length;
                        newFrames.push({
                            id: newId,
                            name: `sprite_${newId}`,
                            rect: {
                                x: result.minX,
                                y: result.minY,
                                w: result.maxX - result.minX + 1,
                                h: result.maxY - result.minY + 1
                            },
                            type: 'simple'
                        });
                    }
                }
            }

            if (enableLogging) {
                console.log(`Detección completada: ${newFrames.length} sprites encontrados`);
                console.log(`Píxeles procesados: ${processedPixels}/${w * h}`);
            }

            resolve(newFrames);

        } catch (error) {
            reject(new Error(`Error en detección de sprites: ${error.message}`));
        }
    });
}

/**
 * Valida los parámetros de entrada
 * @param {HTMLImageElement} imageElement
 * @param {Object} config
 * @throws {Error}
 */
function validateInputs(imageElement, config) {
    if (!imageElement || !(imageElement instanceof HTMLImageElement)) {
        throw new Error('Se requiere un elemento de imagen válido');
    }
    if (!imageElement.complete) {
        throw new Error('La imagen debe estar completamente cargada');
    }
    if (config.tolerance !== undefined && (config.tolerance < 0 || config.tolerance > 255)) {
        throw new Error('La tolerancia debe estar entre 0 y 255');
    }
    if (config.minSpriteSize !== undefined && config.minSpriteSize < 1) {
        throw new Error('El tamaño mínimo de sprite debe ser al menos 1');
    }
}

/**
 * Detecta el color de fondo basado en las esquinas de la imagen
 * @param {Uint8ClampedArray} data - Datos de imagen
 * @param {number} w - Ancho
 * @param {number} h - Alto
 * @returns {Array} Color RGBA del fondo
 */
function detectBackgroundColor(data, w, h) {
    const corners = [
        [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]
    ];

    const colors = corners.map(([x, y]) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    });

    // Contar frecuencia de colores
    const colorCounts = {};
    colors.forEach(color => {
        const key = color.join(',');
        colorCounts[key] = (colorCounts[key] || 0) + 1;
    });

    // Retornar el color más común
    const mostCommonKey = Object.keys(colorCounts).reduce((a, b) =>
        colorCounts[a] > colorCounts[b] ? a : b
    );

    return mostCommonKey.split(',').map(Number);
}

/**
 * Verifica si un píxel es color de fondo
 * @param {Uint8ClampedArray} data
 * @param {number} index
 * @param {Array} bgColor
 * @param {number} tolerance
 * @returns {boolean}
 */
function isBackgroundColor(data, index, bgColor, tolerance) {
    const r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3];
    if (a === 0) return true;
    if (bgColor[3] < 255 && a > 0) return false;
    const [bgR, bgG, bgB] = bgColor;
    return (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)) <= tolerance;
}

// --- Funciones de utilidad para testing ---
export { detectBackgroundColor, isBackgroundColor, validateInputs };
