// --- Módulo de la Interfaz de Usuario ---
// Gestiona todas las actualizaciones del DOM que no son del canvas.

import { DOM } from './1_dom.js';
import { AppState } from './2_appState.js';
import { HistoryManager } from './3_historyManager.js';

const UIManager = (() => {
    return {
        highlightSyntax(str, lang) {
            const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            str = esc(str);
            if (lang === 'json') return str.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (m) => /:$/.test(m) ? `<span class="token-key">${m.slice(0,-1)}</span>:` : `<span class="token-string">${m}</span>`).replace(/([{}[\](),:])/g, '<span class="token-punctuation">$&</span>');
            if (lang === 'html') return str.replace(/(&lt;\/?)([^&gt;\s]+)/g, `$1<span class="token-tag">$2</span>`).replace(/([a-z-]+)=(&quot;.*?&quot;)/g, `<span class="token-attr-name">$1</span>=<span class="token-attr-value">$2</span>`);
            if (lang === 'css') return str.replace(/\/\*[\s\S]*?\*\//g, '<span class="token-comment">$&</span>').replace(/([a-zA-Z-]+)(?=:)/g, '<span class="token-property">$&</span>').replace(/(body|h1|@keyframes|\.stage|\.sprite-container|\.ground)/g, '<span class="token-selector">$&</span>');
            return str;
        },
        showToast(message, type = 'success') {
            DOM.toast.textContent = message;
            DOM.toast.style.backgroundColor = `var(--${type})`;
            DOM.toast.style.bottom = '20px';
            setTimeout(() => { DOM.toast.style.bottom = '-100px'; }, 2500);
        },
        showLoader(message = "Procesando...") {
            DOM.loadingOverlay.querySelector('p').textContent = message;
            DOM.loadingOverlay.classList.remove('hidden');
        },
        hideLoader() {
            DOM.loadingOverlay.classList.add('hidden');
        },
        setControlsEnabled(enabled) {
            DOM.allControls.forEach(el => el.id !== 'image-loader' && el.parentElement.id !== 'drop-zone' && (el.disabled = !enabled));
            HistoryManager.updateButtons();
        },
        updateFramesList() {
            DOM.framesList.innerHTML = '';
            const activeClip = AppState.getActiveClip();
            const allFrames = AppState.getFlattenedFrames();
            if (allFrames.length === 0) {
                DOM.framesList.innerHTML = `<li style="text-align:center; padding:10px;">No hay frames definidos.</li>`;
                return;
            };
            allFrames.forEach(f => {
                const li = document.createElement('li');
                const isChecked = activeClip?.frameIds.includes(f.id);
                li.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} data-frame-id="${f.id}"> F${f.id}: ${f.name} (${f.rect.w}x${f.rect.h})`;
                DOM.framesList.appendChild(li);
            });
        },
        updateClipsSelect() {
            const prevId = AppState.activeClipId;
            DOM.clipsSelect.innerHTML = '';

            // --- CORRECCIÓN --- Se rompe el bucle infinito aquí
            // Si hay frames pero no clips, crea uno directamente en el estado.
            if (AppState.clips.length === 0 && AppState.getFlattenedFrames().length > 0) {
                const defaultClip = { id: Date.now(), name: "Default", frameIds: [] };
                AppState.clips.push(defaultClip);
                AppState.activeClipId = defaultClip.id;
            }

            AppState.clips.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                DOM.clipsSelect.appendChild(opt);
            });

            if (AppState.clips.find(c => c.id === prevId)) {
                DOM.clipsSelect.value = prevId;
            } else if (AppState.clips.length > 0) {
                DOM.clipsSelect.value = AppState.clips[0].id;
            }

            AppState.activeClipId = DOM.clipsSelect.value ? parseInt(DOM.clipsSelect.value) : null;
            if (!AppState.activeClipId && AppState.clips.length > 0) {
                AppState.activeClipId = AppState.clips[0].id;
            }

            const animFramesExist = AppState.getAnimationFrames().length > 0;
            DOM.playPauseButton.disabled = !animFramesExist;
            DOM.firstFrameButton.disabled = !animFramesExist;
            DOM.lastFrameButton.disabled = !animFramesExist;
            DOM.fpsSlider.disabled = !animFramesExist;
            DOM.fpsValue.textContent = DOM.fpsSlider.value;
        },
        updateJsonOutput() {
            const format = DOM.jsonFormatSelect.value;
            let out;
            const framesData = AppState.getFlattenedFrames();
            const meta = {
                app: "Sprite Sheet Suite v4.3",
                image: AppState.currentFileName,
                size: { w: DOM.canvas.width, h: DOM.canvas.height },
                clips: AppState.clips.map(c => ({ name: c.name, frames: c.frameIds }))
            };
            switch (format) {
                case 'phaser3':
                    out = { frames: framesData.reduce((acc, f) => { acc[f.name] = { frame: f.rect, spriteSourceSize: { x: 0, y: 0, ...f.rect }, sourceSize: f.rect }; return acc; }, {}), meta };
                    break;
                case 'godot':
                     out = { frames: framesData.reduce((acc, f) => { acc[f.name] = { frame: f.rect, source_size: { w: f.rect.w, h: f.rect.h }, sprite_source_size: { x: 0, y: 0, ...f.rect } }; return acc; }, {}), meta };
                    break;
                default:
                    out = { meta, frames: framesData };
                    break;
            }
            const jsonString = JSON.stringify(out, null, 2);
            DOM.jsonOutput.innerHTML = this.highlightSyntax(jsonString, 'json');
            DOM.jsonLineNumbers.innerHTML = Array.from({ length: jsonString.split('\n').length }, (_, i) => `<span>${i+1}</span>`).join('');
        },
        updateAll() {
            this.updateClipsSelect();
            this.updateFramesList();
            this.updateJsonOutput();
            HistoryManager.updateButtons();
        }
    };
})();

export { UIManager };