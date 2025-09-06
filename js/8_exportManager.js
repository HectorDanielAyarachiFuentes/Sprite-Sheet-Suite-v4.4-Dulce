// --- Módulo de Exportación ---
// Contiene toda la lógica para exportar frames y animaciones en diferentes formatos.

import { DOM } from './1_dom.js';
import { AppState } from './2_appState.js';
import { UIManager } from './4_uiManager.js';

const ExportManager = (() => {

    const generateCssAnimationCode = (animFrames, scale) => {
        const firstFrame = animFrames[0].rect;
        const frameCount = animFrames.length;
        const duration = ((1 / AppState.animation.fps) * frameCount).toFixed(2);

        const htmlCode = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Animación de Sprite</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="stage">
        <div class="sprite"></div>
    </div>
</body>
</html>`;

        let keyframesSteps = animFrames.map((frame, index) => {
            const { x, y, w, h } = frame.rect;
            const percentage = (index / frameCount) * 100;
            return `    ${percentage.toFixed(2)}% { width: ${w}px; height: ${h}px; background-position: -${x}px -${y}px; }`;
        }).join('\n');

        const cssCode = `/* Estilos para la página de demostración */
body {
    display: grid;
    place-content: center;
    min-height: 100vh;
    background-color: #2c3e50;
    margin: 0;
}

/* El "escenario" donde ocurre la animación */
.stage {
    padding: 2rem;
    background-color: #1a252f;
    border-radius: 8px;
    border: 2px solid #55687a;
}

/* El sprite con la animación */
.sprite {
    width: ${firstFrame.w}px;
    height: ${firstFrame.h}px;
    background-image: url('${AppState.currentFileName}');
    
    /* Mantiene los píxeles nítidos */
    image-rendering: pixelated;
    image-rendering: crisp-edges;

    /* Escala el sprite para verlo mejor */
    transform: scale(${scale});
    transform-origin: bottom center;

    /* Aplicación de la animación */
    animation: play ${duration}s steps(1) infinite;
}

/* Definición de los pasos de la animación */
@keyframes play {
${keyframesSteps}
    100% { width: ${firstFrame.w}px; height: ${firstFrame.h}px; background-position: -${firstFrame.x}px -${firstFrame.y}px; }
}`;

        return { htmlCode, cssCode };
    };

    return {
        init() {
            DOM.exportZipButton.addEventListener('click', () => this.exportZip());
            DOM.exportGifButton.addEventListener('click', () => this.exportGif());
            DOM.exportCodeButton.addEventListener('click', () => this.exportCode());
            
            // Listener para copiar código al portapapeles
            document.body.addEventListener('click', (e) => {
                if (e.target.classList.contains('copy-button')) {
                    const targetId = e.target.dataset.target;
                    const pre = document.getElementById(targetId);
                    if(pre) {
                       navigator.clipboard.writeText(pre.textContent).then(() => UIManager.showToast('¡Copiado al portapapeles!'));
                    }
                }
            });
        },

        async exportZip() {
            const allFrames = AppState.getFlattenedFrames();
            if (allFrames.length === 0) {
                UIManager.showToast('No hay frames para exportar.', 'warning');
                return;
            }
            UIManager.showLoader('Generando ZIP de frames...');

            try {
                const zip = new JSZip();
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');

                for (const frame of allFrames) {
                    tempCanvas.width = frame.rect.w;
                    tempCanvas.height = frame.rect.h;
                    tempCtx.drawImage(DOM.imageDisplay, frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h, 0, 0, frame.rect.w, frame.rect.h);
                    const blob = await new Promise(res => tempCanvas.toBlob(res, 'image/png'));
                    zip.file(`${frame.name || `frame_${frame.id}`}.png`, blob);
                }

                const content = await zip.generateAsync({ type: "blob" });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `${AppState.currentFileName.split('.')[0]}_frames.zip`;
                link.click();
                URL.revokeObjectURL(link.href);
                UIManager.showToast('Frames exportados con éxito.', 'success');
            } catch (error) {
                console.error("Error exporting ZIP:", error);
                UIManager.showToast('Error al exportar frames ZIP.', 'danger');
            } finally {
                UIManager.hideLoader();
            }
        },

        exportGif() {
            const animFrames = AppState.getAnimationFrames();
            if (animFrames.length === 0) {
                UIManager.showToast("No hay frames en el clip activo para exportar.", 'warning');
                return;
            }
            UIManager.showLoader('Generando GIF...');

            try {
                const gif = new GIF({
                    workers: 2,
                    quality: 10,
                    workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
                });
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                const maxSize = parseInt(DOM.maxGifSizeInput.value) || 128;

                animFrames.forEach(frame => {
                    const { x, y, w, h } = frame.rect;
                    let dW = w, dH = h;
                    if (w > maxSize || h > maxSize) {
                        if (w > h) { dW = maxSize; dH = (h / w) * maxSize; } 
                        else { dH = maxSize; dW = (w / h) * maxSize; }
                    }
                    tempCanvas.width = Math.round(dW);
                    tempCanvas.height = Math.round(dH);
                    tempCtx.drawImage(DOM.imageDisplay, x, y, w, h, 0, 0, tempCanvas.width, tempCanvas.height);
                    gif.addFrame(tempCanvas, { copy: true, delay: 1000 / AppState.animation.fps });
                });

                gif.on('finished', (blob) => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `${AppState.currentFileName.split('.')[0]}_${AppState.getActiveClip().name}.gif`;
                    link.click();
                    URL.revokeObjectURL(link.href);
                    UIManager.showToast('GIF exportado con éxito.', 'success');
                    UIManager.hideLoader();
                });
                
                gif.on('progress', (p) => {
                    UIManager.showLoader(`Generando GIF: ${Math.round(p * 100)}%`);
                });

                gif.render();
            } catch (error) {
                console.error("Error exporting GIF:", error);
                UIManager.showToast('Error al exportar GIF.', 'danger');
                UIManager.hideLoader();
            }
        },

        exportCode() {
            const animFrames = AppState.getAnimationFrames();
            if (animFrames.length === 0) {
                UIManager.showToast("Selecciona al menos un frame en el clip activo.", 'warning');
                return;
            }
            const scale = parseFloat(DOM.exportScaleInput.value) || 2;
            const { htmlCode, cssCode } = generateCssAnimationCode(animFrames, scale);

            DOM.htmlCodeOutput.innerHTML = UIManager.highlightSyntax(htmlCode, 'html');
            DOM.cssCodeOutput.innerHTML = UIManager.highlightSyntax(cssCode, 'css');

            const genLines = (c) => Array.from({ length: c.split('\n').length }, (_, i) => `<span>${i+1}</span>`).join('');
            DOM.htmlLineNumbers.innerHTML = genLines(htmlCode);
            DOM.cssLineNumbers.innerHTML = genLines(cssCode);

            const iframeContent = `<!DOCTYPE html><html><head><style>${cssCode}</style></head><body>${htmlCode.match(/<body>([\s\S]*)<\/body>/)[1]}</body></html>`;
            DOM.livePreviewIframe.srcdoc = iframeContent;

            DOM.codePreviewContainer.style.display = 'grid';
            UIManager.showToast('Código HTML/CSS generado.', 'success');
        }
    };
})();

export { ExportManager };