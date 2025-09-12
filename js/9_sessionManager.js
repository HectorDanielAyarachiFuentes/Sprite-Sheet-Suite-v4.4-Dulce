// --- Módulo de Sesión y Persistencia ---
// Guarda y carga el estado de la aplicación en el LocalStorage.

import { DOM } from './1_dom.js';
import { AppState } from './2_appState.js';
import { HistoryManager } from './3_historyManager.js';

const SessionManager = (() => {
    // Funciones privadas para manejar el historial de proyectos
    const getProjectHistory = () => JSON.parse(localStorage.getItem('spriteSheetHistory') || '[]');
    const saveProjectHistory = (history) => localStorage.setItem('spriteSheetHistory', JSON.stringify(history));

    return {
        init() {
            // Cargar la última sesión al iniciar y poblar el panel
            this.loadLast();
            this.updateHistoryPanel();
        },

        saveCurrent() {
            if (!DOM.imageDisplay.src || DOM.imageDisplay.src.startsWith('http')) return;
            const state = {
                imageSrc: DOM.imageDisplay.src,
                fileName: AppState.currentFileName,
                frames: AppState.frames,
                clips: AppState.clips,
                activeClipId: AppState.activeClipId,
                subFrameOffsets: AppState.subFrameOffsets,
                ...HistoryManager.getHistoryState()
            };
            localStorage.setItem('spriteSheetLastSession', JSON.stringify(state));
        },

        loadLast() {
            const savedState = localStorage.getItem('spriteSheetLastSession');
            if (savedState) {
                // En lugar de cargar el proyecto aquí, se lo pasamos al App principal.
                // Esto se hace para que el evento onload en main.js pueda manejar la recarga.
                const state = JSON.parse(savedState);
                if (state.imageSrc) {
                     // Simulamos una carga de proyecto
                    window.dispatchEvent(new CustomEvent('loadProjectState', { detail: state }));
                }
            }
        },
        
        addToHistory() {
            const id = Date.now();
            const thumbCanvas = document.createElement('canvas');
            const thumbCtx = thumbCanvas.getContext('2d');
            const thumbSize = 40;
            thumbCanvas.width = thumbSize; thumbCanvas.height = thumbSize;

            if (DOM.imageDisplay.naturalWidth > 0) {
                 thumbCtx.drawImage(DOM.imageDisplay, 0, 0, DOM.imageDisplay.naturalWidth, DOM.imageDisplay.naturalHeight, 0, 0, thumbSize, thumbSize);
            } else {
                 thumbCtx.fillStyle = '#333'; thumbCtx.fillRect(0,0,thumbSize, thumbSize);
            }
            const thumbSrc = thumbCanvas.toDataURL();
            const historyEntry = { id, name: AppState.currentFileName, thumb: thumbSrc };
            let history = getProjectHistory();
            history = history.filter(item => item.name !== AppState.currentFileName);
            history.unshift(historyEntry);
            if (history.length > 5) history.pop();
            saveProjectHistory(history);

            const fullState = {
                imageSrc: DOM.imageDisplay.src,
                fileName: AppState.currentFileName,
                frames: AppState.frames,
                clips: AppState.clips,
                activeClipId: AppState.activeClipId,
                subFrameOffsets: AppState.subFrameOffsets,
                ...HistoryManager.getHistoryState()
            };
            localStorage.setItem(`history_${id}`, JSON.stringify(fullState));
            this.updateHistoryPanel();
        },
        
        updateHistoryPanel() {
            const history = getProjectHistory();
            DOM.projectHistoryList.innerHTML = '';
            if (history.length === 0) {
                DOM.projectHistoryList.innerHTML = `<li class="no-projects" style="cursor: default; justify-content: center;">No hay proyectos recientes.</li>`;
                return;
            }
            history.forEach(item => {
                const li = document.createElement('li');
                li.dataset.historyId = item.id;
                li.innerHTML = `<img src="${item.thumb}" class="history-thumb" alt="thumb"><span class="history-name">${item.name}</span><button class="delete-history-btn" title="Eliminar">✖</button>`;
                DOM.projectHistoryList.appendChild(li);
            });
        },

        // --- AÑADIDO --- Función específica para borrar un item del historial
        deleteHistoryItem(id) {
            let history = getProjectHistory();
            history = history.filter(item => item.id != id);
            saveProjectHistory(history);
            localStorage.removeItem(`history_${id}`);
            this.updateHistoryPanel();
        }
    };
})();

export { SessionManager };