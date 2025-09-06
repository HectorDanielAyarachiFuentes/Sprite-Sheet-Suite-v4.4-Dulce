// --- Archivo Principal de la Aplicación (main.js) ---
// Importa todos los módulos, los inicializa y coordina las actualizaciones globales.

import { DOM, CTX } from './1_dom.js';
import { AppState } from './2_appState.js';
import { HistoryManager } from './3_historyManager.js';
import { UIManager } from './4_uiManager.js';
import { CanvasView } from './5_canvasView.js';
import { InteractionController } from './6_interactionController.js';
import { AnimationManager } from './7_animationManager.js';
import { ExportManager } from './8_exportManager.js';
import { SessionManager } from './9_sessionManager.js';

// --- Zoom Manager (Un pequeño módulo dentro de main) ---
const ZoomManager = {
    apply() {
        DOM.imageContainer.style.transform = `scale(${AppState.zoomLevel})`;
        DOM.zoomDisplay.textContent = `${Math.round(AppState.zoomLevel * 100)}%`;
        CanvasView.drawAll();
    },
    zoomIn() {
        AppState.zoomLevel = Math.min(AppState.zoomLevel * 1.25, 16);
        this.apply();
    },
    zoomOut() {
        AppState.zoomLevel = Math.max(AppState.zoomLevel / 1.25, 0.1);
        this.apply();
    },
    fit() {
        if (!DOM.imageDisplay.complete || DOM.imageDisplay.naturalWidth === 0) return;
        const editorRect = DOM.editorArea.getBoundingClientRect();
        const viewWidth = editorRect.width - 60;
        const viewHeight = editorRect.height - 60;
        const scaleX = viewWidth / DOM.imageDisplay.naturalWidth;
        const scaleY = viewHeight / DOM.imageDisplay.naturalHeight;
        AppState.zoomLevel = Math.min(scaleX, scaleY, 1);
        this.apply();
    }
};

