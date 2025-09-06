// --- Módulo de Animación ---
// Se encarga de la lógica de reproducción en el panel de previsualización.

import { DOM, CTX } from './1_dom.js';
import { AppState } from './2_appState.js';

const AnimationManager = (() => {
    // La función del bucle de animación es privada para el módulo
    const animationLoop = (timestamp) => {
        if (!AppState.animation.isPlaying) return;

        const elapsed = timestamp - AppState.animation.lastTime;
        const animFrames = AppState.getAnimationFrames();

        if (elapsed > 1000 / AppState.animation.fps && animFrames.length > 0) {
            AppState.animation.lastTime = timestamp;
            drawFrameInPreview(animFrames[AppState.animation.currentFrameIndex]);
            AppState.animation.currentFrameIndex = (AppState.animation.currentFrameIndex + 1) % animFrames.length;
        }
        AppState.animation.animationFrameId = requestAnimationFrame(animationLoop);
    };
    
    // La función de dibujado también es privada
    const drawFrameInPreview = (frame) => {
        CTX.preview.clearRect(0, 0, DOM.previewCanvas.width, DOM.previewCanvas.height);
        if (!frame || !DOM.imageDisplay.complete || DOM.imageDisplay.naturalWidth === 0) return;

        const { x, y, w, h } = frame.rect;
        const scale = Math.min(DOM.previewCanvas.width / w, DOM.previewCanvas.height / h);
        const drawW = w * scale;
        const drawH = h * scale;
        const drawX = (DOM.previewCanvas.width - drawW) / 2;
        const drawY = (DOM.previewCanvas.height - drawH) / 2;
        
        // Desactiva el suavizado de imagen para mantener el estilo pixel art
        CTX.preview.imageSmoothingEnabled = false;
        CTX.preview.drawImage(DOM.imageDisplay, x, y, w, h, drawX, drawY, drawW, drawH);
    };
    
    // Objeto público del módulo
    return {
        init() {
            DOM.playPauseButton.addEventListener('click', () => this.toggleAnimation());
            DOM.fpsSlider.addEventListener('input', (e) => {
                AppState.animation.fps = parseInt(e.target.value);
                DOM.fpsValue.textContent = e.target.value;
            });
            DOM.firstFrameButton.addEventListener('click', () => {
                if (AppState.animation.isPlaying) this.toggleAnimation();
                AppState.animation.currentFrameIndex = 0;
                drawFrameInPreview(AppState.getAnimationFrames()[0]);
            });
            DOM.lastFrameButton.addEventListener('click', () => {
                if (AppState.animation.isPlaying) this.toggleAnimation();
                const animFrames = AppState.getAnimationFrames();
                AppState.animation.currentFrameIndex = animFrames.length > 0 ? animFrames.length - 1 : 0;
                drawFrameInPreview(animFrames[AppState.animation.currentFrameIndex]);
            });
        },

        toggleAnimation() {
            AppState.animation.isPlaying = !AppState.animation.isPlaying;
            if (AppState.animation.isPlaying && AppState.getAnimationFrames().length > 0) {
                DOM.playPauseButton.textContent = '⏸️';
                AppState.animation.lastTime = performance.now();
                animationLoop(AppState.animation.lastTime);
            } else {
                DOM.playPauseButton.textContent = '▶️';
                cancelAnimationFrame(AppState.animation.animationFrameId);
            }
        },

        reset() {
            if (AppState.animation.isPlaying) {
                this.toggleAnimation(); // Esto detiene el bucle y cambia el botón
            }
            AppState.animation.currentFrameIndex = 0;
            const animFrames = AppState.getAnimationFrames();
            drawFrameInPreview(animFrames.length > 0 ? animFrames[0] : null);
        }
    };
})();

export { AnimationManager };