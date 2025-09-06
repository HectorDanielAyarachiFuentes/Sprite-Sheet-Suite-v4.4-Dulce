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
 * Implementa el algoritmo de Canny para detección de bordes
 * @param {Uint8ClampedArray} data - Datos de imagen
 * @param {number} w - Ancho
 * @param {number} h - Alto
 * @param {Object} config - Configuración
 * @returns {Uint8ClampedArray} Datos con bordes detectados
 */
function applyCannyEdgeDetection(data, w, h, config) {
    if (!config.enableEdgeDetection) return data;

    const lowThreshold = config.edgeLowThreshold || 50;
    const highThreshold = config.edgeHighThreshold || 150;

    // Convertir a escala de grises
    const grayData = new Uint8ClampedArray(w * h);
    for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        grayData[i / 4] = gray;
    }

    // Aplicar filtro Gaussiano para reducir ruido
    const blurred = applyGaussianBlur(grayData, w, h, config.gaussianSigma || 1.4);

    // Calcular gradientes con operadores Sobel
    const { magnitude, direction } = calculateGradients(blurred, w, h);

    // Supresión de no-máximos
    const suppressed = nonMaxSuppression(magnitude, direction, w, h);

    // Umbralización con histéresis
    const edges = hysteresisThresholding(suppressed, w, h, lowThreshold, highThreshold);

    // Convertir resultado a formato RGBA
    const result = new Uint8ClampedArray(data.length);
    for (let i = 0; i < edges.length; i++) {
        const pixelIndex = i * 4;
        const edgeValue = edges[i];
        result[pixelIndex] = edgeValue;     // R
        result[pixelIndex + 1] = edgeValue; // G
        result[pixelIndex + 2] = edgeValue; // B
        result[pixelIndex + 3] = 255;       // A
    }

    return result;
}

/**
 * Aplica filtro Gaussiano para suavizado
 */
function applyGaussianBlur(data, w, h, sigma) {
    const kernelSize = Math.ceil(3 * sigma);
    const kernel = generateGaussianKernel(kernelSize, sigma);
    return applyConvolution(data, w, h, kernel);
}

/**
 * Genera kernel Gaussiano
 */
function generateGaussianKernel(size, sigma) {
    const kernel = new Array(size * size);
    const center = Math.floor(size / 2);
    let sum = 0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            kernel[y * size + x] = value;
            sum += value;
        }
    }

    // Normalizar
    for (let i = 0; i < kernel.length; i++) {
        kernel[i] /= sum;
    }

    return kernel;
}

/**
 * Aplica convolución 2D
 */
function applyConvolution(data, w, h, kernel) {
    const kernelSize = Math.sqrt(kernel.length);
    const halfKernel = Math.floor(kernelSize / 2);
    const result = new Uint8ClampedArray(data.length);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;

            for (let ky = 0; ky < kernelSize; ky++) {
                for (let kx = 0; kx < kernelSize; kx++) {
                    const px = x + kx - halfKernel;
                    const py = y + ky - halfKernel;

                    if (px >= 0 && px < w && py >= 0 && py < h) {
                        const kernelValue = kernel[ky * kernelSize + kx];
                        const pixelValue = data[py * w + px];
                        sum += kernelValue * pixelValue;
                    }
                }
            }

            result[y * w + x] = Math.min(255, Math.max(0, Math.round(sum)));
        }
    }

    return result;
}

/**
 * Calcula gradientes usando operadores Sobel
 */
function calculateGradients(data, w, h) {
    const magnitude = new Uint8ClampedArray(w * h);
    const direction = new Float32Array(w * h);

    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let gx = 0, gy = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const pixel = data[(y + ky) * w + (x + kx)];
                    const kernelIndex = (ky + 1) * 3 + (kx + 1);
                    gx += pixel * sobelX[kernelIndex];
                    gy += pixel * sobelY[kernelIndex];
                }
            }

            const mag = Math.sqrt(gx * gx + gy * gy);
            magnitude[y * w + x] = Math.min(255, Math.round(mag));
            direction[y * w + x] = Math.atan2(gy, gx);
        }
    }

    return { magnitude, direction };
}

/**
 * Supresión de no-máximos
 */
function nonMaxSuppression(magnitude, direction, w, h) {
    const result = new Uint8ClampedArray(w * h);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const angle = direction[y * w + x];
            const mag = magnitude[y * w + x];

            // Convertir ángulo a grados y determinar dirección
            let angleDeg = (angle * 180) / Math.PI;
            if (angleDeg < 0) angleDeg += 180;

            let neighbor1, neighbor2;

            if ((angleDeg >= 0 && angleDeg < 22.5) || (angleDeg >= 157.5 && angleDeg <= 180)) {
                neighbor1 = magnitude[y * w + (x + 1)];
                neighbor2 = magnitude[y * w + (x - 1)];
            } else if (angleDeg >= 22.5 && angleDeg < 67.5) {
                neighbor1 = magnitude[(y + 1) * w + (x - 1)];
                neighbor2 = magnitude[(y - 1) * w + (x + 1)];
            } else if (angleDeg >= 67.5 && angleDeg < 112.5) {
                neighbor1 = magnitude[(y + 1) * w + x];
                neighbor2 = magnitude[(y - 1) * w + x];
            } else {
                neighbor1 = magnitude[(y + 1) * w + (x + 1)];
                neighbor2 = magnitude[(y - 1) * w + (x - 1)];
            }

            if (mag >= neighbor1 && mag >= neighbor2) {
                result[y * w + x] = mag;
            }
        }
    }

    return result;
}

/**
 * Umbralización con histéresis
 */
