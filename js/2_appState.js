// --- Módulo de Estado de la Aplicación ---
// Contiene todos los datos centrales. Es la "única fuente de verdad".

export const AppState = {
    frames: [],
    clips: [],
    activeClipId: null,
    selectedFrameId: null,
    selectedSlice: null, // --- AÑADIDO --- Para recordar la línea (slice) seleccionada.
    currentFileName: "spritesheet.png",
    isLocked: false,
    activeTool: 'select',
    zoomLevel: 1.0,
    animation: {
        isPlaying: false,
        fps: 12,
        currentFrameIndex: 0,
        lastTime: 0,
        animationFrameId: null
    },

    // --- Métodos para acceder o derivar datos del estado ---

    getActiveClip() {
        return this.clips.find(c => c.id === this.activeClipId);
    },

    getAnimationFrames() {
        const clip = this.getActiveClip();
        if (!clip) return [];
        const all = this.getFlattenedFrames();
        return clip.frameIds.map(id => all.find(f => f.id === id)).filter(Boolean);
    },

    getFlattenedFrames() {
        const flattened = [];
        let subFrameId = 0;
        this.frames.forEach(frame => {
            if (frame.type === 'group') {
                const yCoords = [0, ...frame.hSlices.sort((a, b) => a - b), frame.rect.h];
                for (let i = 0; i < yCoords.length - 1; i++) {
                    const rowY = yCoords[i];
                    const rowH = yCoords[i + 1] - yCoords[i];
                    const xCoordsForRow = [0];

                    frame.vSlices.sort((a, b) => (a.rowOverrides[i] ?? a.globalX) - (b.rowOverrides[i] ?? b.globalX)).forEach(slice => {
                        const xPos = slice.rowOverrides[i] !== undefined ? slice.rowOverrides[i] : slice.globalX;
                        if (xPos !== null) {
                            xCoordsForRow.push(xPos);
                        }
                    });

                    xCoordsForRow.push(frame.rect.w);
                    const uniqueSortedX = [...new Set(xCoordsForRow)].sort((a, b) => a - b);

                    for (let j = 0; j < uniqueSortedX.length - 1; j++) {
                        const cellX = uniqueSortedX[j];
                        const cellW = uniqueSortedX[j + 1] - cellX;
                        if (cellW <= 0) continue;

                        flattened.push({
                            id: subFrameId++,
                            name: `${frame.name}_${i}_${j}`,
                            rect: {
                                x: Math.round(frame.rect.x + cellX),
                                y: Math.round(frame.rect.y + rowY),
                                w: Math.round(cellW),
                                h: Math.round(rowH)
                            }
                        });
                    }
                }
            } else {
                flattened.push({ ...frame,
                    id: subFrameId++
                });
            }
        });
        return flattened;
    }
};