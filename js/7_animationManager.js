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
 
        const animFrames = AppState.getAnimationFrames();
        if (animFrames.length === 0) return;
 
        // --- LÓGICA DE CENTRADO MEJORADA ---
        // 1. Calcular el bounding box de toda la animación, relativo al punto de anclaje (0,0)
        const animBBox = {
            minX: Math.min(...animFrames.map(f => -f.offset.x)),
            minY: Math.min(...animFrames.map(f => -f.offset.y)),
            maxX: Math.max(...animFrames.map(f => -f.offset.x + f.rect.w)),
            maxY: Math.max(...animFrames.map(f => -f.offset.y + f.rect.h)),
        };
        const animWidth = animBBox.maxX - animBBox.minX;
        const animHeight = animBBox.maxY - animBBox.minY;
 
        // 2. Calcular la escala para que toda la animación quepa en el canvas
        const scale = Math.min(1, DOM.previewCanvas.width / animWidth, DOM.previewCanvas.height / animHeight);
 
        // 3. Calcular el desplazamiento para centrar el bounding box de la animación
        const canvasOffsetX = (DOM.previewCanvas.width - animWidth * scale) / 2;
        const canvasOffsetY = (DOM.previewCanvas.height - animHeight * scale) / 2;
 
        // 4. Calcular la posición de dibujado para el frame actual
        const { x, y, w, h } = frame.rect;
        const drawW = w * scale;
        const drawH = h * scale;
        const drawX = canvasOffsetX + (-frame.offset.x - animBBox.minX) * scale;
        const drawY = canvasOffsetY + (-frame.offset.y - animBBox.minY) * scale;
        
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