function hysteresisThresholding(data, w, h, lowThreshold, highThreshold) {
    const result = new Uint8ClampedArray(w * h);
    const visited = new Uint8Array(w * h);

    // Primera pasada: píxeles fuertes
    for (let i = 0; i < data.length; i++) {
        if (data[i] >= highThreshold) {
            result[i] = 255;
            visited[i] = 1;
        }
    }

    // Segunda pasada: píxeles débiles conectados a fuertes
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (visited[i] || data[i] < lowThreshold) continue;

            // Buscar conexión con píxel fuerte usando BFS
            const queue = [[x, y]];
            const componentVisited = new Uint8Array(w * h);
            componentVisited[i] = 1;
            let connectedToStrong = false;

            while (queue.length > 0 && !connectedToStrong) {
                const [cx, cy] = queue.shift();

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            const ni = ny * w + nx;
                            if (!componentVisited[ni]) {
                                componentVisited[ni] = 1;
                                if (result[ni] === 255) {
                                    connectedToStrong = true;
                                    break;
                                } else if (data[ni] >= lowThreshold) {
                                    queue.push([nx, ny]);
                                }
                            }
                        }
                    }
                    if (connectedToStrong) break;
                }
            }

            if (connectedToStrong) {
                // Marcar todo el componente como borde
                for (let j = 0; j < componentVisited.length; j++) {
                    if (componentVisited[j] && data[j] >= lowThreshold) {
                        result[j] = 255;
                    }
                }
            }
        }
    }

    return result;
}

/**
 * Sistema de fusión inteligente de sprites adyacentes
 * @param {Array} frames - Sprites detectados
 * @param {Object} config - Configuración
 * @returns {Array} Sprites fusionados
 */
function applyIntelligentSpriteMerging(frames, config) {
    if (!config.enableSpriteMerging || frames.length <= 1) return frames;

    const mergedFrames = [];
    const processed = new Set();

    for (let i = 0; i < frames.length; i++) {
        if (processed.has(i)) continue;

        let currentGroup = [frames[i]];
        processed.add(i);

        // Buscar sprites adyacentes similares
        for (let j = i + 1; j < frames.length; j++) {
            if (processed.has(j)) continue;

            const sprite1 = frames[i];
            const sprite2 = frames[j];

            if (shouldMergeSprites(sprite1, sprite2, config)) {
                currentGroup.push(frames[j]);
                processed.add(j);
            }
        }

        // Fusionar grupo si hay múltiples sprites
        if (currentGroup.length > 1) {
            const mergedSprite = mergeSpriteGroup(currentGroup);
            mergedFrames.push(mergedSprite);
        } else {
            mergedFrames.push(currentGroup[0]);
        }
    }

    return mergedFrames;
}

/**
 * Determina si dos sprites deberían fusionarse
 * @param {Object} sprite1
 * @param {Object} sprite2
 * @param {Object} config
 * @returns {boolean}
 */
function shouldMergeSprites(sprite1, sprite2, config) {
    const rect1 = sprite1.rect;
    const rect2 = sprite2.rect;

    // Calcular distancia entre bounding boxes
    const distance = calculateBoundingBoxDistance(rect1, rect2);

    // Umbrales de configuración
    const maxDistance = config.spriteMergeMaxDistance || 5;
    const minSimilarity = config.spriteMergeMinSimilarity || 0.7;

    if (distance > maxDistance) return false;

    // Calcular similitud de tamaño
    const size1 = rect1.w * rect1.h;
    const size2 = rect2.w * rect2.h;
    const sizeRatio = Math.min(size1, size2) / Math.max(size1, size2);
    const sizeSimilarity = sizeRatio > minSimilarity;

    // Calcular similitud de forma (aspect ratio)
    const aspect1 = rect1.w / rect1.h;
    const aspect2 = rect2.w / rect2.h;
    const aspectRatio = Math.min(aspect1, aspect2) / Math.max(aspect1, aspect2);
    const aspectSimilarity = aspectRatio > minSimilarity;

    return sizeSimilarity && aspectSimilarity;
}

/**
 * Calcula la distancia mínima entre dos bounding boxes
 * @param {Object} rect1
 * @param {Object} rect2
 * @returns {number}
 */
function calculateBoundingBoxDistance(rect1, rect2) {
    const x1 = rect1.x + rect1.w / 2;
    const y1 = rect1.y + rect1.h / 2;
    const x2 = rect2.x + rect2.w / 2;
    const y2 = rect2.y + rect2.h / 2;

    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Fusiona un grupo de sprites en uno solo
 * @param {Array} spriteGroup
 * @returns {Object}
 */
function mergeSpriteGroup(spriteGroup) {
    if (spriteGroup.length === 1) return spriteGroup[0];

    // Calcular bounding box combinado
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    spriteGroup.forEach(sprite => {
        const rect = sprite.rect;
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.w);
        maxY = Math.max(maxY, rect.y + rect.h);
    });

    // Crear sprite fusionado
    const mergedRect = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };

    // Generar nombre para el sprite fusionado
    const baseNames = spriteGroup.map(s => s.name.split('_')[1]).join('-');
    const mergedName = `merged_${baseNames}`;

    return {
        id: spriteGroup[0].id, // Mantener ID del primer sprite
        name: mergedName,
        rect: mergedRect,
        type: 'merged',
        originalSprites: spriteGroup.length,
        mergedFrom: spriteGroup.map(s => s.id)
    };
}

/**
 * Sistema avanzado de optimización de sprites
 * @param {Array} frames - Sprites detectados
 * @param {Object} config - Configuración
 * @returns {Array} Sprites optimizados
 */
function applyAdvancedSpriteOptimization(frames, config) {
    if (!config.enableSpriteOptimization || frames.length === 0) return frames;

    let optimizedFrames = [...frames];

    // 1. Eliminar sprites duplicados
    if (config.removeDuplicates) {
        optimizedFrames = removeDuplicateSprites(optimizedFrames, config);
    }

    // 2. Optimizar tamaños de sprites
    if (config.optimizeSpriteSizes) {
        optimizedFrames = optimizeSpriteSizes(optimizedFrames, config);
    }

    // 3. Optimizar formatos y compresión
    if (config.optimizeFormats) {
        optimizedFrames = optimizeSpriteFormats(optimizedFrames, config);
    }

    // 4. Aplicar optimizaciones adicionales
    if (config.enableAdvancedOptimizations) {
        optimizedFrames = applyAdvancedOptimizations(optimizedFrames, config);
    }

    return optimizedFrames;
}

