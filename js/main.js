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
import { detectSpritesFromImage, detectBackgroundColor, isBackgroundColor } from './spriteDetection.js';
import { openTutorial } from './tutorial.js';

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
    isModifyingImage: false,

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
            UIManager.hideLoader(); // Centralized place to hide loader
            DOM.welcomeScreen.style.display = 'none';
            DOM.appContainer.style.visibility = 'visible';
            document.body.classList.add('app-loaded');

            const { naturalWidth: w, naturalHeight: h } = DOM.imageDisplay;
            DOM.canvas.width = w; DOM.canvas.height = h;
            DOM.rulerTop.width = w + 60; DOM.rulerLeft.height = h + 60;
            DOM.rulerTop.height = 30; DOM.rulerLeft.width = 30;
            DOM.imageDimensionsP.innerHTML = `<strong>${AppState.currentFileName}:</strong> ${w}px &times; ${h}px`;

            if (this.isModifyingImage) {
                // Image was modified in-place (e.g., background removed)
                this.isModifyingImage = false;
                this.updateAll(true); // Redraw and save state with new image
                SessionManager.addToHistory(); // Update history thumbnail with the new image
                UIManager.showToast('Fondo eliminado con éxito.', 'success');
            } else if (!this.isReloadingFromStorage) {
                // This is a brand new image load
                HistoryManager.reset();
                this.clearAll(true);
                SessionManager.addToHistory();
                ZoomManager.fit();
            } else { // isReloadingFromStorage is true
                // This is a project load from history or last session
                this.updateAll(false);
                ZoomManager.apply();
                this.isReloadingFromStorage = false;
            }
            UIManager.setControlsEnabled(true);

            // Show tutorial only on first load of a new image
            if (!this.isReloadingFromStorage && !this.isModifyingImage && !localStorage.getItem('hideTutorial')) {
                openTutorial();
            }
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
        DOM.removeBgToolButton.addEventListener('click', () => this.removeBackground());
        DOM.autoDetectButton.addEventListener('click', () => this.detectSprites());
        DOM.autoDetectToolButton.addEventListener('click', () => this.detectSprites());
        DOM.generateGridButton.addEventListener('click', () => this.generateByGrid());
        DOM.generateBySizeButton.addEventListener('click', () => this.generateBySize());
        DOM.guessGridButton.addEventListener('click', () => this.guessGrid());
        DOM.zoomInButton.addEventListener('click', () => ZoomManager.zoomIn());
        DOM.zoomOutButton.addEventListener('click', () => ZoomManager.zoomOut());
        DOM.zoomFitButton.addEventListener('click', () => ZoomManager.fit());
        DOM.undoButton.addEventListener('click', () => HistoryManager.undo());
        DOM.redoButton.addEventListener('click', () => HistoryManager.redo());

        DOM.snapToGridCheckbox.addEventListener('change', (e) => {
            AppState.isSnapToGridEnabled = e.target.checked;
            CanvasView.drawAll(); // Redraw to show/hide grid
        });
        DOM.gridSizeInput.addEventListener('change', (e) => {
            const size = parseInt(e.target.value, 10);
            if (size > 0) {
                AppState.gridSize = size;
                if (AppState.isSnapToGridEnabled) CanvasView.drawAll();
            }
        });


        // Listeners para los nuevos inputs de offset
        [DOM.subframeOffsetXInput, DOM.subframeOffsetYInput].forEach(input => {
            input.addEventListener('change', () => {
                const subFrameId = AppState.selectedSubFrameId;
                if (!subFrameId) return;

                const newOffsetX = parseInt(DOM.subframeOffsetXInput.value, 10) || 0;
                const newOffsetY = parseInt(DOM.subframeOffsetYInput.value, 10) || 0;

                AppState.subFrameOffsets[subFrameId] = { x: newOffsetX, y: newOffsetY };
                
                SessionManager.saveCurrent(); // Guardar el estado en la sesión
                this.updateAll(false); // Redibujar todo para ver cambios en la previsualización
            });
        });

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
                const id = e.target.dataset.frameId; // ID ahora es un string
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
        AppState.subFrameOffsets = state.subFrameOffsets || {};
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
        AppState.frames = []; 
        AppState.clips = []; 
        AppState.activeClipId = null; 
        AppState.selectedFrameId = null; 
        AppState.selectedSubFrameId = null;
        AppState.subFrameOffsets = {};
        AppState.selectedSlice = null;
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

    async removeBackground() {
        if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames primero (L)', 'warning'); return; }
        if (!DOM.imageDisplay.src || DOM.imageDisplay.src.startsWith('http') || DOM.imageDisplay.naturalWidth === 0) {
            UIManager.showToast('No hay imagen cargada para procesar.', 'warning');
            return;
        }

        if (!confirm('Esta acción modificará la imagen permanentemente para esta sesión (puedes cambiar la imagen para revertir). ¿Deseas continuar?')) {
            return;
        }

        UIManager.showLoader('Eliminando fondo...');
        
        // Use a timeout to allow the loader to show
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const imageEl = DOM.imageDisplay;
            const w = imageEl.naturalWidth;
            const h = imageEl.naturalHeight;

            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = w;
            tempCanvas.height = h;
            tempCtx.drawImage(imageEl, 0, 0);

            const imageData = tempCtx.getImageData(0, 0, w, h);
            const data = imageData.data;

            const bgColor = detectBackgroundColor(data, w, h);
            const tolerance = parseInt(DOM.autoDetectToleranceInput.value, 10);

            for (let i = 0; i < data.length; i += 4) {
                if (isBackgroundColor(data, i, bgColor, tolerance)) {
                    data[i + 3] = 0; // Set alpha to 0
                }
            }

            tempCtx.putImageData(imageData, 0, 0);

            this.isModifyingImage = true; // Set flag before changing src
            // The onload event will handle hiding the loader, updating UI, and showing toast.
            DOM.imageDisplay.src = tempCanvas.toDataURL('image/png');

        } catch (error) {
            console.error("Error eliminando el fondo:", error);
            UIManager.showToast('Ocurrió un error al eliminar el fondo.', 'danger');
            this.isModifyingImage = false;
            UIManager.hideLoader(); // Hide loader on error
        }
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
    
    async guessGrid() {
        if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames primero (L)', 'warning'); return; }
        
        UIManager.showLoader('Analizando imagen para adivinar la parrilla...');
        DOM.guessGridButton.disabled = true;
    
        // Use a timeout to allow the loader to show
        await new Promise(resolve => setTimeout(resolve, 50));
    
        try {
            const tolerance = parseInt(DOM.autoDetectToleranceInput.value, 10);
            // We can use a higher minSpriteSize to filter out noise
            const detectedFrames = await detectSpritesFromImage(DOM.imageDisplay, { tolerance, minSpriteSize: 8 });
    
            if (detectedFrames.length < 3) { // Need at least a few sprites to make a good guess
                UIManager.showToast('No se encontraron suficientes sprites para adivinar un patrón de parrilla.', 'warning');
                return;
            }
    
            // Find the most common width and height
            const findMode = (arr) => {
                if (arr.length === 0) return null;
                // Group similar sizes together to handle minor variations (e.g. rounding to nearest 4px)
                const roundedArr = arr.map(val => Math.round(val / 4) * 4);
                const counts = roundedArr.reduce((acc, val) => {
                    if (val > 0) acc[val] = (acc[val] || 0) + 1;
                    return acc;
                }, {});

                if (Object.keys(counts).length === 0) return null;

                return parseInt(Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b));
            };
    
            const widths = detectedFrames.map(f => f.rect.w);
            const heights = detectedFrames.map(f => f.rect.h);
    
            const modeWidth = findMode(widths);
            const modeHeight = findMode(heights);
    
            if (modeWidth && modeHeight) {
                DOM.cellWInput.value = modeWidth;
                DOM.cellHInput.value = modeHeight;
                UIManager.showToast(`Tamaño de celda sugerido: ${modeWidth}x${modeHeight}. Haz clic en "Generar por Tamaño".`, 'success');
            } else {
                UIManager.showToast('No se pudo determinar un tamaño de celda consistente.', 'warning');
            }
    
        } catch (error) {
            console.error("Error adivinando la parrilla:", error);
            UIManager.showToast('Ocurrió un error al analizar la imagen.', 'danger');
        } finally {
            UIManager.hideLoader();
            DOM.guessGridButton.disabled = false;
        }
    },

    detectSprites() {
        if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames primero (L)', 'warning'); return; }
        if (AppState.frames.length > 0 && !confirm('Esta acción borrará los frames existentes. ¿Continuar?')) return;
        UIManager.showLoader('Detectando sprites...');
        DOM.autoDetectButton.disabled = true; DOM.autoDetectToolButton.disabled = true;
        setTimeout(async () => {
            try {
                const tolerance = parseInt(DOM.autoDetectToleranceInput.value, 10);
                const newFrames = await detectSpritesFromImage(DOM.imageDisplay, { tolerance });
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