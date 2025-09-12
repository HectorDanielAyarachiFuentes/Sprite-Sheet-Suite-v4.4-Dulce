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

// --- Objeto Principal de la Aplicación ---
export const App = {
    isReloadingFromStorage: false,
    isModifyingImage: false,
    modificationMessage: null,

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
        if (AppState.frames.length === 0) {
            UIManager.showToast('No hay frames definidos para recortar.', 'warning');
            return;
        }

        if (!confirm('¡ACCIÓN DESTRUCTIVA!\n\nEsto recortará la hoja de sprites para que se ajuste solo a los frames definidos. La nueva imagen se descargará y reemplazará a la actual en la aplicación.\n\n¿Deseas continuar?')) {
            return;
        }

        UIManager.showLoader('Recortando hoja de sprites...');
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            // 1. Calcular el bounding box de todos los frames.
            const allFrames = AppState.frames;
            if (allFrames.length === 0) throw new Error("No hay frames para calcular el área de recorte.");

            const bBox = {
                minX: Math.min(...allFrames.map(f => f.rect.x)),
                minY: Math.min(...allFrames.map(f => f.rect.y)),
                maxX: Math.max(...allFrames.map(f => f.rect.x + f.rect.w)),
                maxY: Math.max(...allFrames.map(f => f.rect.y + f.rect.h))
            };

            const newWidth = bBox.maxX - bBox.minX;
            const newHeight = bBox.maxY - bBox.minY;

            if (newWidth <= 0 || newHeight <= 0) throw new Error("El área de recorte es inválida.");

            // 2. Crear un nuevo canvas y dibujar la porción recortada.
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = newWidth;
            tempCanvas.height = newHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(DOM.imageDisplay, bBox.minX, bBox.minY, newWidth, newHeight, 0, 0, newWidth, newHeight);
            const newImageURL = tempCanvas.toDataURL('image/png');

            // 3. Iniciar la descarga de la nueva imagen.
            const link = document.createElement('a');
            link.href = newImageURL;
            link.download = `trimmed_${AppState.currentFileName}`;
            document.body.appendChild(link); // Necesario para Firefox
            link.click();
            document.body.removeChild(link); // Limpiar el DOM

            // 4. Actualizar las coordenadas de todos los frames.
            AppState.frames.forEach(frame => {
                frame.rect.x -= bBox.minX;
                frame.rect.y -= bBox.minY;
            });

            // 5. Actualizar la imagen principal y el estado.
            this.isModifyingImage = true;
            this.modificationMessage = 'Hoja de sprites recortada. La nueva imagen se ha descargado y ahora se usa en la aplicación.';
            AppState.currentFileName = `trimmed_${AppState.currentFileName}`;
            DOM.imageDisplay.src = newImageURL;

        } catch (error) {
            console.error("Error recortando la hoja de sprites:", error);
            UIManager.showToast('Ocurrió un error al recortar la imagen.', 'danger');
            UIManager.hideLoader();
        }
    },

    // --- NUEVO: Funciones del Inspector de Frames ---
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
            dimensions.textContent = currentSize;
            if (mostCommonSize && currentSize !== mostCommonSize) {
                dimensions.classList.add('mismatch');
                dimensions.title = `Difiere del tamaño más común (${mostCommonSize})`;
            }

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
        const animFrames = AppState.getAnimationFrames();
        if (animFrames.length > 0) {
            const maxWidth = Math.max(...animFrames.map(f => f.rect.w));
            const maxHeight = Math.max(...animFrames.map(f => f.rect.h));
            
            DOM.recommendedSizeText.textContent = `${maxWidth} x ${maxHeight}px`;
            DOM.useRecommendedSizeBtn.dataset.w = maxWidth;
            DOM.useRecommendedSizeBtn.dataset.h = maxHeight;
            DOM.unifySizeRecommendation.style.display = 'flex';
        } else {
            DOM.unifySizeRecommendation.style.display = 'none';
        }
    },

    closeFrameInspector() { DOM.frameInspectorPanel.classList.add('hidden'); },

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
        const animFrames = AppState.getAnimationFrames();
        if (animFrames.length === 0) {
            UIManager.showToast('No hay frames en el clip activo para unificar.', 'warning');
            return;
        }

        // Esta acción ya no es destructiva, pero es bueno confirmar la sobreescritura de los offsets.
        if (!confirm('Esto ajustará los offsets de todos los frames en el clip para que la animación tenga un tamaño consistente. Los offsets manuales existentes se sobrescribirán. Esta acción se puede deshacer (Ctrl+Z).\n\n¿Deseas continuar?')) {
            return;
        }

        const inputW = parseInt(DOM.unifyWidthInput.value, 10);
        const inputH = parseInt(DOM.unifyHeightInput.value, 10);

        // Determinar el tamaño objetivo: entrada del usuario o el tamaño máximo de los frames en la animación.
        const targetW = isNaN(inputW) || inputW <= 0 ? Math.max(...animFrames.map(f => f.rect.w)) : inputW;
        const targetH = isNaN(inputH) || inputH <= 0 ? Math.max(...animFrames.map(f => f.rect.h)) : inputH;

        // Esta es ahora una operación no destructiva que funciona para TODOS los tipos de frames.
        animFrames.forEach(frame => {
            const { w, h } = frame.rect;

            // Calcular el offset para centrar el frame dentro de las dimensiones objetivo.
            const offsetX = (targetW - w) / 2;
            const offsetY = (targetH - h) / 2;

            // Almacenar el offset calculado. Se usará para la previsualización y exportación de la animación.
            AppState.subFrameOffsets[frame.id] = { x: Math.round(offsetX), y: Math.round(offsetY) };
        });

        HistoryManager.saveGlobalState(); // Guardar el nuevo estado en el historial.
        this.updateAll(false); // Actualizar toda la UI.
        this.closeFrameInspector(); // Cerrar el inspector para mostrar el resultado en el lienzo principal.
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

            AppState.subFrameOffsets[frame.id] = { x: Math.round(offsetX), y: Math.round(offsetY) };
        });

        HistoryManager.saveGlobalState();
        this.updateAll(false);
        UIManager.showToast(`Frames alineados (offset) a: ${alignMode}.`, 'success');
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