/**
 * Elimina sprites duplicados basándose en similitud de contenido
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function removeDuplicateSprites(frames, config) {
    const uniqueFrames = [];
    const processed = new Set();

    for (let i = 0; i < frames.length; i++) {
        if (processed.has(i)) continue;

        const currentFrame = frames[i];
        let isDuplicate = false;

        // Comparar con frames ya procesados
        for (let j = 0; j < uniqueFrames.length; j++) {
            if (areSpritesSimilar(currentFrame, uniqueFrames[j], config)) {
                isDuplicate = true;
                // Marcar como referencia al sprite original
                currentFrame.duplicateOf = uniqueFrames[j].id;
                break;
            }
        }

        if (!isDuplicate) {
            uniqueFrames.push(currentFrame);
        }
        processed.add(i);
    }

    return uniqueFrames;
}

/**
 * Verifica si dos sprites son similares
 * @param {Object} sprite1
 * @param {Object} sprite2
 * @param {Object} config
 * @returns {boolean}
 */
function areSpritesSimilar(sprite1, sprite2, config) {
    const rect1 = sprite1.rect;
    const rect2 = sprite2.rect;

    // Verificar si las dimensiones son similares
    const sizeThreshold = config.duplicateSizeThreshold || 0.9;
    const size1 = rect1.w * rect1.h;
    const size2 = rect2.w * rect2.h;
    const sizeRatio = Math.min(size1, size2) / Math.max(size1, size2);

    if (sizeRatio < sizeThreshold) return false;

    // Verificar si las posiciones están cerca
    const positionThreshold = config.duplicatePositionThreshold || 10;
    const distance = calculateBoundingBoxDistance(rect1, rect2);

    return distance <= positionThreshold;
}

/**
 * Optimiza los tamaños de los sprites eliminando espacio vacío
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function optimizeSpriteSizes(frames, config) {
    return frames.map(frame => {
        const rect = frame.rect;

        // Aquí iría la lógica para recortar el sprite eliminando píxeles transparentes
        // Por ahora, retornamos el frame sin modificaciones
        return {
            ...frame,
            optimized: true,
            originalSize: rect.w * rect.h
        };
    });
}

/**
 * Optimiza formatos y compresión de sprites
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function optimizeSpriteFormats(frames, config) {
    return frames.map(frame => {
        const rect = frame.rect;
        const area = rect.w * rect.h;

        // Determinar el formato óptimo basado en el tamaño
        let format = 'png'; // default
        if (area < 100) {
            format = 'svg'; // Para sprites muy pequeños
        } else if (config.enableWebP && area > 1000) {
            format = 'webp'; // Para sprites grandes con soporte WebP
        }

        return {
            ...frame,
            format,
            compressionLevel: config.compressionLevel || 6
        };
    });
}

/**
 * Aplica optimizaciones avanzadas adicionales
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function applyAdvancedOptimizations(frames, config) {
    return frames.map(frame => {
        const rect = frame.rect;

        // Calcular métricas de optimización
        const aspectRatio = rect.w / rect.h;
        const area = rect.w * rect.h;
        const perimeter = 2 * (rect.w + rect.h);
        const compactness = (4 * Math.PI * area) / (perimeter * perimeter);

        return {
            ...frame,
            metrics: {
                aspectRatio: aspectRatio.toFixed(2),
                area,
                compactness: compactness.toFixed(3),
                efficiency: (area / (rect.w * rect.h)).toFixed(2)
            }
        };
    });
}

/**
 * Sistema inteligente de animación de sprites
 * @param {Array} frames - Sprites detectados
 * @param {Object} config - Configuración
 * @returns {Array} Animaciones detectadas
 */
function applyIntelligentSpriteAnimation(frames, config) {
    if (!config.enableAnimationDetection || frames.length <= 1) return frames;

    const animations = [];

    // 1. Detectar secuencias de animación
    const animationSequences = detectAnimationSequences(frames, config);

    // 2. Crear animaciones a partir de las secuencias
    animationSequences.forEach(sequence => {
        const animation = createAnimationFromSequence(sequence, config);
        if (animation) {
            animations.push(animation);
        }
    });

    // 3. Optimizar animaciones
    if (config.optimizeAnimations) {
        return optimizeAnimations(animations, config);
    }

    return animations.length > 0 ? animations : frames;
}

/**
 * Detecta secuencias de animación basándose en similitud y posición
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function detectAnimationSequences(frames, config) {
    const sequences = [];
    const processed = new Set();

    for (let i = 0; i < frames.length; i++) {
        if (processed.has(i)) continue;

        const sequence = [frames[i]];
        processed.add(i);

        // Buscar frames relacionados
        for (let j = i + 1; j < frames.length; j++) {
            if (processed.has(j)) continue;

            const currentFrame = frames[i];
            const candidateFrame = frames[j];

            if (areAnimationFrames(currentFrame, candidateFrame, config)) {
                sequence.push(candidateFrame);
                processed.add(j);
            }
        }

        // Solo considerar secuencias con múltiples frames
        if (sequence.length > 1) {
            sequences.push(sequence);
        }
    }

    return sequences;
}

/**
 * Verifica si dos frames pertenecen a la misma animación
 * @param {Object} frame1
 * @param {Object} frame2
 * @param {Object} config
 * @returns {boolean}
 */
function areAnimationFrames(frame1, frame2, config) {
    const rect1 = frame1.rect;
    const rect2 = frame2.rect;

    // Verificar similitud de tamaño
    const sizeThreshold = config.animationSizeThreshold || 0.8;
    const size1 = rect1.w * rect1.h;
    const size2 = rect2.w * rect2.h;
    const sizeRatio = Math.min(size1, size2) / Math.max(size1, size2);

    if (sizeRatio < sizeThreshold) return false;

    // Verificar proximidad espacial
    const distanceThreshold = config.animationDistanceThreshold || 50;
    const distance = calculateBoundingBoxDistance(rect1, rect2);

    if (distance > distanceThreshold) return false;

    // Verificar similitud de forma (aspect ratio)
    const aspect1 = rect1.w / rect1.h;
    const aspect2 = rect2.w / rect2.h;
    const aspectThreshold = config.animationAspectThreshold || 0.9;
    const aspectRatio = Math.min(aspect1, aspect2) / Math.max(aspect1, aspect2);

    return aspectRatio > aspectThreshold;
}

