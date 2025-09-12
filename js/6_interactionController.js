// --- Módulo Controlador de Interacción ---
// Escucha y gestiona toda la entrada del usuario (ratón, teclado).

import { DOM } from './1_dom.js';
import { AppState } from './2_appState.js';
import { HistoryManager } from './3_historyManager.js';
import { UIManager } from './4_uiManager.js';
import { CanvasView } from './5_canvasView.js';
import { App } from './main.js';

export let InteractionState = {
    isDrawing: false, isDragging: false, isResizing: false, isDraggingSlice: false,
    startPos: { x: 0, y: 0 },
    newRect: null,
    resizeHandle: null,
    draggedSlice: null,
    HANDLE_SIZE: 8,
    SLICE_HANDLE_WIDTH: 6,
};

const getMousePos = (e) => {
    const rect = DOM.canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / AppState.zoomLevel,
        y: (e.clientY - rect.top) / AppState.zoomLevel
    };
};

const getSubFrameAtPos = (pos) => {
    // Itera hacia atrás para obtener el frame superior
    return AppState.getFlattenedFrames().slice().reverse().find(f => 
        pos.x >= f.rect.x && pos.x <= f.rect.x + f.rect.w && 
        pos.y >= f.rect.y && pos.y <= f.rect.y + f.rect.h
    );
};

const getFrameAtPos = (pos) => AppState.frames.slice().reverse().find(f => pos.x >= f.rect.x && pos.x <= f.rect.x + f.rect.w && pos.y >= f.rect.y && pos.y <= f.rect.y + f.rect.h);

export const getResizeHandles = (rect) => {
    const { x, y, w, h } = rect;
    return {
        tl: { x, y }, tr: { x: x + w, y }, bl: { x, y: y + h }, br: { x: x + w, y: y + h },
        t: { x: x + w / 2, y }, b: { x: x + w / 2, y: y + h }, l: { x, y: y + h / 2 }, r: { x: x + w, y: y + h / 2 }
    };
};

const getHandleAtPos = (pos) => {
    if (AppState.isLocked) return null;
    const frame = AppState.frames.find(f => f.id === AppState.selectedFrameId);
    if (!frame) return null;
    const handleSize = InteractionState.HANDLE_SIZE / AppState.zoomLevel;
    for (const [name, handlePos] of Object.entries(getResizeHandles(frame.rect))) {
        if (Math.abs(pos.x - handlePos.x) < handleSize / 2 && Math.abs(pos.y - handlePos.y) < handleSize / 2) return name;
    }
    return null;
};

// --- MODIFICADO --- Ahora busca la línea en el frame que se le pase
const getSliceAtPos = (pos, frame) => {
    if (!frame || frame.type !== 'group') return null;
    const sliceHandleWidth = InteractionState.SLICE_HANDLE_WIDTH / AppState.zoomLevel;

    // Buscar slices horizontales
    for (let i = 0; i < frame.hSlices.length; i++) {
        if (Math.abs(pos.y - (frame.rect.y + frame.hSlices[i])) < sliceHandleWidth / 2) {
            return { axis: 'h', index: i, frameId: frame.id };
        }
    }

    // Buscar slices verticales
    const yCoords = [0, ...frame.hSlices.sort((a, b) => a - b), frame.rect.h];
    const rowIndex = yCoords.findIndex((y, i) => pos.y >= frame.rect.y + y && pos.y < frame.rect.y + yCoords[i + 1]);
    if (rowIndex === -1) return null;
    for (let i = 0; i < frame.vSlices.length; i++) {
        const slice = frame.vSlices[i],
            xPos = slice.rowOverrides[rowIndex] !== undefined ? slice.rowOverrides[rowIndex] : slice.globalX;
        if (xPos === null) continue;
        if (Math.abs(pos.x - (frame.rect.x + xPos)) < sliceHandleWidth / 2) {
            return { axis: 'v', index: i, rowIndex: rowIndex, frameId: frame.id };
        }
    }
    return null;
};

