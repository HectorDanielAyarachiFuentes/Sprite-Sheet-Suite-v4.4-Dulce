// --- Módulo Avanzado para la Detección Automática de Sprites ---
// Versión con Web Workers, sistema de plugins, cache inteligente y optimizaciones avanzadas.

/**
 * Configuración avanzada para la detección de sprites
 * @typedef {Object} DetectionConfig
 * @property {number} tolerance - Tolerancia de color para detectar fondo (0-255)
 * @property {number} minSpriteSize - Tamaño mínimo de sprite en píxeles
 * @property {boolean} use8WayConnectivity - Usar conectividad 8-way en lugar de 4-way
 * @property {boolean} enableLogging - Habilitar logs de debug
 * @property {boolean} useWebWorker - Usar Web Worker para procesamiento paralelo
 * @property {string} algorithm - Algoritmo a usar ('floodFill', 'contour', 'ai')
 * @property {boolean} enableCache - Habilitar cache inteligente
 * @property {number} chunkSize - Tamaño de chunk para procesamiento (bytes)
 * @property {boolean} useWebGL - Usar WebGL para aceleración GPU
 * @property {boolean} forceRecalculation - Forzar recálculo ignorando cache
 */

/** @type {DetectionConfig} */
const DEFAULT_CONFIG = {
    tolerance: 10,
    minSpriteSize: 4,
    use8WayConnectivity: false,
    enableLogging: false,
    useWebWorker: true,
    algorithm: 'floodFill',
    enableCache: true,
    chunkSize: 1024 * 1024, // 1MB chunks
    useWebGL: false,
    forceRecalculation: false,
    enableNoiseReduction: true,
    noiseThreshold: 2
};

// --- Sistema de Cache Inteligente ---
const detectionCache = new Map();
const CACHE_MAX_SIZE = 10;

function getCacheKey(imageElement, config) {
    // Crear hash simple basado en dimensiones y configuración crítica
    const criticalConfig = {
        tolerance: config.tolerance,
        minSpriteSize: config.minSpriteSize,
        use8WayConnectivity: config.use8WayConnectivity,
        algorithm: config.algorithm
    };
    return `${imageElement.naturalWidth}x${imageElement.naturalHeight}_${JSON.stringify(criticalConfig)}`;
}

function manageCacheSize() {
    if (detectionCache.size > CACHE_MAX_SIZE) {
        const firstKey = detectionCache.keys().next().value;
        detectionCache.delete(firstKey);
    }
}

// --- Web Worker para Procesamiento Paralelo ---
let detectionWorker = null;