/**
 * Crea una animación a partir de una secuencia de frames
 * @param {Array} sequence
 * @param {Object} config
 * @returns {Object}
 */
function createAnimationFromSequence(sequence, config) {
    if (sequence.length < 2) return null;

    // Ordenar frames por posición (de izquierda a derecha, arriba a abajo)
    const sortedFrames = sortAnimationFrames(sequence, config);

    // Calcular propiedades de la animación
    const totalFrames = sortedFrames.length;
    const frameRate = config.defaultFrameRate || 12; // FPS
    const duration = totalFrames / frameRate;

    // Calcular bounding box combinado
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    sortedFrames.forEach(frame => {
        const rect = frame.rect;
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.w);
        maxY = Math.max(maxY, rect.y + rect.h);
    });

    const animationRect = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };

    // Generar nombre para la animación
    const baseName = sortedFrames[0].name.split('_')[1];
    const animationName = `animation_${baseName}`;

    return {
        id: `anim_${Date.now()}`,
        name: animationName,
        type: 'animation',
        frames: sortedFrames,
        totalFrames,
        frameRate,
        duration: duration.toFixed(2),
        rect: animationRect,
        loop: config.animationLoop || true,
        metadata: {
            created: new Date().toISOString(),
            sourceFrames: sortedFrames.map(f => f.id),
            optimizationLevel: config.animationOptimizationLevel || 'medium'
        }
    };
}

/**
 * Ordena los frames de una animación
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function sortAnimationFrames(frames, config) {
    const sortMethod = config.animationSortMethod || 'position'; // 'position', 'name', 'size'

    switch (sortMethod) {
        case 'position':
            return frames.sort((a, b) => {
                const rectA = a.rect;
                const rectB = b.rect;
                // Primero por fila (Y), luego por columna (X)
                if (Math.abs(rectA.y - rectB.y) > 10) {
                    return rectA.y - rectB.y;
                }
                return rectA.x - rectB.x;
            });

        case 'name':
            return frames.sort((a, b) => {
                const numA = parseInt(a.name.split('_')[1]) || 0;
                const numB = parseInt(b.name.split('_')[1]) || 0;
                return numA - numB;
            });

        case 'size':
            return frames.sort((a, b) => {
                const sizeA = a.rect.w * a.rect.h;
                const sizeB = b.rect.w * b.rect.h;
                return sizeB - sizeA; // De mayor a menor
            });

        default:
            return frames;
    }
}

/**
 * Optimiza animaciones detectadas
 * @param {Array} animations
 * @param {Object} config
 * @returns {Array}
 */
function optimizeAnimations(animations, config) {
    return animations.map(animation => {
        const optimizedFrames = [...animation.frames];

        // 1. Eliminar frames duplicados en la animación
        if (config.removeDuplicateAnimationFrames) {
            optimizedFrames = removeDuplicateAnimationFrames(optimizedFrames, config);
        }

        // 2. Optimizar timing de frames
        if (config.optimizeAnimationTiming) {
            animation.frameRate = optimizeAnimationTiming(optimizedFrames, config);
        }

        // 3. Comprimir animación si es necesario
        if (config.compressAnimations && optimizedFrames.length > config.maxAnimationFrames) {
            optimizedFrames = compressAnimationFrames(optimizedFrames, config.maxAnimationFrames);
        }

        return {
            ...animation,
            frames: optimizedFrames,
            totalFrames: optimizedFrames.length,
            duration: (optimizedFrames.length / animation.frameRate).toFixed(2),
            optimized: true
        };
    });
}

/**
 * Elimina frames duplicados dentro de una animación
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function removeDuplicateAnimationFrames(frames, config) {
    const uniqueFrames = [];
    const threshold = config.animationDuplicateThreshold || 0.95;

    for (let i = 0; i < frames.length; i++) {
        let isDuplicate = false;

        for (let j = 0; j < uniqueFrames.length; j++) {
            if (areSpritesSimilar(frames[i], uniqueFrames[j], { duplicateSizeThreshold: threshold })) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            uniqueFrames.push(frames[i]);
        }
    }

    return uniqueFrames;
}

/**
 * Optimiza el timing de una animación
 * @param {Array} frames
 * @param {Object} config
 * @returns {number}
 */
function optimizeAnimationTiming(frames, config) {
    // Análisis simple basado en el número de frames y complejidad
    const baseFrameRate = config.defaultFrameRate || 12;
    const frameCount = frames.length;

    // Ajustar frame rate basado en la cantidad de frames
    if (frameCount <= 4) {
        return Math.max(baseFrameRate, 8); // Animaciones cortas más lentas
    } else if (frameCount <= 8) {
        return baseFrameRate;
    } else {
        return Math.min(baseFrameRate * 1.5, 24); // Animaciones largas más rápidas
    }
}

/**
 * Comprime frames de animación para reducir cantidad
 * @param {Array} frames
 * @param {number} maxFrames
 * @returns {Array}
 */
function compressAnimationFrames(frames, maxFrames) {
    if (frames.length <= maxFrames) return frames;

    const step = frames.length / maxFrames;
    const compressedFrames = [];

    for (let i = 0; i < maxFrames; i++) {
        const index = Math.floor(i * step);
        compressedFrames.push(frames[Math.min(index, frames.length - 1)]);
    }

    return compressedFrames;
}

/**
 * Sistema avanzado de generación de sprite sheets
 * @param {Array} frames - Sprites detectados
 * @param {Object} config - Configuración
 * @returns {Object} Sprite sheet generado
 */