// --- Objeto Principal de la Aplicación ---
export const App = {
    isReloadingFromStorage: false,

    init() {
        console.log("Aplicación Sprite Sheet iniciada.");
        this.setupEventListeners();
        
        UIManager.setControlsEnabled(false);
        InteractionController.init();
        AnimationManager.init();
        ExportManager.init();
        SessionManager.init(); 
    },

    updateAll(saveState = false) {
        if (saveState) {
            HistoryManager.saveGlobalState();
        }
        CanvasView.drawAll();
        UIManager.updateAll();
        AnimationManager.reset();
    },

    setupEventListeners() {
        DOM.changeImageButton.addEventListener('click', () => {
            DOM.welcomeScreen.style.display = 'flex';
            DOM.appContainer.style.visibility = 'hidden';
            document.body.classList.remove('app-loaded');
        });

        DOM.imageDisplay.onload = () => {
            DOM.welcomeScreen.style.display = 'none';
            DOM.appContainer.style.visibility = 'visible';
            document.body.classList.add('app-loaded');

            const { naturalWidth: w, naturalHeight: h } = DOM.imageDisplay;
            DOM.canvas.width = w; DOM.canvas.height = h;
            DOM.rulerTop.width = w + 60; DOM.rulerLeft.height = h + 60;
            DOM.rulerTop.height = 30; DOM.rulerLeft.width = 30;
            DOM.imageDimensionsP.innerHTML = `<strong>${AppState.currentFileName}:</strong> ${w}px &times; ${h}px`;

            if (!this.isReloadingFromStorage) {
                HistoryManager.reset();
                this.clearAll(true);
                SessionManager.addToHistory();
                ZoomManager.fit();
            } else {
                this.updateAll(false);
                ZoomManager.apply();
                this.isReloadingFromStorage = false;
            }
            UIManager.setControlsEnabled(true);
        };
        
        DOM.projectHistoryList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li || li.classList.contains('no-projects')) return;
            const id = li.dataset.historyId;

            if (e.target.classList.contains('delete-history-btn')) {
                e.stopPropagation();
                if (confirm('¿Estás seguro de que quieres eliminar este proyecto del historial?')) {
                    SessionManager.deleteHistoryItem(id);
                    UIManager.showToast('Proyecto eliminado del historial.', 'info');
                }
            } else {
                const savedState = localStorage.getItem(`history_${id}`);
                if (savedState) this.loadProjectState(JSON.parse(savedState));
                else UIManager.showToast('No se pudo cargar el proyecto.', 'danger');
            }
        });

        window.addEventListener('loadProjectState', (e) => {
            this.loadProjectState(e.detail);
        });

        DOM.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); });
        DOM.dropZone.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('dragleave'));
        DOM.dropZone.addEventListener('drop', (e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); if (e.dataTransfer.files.length) this.handleFile(e.dataTransfer.files[0]); });
        DOM.imageLoader.addEventListener('change', (e) => { if (e.target.files.length) this.handleFile(e.target.files[0]); });
        DOM.selectToolButton.addEventListener('click', () => this.setActiveTool('select'));
        DOM.createFrameToolButton.addEventListener('click', () => this.setActiveTool('create'));
        DOM.eraserToolButton.addEventListener('click', () => this.setActiveTool('eraser'));
        DOM.autoDetectButton.addEventListener('click', () => this.detectSprites());
        DOM.autoDetectToolButton.addEventListener('click', () => this.detectSprites());
        DOM.generateGridButton.addEventListener('click', () => this.generateByGrid());
        DOM.generateBySizeButton.addEventListener('click', () => this.generateBySize());
        DOM.zoomInButton.addEventListener('click', () => ZoomManager.zoomIn());
        DOM.zoomOutButton.addEventListener('click', () => ZoomManager.zoomOut());
        DOM.zoomFitButton.addEventListener('click', () => ZoomManager.fit());
        DOM.undoButton.addEventListener('click', () => HistoryManager.undo());
        DOM.redoButton.addEventListener('click', () => HistoryManager.redo());

        // --- CORRECCIÓN --- El listener ahora llama a la nueva función y luego actualiza.
        DOM.newClipButton.addEventListener('click', () => {
            const newName = prompt("Nombre del nuevo clip:", `Clip ${AppState.clips.length + 1}`);
            if (newName) {
                this.createNewClip(newName); // 1. Modifica el estado
                this.updateAll(false);      // 2. Actualiza la UI
                UIManager.showToast(`Clip "${newName}" creado.`, 'success');
            }
        });

        DOM.renameClipButton.addEventListener('click', () => this.renameClip());
        DOM.deleteClipButton.addEventListener('click', () => this.deleteClip());
        DOM.clipsSelect.addEventListener('change', (e) => { AppState.activeClipId = parseInt(e.target.value); this.updateAll(false); });
        DOM.selectAllFramesButton.addEventListener('click', () => {
            const clip = AppState.getActiveClip();
            if (clip) {
                clip.frameIds = AppState.getFlattenedFrames().map(f => f.id);
                this.updateAll(false); SessionManager.saveCurrent();
                UIManager.showToast(`Todos los frames añadidos a "${clip.name}".`, 'info');
            }
        });
        DOM.deselectAllFramesButton.addEventListener('click', () => {
            const clip = AppState.getActiveClip();
            if (clip) {
                clip.frameIds = [];
                this.updateAll(false); SessionManager.saveCurrent();
                UIManager.showToast(`Todos los frames quitados de "${clip.name}".`, 'info');
            }
        });
        DOM.framesList.addEventListener('change', (e) => {
            if (e.target.matches('[data-frame-id]')) {
                const clip = AppState.getActiveClip();
                if (!clip) return;
                const id = parseInt(e.target.dataset.frameId);
                if (e.target.checked) { if (!clip.frameIds.includes(id)) clip.frameIds.push(id); } 
                else { clip.frameIds = clip.frameIds.filter(fid => fid !== id); }
                this.updateAll(false); SessionManager.saveCurrent();
            }
        });
        DOM.clearButton.addEventListener('click', () => { if(confirm('¿Seguro?')) this.clearAll(false); });
        DOM.lockFramesButton.addEventListener('click', () => this.toggleLock());
        DOM.fullscreenButton.addEventListener('click', () => this.toggleFullscreen());
    },
    
    loadProjectState(state) {
        this.isReloadingFromStorage = true;
        AppState.currentFileName = state.fileName;
        AppState.frames = state.frames;
        AppState.clips = state.clips;
        AppState.activeClipId = state.activeClipId;
        AppState.selectedSlice = null; // Reiniciar slice al cargar
        HistoryManager.setHistoryState(state);
        DOM.imageDisplay.src = state.imageSrc;
        UIManager.showToast(`Proyecto "${state.fileName}" cargado.`, 'success');
    },
    
    handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        AppState.currentFileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => { DOM.imageDisplay.src = e.target.result; this.isReloadingFromStorage = false; };
        reader.readAsDataURL(file);
    },

    setActiveTool(toolName) {
        AppState.activeTool = toolName;
        document.querySelectorAll('.left-toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`${toolName}-tool-button`);
        if (activeBtn) activeBtn.classList.add('active');
        DOM.canvas.classList.toggle('cursor-eraser', toolName === 'eraser');
    },

    clearAll(isInitial = false) {
        AppState.frames = []; AppState.clips = []; AppState.activeClipId = null; AppState.selectedFrameId = null; AppState.selectedSlice = null;
        if (!isInitial) this.updateAll(true);
    },

    addNewFrame(rect) {
        const newId = AppState.frames.length > 0 ? Math.max(...AppState.frames.map(f => f.id)) + 1 : 0;
        AppState.frames.push({ id: newId, name: `frame_${newId}`, rect, type: 'simple' });
        AppState.selectedFrameId = newId;
    },

    deleteFrame(frameId) {
        const frameToDelete = AppState.frames.find(f => f.id === frameId);
        if (!frameToDelete) return;
        const subFrameIdsBefore = AppState.getFlattenedFrames().map(f => f.id);
        AppState.frames = AppState.frames.filter(f => f.id !== frameId);
        if (AppState.selectedFrameId === frameId) { AppState.selectedFrameId = null; AppState.selectedSlice = null; }
        const subFrameIdsAfter = new Set(AppState.getFlattenedFrames().map(f => f.id));
        const idsToRemove = subFrameIdsBefore.filter(id => !subFrameIdsAfter.has(id));
        if (idsToRemove.length > 0) {
            AppState.clips.forEach(clip => {
                clip.frameIds = clip.frameIds.filter(id => !idsToRemove.includes(id));
            });
        }
        this.updateAll(true);
        UIManager.showToast(`Frame ${frameToDelete.name} eliminado.`, 'success');
    },
    
    // --- CORRECCIÓN --- La función ahora solo modifica el estado.
    createNewClip(name) {
        if (!name) return;
        const newClip = { id: Date.now(), name: name, frameIds: [] };
        AppState.clips.push(newClip);
        AppState.activeClipId = newClip.id;
        SessionManager.saveCurrent();
    },

    renameClip() {
        const clip = AppState.getActiveClip();
        if (clip) {
            const newName = prompt("Nuevo nombre:", clip.name);
            if(newName) { 
                clip.name = newName; this.updateAll(false); SessionManager.saveCurrent();
                UIManager.showToast(`Clip renombrado a "${newName}".`, 'success'); 
            }
        }
    },

    deleteClip() {
        if (AppState.clips.length <= 1) { UIManager.showToast("No puedes eliminar el último clip.", 'warning'); return; }
        if(confirm(`¿Eliminar el clip "${AppState.getActiveClip().name}"?`)) {
            AppState.clips = AppState.clips.filter(c => c.id !== AppState.activeClipId);
            AppState.activeClipId = AppState.clips[0]?.id || null;
            this.updateAll(false); SessionManager.saveCurrent();
        }
    },

    toggleLock() {
        AppState.isLocked = !AppState.isLocked;
        DOM.lockFramesButton.textContent = AppState.isLocked ? '🔒' : '🔓';
        DOM.lockFramesButton.classList.toggle('locked', AppState.isLocked);
        UIManager.showToast(AppState.isLocked ? 'Frames bloqueados' : 'Frames desbloqueados', 'primary');
        CanvasView.drawAll();
    },

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                alert(`Error al intentar entrar en pantalla completa: ${err.message} (${err.name})`);
            });
        } else { document.exitFullscreen(); }
    },

    generateByGrid() {
        if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames primero (L)', 'warning'); return; }
        if (AppState.frames.length > 0 && !confirm('Esto borrará los frames existentes. ¿Continuar?')) return;
        const r = parseInt(DOM.rowsInput.value), c = parseInt(DOM.colsInput.value);
        if(isNaN(r) || isNaN(c) || r < 1 || c < 1) { UIManager.showToast('Filas y Columnas deben ser números positivos.', 'warning'); return; }
        const w = DOM.canvas.width / c, h = DOM.canvas.height / r;
        const newFrame = { id: 0, name: `grid_group`, rect: { x: 0, y: 0, w: DOM.canvas.width, h: DOM.canvas.height }, type: 'group', vSlices: [], hSlices: [] };
        for (let i = 1; i < c; i++) newFrame.vSlices.push({ id: Date.now()+i, globalX: i*w, rowOverrides: {} });
        for (let i = 1; i < r; i++) newFrame.hSlices.push(i*h);
        AppState.frames = [newFrame]; AppState.clips = []; AppState.activeClipId = null;
        this.updateAll(true);
        UIManager.showToast('Parrilla generada con éxito.', 'success');
    },

    generateBySize() {
        if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames primero (L)', 'warning'); return; }
        if (AppState.frames.length > 0 && !confirm('Esto borrará los frames existentes. ¿Continuar?')) return;
        const w = parseInt(DOM.cellWInput.value), h = parseInt(DOM.cellHInput.value);
        if(isNaN(w) || isNaN(h) || w < 1 || h < 1) { UIManager.showToast('Ancho y Alto deben ser números positivos.', 'warning'); return; }
        const newFrame = { id: 0, name: `sized_group`, rect: { x: 0, y: 0, w: DOM.canvas.width, h: DOM.canvas.height }, type: 'group', vSlices: [], hSlices: [] };
        for (let x=w; x<DOM.canvas.width; x+=w) newFrame.vSlices.push({ id: Date.now()+x, globalX: x, rowOverrides: {} });
        for (let y=h; y<DOM.canvas.height; y+=h) newFrame.hSlices.push(y);
        AppState.frames = [newFrame]; AppState.clips = []; AppState.activeClipId = null;
        this.updateAll(true);
        UIManager.showToast('Frames generados por tamaño con éxito.', 'success');
    },
    
    detectSprites() {
        if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames primero (L)', 'warning'); return; }
        if (AppState.frames.length > 0 && !confirm('Esta acción borrará los frames existentes. ¿Continuar?')) return;
        UIManager.showLoader('Detectando sprites...');
        DOM.autoDetectButton.disabled = true; DOM.autoDetectToolButton.disabled = true;
        setTimeout(() => {
            try {
                const tolerance = parseInt(DOM.autoDetectToleranceInput.value, 10);
                const tempCanvas = document.createElement('canvas'); const tempCtx = tempCanvas.getContext('2d');
                const { naturalWidth: w, naturalHeight: h } = DOM.imageDisplay;
                tempCanvas.width = w; tempCanvas.height = h; tempCtx.drawImage(DOM.imageDisplay, 0, 0);
                const imageData = tempCtx.getImageData(0, 0, w, h); const data = imageData.data;
                const visited = new Uint8Array(w * h); const newFrames = [];
                const bgColors = []; const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
                corners.forEach(([x, y]) => { const i = (y * w + x) * 4; bgColors.push([data[i], data[i+1], data[i+2], data[i+3]]); });
                const colorCounts = {}; bgColors.forEach(color => { const key = color.join(','); colorCounts[key] = (colorCounts[key] || 0) + 1; });
                const mostCommonColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b).split(',').map(Number);
                const [bgR, bgG, bgB, bgA] = mostCommonColor;
                const isBackgroundColor = (index) => {
                    const r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3];
                    if (a === 0) return true; if (bgA < 255 && a > 0) return false;
                    return (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)) <= tolerance;
                };
                const minSpriteSize = 4;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const i = (y * w + x); if (visited[i] || isBackgroundColor(i * 4)) continue;
                        const queue = [[x, y]]; visited[i] = 1; let minX = x, minY = y, maxX = x, maxY = y; let pixelCount = 0;
                        while (queue.length > 0) {
                            const [cx, cy] = queue.shift(); minX = Math.min(minX, cx); minY = Math.min(minY, cy); maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy); pixelCount++;
                            const neighbors = [[cx,cy-1], [cx,cy+1], [cx-1,cy], [cx+1,cy]];
                            for (const [nx, ny] of neighbors) {
                                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                    const ni = (ny * w + nx);
                                    if (!visited[ni] && !isBackgroundColor(ni * 4)) { visited[ni] = 1; queue.push([nx, ny]); }
                                }
                            }
                        }
                        if (pixelCount >= minSpriteSize) {
                             const newId = newFrames.length;
                             newFrames.push({ id: newId, name: `sprite_${newId}`, rect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, type: 'simple' });
                        }
                    }
                }
                if (newFrames.length > 0) {
                    AppState.frames = newFrames; AppState.clips = []; AppState.activeClipId = null; AppState.selectedFrameId = null;
                    UIManager.showToast(`¡Detección completada! Se encontraron ${newFrames.length} sprites.`, 'success');
                    this.updateAll(true);
                } else { UIManager.showToast('No se encontraron sprites con la tolerancia actual.', 'warning'); }
            } catch (error) {
                console.error("Error en detección de sprites:", error); UIManager.showToast('Ocurrió un error durante la detección.', 'danger');
            } finally {
                UIManager.hideLoader(); DOM.autoDetectButton.disabled = false; DOM.autoDetectToolButton.disabled = false;
            }
        }, 50);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());