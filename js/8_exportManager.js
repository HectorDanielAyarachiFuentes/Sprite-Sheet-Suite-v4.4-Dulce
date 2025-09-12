// --- Módulo de Exportación ---
// Contiene toda la lógica para exportar frames y animaciones en diferentes formatos.

import { DOM } from './1_dom.js';
import { AppState } from './2_appState.js';
import { UIManager } from './4_uiManager.js';

const ExportManager = (() => {

    const generateCssAnimationCode = (animFrames, scale) => {
        if (animFrames.length === 0) return { htmlCode: '', cssCode: '' };

        // --- LÓGICA DE TAMAÑO DE ESCENARIO MEJORADA ---
        // 1. Calcular el bounding box de toda la animación para definir el tamaño del escenario.
        const animBBox = {
            minX: Math.min(...animFrames.map(f => -f.offset.x)),
            minY: Math.min(...animFrames.map(f => -f.offset.y)),
            maxX: Math.max(...animFrames.map(f => -f.offset.x + f.rect.w)),
            maxY: Math.max(...animFrames.map(f => -f.offset.y + f.rect.h)),
        };
        const stageW = Math.round(animBBox.maxX - animBBox.minX);
        const stageH = Math.round(animBBox.maxY - animBBox.minY);

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
            // 2. Calcular la traslación relativa al bounding box de la animación.
            const translateX = Math.round(-frame.offset.x - animBBox.minX);
            const translateY = Math.round(-frame.offset.y - animBBox.minY);
            return `    ${percentage.toFixed(2)}% { width: ${w}px; height: ${h}px; background-position: -${x}px -${y}px; transform: translate(${translateX}px, ${translateY}px); }`;
        }).join('\n');

        // --- CORRECCIÓN ---
        // El keyframe del 100% debe ser una copia del último frame para que se mantenga hasta el final,
        // antes de que la animación se reinicie en el primer frame.
        const lastFrame = animFrames[animFrames.length - 1];
        const lastTranslateX = Math.round(-lastFrame.offset.x - animBBox.minX);
        const lastTranslateY = Math.round(-lastFrame.offset.y - animBBox.minY);

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
    /* Escala el escenario para verlo mejor */
    transform: scale(${scale});
    transform-origin: center center;
}

/* El sprite es un contenedor del tamaño del escenario */
.sprite {
    width: ${stageW}px;
    height: ${stageH}px;
    position: relative;
    overflow: hidden; /* Para que los frames no se salgan del escenario */
}

/* Usamos un pseudo-elemento para el sprite real, para poder posicionarlo */
.sprite::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    /* El tamaño inicial se basa en el primer frame de la animación */
    width: ${animFrames[0].rect.w}px;
    height: ${animFrames[0].rect.h}px;
    /* La imagen de fondo es la hoja de sprites completa.
       Se asume que la imagen está en la misma carpeta que el HTML/CSS. */
    background-image: url('${AppState.currentFileName}');
    background-repeat: no-repeat;
    
    /* Mantiene los píxeles nítidos */
    image-rendering: pixelated;
    image-rendering: crisp-edges;

    /* Aplicación de la animación */
    animation: play ${duration}s steps(1, end) infinite;
}