function generateAdvancedSpriteSheet(frames, config) {
    if (!frames || frames.length === 0) return null;

    const spriteSheetConfig = {
        maxWidth: config.spriteSheetMaxWidth || 2048,
        maxHeight: config.spriteSheetMaxHeight || 2048,
        padding: config.spriteSheetPadding || 2,
        powerOfTwo: config.spriteSheetPowerOfTwo || false,
        algorithm: config.packingAlgorithm || 'binPacking',
        enableRotation: config.enableSpriteRotation || false,
        ...config
    };

    // Preparar frames para empaquetado
    const preparedFrames = prepareFramesForPacking(frames, spriteSheetConfig);

    // Aplicar algoritmo de empaquetado
    let packedFrames;
    switch (spriteSheetConfig.algorithm) {
        case 'binPacking':
            packedFrames = applyBinPackingAlgorithm(preparedFrames, spriteSheetConfig);
            break;
        case 'shelfPacking':
            packedFrames = applyShelfPackingAlgorithm(preparedFrames, spriteSheetConfig);
            break;
        case 'gridPacking':
            packedFrames = applyGridPackingAlgorithm(preparedFrames, spriteSheetConfig);
            break;
        default:
            packedFrames = applyBinPackingAlgorithm(preparedFrames, spriteSheetConfig);
    }

    // Calcular dimensiones finales del sprite sheet
    const dimensions = calculateSpriteSheetDimensions(packedFrames, spriteSheetConfig);

    // Generar metadatos
    const metadata = generateSpriteSheetMetadata(packedFrames, dimensions, spriteSheetConfig);

    return {
        frames: packedFrames,
        dimensions,
        metadata,
        config: spriteSheetConfig,
        generated: new Date().toISOString(),
        version: '2.0'
    };
}

/**
 * Prepara los frames para el algoritmo de empaquetado
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function prepareFramesForPacking(frames, config) {
    return frames.map((frame, index) => {
        const rect = frame.rect;
        const paddedWidth = rect.w + (config.padding * 2);
        const paddedHeight = rect.h + (config.padding * 2);

        return {
            ...frame,
            originalIndex: index,
            packed: false,
            x: 0,
            y: 0,
            paddedWidth,
            paddedHeight,
            area: paddedWidth * paddedHeight,
            // Calcular heurísticas para ordenamiento
            heuristic: calculatePackingHeuristic(frame, config)
        };
    }).sort((a, b) => b.heuristic - a.heuristic); // Ordenar por heurística descendente
}

/**
 * Calcula heurística para ordenamiento óptimo de empaquetado
 * @param {Object} frame
 * @param {Object} config
 * @returns {number}
 */
function calculatePackingHeuristic(frame, config) {
    const rect = frame.rect;
    const area = rect.w * rect.h;
    const perimeter = 2 * (rect.w + rect.h);
    const aspectRatio = Math.max(rect.w / rect.h, rect.h / rect.w);

    // Heurística combinada: área + perímetro + penalización por aspect ratio extremo
    return area + (perimeter * 0.1) - (aspectRatio * 10);
}

/**
 * Aplica algoritmo de bin packing para empaquetado óptimo
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function applyBinPackingAlgorithm(frames, config) {
    const packedFrames = [];
    const bins = [];

    for (const frame of frames) {
        let placed = false;

        // Intentar colocar en un bin existente
        for (const bin of bins) {
            if (tryPlaceInBin(frame, bin, config)) {
                placed = true;
                packedFrames.push({
                    ...frame,
                    packed: true,
                    binId: bin.id
                });
                break;
            }
        }

        // Si no se pudo colocar, crear nuevo bin
        if (!placed) {
            const newBin = createNewBin(bins.length, config);
            if (tryPlaceInBin(frame, newBin, config)) {
                bins.push(newBin);
                packedFrames.push({
                    ...frame,
                    packed: true,
                    binId: newBin.id
                });
            } else {
                // Frame no cabe en ningún bin (muy grande)
                packedFrames.push({
                    ...frame,
                    packed: false,
                    error: 'Frame too large for sprite sheet'
                });
            }
        }
    }

    return packedFrames;
}

/**
 * Intenta colocar un frame en un bin específico
 * @param {Object} frame
 * @param {Object} bin
 * @param {Object} config
 * @returns {boolean}
 */
function tryPlaceInBin(frame, bin, config) {
    const paddedWidth = frame.paddedWidth;
    const paddedHeight = frame.paddedHeight;

    // Buscar posición libre en el bin usando bottom-left fill
    for (let y = 0; y <= bin.height - paddedHeight; y++) {
        for (let x = 0; x <= bin.width - paddedWidth; x++) {
            if (canPlaceAtPosition(frame, bin, x, y, config)) {
                // Colocar frame
                frame.x = x + config.padding;
                frame.y = y + config.padding;
                bin.placedFrames.push({
                    x: frame.x,
                    y: frame.y,
                    width: frame.rect.w,
                    height: frame.rect.h,
                    frameId: frame.id
                });
                return true;
            }
        }
    }

    return false;
}

/**
 * Verifica si se puede colocar un frame en una posición específica
 * @param {Object} frame
 * @param {Object} bin
 * @param {number} x
 * @param {number} y
 * @param {Object} config
 * @returns {boolean}
 */
function canPlaceAtPosition(frame, bin, x, y, config) {
    const paddedWidth = frame.paddedWidth;
    const paddedHeight = frame.paddedHeight;

    // Verificar límites del bin
    if (x + paddedWidth > bin.width || y + paddedHeight > bin.height) {
        return false;
    }

    // Verificar colisión con frames existentes
    for (const placedFrame of bin.placedFrames) {
        if (!(x + paddedWidth <= placedFrame.x ||
              placedFrame.x + placedFrame.width + config.padding * 2 <= x ||
              y + paddedHeight <= placedFrame.y ||
              placedFrame.y + placedFrame.height + config.padding * 2 <= y)) {
            return false;
        }
    }

    return true;
}

/**
 * Crea un nuevo bin para empaquetado
 * @param {number} id
 * @param {Object} config
 * @returns {Object}
 */