const InteractionController = (() => {

    const handleMouseDown = (e) => {
        const pos = getMousePos(e);
        InteractionState.startPos = pos;
        const frameAtClick = getFrameAtPos(pos);
        const subFrameAtClick = getSubFrameAtPos(pos);

        // Lógica de Slicing Universal (Crear nuevas líneas)
        if (frameAtClick && (e.altKey || e.ctrlKey || e.metaKey)) {
            // ... (el resto de esta lógica no cambia) ...
             if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames para editar (L)', 'warning'); return; }
            e.preventDefault();
            AppState.selectedFrameId = frameAtClick.id;
            if (frameAtClick.type !== 'group') {
                frameAtClick.type = 'group'; frameAtClick.hSlices = []; frameAtClick.vSlices = [];
            }
            if (e.altKey) { frameAtClick.hSlices.push(pos.y - frameAtClick.rect.y); } 
            else {
                const yCoords = [0, ...frameAtClick.hSlices.sort((a, b) => a - b), frameAtClick.rect.h];
                const rowIndex = yCoords.findIndex((y, i) => pos.y >= frameAtClick.rect.y + y && pos.y < frameAtClick.rect.y + yCoords[i + 1]);
                if (rowIndex > -1) {
                    const newVSlice = { id: Date.now(), globalX: null, rowOverrides: { [rowIndex]: pos.x - frameAtClick.rect.x } };
                    frameAtClick.vSlices.push(newVSlice);
                }
            }
            HistoryManager.saveLocalState();
            App.updateAll(false);
            return;
        }

        switch (AppState.activeTool) {
            case 'select':
                if (AppState.isLocked) {
                    UIManager.showToast('Frames bloqueados. Desbloquéalos para mover/redimensionar (L).', 'warning');
                    AppState.selectedFrameId = frameAtClick ? frameAtClick.id : null;
                    AppState.selectedSubFrameId = subFrameAtClick ? subFrameAtClick.id : null;
                    AppState.selectedSlice = null; // Deseleccionar slice si los frames están bloqueados
                    App.updateAll(false);
                    return;
                }
                
                const handleAtClick = getHandleAtPos(InteractionState.startPos);
                const sliceAtClick = getSliceAtPos(pos, frameAtClick);
                
                if (handleAtClick) {
                    InteractionState.isResizing = true;
                    InteractionState.resizeHandle = handleAtClick;
                    AppState.selectedSubFrameId = null; // Deseleccionar sub-frame al redimensionar
                    AppState.selectedSlice = null; // Al redimensionar, deseleccionamos cualquier línea
                } else if (sliceAtClick) {
                    // Si se hizo clic en una línea, la seleccionamos e iniciamos el arrastre.
                    AppState.selectedSlice = sliceAtClick;
                    AppState.selectedFrameId = frameAtClick.id;
                    InteractionState.isDraggingSlice = true;
                    InteractionState.draggedSlice = sliceAtClick;
                } else if (frameAtClick) {
                    // Si no se hizo clic en una línea o handle, seleccionamos el frame
                    if (AppState.selectedFrameId !== frameAtClick.id) HistoryManager.resetLocal();
                    AppState.selectedFrameId = frameAtClick.id;
                    AppState.selectedSubFrameId = subFrameAtClick ? subFrameAtClick.id : null;
                    AppState.selectedSlice = null; // Deseleccionamos cualquier línea anterior
                    InteractionState.isDragging = true;
                } else {
                    // Clic en el vacío
                    AppState.selectedFrameId = null;
                    AppState.selectedSubFrameId = null;
                    AppState.selectedSlice = null;
                }
                break;
            case 'create':
                // ... (sin cambios)
                 if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames para crear nuevos (L)', 'warning'); return; }
                if (!frameAtClick) {
                    AppState.selectedFrameId = null; AppState.selectedSlice = null;
                    InteractionState.isDrawing = true;
                    InteractionState.newRect = { x: InteractionState.startPos.x, y: InteractionState.startPos.y, w: 0, h: 0 };
                }
                break;
            case 'eraser':
                 if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames para borrar (L)', 'warning'); return; }
                if (frameAtClick) App.deleteFrame(frameAtClick.id);
                break;
        }
        
        if (AppState.activeTool !== 'eraser') {
            App.updateAll(false);
        }
    };
    
    // El resto de los manejadores (mousemove, mouseup, dblclick) no necesitan cambios significativos.
    // Solo modificamos handleKeyDown.
    const handleMouseMove = (e) => {
         const pos = getMousePos(e);
        const frameAtPos = getFrameAtPos(pos);
        
        if (AppState.isLocked) { DOM.canvas.style.cursor = 'not-allowed'; } 
        else if (AppState.activeTool === 'select') {
            const handle = getHandleAtPos(pos);
            const slice = getSliceAtPos(pos, frameAtPos);
            if (handle) {
                if (handle.includes('t') || handle.includes('b')) DOM.canvas.style.cursor = 'ns-resize';
                else if (handle.includes('l') || handle.includes('r')) DOM.canvas.style.cursor = 'ew-resize';
                else DOM.canvas.style.cursor = 'pointer';
            } else if (slice) {
                DOM.canvas.style.cursor = slice.axis === 'v' ? 'ew-resize' : 'ns-resize';
            } else if (frameAtPos) {
                DOM.canvas.style.cursor = 'move';
            } else {
                DOM.canvas.style.cursor = 'default';
            }
        } 
        else if (AppState.activeTool === 'create') { DOM.canvas.style.cursor = 'crosshair'; }
        
        DOM.canvas.classList.toggle('cursor-eraser', AppState.activeTool === 'eraser');

        // ... (el resto de la lógica de mousemove no cambia)
        if (InteractionState.isResizing && AppState.selectedFrameId !== null) {
            const frame = AppState.frames.find(f => f.id === AppState.selectedFrameId);
            if (frame) {
                let { x, y, w, h } = frame.rect;
                const ox2 = x + w, oy2 = y + h;
                if (InteractionState.resizeHandle.includes('l')) x = pos.x;
                if (InteractionState.resizeHandle.includes('t')) y = pos.y;
                if (InteractionState.resizeHandle.includes('r')) w = pos.x - x;
                if (InteractionState.resizeHandle.includes('b')) h = pos.y - y;
                if (InteractionState.resizeHandle.includes('l')) w = ox2 - x;
                if (InteractionState.resizeHandle.includes('t')) h = oy2 - y;
                frame.rect = { x, y, w, h };
            }
        } else if (InteractionState.isDragging && AppState.selectedFrameId !== null) {
            const frame = AppState.frames.find(f => f.id === AppState.selectedFrameId);
            if (frame) {
                const dx = pos.x - InteractionState.startPos.x;
                const dy = pos.y - InteractionState.startPos.y;
                frame.rect.x += dx;
                frame.rect.y += dy;
                InteractionState.startPos = pos;
            }
        } else if (InteractionState.isDraggingSlice && AppState.selectedFrameId !== null) {
            const frame = AppState.frames.find(f => f.id === AppState.selectedFrameId);
            if (frame && InteractionState.draggedSlice) {
                if (InteractionState.draggedSlice.axis === 'v') {
                    let newX = Math.max(0, Math.min(pos.x - frame.rect.x, frame.rect.w));
                    const vSlice = frame.vSlices[InteractionState.draggedSlice.index];
                    if (e.altKey) vSlice.rowOverrides[InteractionState.draggedSlice.rowIndex] = newX;
                    else vSlice.globalX = newX;
                } else {
                    let newY = Math.max(0, Math.min(pos.y - frame.rect.y, frame.rect.h));
                    frame.hSlices[InteractionState.draggedSlice.index] = newY;
                }
            }
        } else if (InteractionState.isDrawing && InteractionState.newRect) {
            InteractionState.newRect.w = pos.x - InteractionState.newRect.x;
            InteractionState.newRect.h = pos.y - InteractionState.newRect.y;
        }
        
        CanvasView.drawAll();
    };

    const handleMouseUp = (e) => {
        // ... (código de mouseup sin cambios)
        let stateChanged = false;
        if (InteractionState.isResizing || InteractionState.isDragging || InteractionState.isDraggingSlice) {
            const frame = AppState.frames.find(f => f.id === AppState.selectedFrameId);
            if (frame) {
                if (frame.rect.w < 0) { frame.rect.x += frame.rect.w; frame.rect.w *= -1; }
                if (frame.rect.h < 0) { frame.rect.y += frame.rect.h; frame.rect.h *= -1; }
            }
            if (InteractionState.isDraggingSlice) HistoryManager.saveLocalState();
            else stateChanged = true;
        } else if (InteractionState.isDrawing && InteractionState.newRect) {
            if (InteractionState.newRect.w < 0) { InteractionState.newRect.x += InteractionState.newRect.w; InteractionState.newRect.w *= -1; }
            if (InteractionState.newRect.h < 0) { InteractionState.newRect.y += InteractionState.newRect.h; InteractionState.newRect.h *= -1; }
            if (InteractionState.newRect.w > 4 && InteractionState.newRect.h > 4) {
                App.addNewFrame(InteractionState.newRect);
                stateChanged = true;
            }
        }
        
        InteractionState.isDrawing = InteractionState.isDragging = InteractionState.isResizing = InteractionState.isDraggingSlice = false;
        InteractionState.newRect = InteractionState.resizeHandle = InteractionState.draggedSlice = null;
        
        App.updateAll(stateChanged);
    };

    const handleDoubleClick = (e) => {
        // ... (código de doubleclick sin cambios)
        const subFrame = AppState.getFlattenedFrames().slice().reverse().find(f => {
            const pos = getMousePos(e);
            return pos.x >= f.rect.x && pos.x <= f.rect.x + f.rect.w && pos.y >= f.rect.y && pos.y <= f.rect.y + f.rect.h;
        });
        if (subFrame) {
            const clip = AppState.getActiveClip();
            if (!clip) { UIManager.showToast('Crea un clip de animación primero.', 'warning'); return; }
            const idx = clip.frameIds.indexOf(subFrame.id);
            if (idx > -1) {
                clip.frameIds.splice(idx, 1);
                UIManager.showToast(`Frame F${subFrame.id} quitado de "${clip.name}".`, 'info');
            } else {
                clip.frameIds.push(subFrame.id);
                UIManager.showToast(`Frame F${subFrame.id} añadido a "${clip.name}".`, 'success');
            }
            App.updateAll(false);
        }
    };
    const handleKeyDown = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

        // --- LÓGICA DE BORRADO MEJORADA ---
        if ((e.key === 'Delete' || e.key === 'Backspace') && !AppState.isLocked) {
            e.preventDefault();

            // Prioridad 1: Borrar la línea seleccionada
            if (AppState.selectedSlice) {
                const frame = AppState.frames.find(f => f.id === AppState.selectedSlice.frameId);
                if (frame) {
                    if (AppState.selectedSlice.axis === 'v') {
                        frame.vSlices.splice(AppState.selectedSlice.index, 1);
                    } else { // axis 'h'
                        frame.hSlices.splice(AppState.selectedSlice.index, 1);
                    }
                    AppState.selectedSlice = null; // Deseleccionar
                    HistoryManager.saveLocalState(); // Guardar el cambio en el historial local del frame
                    App.updateAll(false);
                }
            }
            // Prioridad 2: Si no hay línea, borrar el frame seleccionado
            else if (AppState.selectedFrameId !== null) {
                App.deleteFrame(AppState.selectedFrameId);
            }
        }
        
        if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); HistoryManager.undo(); }
        if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); HistoryManager.redo(); }
        if (e.key.toLowerCase() === 'c') { e.preventDefault(); App.setActiveTool('create'); }
        if (e.key.toLowerCase() === 'v') { e.preventDefault(); App.setActiveTool('select'); }
        if (e.key.toLowerCase() === 'b') { e.preventDefault(); App.removeBackground(); }
        if (e.key.toLowerCase() === 'e') { e.preventDefault(); App.setActiveTool('eraser'); }
        if (e.key.toLowerCase() === 'l') { e.preventDefault(); App.toggleLock(); }
    };
    
    return {
        init() {
            DOM.canvas.addEventListener('mousedown', handleMouseDown);
            DOM.canvas.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            DOM.canvas.addEventListener('dblclick', handleDoubleClick);
            document.addEventListener('keydown', handleKeyDown);
        }
    };
})();

export { InteractionController };