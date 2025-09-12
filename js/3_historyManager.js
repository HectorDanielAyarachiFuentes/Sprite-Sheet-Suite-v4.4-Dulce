// --- Módulo de Historial (Undo/Redo) ---
// Encapsula toda la lógica para manejar las pilas de historial.

import { AppState } from './2_appState.js';
import { SessionManager } from './9_sessionManager.js';
import { DOM } from './1_dom.js';
import { App } from './main.js';

// Variables privadas del módulo usando un IIFE (Immediately Invoked Function Expression)
const HistoryManager = (() => {
    let historyStack = [],
        historyIndex = -1;
    let localHistoryStack = [],
        localHistoryIndex = -1,
        localHistoryFrameId = null;

    const updateButtons = () => {
        const localUndo = localHistoryIndex > 0;
        const localRedo = localHistoryIndex < localHistoryStack.length - 1;
        const globalUndo = historyIndex > 0;
        const globalRedo = historyIndex < historyStack.length - 1;
        DOM.undoButton.disabled = !localUndo && !globalUndo;
        DOM.redoButton.disabled = !localRedo && !globalRedo;
    };

    const loadState = (stateString) => {
        const state = JSON.parse(stateString);
        AppState.frames = state.frames;
        AppState.clips = state.clips;
        AppState.activeClipId = state.activeClipId;
        AppState.subFrameOffsets = state.subFrameOffsets || {};
        AppState.selectedFrameId = null;
        AppState.selectedSubFrameId = null;
        localHistoryStack = [];
        localHistoryIndex = -1;
        localHistoryFrameId = null;
        App.updateAll(false);
        SessionManager.saveCurrent();
    };

    return {
        updateButtons,
        saveGlobalState: () => {
            historyStack = historyStack.slice(0, historyIndex + 1);
            historyStack.push(JSON.stringify({
                frames: AppState.frames,
                clips: AppState.clips,
                activeClipId: AppState.activeClipId,
                subFrameOffsets: AppState.subFrameOffsets
            }));
            historyIndex++;
            localHistoryStack = [];
            localHistoryIndex = -1;
            updateButtons();
            SessionManager.saveCurrent();
        },
        saveLocalState: () => {
            const frame = AppState.frames.find(f => f.id === AppState.selectedFrameId);
            if (!frame) return;
            if (localHistoryFrameId !== AppState.selectedFrameId) {
                localHistoryStack = [];
                localHistoryIndex = -1;
                localHistoryFrameId = AppState.selectedFrameId;
            }
            localHistoryStack = localHistoryStack.slice(0, localHistoryIndex + 1);
            localHistoryStack.push(JSON.stringify({
                hSlices: frame.hSlices,
                vSlices: frame.vSlices
            }));
            localHistoryIndex++;
            updateButtons();
            SessionManager.saveCurrent();
        },
        undo: () => {
            if (localHistoryIndex > 0) {
                localHistoryIndex--;
                const frame = AppState.frames.find(f => f.id === localHistoryFrameId);
                const state = JSON.parse(localHistoryStack[localHistoryIndex]);
                if (frame) {
                    frame.hSlices = state.hSlices;
                    frame.vSlices = state.vSlices;
                }
                App.updateAll(false);
                SessionManager.saveCurrent();
            } else if (historyIndex > 0) {
                historyIndex--;
                loadState(historyStack[historyIndex]);
            }
        },
        redo: () => {
            if (localHistoryIndex < localHistoryStack.length - 1) {
                localHistoryIndex++;
                const frame = AppState.frames.find(f => f.id === localHistoryFrameId);
                const state = JSON.parse(localHistoryStack[localHistoryIndex]);
                if (frame) {
                    frame.hSlices = state.hSlices;
                    frame.vSlices = state.vSlices;
                }
                App.updateAll(false);
                SessionManager.saveCurrent();
            } else if (historyIndex < historyStack.length - 1) {
                historyIndex++;
                loadState(historyStack[historyIndex]);
            }
        },
        getHistoryState: () => ({
            historyStack,
            historyIndex
        }),
        setHistoryState: (state) => {
            historyStack = state.historyStack || [];
            historyIndex = state.historyIndex === undefined ? -1 : state.historyIndex;
        },
        reset: () => {
            historyStack = [];
            historyIndex = -1;
            localHistoryStack = [];
            localHistoryIndex = -1;
            localHistoryFrameId = null;
            updateButtons();
        }
    };
})();

export { HistoryManager };