function createNewBin(id, config) {
    return {
        id,
        width: config.maxWidth,
        height: config.maxHeight,
        placedFrames: [],
        usedArea: 0,
        efficiency: 0
    };
}

/**
 * Aplica algoritmo de shelf packing
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function applyShelfPackingAlgorithm(frames, config) {
    const packedFrames = [];
    const shelves = [];
    let currentY = 0;

    for (const frame of frames) {
        let placed = false;

        // Intentar colocar en shelf existente
        for (const shelf of shelves) {
            if (frame.paddedHeight <= shelf.height &&
                shelf.currentX + frame.paddedWidth <= config.maxWidth) {

                frame.x = shelf.currentX + config.padding;
                frame.y = shelf.y + config.padding;
                shelf.currentX += frame.paddedWidth;
                shelf.placedFrames.push(frame);
                packedFrames.push({ ...frame, packed: true });
                placed = true;
                break;
            }
        }

        // Crear nueva shelf si no se pudo colocar
        if (!placed) {
            if (currentY + frame.paddedHeight > config.maxHeight) {
                // No hay espacio suficiente
                packedFrames.push({
                    ...frame,
                    packed: false,
                    error: 'No space available in sprite sheet'
                });
                continue;
            }

            const newShelf = {
                y: currentY,
                height: frame.paddedHeight,
                currentX: 0,
                placedFrames: []
            };

            frame.x = config.padding;
            frame.y = currentY + config.padding;
            newShelf.currentX = frame.paddedWidth;
            newShelf.placedFrames.push(frame);
            shelves.push(newShelf);
            currentY += frame.paddedHeight;
            packedFrames.push({ ...frame, packed: true });
        }
    }

    return packedFrames;
}

/**
 * Aplica algoritmo de grid packing
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function applyGridPackingAlgorithm(frames, config) {
    const packedFrames = [];
    const gridSize = config.gridSize || 64;
    const cols = Math.floor(config.maxWidth / gridSize);
    const rows = Math.floor(config.maxHeight / gridSize);
    const grid = Array(rows).fill().map(() => Array(cols).fill(false));

    for (const frame of frames) {
        const gridCols = Math.ceil(frame.paddedWidth / gridSize);
        const gridRows = Math.ceil(frame.paddedHeight / gridSize);

        let placed = false;

        // Buscar posición en la grid
        for (let row = 0; row <= rows - gridRows && !placed; row++) {
            for (let col = 0; col <= cols - gridCols && !placed; col++) {
                if (canPlaceInGrid(grid, col, row, gridCols, gridRows)) {
                    // Marcar celdas como ocupadas
                    for (let r = 0; r < gridRows; r++) {
                        for (let c = 0; c < gridCols; c++) {
                            grid[row + r][col + c] = true;
                        }
                    }

                    frame.x = col * gridSize + config.padding;
                    frame.y = row * gridSize + config.padding;
                    packedFrames.push({ ...frame, packed: true });
                    placed = true;
                }
            }
        }

        if (!placed) {
            packedFrames.push({
                ...frame,
                packed: false,
                error: 'No space available in grid'
            });
        }
    }

    return packedFrames;
}

/**
 * Verifica si se puede colocar en la grid
 * @param {Array} grid
 * @param {number} col
 * @param {number} row
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
function canPlaceInGrid(grid, col, row, width, height) {
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            if (grid[row + r][col + c]) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Calcula las dimensiones finales del sprite sheet
 * @param {Array} packedFrames
 * @param {Object} config
 * @returns {Object}
 */
function calculateSpriteSheetDimensions(packedFrames, config) {
    let maxX = 0, maxY = 0;

    packedFrames.forEach(frame => {
        if (frame.packed) {
            maxX = Math.max(maxX, frame.x + frame.rect.w + config.padding);
            maxY = Math.max(maxY, frame.y + frame.rect.h + config.padding);
        }
    });

    // Ajustar a potencia de 2 si está habilitado
    if (config.powerOfTwo) {
        maxX = nextPowerOfTwo(maxX);
        maxY = nextPowerOfTwo(maxY);
    }

    // Aplicar límites máximos
    maxX = Math.min(maxX, config.maxWidth);
    maxY = Math.min(maxY, config.maxHeight);

    return { width: maxX, height: maxY };
}

/**
 * Calcula la siguiente potencia de 2
 * @param {number} n
 * @returns {number}
 */
