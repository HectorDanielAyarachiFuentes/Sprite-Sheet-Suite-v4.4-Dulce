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
    },
    zoomToRect(rect) {
        if (!rect) return;
        const editorRect = DOM.editorArea.getBoundingClientRect();
        // Añadir algo de padding a la vista
        const viewWidth = editorRect.width - 100;
        const viewHeight = editorRect.height - 100;

        const scaleX = viewWidth / rect.w;
        const scaleY = viewHeight / rect.h;
        
        // Establecer un nivel de zoom razonable, ni muy cerca ni muy lejos.
        AppState.zoomLevel = Math.min(scaleX, scaleY, 4); // Zoom máximo 4x
        this.apply();

        // Ahora, hacer scroll hacia el rectángulo.
        const scaledRectX = rect.x * AppState.zoomLevel;
        const scaledRectY = rect.y * AppState.zoomLevel;
        const scaledW = rect.w * AppState.zoomLevel;
        const scaledH = rect.h * AppState.zoomLevel;

        DOM.editorArea.scrollLeft = scaledRectX - (editorRect.width / 2) + (scaledW / 2);
        DOM.editorArea.scrollTop = scaledRectY - (editorRect.height / 2) + (scaledH / 2);
    }
};

// --- Simple Growing Packer Algorithm ---
const GrowingPacker = function() {};
GrowingPacker.prototype = {
    fit: function(blocks) {
        let n, node, block, len = blocks.length;
        let w = len > 0 ? blocks[0].w : 0;
        let h = len > 0 ? blocks[0].h : 0;
        this.root = { x: 0, y: 0, w: w, h: h };
        for (n = 0; n < len; n++) {
            block = blocks[n];
            if (node = this.findNode(this.root, block.w, block.h)) {
                block.fit = this.splitNode(node, block.w, block.h);
            } else {
                block.fit = this.growNode(block.w, block.h);
            }
        }
    },
    findNode: function(root, w, h) {
        if (root.used) {
            return this.findNode(root.right, w, h) || this.findNode(root.down, w, h);
        } else if ((w <= root.w) && (h <= root.h)) {
            return root;
        } else {
            return null;
        }
    },
    splitNode: function(node, w, h) {
        node.used = true;
        node.down = { x: node.x, y: node.y + h, w: node.w, h: node.h - h };
        node.right = { x: node.x + w, y: node.y, w: node.w - w, h: h };
        return node;
    },
    growNode: function(w, h) {
        const canGrowDown = (w <= this.root.w);
        const canGrowRight = (h <= this.root.h);
        const shouldGrowRight = canGrowRight && (this.root.h >= (this.root.w + w));
        const shouldGrowDown = canGrowDown && (this.root.w >= (this.root.h + h));
        if (shouldGrowRight) return this.growRight(w, h);
        else if (shouldGrowDown) return this.growDown(w, h);
        else if (canGrowRight) return this.growRight(w, h);
        else if (canGrowDown) return this.growDown(w, h);
        else return null;
    },
    growRight: function(w, h) {
        const previousRoot = this.root;
        this.root = { used: true, x: 0, y: 0, w: previousRoot.w + w, h: previousRoot.h, down: previousRoot, right: { x: previousRoot.w, y: 0, w: w, h: previousRoot.h } };
        let node; if (node = this.findNode(this.root, w, h)) { return this.splitNode(node, w, h); } return null;
    },
    growDown: function(w, h) {
        const previousRoot = this.root;
        this.root = { used: true, x: 0, y: 0, w: previousRoot.w, h: previousRoot.h + h, down: { x: 0, y: previousRoot.h, w: previousRoot.w, h: h }, right: previousRoot };
        let node; if (node = this.findNode(this.root, w, h)) { return this.splitNode(node, w, h); } return null;
    }
};