/* Definición de los pasos de la animación */
@keyframes play {
${keyframesSteps}
    100% { width: ${lastFrame.rect.w}px; height: ${lastFrame.rect.h}px; background-position: -${lastFrame.rect.x}px -${lastFrame.rect.y}px; transform: translate(${lastTranslateX}px, ${lastTranslateY}px); }
}`;

        return { htmlCode, cssCode };
    };

    return {
        init() {
            DOM.exportZipButton.addEventListener('click', () => this.exportZip(true));
            DOM.exportGifButton.addEventListener('click', () => this.exportGif(true));
            DOM.exportCodeButton.addEventListener('click', () => this.exportCode());

            // Listener para las nuevas opciones de exportación de GIF
            DOM.gifTransparentBg.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                DOM.gifBgColor.disabled = isChecked;
                DOM.gifBgColorGroup.style.display = isChecked ? 'none' : 'flex';
            });
            // Forzar estado inicial al cargar la página
            DOM.gifBgColor.disabled = DOM.gifTransparentBg.checked;
            DOM.gifBgColorGroup.style.display = DOM.gifTransparentBg.checked ? 'none' : 'flex';

            // Listeners para el tamaño del GIF y el bloqueo de proporción
            DOM.gifWidthInput.addEventListener('input', () => {
                if (!DOM.gifAspectRatioLock.checked) return;
                const aspectRatio = AppState.getAnimationAspectRatio();
                const newWidth = parseInt(DOM.gifWidthInput.value, 10);
                if (!isNaN(newWidth) && aspectRatio > 0) {
                    const newHeight = Math.round(newWidth / aspectRatio);
                    if (newHeight > 0) DOM.gifHeightInput.value = newHeight;
                }
            });

            DOM.gifHeightInput.addEventListener('input', () => {
                if (!DOM.gifAspectRatioLock.checked) return;
                const aspectRatio = AppState.getAnimationAspectRatio();
                const newHeight = parseInt(DOM.gifHeightInput.value, 10);
                if (!isNaN(newHeight) && aspectRatio > 0) {
                    const newWidth = Math.round(newHeight * aspectRatio);
                    if (newWidth > 0) DOM.gifWidthInput.value = newWidth;
                }
            });
            
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

        async exportZip(showLoader = true) {
            const animFrames = AppState.getAnimationFrames();
            if (animFrames.length === 0) {
                UIManager.showToast('No hay frames en el clip activo para exportar.', 'warning');
                return;
            }
            if (showLoader) UIManager.showLoader('Generando ZIP de frames alineados...');

            try {
                if (typeof JSZip === 'undefined') {
                    throw new Error('La librería JSZip no está cargada. Revisa el script en index.html.');
                }
                const zip = new JSZip();
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.imageSmoothingEnabled = false; // Mantener píxeles nítidos

                // 1. Calcular el bounding box de la animación para que todos los frames tengan el mismo tamaño.
                const animBBox = {
                    minX: Math.min(...animFrames.map(f => -f.offset.x)),
                    minY: Math.min(...animFrames.map(f => -f.offset.y)),
                    maxX: Math.max(...animFrames.map(f => -f.offset.x + f.rect.w)),
                    maxY: Math.max(...animFrames.map(f => -f.offset.y + f.rect.h)),
                };
                const canvasW = animBBox.maxX - animBBox.minX;
                const canvasH = animBBox.maxY - animBBox.minY;

                tempCanvas.width = canvasW;
                tempCanvas.height = canvasH;

                for (const frame of animFrames) {
                    // 2. Limpiar el canvas y dibujar el frame en su posición alineada.
                    tempCtx.clearRect(0, 0, canvasW, canvasH);
                    const drawX = -frame.offset.x - animBBox.minX;
                    const drawY = -frame.offset.y - animBBox.minY;

                    tempCtx.drawImage(DOM.imageDisplay, frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h, drawX, drawY, frame.rect.w, frame.rect.h);
                    
                    // 3. Añadir el canvas (con el frame alineado) al ZIP.
                    const blob = await new Promise(res => tempCanvas.toBlob(res, 'image/png'));
                    zip.file(`${frame.name || `frame_${frame.id}`}.png`, blob);
                }

                const content = await zip.generateAsync({ type: "blob" });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `${AppState.currentFileName.split('.')[0]}_frames.zip`;
                link.click();
                URL.revokeObjectURL(link.href);
                if (showLoader) UIManager.showToast('Frames del clip exportados con éxito.', 'success');
            } catch (error) {
                console.error("Error exporting ZIP:", error);
                UIManager.showToast('Error al exportar frames ZIP.', 'danger');
            } finally {
                if (showLoader) UIManager.hideLoader();
            }
        },

        exportGif(showLoader = true) {
            const animFrames = AppState.getAnimationFrames();
            if (animFrames.length === 0) {
                UIManager.showToast("No hay frames en el clip activo para exportar.", 'warning');
                return;
            }
            if (showLoader) UIManager.showLoader('Generando GIF...');

            // Comprobación de seguridad para la librería GIF
            if (typeof GIF === 'undefined') {
                UIManager.showToast('La librería GIF no se cargó correctamente.', 'danger');
                console.error("GIF library is not defined. Check the script tag in index.html and internet connection.");
                UIManager.hideLoader();
                return;
            }

            try {
                const isTransparent = DOM.gifTransparentBg.checked;
                const bgColor = DOM.gifBgColor.value;
                const gifWidth = parseInt(DOM.gifWidthInput.value, 10) || 128;
                const gifHeight = parseInt(DOM.gifHeightInput.value, 10) || 128;
                // --- LÓGICA DE CÁLCULO DE TAMAÑO MEJORADA ---
                // 1. Calcular el bounding box de toda la animación para un tamaño consistente.
                const animBBox = {
                    minX: Math.min(...animFrames.map(f => -f.offset.x)),
                    minY: Math.min(...animFrames.map(f => -f.offset.y)),
                    maxX: Math.max(...animFrames.map(f => -f.offset.x + f.rect.w)),
                    maxY: Math.max(...animFrames.map(f => -f.offset.y + f.rect.h)),
                };
                const animWidth = animBBox.maxX - animBBox.minX;
                const animHeight = animBBox.maxY - animBBox.minY;

                // 2. Calcular la escala para cada eje. Esto permite estirar si la proporción no se mantiene.
                // --- CORRECCIÓN: Calcular una escala única para mantener la proporción ---
                const scale = Math.min(gifWidth / animWidth, gifHeight / animHeight);
                const scaledAnimWidth = animWidth * scale;
                const scaledAnimHeight = animHeight * scale;

                // Calcular offsets para centrar la animación dentro del canvas del GIF
                const canvasOffsetX = (gifWidth - scaledAnimWidth) / 2;
                const canvasOffsetY = (gifHeight - scaledAnimHeight) / 2;

                const gifOptions = {
                    workers: 2,
                    quality: 10,
                    workerScript: 'js/gif.worker.js',
                    transparent: isTransparent ? 0xFF00FF : null,
                    width: gifWidth,
                    height: gifHeight
                };

                const gif = new GIF(gifOptions);
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tempCanvas.width = gifWidth;
                tempCanvas.height = gifHeight;

                // Para un look pixel-perfect, deshabilitamos el suavizado.
                tempCtx.imageSmoothingEnabled = false;

                animFrames.forEach(frame => {
                    const { x, y, w, h } = frame.rect;

                    // 1. Preparar el fondo del canvas para este frame.
                    if (isTransparent) {
                        // Limpiar el canvas para que el fondo sea transparente antes de dibujar el sprite.
                        tempCtx.clearRect(0, 0, gifWidth, gifHeight);
                    } else {
                        // Rellenar con el color de fondo elegido para aplanar la transparencia del PNG.
                        tempCtx.fillStyle = bgColor;
                        tempCtx.fillRect(0, 0, gifWidth, gifHeight);
                    }

                    // 2. Calcular la posición y tamaño del sprite DENTRO del canvas del GIF.
                    const drawW = w * scale;
                    const drawH = h * scale;
                    const drawX = canvasOffsetX + (-frame.offset.x - animBBox.minX) * scale;
                    const drawY = canvasOffsetY + (-frame.offset.y - animBBox.minY) * scale;

                    // 3. Dibujar el sprite en el canvas.
                    tempCtx.drawImage(DOM.imageDisplay, x, y, w, h, drawX, drawY, drawW, drawH);

                    if (isTransparent) {
                        // 4. Para transparencia, procesar píxeles para evitar el contorno magenta.
                        const imageData = tempCtx.getImageData(0, 0, gifWidth, gifHeight);
                        const data = imageData.data;
                        const alphaThreshold = 10; // Umbral de alfa para considerar un píxel como transparente.

                        for (let i = 0; i < data.length; i += 4) {
                            if (data[i + 3] < alphaThreshold) {
                                // Convertir a magenta y hacerlo opaco. gif.js usará este color como la clave de transparencia.
                                // Hacerlo opaco evita que el canvas o la librería se confundan con píxeles "magenta transparentes".
                                data[i] = 255;     // R
                                data[i + 1] = 0;   // G
                                data[i + 2] = 255; // B
                                data[i + 3] = 255; // A (Hacer opaco)
                            }
                        }
                        gif.addFrame(imageData, { copy: true, delay: 1000 / AppState.animation.fps });
                    } else {
                        // 4. Si tiene fondo sólido, el canvas ya está listo para ser añadido.
                        gif.addFrame(tempCanvas, { copy: true, delay: 1000 / AppState.animation.fps });
                    }
                });

                gif.on('finished', (blob) => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `${AppState.currentFileName.split('.')[0]}_${AppState.getActiveClip().name}.gif`;
                    link.click();
                    URL.revokeObjectURL(link.href);
                    if (showLoader) UIManager.showToast('GIF exportado con éxito.', 'success');
                    if (showLoader) UIManager.hideLoader();
                });
                
                gif.on('progress', (p) => {
                    if (showLoader) UIManager.showLoader(`Generando GIF: ${Math.round(p * 100)}%`);
                });

                gif.render();
            } catch (error) {
                console.error("Error exporting GIF:", error);
                UIManager.showToast('Error al exportar GIF.', 'danger');
                if (showLoader) UIManager.hideLoader();
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
        },

        async downloadCodeAsZip() {
            const animFrames = AppState.getAnimationFrames();
            if (animFrames.length === 0) return;

            if (typeof JSZip === 'undefined') {
                throw new Error('La librería JSZip no está cargada.');
            }

            const scale = parseFloat(DOM.exportScaleInput.value) || 2;
            const { htmlCode, cssCode } = generateCssAnimationCode(animFrames, scale);

            const zip = new JSZip();
            zip.file("index.html", htmlCode);
            zip.file("style.css", cssCode);

            // Obtener la imagen como blob y añadirla al zip
            const imageBlob = await fetch(DOM.imageDisplay.src).then(res => res.blob());
            zip.file(AppState.currentFileName, imageBlob);

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `${AppState.currentFileName.split('.')[0]}_code.zip`;
            link.click();
            URL.revokeObjectURL(link.href);
        },

        downloadJson() {
            const format = DOM.jsonFormatSelect.value;
            const jsonString = UIManager.getJsonString(format);
            if (!jsonString || jsonString.trim() === '{}') {
                return;
            }

            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${AppState.currentFileName.split('.')[0]}_${format}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
        },

        async exportAllFormats() {
            UIManager.showToast('Iniciando exportación múltiple...', 'info');
            UIManager.showLoader('Exportando todos los formatos...');
            try {
                // La imagen recortada ya se descarga desde trimSpritesheet.
                await this.exportZip(false);
                await this.downloadCodeAsZip();
                this.downloadJson();
                this.exportGif(false);
                UIManager.showToast('Todas las exportaciones han comenzado.', 'success');
            } catch (error) {
                console.error("Error en exportación múltiple:", error);
                UIManager.showToast('Ocurrió un error durante la exportación múltiple.', 'danger');
            } finally {
                UIManager.hideLoader();
            }
        }
    };
})();

export { ExportManager };