function nextPowerOfTwo(n) {
    return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Genera metadatos del sprite sheet
 * @param {Array} packedFrames
 * @param {Object} dimensions
 * @param {Object} config
 * @returns {Object}
 */
function generateSpriteSheetMetadata(packedFrames, dimensions, config) {
    const packedCount = packedFrames.filter(f => f.packed).length;
    const totalArea = dimensions.width * dimensions.height;
    const usedArea = packedFrames
        .filter(f => f.packed)
        .reduce((sum, f) => sum + f.area, 0);
    const efficiency = (usedArea / totalArea) * 100;

    return {
        version: '2.0',
        generated: new Date().toISOString(),
        dimensions,
        frames: packedCount,
        totalFrames: packedFrames.length,
        efficiency: efficiency.toFixed(2),
        algorithm: config.algorithm,
        settings: {
            padding: config.padding,
            powerOfTwo: config.powerOfTwo,
            maxWidth: config.maxWidth,
            maxHeight: config.maxHeight
        },
        frameData: packedFrames.map(frame => ({
            id: frame.id,
            name: frame.name,
            x: frame.x,
            y: frame.y,
            width: frame.rect.w,
            height: frame.rect.h,
            packed: frame.packed,
            binId: frame.binId || null
        }))
    };
}

/**
 * Sistema avanzado de exportación de sprites
 * @param {Array} frames - Sprites a exportar
 * @param {Object} config - Configuración de exportación
 * @returns {Promise<Object>} Resultados de la exportación
 */
function exportSpritesAdvanced(frames, config) {
    return new Promise(async (resolve, reject) => {
        try {
            const exportConfig = {
                formats: config.formats || ['png'],
                quality: config.quality || 0.9,
                batchSize: config.batchSize || 10,
                enableCompression: config.enableCompression || true,
                generateMetadata: config.generateMetadata !== false,
                outputPath: config.outputPath || './exported_sprites',
                namingPattern: config.namingPattern || '{name}_{index}',
                enableProgressCallback: config.enableProgressCallback || false,
                progressCallback: config.progressCallback || null,
                ...config
            };

            const results = {
                exported: [],
                failed: [],
                metadata: null,
                stats: {
                    totalFrames: frames.length,
                    exportedCount: 0,
                    failedCount: 0,
                    totalSize: 0,
                    exportTime: 0
                }
            };

            const startTime = Date.now();

            // Preparar frames para exportación
            const preparedFrames = prepareFramesForExport(frames, exportConfig);

            // Procesar en lotes para mejor rendimiento
            const batches = createExportBatches(preparedFrames, exportConfig.batchSize);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];

                if (exportConfig.enableProgressCallback && exportConfig.progressCallback) {
                    exportConfig.progressCallback({
                        current: i + 1,
                        total: batches.length,
                        percentage: ((i + 1) / batches.length) * 100
                    });
                }

                try {
                    const batchResults = await processExportBatch(batch, exportConfig);
                    results.exported.push(...batchResults.exported);
                    results.failed.push(...batchResults.failed);
                    results.stats.exportedCount += batchResults.exported.length;
                    results.stats.failedCount += batchResults.failed.length;
                } catch (error) {
                    console.warn(`Error procesando lote ${i + 1}:`, error);
                    // Continuar con el siguiente lote
                }
            }

            // Generar metadatos si está habilitado
            if (exportConfig.generateMetadata) {
                results.metadata = generateExportMetadata(frames, results, exportConfig);
            }

            // Calcular estadísticas finales
            results.stats.exportTime = Date.now() - startTime;
            results.stats.totalSize = results.exported.reduce((sum, item) => sum + (item.size || 0), 0);

            resolve(results);

        } catch (error) {
            reject(new Error(`Error en exportación avanzada: ${error.message}`));
        }
    });
}

/**
 * Prepara los frames para la exportación
 * @param {Array} frames
 * @param {Object} config
 * @returns {Array}
 */
function prepareFramesForExport(frames, config) {
    return frames.map((frame, index) => {
        const exportName = generateExportName(frame, index, config.namingPattern);

        return {
            ...frame,
            exportName,
            exportIndex: index,
            prepared: true,
            exportFormats: config.formats
        };
    });
}

/**
 * Genera nombre de exportación basado en patrón
 * @param {Object} frame
 * @param {number} index
 * @param {string} pattern
 * @returns {string}
 */
function generateExportName(frame, index, pattern) {
    return pattern
        .replace('{name}', frame.name || 'sprite')
        .replace('{index}', index.toString().padStart(3, '0'))
        .replace('{id}', frame.id || index)
        .replace('{type}', frame.type || 'simple');
}

/**
 * Crea lotes de exportación
 * @param {Array} frames
 * @param {number} batchSize
 * @returns {Array}
 */
function createExportBatches(frames, batchSize) {
    const batches = [];
    for (let i = 0; i < frames.length; i += batchSize) {
        batches.push(frames.slice(i, i + batchSize));
    }
    return batches;
}

/**
 * Procesa un lote de exportación
 * @param {Array} batch
 * @param {Object} config
 * @returns {Promise<Object>}
 */
function processExportBatch(batch, config) {
    return new Promise(async (resolve) => {
        const results = { exported: [], failed: [] };

        for (const frame of batch) {
            try {
                const frameResults = await exportFrameInFormats(frame, config);
                results.exported.push(...frameResults);
            } catch (error) {
                console.warn(`Error exportando frame ${frame.exportName}:`, error);
                results.failed.push({
                    frame: frame.exportName,
                    error: error.message
                });
            }
        }

        resolve(results);
    });
}

/**
 * Exporta un frame en múltiples formatos
 * @param {Object} frame
 * @param {Object} config
 * @returns {Promise<Array>}
 */
function exportFrameInFormats(frame, config) {
    return new Promise(async (resolve) => {
        const results = [];

        for (const format of frame.exportFormats) {
            try {
                const result = await exportFrameToFormat(frame, format, config);
                results.push(result);
            } catch (error) {
                console.warn(`Error exportando ${frame.exportName} a ${format}:`, error);
            }
        }

        resolve(results);
    });
}

/**
 * Exporta un frame a un formato específico
 * @param {Object} frame
 * @param {string} format
 * @param {Object} config
 * @returns {Promise<Object>}
 */
function exportFrameToFormat(frame, format, config) {
    return new Promise((resolve, reject) => {
        try {
            // Crear canvas temporal para el frame
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Aquí iría la lógica para extraer el frame de la imagen original
            // Por ahora, creamos un placeholder
            canvas.width = frame.rect.w;
            canvas.height = frame.rect.h;

            // Simular extracción del frame (en implementación real, copiar desde imagen fuente)
            ctx.fillStyle = `hsl(${Math.random() * 360}, 70%, 50%)`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Convertir a blob según el formato
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error(`Error convirtiendo frame a ${format}`));
                    return;
                }

                const result = {
                    name: `${frame.exportName}.${format}`,
                    format,
                    size: blob.size,
                    data: blob,
                    frameId: frame.id,
                    dimensions: { width: canvas.width, height: canvas.height },
                    exported: new Date().toISOString()
                };

                resolve(result);
            }, `image/${format}`, config.quality);

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Genera metadatos de la exportación
 * @param {Array} originalFrames
 * @param {Object} results
 * @param {Object} config
 * @returns {Object}
 */
