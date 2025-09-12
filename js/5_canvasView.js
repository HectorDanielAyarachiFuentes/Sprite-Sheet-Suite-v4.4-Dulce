// --- Módulo de la Vista del Canvas ---
// Responsable de todo el dibujo en el canvas principal y las reglas.

import { DOM, CTX } from './1_dom.js';
import { AppState } from './2_appState.js';
import { InteractionState, getResizeHandles } from './6_interactionController.js';

const CanvasView = (() => {
    const HANDLE_SIZE = 8;
    
    const drawGrid = () => {
        if (!AppState.isSnapToGridEnabled || AppState.gridSize <= 0) return;

        const { width, height } = DOM.canvas;
        const gridSize = AppState.gridSize;
        const zoom = AppState.zoomLevel;

        CTX.main.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        CTX.main.lineWidth = 1 / zoom;
        CTX.main.beginPath();

        for (let x = 0; x <= width; x += gridSize) {
            CTX.main.moveTo(x, 0);
            CTX.main.lineTo(x, height);
        }

        for (let y = 0; y <= height; y += gridSize) {
            CTX.main.moveTo(0, y);
            CTX.main.lineTo(width, y);
        }
        CTX.main.stroke();
    };

    return {
        drawAll() {
            CTX.main.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);
            drawGrid(); // Dibujar la cuadrícula primero

            const activeClip = AppState.getActiveClip();
            const allSubFrames = AppState.getFlattenedFrames();

            AppState.frames.forEach(frame => {
                const isSelected = AppState.selectedFrameId === frame.id;
                CTX.main.strokeStyle = isSelected ? 'var(--danger)' : 'rgba(122, 162, 247, 0.5)';
                CTX.main.lineWidth = isSelected ? 2 / AppState.zoomLevel : 1 / AppState.zoomLevel;
                CTX.main.setLineDash(frame.type === 'group' ? [4 / AppState.zoomLevel, 4 / AppState.zoomLevel] : []);
                CTX.main.strokeRect(frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h);
                CTX.main.setLineDash([]);

                if (isSelected && !AppState.isLocked) this.drawResizeHandles(frame.rect);

                if (frame.type === 'group') {
                    const sliceColor = '#f7768e';
                    const overrideColor = '#e0af68';
                    const selectedSliceColor = 'var(--warning)'; // Color para la línea seleccionada
                    CTX.main.lineWidth = 1 / AppState.zoomLevel;

                    // --- MODIFICADO --- Dibujar slices horizontales con resaltado de selección
                    frame.hSlices.forEach((sliceY, index) => {
                        const isSelectedSlice = AppState.selectedSlice && AppState.selectedSlice.frameId === frame.id && AppState.selectedSlice.axis === 'h' && AppState.selectedSlice.index === index;
                        CTX.main.strokeStyle = isSelectedSlice ? selectedSliceColor : sliceColor;
                        CTX.main.beginPath();
                        CTX.main.moveTo(frame.rect.x, frame.rect.y + sliceY);
                        CTX.main.lineTo(frame.rect.x + frame.rect.w, frame.rect.y + sliceY);
                        CTX.main.stroke();
                    });

                    // --- MODIFICADO --- Dibujar slices verticales con resaltado de selección
                    const yCoords = [0, ...frame.hSlices.sort((a, b) => a - b), frame.rect.h];
                    for (let i = 0; i < yCoords.length - 1; i++) {
                        const rowYStart = frame.rect.y + yCoords[i];
                        const rowYEnd = frame.rect.y + yCoords[i + 1];
                        frame.vSlices.forEach((slice, sliceIndex) => {
                            const xPos = slice.rowOverrides[i] !== undefined ? slice.rowOverrides[i] : slice.globalX;
                            if (xPos === null) return;
                            
                            const isOverridden = slice.rowOverrides[i] !== undefined;
                            const isSelectedSlice = AppState.selectedSlice && AppState.selectedSlice.frameId === frame.id && AppState.selectedSlice.axis === 'v' && AppState.selectedSlice.index === sliceIndex;
                            
                            CTX.main.strokeStyle = isSelectedSlice ? selectedSliceColor : (isOverridden ? overrideColor : sliceColor);
                            CTX.main.beginPath();
                            CTX.main.moveTo(frame.rect.x + xPos, rowYStart);
                            CTX.main.lineTo(frame.rect.x + xPos, rowYEnd);
                            CTX.main.stroke();
                        });
                    }
                }
            });

            allSubFrames.forEach(subFrame => {
                const isIncluded = activeClip?.frameIds.includes(subFrame.id);
                const isSelected = AppState.selectedSubFrameId === subFrame.id;

                if (isSelected) {
                    CTX.main.fillStyle = 'rgba(255, 236, 179, 0.4)'; // Amarillo para resaltar
                    CTX.main.strokeStyle = 'var(--warning)';
                    CTX.main.lineWidth = 2 / AppState.zoomLevel;
                    CTX.main.fillRect(subFrame.rect.x, subFrame.rect.y, subFrame.rect.w, subFrame.rect.h);
                    CTX.main.strokeRect(subFrame.rect.x, subFrame.rect.y, subFrame.rect.w, subFrame.rect.h);
                } else {
                    CTX.main.fillStyle = isIncluded ? 'rgba(122, 162, 247, 0.15)' : 'rgba(30,30,45,0.4)';
                    CTX.main.fillRect(subFrame.rect.x, subFrame.rect.y, subFrame.rect.w, subFrame.rect.h);
                }

                if (subFrame.rect.w > 8 && subFrame.rect.h > 8) {
                    CTX.main.fillStyle = isSelected ? 'var(--warning)' : (isIncluded ? 'rgba(255,255,255,0.8)' : 'rgba(169,177,214,0.6)');
                    CTX.main.font = `${12 / AppState.zoomLevel}px var(--font-sans)`;
                    const idText = typeof subFrame.id === 'string' ? subFrame.id.split('_')[0] : subFrame.id;
                    CTX.main.fillText(`F${idText}`, subFrame.rect.x + (4 / AppState.zoomLevel), subFrame.rect.y + (14 / AppState.zoomLevel));
                }
            });

            if (InteractionState.isResizing && AppState.selectedFrameId !== null) {
                const frame = AppState.frames.find(f => f.id === AppState.selectedFrameId);
                if (frame) {
                    const { x, y, w, h } = frame.rect;
                    CTX.main.strokeStyle = 'rgba(122, 162, 247, 0.7)';
                    CTX.main.lineWidth = 1 / AppState.zoomLevel;
                    CTX.main.setLineDash([5 / AppState.zoomLevel, 3 / AppState.zoomLevel]);
                    CTX.main.beginPath();
                    if (InteractionState.resizeHandle.includes('t') || InteractionState.resizeHandle.includes('b')) {
                        CTX.main.moveTo(0, y); CTX.main.lineTo(DOM.canvas.width, y);
                        CTX.main.moveTo(0, y + h); CTX.main.lineTo(DOM.canvas.width, y + h);
                    }
                    if (InteractionState.resizeHandle.includes('l') || InteractionState.resizeHandle.includes('r')) {
                        CTX.main.moveTo(x, 0); CTX.main.lineTo(x, DOM.canvas.height);
                        CTX.main.moveTo(x + w, 0); CTX.main.lineTo(x + w, DOM.canvas.height);
                    }
                    CTX.main.stroke();
                    CTX.main.setLineDash([]);
                }
            }

            if (InteractionState.isDrawing && InteractionState.newRect) {
                CTX.main.strokeStyle = 'var(--warning)';
                CTX.main.lineWidth = 1 / AppState.zoomLevel;
                CTX.main.strokeRect(InteractionState.newRect.x, InteractionState.newRect.y, InteractionState.newRect.w, InteractionState.newRect.h);
            }
            this.drawRulers();
        },
        drawResizeHandles(rect) {
            const handleSize = HANDLE_SIZE / AppState.zoomLevel;
            CTX.main.fillStyle = 'var(--danger)';
            const half = handleSize / 2;
            const handles = getResizeHandles(rect);
            Object.values(handles).forEach(handle => CTX.main.fillRect(handle.x - half, handle.y - half, handleSize, handleSize));
        },
        drawRulers() {
            CTX.rulerTop.clearRect(0, 0, DOM.rulerTop.width, DOM.rulerTop.height);
            CTX.rulerLeft.clearRect(0, 0, DOM.rulerLeft.width, DOM.rulerLeft.height);
            if (!DOM.imageDisplay.src || !DOM.imageDisplay.complete) return;

            const scrollLeft = DOM.editorArea.scrollLeft;
            const scrollTop = DOM.editorArea.scrollTop;

            CTX.rulerTop.font = CTX.rulerLeft.font = '10px var(--font-sans)';
            CTX.rulerTop.fillStyle = CTX.rulerLeft.fillStyle = 'var(--ps-text-medium)';

            let step = 10;
            if (AppState.zoomLevel < 0.5) step = 50;
            if (AppState.zoomLevel < 0.2) step = 100;
            const majorStep = step * 5;

            for (let x = 0; x <= DOM.imageDisplay.naturalWidth; x += step) {
                const screenX = (x * AppState.zoomLevel) - scrollLeft;
                const isMajor = x % majorStep === 0;
                CTX.rulerTop.beginPath();
                CTX.rulerTop.moveTo(screenX, isMajor ? 15 : 22);
                CTX.rulerTop.lineTo(screenX, 30);
                CTX.rulerTop.stroke();
                if (isMajor) CTX.rulerTop.fillText(x, screenX + 2, 12);
            }

            for (let y = 0; y <= DOM.imageDisplay.naturalHeight; y += step) {
                const screenY = (y * AppState.zoomLevel) - scrollTop;
                const isMajor = y % majorStep === 0;
                CTX.rulerLeft.beginPath();
                CTX.rulerLeft.moveTo(isMajor ? 15 : 22, screenY);
                CTX.rulerLeft.lineTo(30, screenY);
                CTX.rulerLeft.stroke();
                if (isMajor) CTX.rulerLeft.fillText(y, 4, screenY + 10);
            }
        }
    };
})();

export { CanvasView };