// --- Objeto Principal de la Aplicación ---
export const App = {
    isReloadingFromStorage: false,
    isModifyingImage: false,
    modificationMessage: null,
    offsetEditorState: {
        isOpen: false,
        targetFrameId: null,
        tempOffset: { x: 0, y: 0 },
        isDragging: false,
        dragStartPos: { x: 0, y: 0 },
        initialOffset: { x: 0, y: 0 },
        canvasSize: { w: 0, h: 0 }
    },

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
                const message = this.modificationMessage || 'Imagen modificada con éxito.';
                // After trimming, ask the user if they want to export everything.
                if (this.modificationMessage && this.modificationMessage.includes('recortada')) {
                    if (confirm('Hoja de sprites optimizada. ¿Deseas descargar todos los formatos de exportación ahora (ZIP, GIF, Código, JSON)?')) {
                        ExportManager.exportAllFormats();
                    }
                }
                UIManager.showToast(message, 'success');
                this.modificationMessage = null; // Reset message
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
        DOM.trimSpritesheetButton.addEventListener('click', () => this.trimSpritesheet());
        // --- NUEVO: Inspector de Frames ---
        DOM.frameInspectorToolButton.addEventListener('click', () => this.openFrameInspector());
        DOM.closeInspectorButton.addEventListener('click', () => this.closeFrameInspector());
        DOM.alignGrid.addEventListener('click', (e) => {
            const button = e.target.closest('.align-btn');
            if (button && button.dataset.align) {
                this.alignFramesByOffset(button.dataset.align);
            }
        });
        DOM.unifySizeButton.addEventListener('click', () => this.unifyFrameSizes());
        DOM.inspectorAddAllButton.addEventListener('click', () => this.inspectorAddAllToClip());
        DOM.inspectorRemoveAllButton.addEventListener('click', () => this.inspectorRemoveAllFromClip());
        DOM.useRecommendedSizeBtn.addEventListener('click', () => {
            DOM.unifyWidthInput.value = DOM.useRecommendedSizeBtn.dataset.w;
            DOM.unifyHeightInput.value = DOM.useRecommendedSizeBtn.dataset.h;
        });

        // --- NUEVO: Listeners para los controles de alineación de unificación ---
        document.querySelectorAll('.segmented-control').forEach(group => {
            group.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    // Quitar 'active' de los hermanos
                    Array.from(group.children).forEach(btn => btn.classList.remove('active'));
                    // Añadir 'active' al botón clicado
                    e.target.classList.add('active');
                }
            });
        });
        // --- FIN ---
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

                const newOffsetX = parseFloat(DOM.subframeOffsetXInput.value) || 0;
                const newOffsetY = parseFloat(DOM.subframeOffsetYInput.value) || 0;

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

        // --- NUEVO: Listeners para el Editor de Offset ---
        DOM.closeOffsetEditorModalBtn.addEventListener('click', () => this.closeOffsetEditor());
        DOM.cancelOffsetEditorBtn.addEventListener('click', () => this.closeOffsetEditor());
        DOM.saveOffsetEditorBtn.addEventListener('click', () => this.saveOffsetChanges());
        DOM.unifyFromEditorBtn.addEventListener('click', () => this.unifyFromEditor());

        // Listeners para los inputs del modal
        [
            DOM.offsetEditorCanvasWidthInput, 
            DOM.offsetEditorCanvasHeightInput, 
            DOM.offsetEditorXInput, 
            DOM.offsetEditorYInput
        ].forEach(input => {
            input.addEventListener('change', () => this.updateOffsetEditorFromInputs());
        });

        // Listeners para arrastrar en el canvas del modal
        const offsetCanvas = DOM.offsetEditorCanvas;

        offsetCanvas.addEventListener('mousedown', (e) => {
            const state = this.offsetEditorState;
            if (!state.isOpen) return;
            
            state.isDragging = true;
            const rect = offsetCanvas.getBoundingClientRect();
            state.dragStartPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            state.initialOffset = { ...state.tempOffset };
        });

        document.addEventListener('mousemove', (e) => {
            const state = this.offsetEditorState;
            if (!state.isOpen || !state.isDragging) return;

            const rect = offsetCanvas.getBoundingClientRect();
            const currentPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            
            const scale = (state.canvasSize.w > 0) ? (offsetCanvas.width / state.canvasSize.w) : 1;
            const dx = (currentPos.x - state.dragStartPos.x) / scale;
            const dy = (currentPos.y - state.dragStartPos.y) / scale;

            state.tempOffset.x = state.initialOffset.x + dx;
            state.tempOffset.y = state.initialOffset.y + dy;

            this.drawOffsetEditorCanvas();
            this.updateOffsetEditorInputs();
        });

        document.addEventListener('mouseup', () => {
            if (this.offsetEditorState.isDragging) {
                this.offsetEditorState.isDragging = false;
                this.updateOffsetEditorInputs(true); // Redondear al soltar
            }
        });
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
            this.modificationMessage = 'Fondo eliminado con éxito.';
            // The onload event will handle hiding the loader, updating UI, and showing toast.
            DOM.imageDisplay.src = tempCanvas.toDataURL('image/png');

        } catch (error) {
            console.error("Error eliminando el fondo:", error);
            UIManager.showToast('Ocurrió un error al eliminar el fondo.', 'danger');
            this.isModifyingImage = false;
            UIManager.hideLoader(); // Hide loader on error
        }
    },

    async trimSpritesheet() {
        if (AppState.isLocked) { UIManager.showToast('Desbloquea los frames primero (L)', 'warning'); return; }
        const allFrames = AppState.getFlattenedFrames();
        if (allFrames.length === 0) {
            UIManager.showToast('No hay frames definidos para re-empaquetar.', 'warning');
            return;
        }

        if (!confirm('¡ACCIÓN DESTRUCTIVA!\n\nEsto re-empaquetará todos los sprites en una nueva hoja con un margen de 3px. Se perderá la estructura de grupos y clips. La nueva imagen se descargará y reemplazará a la actual.\n\n¿Deseas continuar?')) {
            return;
        }

        UIManager.showLoader('Re-empaquetando hoja de sprites...');
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const margin = 3;

            // 1. Preparar bloques para el empaquetador
            const blocks = allFrames.map(frame => ({
                w: frame.rect.w + margin * 2,
                h: frame.rect.h + margin * 2,
                data: frame // Mantener referencia al frame original
            }));

            // Ordenar bloques por lado máximo para mejor eficiencia de empaquetado
            blocks.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

            // 2. Usar el empaquetador para obtener el nuevo layout
            const packer = new GrowingPacker();
            packer.fit(blocks);

            const newWidth = packer.root.w;
            const newHeight = packer.root.h;

            if (newWidth <= 0 || newHeight <= 0) throw new Error("El área de empaquetado es inválida.");

            // 3. Crear un nuevo canvas y dibujar los sprites en sus nuevas posiciones
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = newWidth;
            tempCanvas.height = newHeight;
            const tempCtx = tempCanvas.getContext('2d');
            const newFrames = [];

            blocks.forEach((block, index) => {
                if (block.fit) {
                    const originalFrame = block.data;
                    const newX = block.fit.x + margin;
                    const newY = block.fit.y + margin;

                    // Dibujar el sprite de la imagen vieja al nuevo canvas
                    tempCtx.drawImage(DOM.imageDisplay, originalFrame.rect.x, originalFrame.rect.y, originalFrame.rect.w, originalFrame.rect.h, newX, newY, originalFrame.rect.w, originalFrame.rect.h);

                    // Crear una nueva definición de frame simple para el nuevo layout
                    newFrames.push({ id: index, name: originalFrame.name, rect: { x: newX, y: newY, w: originalFrame.rect.w, h: originalFrame.rect.h }, type: 'simple' });
                }
            });

            const newImageURL = tempCanvas.toDataURL('image/png');

            // 4. Iniciar la descarga de la nueva imagen.
            const newFileName = `packed_${AppState.currentFileName}`;
            const link = document.createElement('a');
            link.href = newImageURL;
            link.download = newFileName;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);

            // 5. Reemplazar los frames y clips viejos con el nuevo layout simple
            AppState.frames = newFrames; AppState.clips = []; AppState.activeClipId = null; AppState.selectedFrameId = null; AppState.selectedSubFrameId = null; AppState.subFrameOffsets = {};

            // 6. Actualizar la imagen principal y el estado de la aplicación.
            this.isModifyingImage = true;
            this.modificationMessage = 'Hoja de sprites re-empaquetada con margen. La nueva imagen se ha descargado y ahora se usa en la aplicación.';
            AppState.currentFileName = newFileName;
            DOM.imageDisplay.src = newImageURL;

        } catch (error) {
            console.error("Error re-empaquetando la hoja de sprites:", error);
            UIManager.showToast('Ocurrió un error al re-empaquetar la imagen.', 'danger');
            UIManager.hideLoader();
        }
    },

    openFrameInspector() {
        const INSPECTOR_THUMB_SIZE = 100; // Tamaño máximo para las miniaturas en píxeles
        const allFrames = AppState.getFlattenedFrames();
        if (allFrames.length === 0) {
            UIManager.showToast('No hay frames para inspeccionar. Crea algunos primero.', 'warning');
            return;
        }

        DOM.inspectorGrid.innerHTML = ''; // Limpiar la vista anterior
        const activeClip = AppState.getActiveClip();

        // Analizar tamaños para resaltar inconsistencias
        const sizes = allFrames.map(f => `${f.rect.w}x${f.rect.h}`);
        const counts = sizes.reduce((acc, val) => {
            acc[val] = (acc[val] || 0) + 1;
            return acc;
        }, {});
        const mostCommonSize = Object.keys(counts).length > 0 ? Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b) : null;

        allFrames.forEach(frame => {
            const card = document.createElement('div');
            card.className = 'inspector-card';
            card.dataset.subFrameId = frame.id; // Guardar ID para el evento de clic

            // --- LÓGICA DE SELECCIÓN DE CLIP ---
            const isInClip = activeClip?.frameIds.includes(frame.id);
            if (isInClip) card.classList.add('is-in-clip');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'frame-selector-checkbox';
            checkbox.checked = isInClip;
            checkbox.title = 'Añadir/Quitar del clip activo';
            checkbox.addEventListener('change', () => {
                if (!activeClip) return;
                if (checkbox.checked) {
                    if (!activeClip.frameIds.includes(frame.id)) activeClip.frameIds.push(frame.id);
                } else {
                    activeClip.frameIds = activeClip.frameIds.filter(id => id !== frame.id);
                }
                card.classList.toggle('is-in-clip', checkbox.checked);
                this.updateAll(true); // Guardar y actualizar la lista de frames del panel derecho
            });
            card.appendChild(checkbox);

            // --- NUEVO: Botón de Edición Visual de Offset ---
            const cardActions = document.createElement('div');
            cardActions.className = 'card-actions';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-offset-btn';
            editBtn.textContent = '✏️';
            editBtn.title = 'Editar posición visualmente';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Evitar que el clic se propague a otros elementos
                this.openOffsetEditor(frame.id);
            });
            cardActions.appendChild(editBtn);
            card.appendChild(cardActions);

            const canvasContainer = document.createElement('div');
            canvasContainer.className = 'canvas-container';
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // --- LÓGICA DE ESCALADO ADAPTATIVO ---
            const scale = Math.min(INSPECTOR_THUMB_SIZE / frame.rect.w, INSPECTOR_THUMB_SIZE / frame.rect.h, 1);
            canvas.width = frame.rect.w * scale;
            canvas.height = frame.rect.h * scale;
            ctx.imageSmoothingEnabled = false; // Mantener el pixel art nítido
            ctx.drawImage(DOM.imageDisplay, frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h, 0, 0, canvas.width, canvas.height);

            canvasContainer.appendChild(canvas);

            const dimensions = document.createElement('p');
            dimensions.className = 'dimensions';
            const currentSize = `${frame.rect.w}x${frame.rect.h}`;
            
            let htmlContent = currentSize;
            if (mostCommonSize && currentSize !== mostCommonSize) {
                dimensions.classList.add('mismatch');
                dimensions.title = `Difiere del tamaño más común (${mostCommonSize})`;
            }

            // Comprobar si hay offsets aplicados para mostrar el tamaño unificado
            const offset = frame.offset; // Ya viene en el frame aplanado
            if (offset && (offset.x !== 0 || offset.y !== 0)) {
                // La fórmula es: tamañoUnificado = tamañoOriginal + 2 * offset
                const unifiedW = frame.rect.w + 2 * offset.x;
                const unifiedH = frame.rect.h + 2 * offset.y;

                // Solo mostrar si el resultado es un tamaño válido
                if (unifiedW > 0 && unifiedH > 0) {
                    htmlContent += `<br><span class="unified-size-display">→ ${Math.round(unifiedW)}x${Math.round(unifiedH)}</span>`;
                }
            }
            dimensions.innerHTML = htmlContent;

            card.appendChild(canvasContainer);
            card.appendChild(dimensions);
            DOM.inspectorGrid.appendChild(card);

            // --- LÓGICA DE CLIC PARA NAVEGAR ---
            canvasContainer.addEventListener('click', () => {
                const subFrameId = card.dataset.subFrameId;
                const parentFrameId = parseInt(subFrameId.split('_')[0], 10);

                if (frame && AppState.frames.some(f => f.id === parentFrameId)) {
                    AppState.selectedFrameId = parentFrameId;
                    AppState.selectedSubFrameId = subFrameId;
                    this.closeFrameInspector();
                    this.updateAll(false); // Redibujar el lienzo principal con la nueva selección
                    ZoomManager.zoomToRect(frame.rect); // Enfocar en el frame seleccionado
                }
            });
        });

        const canAlign = AppState.getActiveClip() && AppState.getAnimationFrames().length > 0;
        DOM.alignGrid.style.opacity = canAlign ? '1' : '0.5';
        DOM.alignGrid.style.pointerEvents = canAlign ? 'auto' : 'none';
        DOM.frameInspectorPanel.classList.remove('hidden');

        // --- NUEVO: Lógica para mostrar el tamaño recomendado ---
        if (allFrames.length > 0) {
            const maxWidth = Math.max(...allFrames.map(f => f.rect.w));
            const maxHeight = Math.max(...allFrames.map(f => f.rect.h));
            
            DOM.recommendedSizeText.textContent = `${maxWidth} x ${maxHeight}px`;
            DOM.useRecommendedSizeBtn.dataset.w = maxWidth;
            DOM.useRecommendedSizeBtn.dataset.h = maxHeight;
            DOM.unifySizeRecommendation.style.display = 'flex';
        } else {
            DOM.unifySizeRecommendation.style.display = 'none';
        }
    },

    closeFrameInspector() { DOM.frameInspectorPanel.classList.add('hidden'); },

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                alert(`Error al intentar entrar en pantalla completa: ${err.message} (${err.name})`);
            });
        } else { document.exitFullscreen(); }
    },

    // --- NUEVO: Funciones del Editor de Offset Visual ---
    openOffsetEditor(frameId) {
        const frame = AppState.getFlattenedFrames().find(f => f.id === frameId);
        if (!frame) {
            UIManager.showToast('No se encontró el frame para editar.', 'danger');
            return;
        }

        const state = this.offsetEditorState;
        state.isOpen = true;
        state.targetFrameId = frameId;
        state.initialOffset = { ...frame.offset };
        state.tempOffset = { ...frame.offset };

        // Usar el tamaño unificado si está definido, si no, el tamaño máximo de todos los frames
        const allFrames = AppState.getFlattenedFrames();
        const inputW = parseInt(DOM.unifyWidthInput.value, 10);
        const inputH = parseInt(DOM.unifyHeightInput.value, 10);
        const targetW = isNaN(inputW) || inputW <= 0 ? Math.max(...allFrames.map(f => f.rect.w)) : inputW;
        const targetH = isNaN(inputH) || inputH <= 0 ? Math.max(...allFrames.map(f => f.rect.h)) : inputH;
        
        state.canvasSize = { w: targetW, h: targetH };

        // Configurar el modal
        DOM.offsetEditorTitle.textContent = `Editar Posición: ${frame.name}`;
        DOM.offsetEditorModal.classList.remove('hidden');

        DOM.offsetEditorCanvasWidthInput.value = Math.round(state.canvasSize.w);
        DOM.offsetEditorCanvasHeightInput.value = Math.round(state.canvasSize.h);

        // Configurar el canvas
        const canvas = DOM.offsetEditorCanvas;
        const maxCanvasDim = 400; // Límite para que no sea gigante
        const scale = Math.min(maxCanvasDim / state.canvasSize.w, maxCanvasDim / state.canvasSize.h);
        canvas.width = state.canvasSize.w * scale;
        canvas.height = state.canvasSize.h * scale;
        
        this.drawOffsetEditorCanvas();
        this.updateOffsetEditorInputs();
    },

    closeOffsetEditor() {
        this.offsetEditorState.isOpen = false;
        DOM.offsetEditorModal.classList.add('hidden');
    },

    drawOffsetEditorCanvas() {
        const state = this.offsetEditorState;
        if (!state.isOpen || !state.canvasSize.w || !state.canvasSize.h) return;

        const frame = AppState.getFlattenedFrames().find(f => f.id === state.targetFrameId);
        if (!frame) return;

        const canvas = DOM.offsetEditorCanvas;
        const ctx = canvas.getContext('2d');
        const scale = (state.canvasSize.w > 0) ? (canvas.width / state.canvasSize.w) : 1;

        // 1. Limpiar y dibujar fondo
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#444'; // Un fondo oscuro para contraste
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Dibujar el sprite
        const { x, y, w, h } = frame.rect;
        const drawW = w * scale;
        const drawH = h * scale;
        // La posición de dibujado es el offset temporal, escalado
        const drawX = state.tempOffset.x * scale;
        const drawY = state.tempOffset.y * scale;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(DOM.imageDisplay, x, y, w, h, drawX, drawY, drawW, drawH);

        // 3. Dibujar el borde del lienzo de animación
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.setLineDash([]);
    },

    updateOffsetEditorInputs(round = false) {
        const state = this.offsetEditorState;
        if (round) {
            state.tempOffset.x = parseFloat(state.tempOffset.x.toFixed(1));
            state.tempOffset.y = parseFloat(state.tempOffset.y.toFixed(1));
        }
        DOM.offsetEditorXInput.value = state.tempOffset.x;
        DOM.offsetEditorYInput.value = state.tempOffset.y;
    },

    updateOffsetEditorFromInputs() {
        const state = this.offsetEditorState;
        if (!state.isOpen) return;

        // Actualizar tamaño de lienzo desde los inputs
        state.canvasSize.w = parseInt(DOM.offsetEditorCanvasWidthInput.value, 10) || 0;
        state.canvasSize.h = parseInt(DOM.offsetEditorCanvasHeightInput.value, 10) || 0;
        
        // Actualizar offset desde los inputs
        state.tempOffset.x = parseFloat(DOM.offsetEditorXInput.value) || 0;
        state.tempOffset.y = parseFloat(DOM.offsetEditorYInput.value) || 0;

        this.drawOffsetEditorCanvas();
    },

    saveOffsetChanges() {
        const state = this.offsetEditorState;
        if (!state.targetFrameId) return;

        // Aplicar el offset final
        AppState.subFrameOffsets[state.targetFrameId] = { ...state.tempOffset };
        
        HistoryManager.saveGlobalState();
        this.updateAll(false);
        this.openFrameInspector(); // Refrescar el inspector para ver el cambio
        this.closeOffsetEditor();
        UIManager.showToast('Posición del frame actualizada.', 'success');
    },

    unifyFromEditor() {
        const state = this.offsetEditorState;
        if (!state.isOpen) return;

        // Transferir valores del modal al inspector principal
        DOM.unifyWidthInput.value = state.canvasSize.w;
        DOM.unifyHeightInput.value = state.canvasSize.h;

        this.closeOffsetEditor();
        this.unifyFrameSizes(); // Esta función ya tiene su propio diálogo de confirmación
    },

    inspectorAddAllToClip() {
        const clip = AppState.getActiveClip();
        if (!clip) { UIManager.showToast('No hay un clip activo seleccionado.', 'warning'); return; }

        const allFrameIds = AppState.getFlattenedFrames().map(f => f.id);
        const currentFrameIds = new Set(clip.frameIds);
        allFrameIds.forEach(id => currentFrameIds.add(id));
        clip.frameIds = Array.from(currentFrameIds);

        this.openFrameInspector(); // Re-render inspector to show changes
        this.updateAll(true);
        UIManager.showToast(`Todos los frames añadidos a "${clip.name}".`, 'success');
    },

    inspectorRemoveAllFromClip() {
        const clip = AppState.getActiveClip();
        if (!clip) { UIManager.showToast('No hay un clip activo seleccionado.', 'warning'); return; }
        clip.frameIds = [];
        this.openFrameInspector(); // Re-render inspector
        this.updateAll(true);
        UIManager.showToast(`Todos los frames quitados de "${clip.name}".`, 'success');
    },

    unifyFrameSizes() {
        const allFrames = AppState.getFlattenedFrames();
        if (allFrames.length === 0) {
            UIManager.showToast('No hay frames para unificar.', 'warning');
            return;
        }

        // Esta acción ya no es destructiva, pero es bueno confirmar la sobreescritura de los offsets.
        if (!confirm('Esto ajustará los offsets de TODOS los frames para que tengan un tamaño de lienzo consistente. Los offsets manuales existentes se sobrescribirán. Esta acción se puede deshacer (Ctrl+Z).\n\n¿Deseas continuar?')) {
            return;
        }

        const inputW = parseInt(DOM.unifyWidthInput.value, 10);
        const inputH = parseInt(DOM.unifyHeightInput.value, 10);

        // --- NUEVO: Obtener la alineación seleccionada ---
        const alignY = DOM.frameInspectorPanel.querySelector('#unify-align-y .active').dataset.align;
        const alignX = DOM.frameInspectorPanel.querySelector('#unify-align-x .active').dataset.align;

        // Determinar el tamaño objetivo: entrada del usuario o el tamaño máximo de los frames en la animación.
        const targetW = isNaN(inputW) || inputW <= 0 ? Math.max(...allFrames.map(f => f.rect.w)) : inputW;
        const targetH = isNaN(inputH) || inputH <= 0 ? Math.max(...allFrames.map(f => f.rect.h)) : inputH;

        // Esta es ahora una operación no destructiva que funciona para TODOS los tipos de frames.
        allFrames.forEach(frame => {
            const { w, h } = frame.rect;

            // --- MODIFICADO: Calcular offsets según la alineación ---
            let offsetX, offsetY;

            // Cálculo de Offset X (Horizontal)
            switch (alignX) {
                case 'left':
                    offsetX = 0;
                    break;
                case 'right':
                    offsetX = targetW - w;
                    break;
                case 'center':
                default:
                    offsetX = (targetW - w) / 2;
                    break;
            }

            // Cálculo de Offset Y (Vertical)
            switch (alignY) {
                case 'top':
                    offsetY = 0;
                    break;
                case 'bottom':
                    offsetY = targetH - h;
                    break;
                case 'center':
                default:
                    offsetY = (targetH - h) / 2;
                    break;
            }

            // Almacenar el offset calculado. Se usará para la previsualización y exportación de la animación.
            AppState.subFrameOffsets[frame.id] = { x: offsetX, y: offsetY };
        });

        HistoryManager.saveGlobalState(); // Guardar el nuevo estado en el historial.
        this.updateAll(false); // Actualizar toda la UI.
        this.closeFrameInspector(); // Cerrar el inspector para ver el cambio en la previsualización.
        UIManager.showToast(`Tamaño de animación unificado a ${targetW}x${targetH}px (vía offsets).`, 'success');
    },

    alignFramesByOffset(alignMode = 'center') {
        const animFrames = AppState.getAnimationFrames();
        if (animFrames.length === 0) { UIManager.showToast('No hay frames en el clip activo para alinear.', 'warning'); return; }
        
        const maxWidth = Math.max(...animFrames.map(f => f.rect.w));
        const maxHeight = Math.max(...animFrames.map(f => f.rect.h));

        animFrames.forEach(frame => {
            let offsetX = 0, offsetY = 0;
            const { w, h } = frame.rect;

            if (alignMode.includes('left')) { offsetX = 0; } 
            else if (alignMode.includes('right')) { offsetX = maxWidth - w; } 
            else { offsetX = (maxWidth - w) / 2; } // center

            if (alignMode.includes('top')) { offsetY = 0; } 
            else if (alignMode.includes('bottom')) { offsetY = maxHeight - h; } 
            else { offsetY = (maxHeight - h) / 2; } // middle or center

            AppState.subFrameOffsets[frame.id] = { x: offsetX, y: offsetY };
        });

        HistoryManager.saveGlobalState();
        this.updateAll(false);
        UIManager.showToast(`Frames alineados (offset) a: ${alignMode}.`, 'success');
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