function generateExportMetadata(originalFrames, results, config) {
    const formatStats = {};
    results.exported.forEach(item => {
        if (!formatStats[item.format]) {
            formatStats[item.format] = { count: 0, totalSize: 0 };
        }
        formatStats[item.format].count++;
        formatStats[item.format].totalSize += item.size || 0;
    });

    return {
        version: '2.0',
        generated: new Date().toISOString(),
        exportConfig: {
            formats: config.formats,
            quality: config.quality,
            batchSize: config.batchSize,
            enableCompression: config.enableCompression
        },
        stats: results.stats,
        formatStats,
        frames: originalFrames.map(frame => ({
            id: frame.id,
            name: frame.name,
            originalRect: frame.rect,
            exportedFormats: config.formats,
            exportName: generateExportName(frame, originalFrames.indexOf(frame), config.namingPattern)
        })),
        exportPath: config.outputPath
    };
}

/**
 * Sistema de compresión avanzada para sprites
 * @param {Array} frames - Sprites a comprimir
 * @param {Object} config - Configuración de compresión
 * @returns {Promise<Array>} Sprites comprimidos
 */
function compressSpritesAdvanced(frames, config) {
    return new Promise(async (resolve, reject) => {
        try {
            const compressionConfig = {
                algorithm: config.algorithm || 'lossless',
                quality: config.quality || 0.9,
                maxColors: config.maxColors || 256,
                enableDithering: config.enableDithering || false,
                targetFormat: config.targetFormat || 'png',
                ...config
            };

            const compressedFrames = [];

            for (const frame of frames) {
                try {
                    const compressed = await compressSingleSprite(frame, compressionConfig);
                    compressedFrames.push(compressed);
                } catch (error) {
                    console.warn(`Error comprimiendo sprite ${frame.name}:`, error);
                    // Mantener frame original si falla la compresión
                    compressedFrames.push(frame);
                }
            }

            resolve(compressedFrames);

        } catch (error) {
            reject(new Error(`Error en compresión avanzada: ${error.message}`));
        }
    });
}

/**
 * Comprime un sprite individual
 * @param {Object} frame
 * @param {Object} config
 * @returns {Promise<Object>}
 */
function compressSingleSprite(frame, config) {
    return new Promise((resolve, reject) => {
        try {
            // Crear canvas temporal
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            canvas.width = frame.rect.w;
            canvas.height = frame.rect.h;

            // Aquí iría la lógica para copiar el sprite desde la imagen original
            // Por ahora, placeholder
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Aplicar algoritmo de compresión
            let quality = config.quality;
            let compressedBlob = null;

            const tryCompression = () => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Error en compresión'));
                        return;
                    }

                    // Verificar si el tamaño es aceptable o si necesitamos reducir calidad
                    const maxSize = config.maxSize || 1024 * 1024; // 1MB default
                    if (blob.size <= maxSize || quality <= 0.1) {
                        compressedBlob = blob;
                        resolve({
                            ...frame,
                            compressed: true,
                            originalSize: frame.size || 0,
                            compressedSize: blob.size,
                            compressionRatio: frame.size ? (blob.size / frame.size) : 1,
                            quality,
                            format: config.targetFormat
                        });
                    } else {
                        // Reducir calidad y reintentar
                        quality = Math.max(0.1, quality - 0.1);
                        tryCompression();
                    }
                }, `image/${config.targetFormat}`, quality);
            };

            tryCompression();

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Sistema de optimización de calidad de sprites
 * @param {Array} frames - Sprites a optimizar
 * @param {Object} config - Configuración de optimización
 * @returns {Promise<Array>} Sprites optimizados
 */
function optimizeSpriteQuality(frames, config) {
    return new Promise(async (resolve, reject) => {
        try {
            const qualityConfig = {
                enableSharpening: config.enableSharpening || false,
                enableNoiseReduction: config.enableNoiseReduction || false,
                enableColorCorrection: config.enableColorCorrection || false,
                targetBrightness: config.targetBrightness || 0,
                targetContrast: config.targetContrast || 0,
                ...config
            };

            const optimizedFrames = [];

            for (const frame of frames) {
                try {
                    let optimizedFrame = { ...frame };

                    // Aplicar optimizaciones de calidad
                    if (qualityConfig.enableNoiseReduction) {
                        optimizedFrame = await applyNoiseReductionToSprite(optimizedFrame, qualityConfig);
                    }

                    if (qualityConfig.enableSharpening) {
                        optimizedFrame = await applySharpeningToSprite(optimizedFrame, qualityConfig);
                    }

                    if (qualityConfig.enableColorCorrection) {
                        optimizedFrame = await applyColorCorrectionToSprite(optimizedFrame, qualityConfig);
                    }

                    optimizedFrame.qualityOptimized = true;
                    optimizedFrames.push(optimizedFrame);

                } catch (error) {
                    console.warn(`Error optimizando calidad de sprite ${frame.name}:`, error);
                    optimizedFrames.push(frame); // Mantener original si falla
                }
            }

            resolve(optimizedFrames);

        } catch (error) {
            reject(new Error(`Error en optimización de calidad: ${error.message}`));
        }
    });
}

/**
 * Aplica reducción de ruido a un sprite
 * @param {Object} frame
 * @param {Object} config
 * @returns {Promise<Object>}
 */
function applyNoiseReductionToSprite(frame, config) {
    return new Promise((resolve) => {
        // Placeholder - implementación simplificada
        resolve({
            ...frame,
            noiseReduced: true
        });
    });
}

/**
 * Aplica sharpening a un sprite
 * @param {Object} frame
 * @param {Object} config
 * @returns {Promise<Object>}
 */
function applySharpeningToSprite(frame, config) {
    return new Promise((resolve) => {
        // Placeholder - implementación simplificada
        resolve({
            ...frame,
            sharpened: true
        });
    });
}

/**
 * Aplica corrección de color a un sprite
 * @param {Object} frame
 * @param {Object} config
 * @returns {Promise<Object>}
 */
function applyColorCorrectionToSprite(frame, config) {
    return new Promise((resolve) => {
        // Placeholder - implementación simplificada
        resolve({
            ...frame,
            colorCorrected: true,
            brightness: config.targetBrightness,
            contrast: config.targetContrast
        });
    });
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