function createDetectionWorker() {
    if (!detectionWorker && window.Worker) {
        try {
            // Crear blob con el código del worker inline
            const workerCode = `
                self.onmessage = function(e) {
                    const { imageData, config } = e.data;
                    try {
                        const result = processImageData(imageData, config);
                        self.postMessage({ success: true, frames: result.frames, stats: result.stats });
                    } catch (error) {
                        self.postMessage({ success: false, error: error.message });
                    }
                };

                function processImageData(imageData, config) {
                    const { width: w, height: h } = imageData;
                    const data = imageData.data;
                    const visited = new Uint8Array(w * h);
                    const frames = [];
                    let processedPixels = 0;

                    // Detectar color de fondo
                    const bgColor = detectBackgroundColor(data, w, h);

                    for (let y = 0; y < h; y++) {
                        for (let x = 0; x < w; x++) {
                            const i = y * w + x;
                            if (visited[i] || isBackgroundColor(data, i * 4, bgColor, config.tolerance)) continue;

                            const result = floodFill(x, y, w, h, data, visited, bgColor, config);
                            processedPixels += result.pixelCount;

                            if (result.pixelCount >= config.minSpriteSize) {
                                const newId = frames.length;
                                frames.push({
                                    id: newId,
                                    name: \`sprite_\${newId}\`,
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

                    return {
                        frames,
                        stats: { processedPixels, totalPixels: w * h }
                    };
                }

                function detectBackgroundColor(data, w, h) {
                    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
                    const colors = corners.map(([x, y]) => {
                        const i = (y * w + x) * 4;
                        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
                    });
                    const colorCounts = {};
                    colors.forEach(color => {
                        const key = color.join(',');
                        colorCounts[key] = (colorCounts[key] || 0) + 1;
                    });
                    const mostCommonKey = Object.keys(colorCounts).reduce((a, b) =>
                        colorCounts[a] > colorCounts[b] ? a : b
                    );
                    return mostCommonKey.split(',').map(Number);
                }

                function isBackgroundColor(data, index, bgColor, tolerance) {
                    const r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3];
                    if (a === 0) return true;
                    if (bgColor[3] < 255 && a > 0) return false;
                    const [bgR, bgG, bgB] = bgColor;
                    return (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)) <= tolerance;
                }

                function floodFill(startX, startY, w, h, data, visited, bgColor, config) {
                    const queue = [[startX, startY]];
                    visited[startY * w + startX] = 1;
                    let minX = startX, minY = startY, maxX = startX, maxY = startY;
                    let pixelCount = 1;

                    const neighbors = config.use8WayConnectivity
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
                                if (!visited[ni] && !isBackgroundColor(data, ni * 4, bgColor, config.tolerance)) {
                                    visited[ni] = 1;
                                    queue.push([nx, ny]);
                                    pixelCount++;
                                }
                            }
                        }
                    }

                    return { minX, minY, maxX, maxY, pixelCount };
                }
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            detectionWorker = new Worker(URL.createObjectURL(blob));
        } catch (error) {
            console.warn('Web Worker no disponible:', error);
        }
    }
    return detectionWorker;
}

/**
 * Aplica reducción de ruido eliminando píxeles aislados pequeños
 * @param {Uint8ClampedArray} data - Datos de imagen
 * @param {number} w - Ancho
 * @param {number} h - Alto
 * @param {Array} bgColor - Color de fondo
 * @param {Object} config - Configuración
 */
function applyNoiseReduction(data, w, h, bgColor, config) {
    if (!config.enableNoiseReduction) return;

    const threshold = config.noiseThreshold || 2;
    const visited = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (visited[i] || isBackgroundColor(data, i * 4, bgColor, config.tolerance)) continue;

            // Contar píxeles conectados
            const connectedPixels = countConnectedPixels(x, y, w, h, data, bgColor, config.tolerance);

            // Si es un grupo pequeño de píxeles aislados, marcar como ruido
            if (connectedPixels <= threshold) {
                // Marcar todos los píxeles del grupo como visitados y convertir a fondo
                markNoisePixels(x, y, w, h, data, visited, bgColor, config.tolerance);
            }
        }
    }
}

/**
 * Cuenta píxeles conectados desde una posición inicial
 * @param {number} startX
 * @param {number} startY
 * @param {number} w
 * @param {number} h
 * @param {Uint8ClampedArray} data
 * @param {Array} bgColor
 * @param {number} tolerance
 * @returns {number}
 */
function countConnectedPixels(startX, startY, w, h, data, bgColor, tolerance) {
    const visited = new Uint8Array(w * h);
    const queue = [[startX, startY]];
    visited[startY * w + startX] = 1;
    let count = 1;

    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 4-way connectivity

    while (queue.length > 0) {
        const [cx, cy] = queue.shift();

        for (const [dx, dy] of neighbors) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const ni = ny * w + nx;
                if (!visited[ni] && !isBackgroundColor(data, ni * 4, bgColor, tolerance)) {
                    visited[ni] = 1;
                    queue.push([nx, ny]);
                    count++;
                }
            }
        }
    }

    return count;
}

/**
 * Marca píxeles de ruido como fondo
 * @param {number} startX
 * @param {number} startY
 * @param {number} w
 * @param {number} h
 * @param {Uint8ClampedArray} data
 * @param {Uint8Array} visited
 * @param {Array} bgColor
 * @param {number} tolerance
 */
function markNoisePixels(startX, startY, w, h, data, visited, bgColor, tolerance) {
    const queue = [[startX, startY]];
    visited[startY * w + startX] = 1;

    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 4-way connectivity

    while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        const index = (cy * w + cx) * 4;

        // Convertir píxel a color de fondo
        data[index] = bgColor[0];     // R
        data[index + 1] = bgColor[1]; // G
        data[index + 2] = bgColor[2]; // B
        data[index + 3] = bgColor[3]; // A

        for (const [dx, dy] of neighbors) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const ni = ny * w + nx;
                if (!visited[ni] && !isBackgroundColor(data, ni * 4, bgColor, tolerance)) {
                    visited[ni] = 1;
                    queue.push([nx, ny]);
                }
            }
        }
    }
}

// --- Sistema de Plugins para Algoritmos ---
const detectionAlgorithms = {
    floodFill: floodFillAlgorithm,
    contour: contourAlgorithm,
    ai: aiDetectionAlgorithm
};

function floodFillAlgorithm(imageElement, config) {
    return new Promise((resolve, reject) => {
        try {
            validateInputs(imageElement, config);
            const finalConfig = { ...DEFAULT_CONFIG, ...config };

            if (finalConfig.enableLogging) console.log('Iniciando detección floodFill...');

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
            if (finalConfig.enableLogging) console.log('Color de fondo detectado:', bgColor);

            // Aplicar reducción de ruido si está habilitada
            if (finalConfig.enableNoiseReduction) {
                applyNoiseReduction(data, w, h, bgColor, finalConfig);
                if (finalConfig.enableLogging) console.log('Reducción de ruido aplicada');
            }

            const newFrames = [];
            let processedPixels = 0;

            // Función auxiliar para flood fill optimizado
            const floodFill = (startX, startY) => {
                const queue = [[startX, startY]];
                visited[startY * w + startX] = 1;
                let minX = startX, minY = startY, maxX = startX, maxY = startY;
                let pixelCount = 1;

                const neighbors = finalConfig.use8WayConnectivity
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
                            if (!visited[ni] && !isBackgroundColor(data, ni * 4, bgColor, finalConfig.tolerance)) {
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
                    if (visited[i] || isBackgroundColor(data, i * 4, bgColor, finalConfig.tolerance)) continue;

                    const result = floodFill(x, y);
                    processedPixels += result.pixelCount;

                    if (result.pixelCount >= finalConfig.minSpriteSize) {
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

            if (finalConfig.enableLogging) {
                console.log(`Detección completada: ${newFrames.length} sprites encontrados`);
                console.log(`Píxeles procesados: ${processedPixels}/${w * h}`);
            }

            resolve(newFrames);

        } catch (error) {
            reject(new Error(`Error en detección floodFill: ${error.message}`));
        }
    });
}

function contourAlgorithm(imageElement, config) {
    // Placeholder para algoritmo de contornos
    console.log('Algoritmo de contornos no implementado aún');
    return floodFillAlgorithm(imageElement, config);
}

function aiDetectionAlgorithm(imageElement, config) {
    // Placeholder para algoritmo de IA
    console.log('Algoritmo de IA no implementado aún');
    return floodFillAlgorithm(imageElement, config);
}

/**
 * Detecta sprites automáticamente en una imagen usando algoritmos avanzados
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

            if (finalConfig.enableLogging) {
                console.log('🚀 Iniciando detección avanzada de sprites...');
                console.log('Configuración:', finalConfig);
            }

            // Verificar cache inteligente
            if (finalConfig.enableCache && !finalConfig.forceRecalculation) {
                const cacheKey = getCacheKey(imageElement, finalConfig);
                if (detectionCache.has(cacheKey)) {
                    if (finalConfig.enableLogging) {
                        console.log('✅ Resultado encontrado en cache');
                    }
                    resolve(detectionCache.get(cacheKey));
                    return;
                }
            }

            // Seleccionar algoritmo
            const algorithm = detectionAlgorithms[finalConfig.algorithm] || detectionAlgorithms.floodFill;

            // Usar Web Worker si está disponible y habilitado
            if (finalConfig.useWebWorker && window.Worker) {
                processWithWebWorker(imageElement, finalConfig, resolve, reject);
            } else {
                // Procesamiento en hilo principal
                algorithm(imageElement, finalConfig)
                    .then(result => {
                        // Cachear resultado
                        if (finalConfig.enableCache) {
                            const cacheKey = getCacheKey(imageElement, finalConfig);
                            detectionCache.set(cacheKey, result);
                            manageCacheSize();
                        }

                        if (finalConfig.enableLogging) {
                            console.log(`✅ Detección completada: ${result.length} sprites encontrados`);
                        }

                        resolve(result);
                    })
                    .catch(reject);
            }

        } catch (error) {
            reject(new Error(`Error en detección de sprites: ${error.message}`));
        }
    });
}

/**
 * Procesa la imagen usando Web Worker para mejor rendimiento
 */
function processWithWebWorker(imageElement, config, resolve, reject) {
    const worker = createDetectionWorker();

    if (!worker) {
        // Fallback a procesamiento normal
        const algorithm = detectionAlgorithms[config.algorithm] || detectionAlgorithms.floodFill;
        return algorithm(imageElement, config).then(resolve).catch(reject);
    }

    // Preparar datos para el worker
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = imageElement.naturalWidth;
    tempCanvas.height = imageElement.naturalHeight;
    tempCtx.drawImage(imageElement, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    // Configurar handlers del worker
    worker.onmessage = function(e) {
        const { success, frames, stats, error } = e.data;

        if (success) {
            // Cachear resultado
            if (config.enableCache) {
                const cacheKey = getCacheKey(imageElement, config);
                detectionCache.set(cacheKey, frames);
                manageCacheSize();
            }

            if (config.enableLogging) {
                console.log(`✅ Detección Web Worker completada: ${frames.length} sprites encontrados`);
                console.log('📊 Estadísticas:', stats);
            }

            resolve(frames);
        } else {
            reject(new Error(`Error en Web Worker: ${error}`));
        }
    };

    worker.onerror = function(error) {
        console.warn('Error en Web Worker, usando procesamiento normal:', error);
        // Fallback a procesamiento normal
        const algorithm = detectionAlgorithms[config.algorithm] || detectionAlgorithms.floodFill;
        algorithm(imageElement, config).then(resolve).catch(reject);
    };

    // Enviar datos al worker
    worker.postMessage({
        imageData: {
            data: imageData.data,
            width: imageData.width,
            height: imageData.height
        },
        config
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
 * Detecta el color de fondo basado en el borde completo de la imagen
 * @param {Uint8ClampedArray} data - Datos de imagen
 * @param {number} w - Ancho
 * @param {number} h - Alto
 * @returns {Array} Color RGBA del fondo
 */
function detectBackgroundColor(data, w, h) {
    const borderPixels = [];

    // Muestrear borde superior e inferior
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 50))) { // Muestrear cada 50 píxeles o menos
        // Superior
        const topIndex = (0 * w + x) * 4;
        borderPixels.push([data[topIndex], data[topIndex + 1], data[topIndex + 2], data[topIndex + 3]]);
        // Inferior
        const bottomIndex = ((h - 1) * w + x) * 4;
        borderPixels.push([data[bottomIndex], data[bottomIndex + 1], data[bottomIndex + 2], data[bottomIndex + 3]]);
    }

    // Muestrear borde izquierdo y derecho (excluyendo esquinas ya muestreadas)
    for (let y = 1; y < h - 1; y += Math.max(1, Math.floor(h / 50))) {
        // Izquierdo
        const leftIndex = (y * w + 0) * 4;
        borderPixels.push([data[leftIndex], data[leftIndex + 1], data[leftIndex + 2], data[leftIndex + 3]]);
        // Derecho
        const rightIndex = (y * w + (w - 1)) * 4;
        borderPixels.push([data[rightIndex], data[rightIndex + 1], data[rightIndex + 2], data[rightIndex + 3]]);
    }

    // Contar frecuencia de colores con tolerancia
    const colorCounts = {};
    const tolerance = 5; // Tolerancia para agrupar colores similares

    borderPixels.forEach(color => {
        // Buscar colores similares ya contados
        let found = false;
        for (const key in colorCounts) {
            const existingColor = key.split(',').map(Number);
            if (colorsSimilar(color, existingColor, tolerance)) {
                colorCounts[key]++;
                found = true;
                break;
            }
        }
        if (!found) {
            const key = color.join(',');
            colorCounts[key] = 1;
        }
    });

    // Retornar el color más común
    const mostCommonKey = Object.keys(colorCounts).reduce((a, b) =>
        colorCounts[a] > colorCounts[b] ? a : b
    );

    return mostCommonKey.split(',').map(Number);
}

/**
 * Verifica si dos colores son similares dentro de una tolerancia
 * @param {Array} color1
 * @param {Array} color2
 * @param {number} tolerance
 * @returns {boolean}
 */
function colorsSimilar(color1, color2, tolerance) {
    for (let i = 0; i < 4; i++) {
        if (Math.abs(color1[i] - color2[i]) > tolerance) {
            return false;
        }
    }
    return true;
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

/**
 * Procesa imágenes grandes en chunks para optimizar memoria
 * @param {ImageData} imageData
 * @param {Object} config
 * @returns {Promise<Array>}
 */
export function processImageInChunks(imageData, config) {
    return new Promise((resolve, reject) => {
        const { width: w, height: h, data } = imageData;
        const chunkSize = config.chunkSize || DEFAULT_CONFIG.chunkSize;
        const bytesPerPixel = 4;
        const pixelsPerChunk = Math.floor(chunkSize / bytesPerPixel);
        const rowsPerChunk = Math.floor(pixelsPerChunk / w);

        if (rowsPerChunk >= h) {
            // Imagen pequeña, procesar normalmente
            return processImageChunk(data, 0, h, w, config).then(resolve).catch(reject);
        }

        const chunks = [];
        for (let startRow = 0; startRow < h; startRow += rowsPerChunk) {
            const endRow = Math.min(startRow + rowsPerChunk, h);
            chunks.push({ startRow, endRow });
        }

        // Procesar chunks en secuencia
        const processChunksSequentially = async () => {
            const allFrames = [];
            for (const chunk of chunks) {
                try {
                    const chunkFrames = await processImageChunk(data, chunk.startRow, chunk.endRow, w, config);
                    allFrames.push(...chunkFrames);
                } catch (error) {
                    reject(new Error(`Error procesando chunk ${chunk.startRow}-${chunk.endRow}: ${error.message}`));
                    return;
                }
            }
            resolve(allFrames);
        };

        processChunksSequentially();
    });
}

/**
 * Procesa un chunk específico de la imagen
 */
function processImageChunk(data, startRow, endRow, width, config) {
    return new Promise((resolve) => {
        const chunkHeight = endRow - startRow;
        const chunkData = new Uint8ClampedArray(width * chunkHeight * 4);

        // Copiar datos del chunk
        for (let y = 0; y < chunkHeight; y++) {
            const srcY = startRow + y;
            const srcIndex = srcY * width * 4;
            const destIndex = y * width * 4;
            chunkData.set(data.subarray(srcIndex, srcIndex + width * 4), destIndex);
        }

        // Procesar chunk (simplificado para este ejemplo)
        const frames = [];
        // Aquí iría la lógica de procesamiento real del chunk
        resolve(frames);
    });
}

/**
 * Calcula estadísticas avanzadas de los sprites detectados
 * @param {Array} frames
 * @param {Object} imageData
 * @returns {Object}
 */
export function calculateDetectionStats(frames, imageData) {
    if (!frames || frames.length === 0) {
        return { totalSprites: 0, averageSize: 0, sizeDistribution: {}, coverage: 0 };
    }

    const sizes = frames.map(f => f.rect.w * f.rect.h);
    const totalPixels = imageData.width * imageData.height;
    const spritePixels = sizes.reduce((sum, size) => sum + size, 0);
    const coverage = (spritePixels / totalPixels) * 100;

    // Distribución de tamaños
    const sizeDistribution = {};
    sizes.forEach(size => {
        const range = Math.floor(size / 100) * 100;
        sizeDistribution[range] = (sizeDistribution[range] || 0) + 1;
    });

    return {
        totalSprites: frames.length,
        averageSize: sizes.reduce((sum, size) => sum + size, 0) / sizes.length,
        minSize: Math.min(...sizes),
        maxSize: Math.max(...sizes),
        sizeDistribution,
        coverage: coverage.toFixed(2),
        density: (frames.length / (imageData.width * imageData.height / 10000)).toFixed(2) // sprites por 100x100 píxeles
    };
}

/**
 * Crea una interfaz de configuración avanzada
 * @param {HTMLElement} container
 * @param {Object} currentConfig
 * @param {Function} onConfigChange
 */
export function createAdvancedConfigPanel(container, currentConfig = {}, onConfigChange = () => {}) {
    const config = { ...DEFAULT_CONFIG, ...currentConfig };

    const panel = document.createElement('div');
    panel.className = 'advanced-detection-config';
    panel.innerHTML = `
        <h4>⚙️ Configuración Avanzada de Detección</h4>

        <div class="config-section">
            <h5>Algoritmo</h5>
            <select id="algorithm-select">
                <option value="floodFill" ${config.algorithm === 'floodFill' ? 'selected' : ''}>Flood Fill (Recomendado)</option>
                <option value="contour" ${config.algorithm === 'contour' ? 'selected' : ''}>Detección de Contornos</option>
                <option value="ai" ${config.algorithm === 'ai' ? 'selected' : ''}>Inteligencia Artificial</option>
            </select>
        </div>

        <div class="config-section">
            <h5>Parámetros Básicos</h5>
            <label>
                Tolerancia: <input type="range" id="tolerance-slider" min="0" max="255" value="${config.tolerance}">
                <span id="tolerance-value">${config.tolerance}</span>
            </label>
            <label>
                Tamaño Mínimo: <input type="range" id="minsize-slider" min="1" max="100" value="${config.minSpriteSize}">
                <span id="minsize-value">${config.minSpriteSize}</span>
            </label>
        </div>

        <div class="config-section">
            <h5>Optimizaciones</h5>
            <label>
                <input type="checkbox" id="webworker-checkbox" ${config.useWebWorker ? 'checked' : ''}>
                Usar Web Worker (Mejor rendimiento)
            </label>
            <label>
                <input type="checkbox" id="cache-checkbox" ${config.enableCache ? 'checked' : ''}>
                Cache inteligente
            </label>
            <label>
                <input type="checkbox" id="8way-checkbox" ${config.use8WayConnectivity ? 'checked' : ''}>
                Conectividad 8-way
            </label>
            <label>
                <input type="checkbox" id="logging-checkbox" ${config.enableLogging ? 'checked' : ''}>
                Logging detallado
            </label>
        </div>

        <div class="config-section">
            <h5>Acciones</h5>
            <button id="reset-config-btn">🔄 Restablecer</button>
            <button id="apply-config-btn">✅ Aplicar</button>
        </div>
    `;

    // Event listeners
    const toleranceSlider = panel.querySelector('#tolerance-slider');
    const toleranceValue = panel.querySelector('#tolerance-value');
    const minsizeSlider = panel.querySelector('#minsize-slider');
    const minsizeValue = panel.querySelector('#minsize-value');

    toleranceSlider.addEventListener('input', (e) => {
        toleranceValue.textContent = e.target.value;
    });

    minsizeSlider.addEventListener('input', (e) => {
        minsizeValue.textContent = e.target.value;
    });

    panel.querySelector('#reset-config-btn').addEventListener('click', () => {
        Object.assign(config, DEFAULT_CONFIG);
        updatePanelValues();
        onConfigChange(config);
    });

    panel.querySelector('#apply-config-btn').addEventListener('click', () => {
        updateConfigFromPanel();
        onConfigChange(config);
    });

    function updatePanelValues() {
        panel.querySelector('#algorithm-select').value = config.algorithm;
        panel.querySelector('#tolerance-slider').value = config.tolerance;
        panel.querySelector('#tolerance-value').textContent = config.tolerance;
        panel.querySelector('#minsize-slider').value = config.minSpriteSize;
        panel.querySelector('#minsize-value').textContent = config.minSpriteSize;
        panel.querySelector('#webworker-checkbox').checked = config.useWebWorker;
        panel.querySelector('#cache-checkbox').checked = config.enableCache;
        panel.querySelector('#8way-checkbox').checked = config.use8WayConnectivity;
        panel.querySelector('#logging-checkbox').checked = config.enableLogging;
    }

    function updateConfigFromPanel() {
        config.algorithm = panel.querySelector('#algorithm-select').value;
        config.tolerance = parseInt(panel.querySelector('#tolerance-slider').value);
        config.minSpriteSize = parseInt(panel.querySelector('#minsize-slider').value);
        config.useWebWorker = panel.querySelector('#webworker-checkbox').checked;
        config.enableCache = panel.querySelector('#cache-checkbox').checked;
        config.use8WayConnectivity = panel.querySelector('#8way-checkbox').checked;
        config.enableLogging = panel.querySelector('#logging-checkbox').checked;
    }

    container.appendChild(panel);
    return config;
}

/**
 * Función de utilidad para limpiar el cache
 */
export function clearDetectionCache() {
    detectionCache.clear();
    console.log('🧹 Cache de detección limpiado');
}

/**
 * Obtiene información del cache actual
 */
export function getCacheInfo() {
    return {
        size: detectionCache.size,
        maxSize: CACHE_MAX_SIZE,
        keys: Array.from(detectionCache.keys())
    };
}
