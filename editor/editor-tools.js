/**
 * Toggles the active state of a tool (e.g., crop, annotate, text, arrow).
 * Deactivates other mutually exclusive tools.
 * @param {'crop' | 'annotate' | 'text' | 'arrow'} tool - The name of the tool to toggle.
 */
export function toggleTool(tool) {
    // Prevent activating other tools during initial crop mode
    if (this.cropOnlyMode && tool !== 'crop') {
        console.warn("Cannot activate other tools while in initial crop mode.");
        return;
    }
     // Prevent re-clicking crop tool during initial crop mode
     if (this.cropOnlyMode && tool === 'crop') {
        this.showToast("Drag on the image to select crop area.", false, 'info');
        return;
     }

    const toolElement = document.getElementById(`${tool}Tool`);
    if (!toolElement || toolElement.style.display === 'none') {
        console.warn(`Tool element for ${tool} not found or is hidden.`);
        return;
    }

    // Define mutually exclusive drawing/interaction tools
    const drawingTools = ['crop', 'annotate', 'text', 'arrow']; // Added 'arrow'
    const otherDrawingTools = drawingTools.filter(t => t !== tool);

    // If trying to activate a tool while actively editing text, finalize text first.
    if (this.isEditingText) {
        console.log("Finalizing text input before switching tool.");
        this.finalizeTextInput();
    }
    // If trying to activate a tool while actively drawing an arrow, cancel it first.
    if (this.isDrawing && this.activeTools.has('arrow') && tool !== 'arrow') {
        console.log("Canceling arrow drawing before switching tool.");
        this.cancelArrowDrawing(); // Use the new cancel function
    }


    // If the clicked tool is already active, deactivate it.
    if (this.activeTools.has(tool)) {
        console.log(`Deactivating tool: ${tool}`);
        this.activeTools.delete(tool);
        toolElement.classList.remove('active');
        // Reset specific state flags when deactivating
        if (tool === 'text') this.isAddingText = false;
        if (tool === 'arrow') this.isAddingArrow = false;

        // Reset cursor only if NO other drawing tool remains active
        const anyDrawingToolActive = drawingTools.some(t => this.activeTools.has(t));
        if (!anyDrawingToolActive && this.canvas) {
            this.canvas.style.cursor = 'default';
        }

        // If deactivating crop, redraw to remove guides
        if (tool === 'crop') {
            this.redrawCanvas();
        }

    } else {
        // --- Activate the selected tool ---
        console.log(`Activating tool: ${tool}`);

        // Deactivate other conflicting drawing tools first
        otherDrawingTools.forEach(otherTool => {
            if (this.activeTools.has(otherTool)) {
                console.log(`Deactivating conflicting tool: ${otherTool}`);
                this.activeTools.delete(otherTool);
                const otherElement = document.getElementById(`${otherTool}Tool`);
                if (otherElement) otherElement.classList.remove('active');
                // Reset flags for deactivated tools
                if (otherTool === 'text') this.isAddingText = false;
                if (otherTool === 'arrow') this.isAddingArrow = false;
            }
        });

        // Now activate the selected tool
        this.activeTools.add(tool);
        toolElement.classList.add('active');

        // Set cursor and provide feedback
        if (tool === 'crop' || tool === 'annotate') {
             if (this.canvas) this.canvas.style.cursor = 'crosshair';
             this.showToast(tool === 'crop' ? "Drag to select crop area." : "Click and drag to draw rectangles.", false, 'info');
        } else if (tool === 'text') {
            if (this.canvas) this.canvas.style.cursor = 'text'; // Use text cursor
            this.isAddingText = true; // Set flag to wait for click
            this.showToast("Click on the image to add text.", false, 'info');
        } else if (tool === 'arrow') { // Arrow Activation
             if (this.canvas) this.canvas.style.cursor = 'crosshair';
             this.isAddingArrow = true; // Set flag to wait for click/drag
             this.showToast("Click and drag to draw an arrow.", false, 'info');
        }
    }
}

/**
 * Finalizes the crop operation based on the selected area.
 * Extracts the cropped section from the original high-resolution image.
 * Updates the main and offscreen canvases to the cropped, high-res data.
 * Adjusts positions AND SIZES of existing elements.
 * Exits cropOnlyMode if active.
 */
export async function completeCrop() {
    // Ensure prerequisites are met
    if (!this.cropStart || !this.cropEnd || !this.activeTools.has('crop') || !this.originalImage || !this.offscreenCanvas) {
        console.warn("completeCrop prerequisites not met.");
        this.resetCropState();
        return;
    }

    // Store dimensions before cropping
    const currentDisplayWidth = this.offscreenCanvas.width;
    const currentDisplayHeight = this.offscreenCanvas.height;
    if (currentDisplayWidth === 0 || currentDisplayHeight === 0) {
         this.showToast("Error: Invalid canvas dimensions before crop.", false, 'error');
         this.resetCropState();
         return;
    }

    // Calculate crop rectangle relative to display canvas
    const displayStartX = Math.min(this.cropStart.x, this.cropEnd.x);
    const displayStartY = Math.min(this.cropStart.y, this.cropEnd.y);
    const displayCropWidth = Math.max(1, Math.round(Math.abs(this.cropEnd.x - this.cropStart.x)));
    const displayCropHeight = Math.max(1, Math.round(Math.abs(this.cropEnd.y - this.cropStart.y)));

    // Clamp selection to display canvas bounds
    const clampedStartX = Math.max(0, Math.min(displayStartX, currentDisplayWidth));
    const clampedStartY = Math.max(0, Math.min(displayStartY, currentDisplayHeight));
    const clampedWidth = Math.max(1, Math.min(displayCropWidth, currentDisplayWidth - clampedStartX));
    const clampedHeight = Math.max(1, Math.min(displayCropHeight, currentDisplayHeight - clampedStartY));

    console.log(`Crop selection on display canvas: x=${clampedStartX}, y=${clampedStartY}, w=${clampedWidth}, h=${clampedHeight}`);

    if (clampedWidth <= 1 || clampedHeight <= 1) {
        this.showToast("Crop area is too small.", false, 'error');
        this.resetCropState();
        return;
    }

    try {
        // Calculate scaling factors
        const scaleX = this.originalImage.naturalWidth / currentDisplayWidth;
        const scaleY = this.originalImage.naturalHeight / currentDisplayHeight;

        // Calculate and clamp source rectangle on original image
        const sourceX = Math.round(clampedStartX * scaleX);
        const sourceY = Math.round(clampedStartY * scaleY);
        const sourceWidth = Math.round(clampedWidth * scaleX);
        const sourceHeight = Math.round(clampedHeight * scaleY);
        const clampedSourceX = Math.max(0, Math.min(sourceX, this.originalImage.naturalWidth));
        const clampedSourceY = Math.max(0, Math.min(sourceY, this.originalImage.naturalHeight));
        const clampedSourceWidth = Math.max(1, Math.min(sourceWidth, this.originalImage.naturalWidth - clampedSourceX));
        const clampedSourceHeight = Math.max(1, Math.min(sourceHeight, this.originalImage.naturalHeight - clampedSourceY));
        console.log(`Cropping from original image: x=${clampedSourceX}, y=${clampedSourceY}, w=${clampedSourceWidth}, h=${clampedSourceHeight}`);

        // Resize editor canvases
        const newCanvasWidth = clampedSourceWidth;
        const newCanvasHeight = clampedSourceHeight;
        this.canvas.width = newCanvasWidth;
        this.canvas.height = newCanvasHeight;
        this.offscreenCanvas.width = newCanvasWidth;
        this.offscreenCanvas.height = newCanvasHeight;

        // Draw cropped high-res section to offscreen canvas
        this.offscreenCtx.imageSmoothingEnabled = false;
        this.offscreenCtx.clearRect(0, 0, newCanvasWidth, newCanvasHeight);
        this.offscreenCtx.drawImage(
            this.originalImage,
            clampedSourceX, clampedSourceY, clampedSourceWidth, clampedSourceHeight,
            0, 0, newCanvasWidth, newCanvasHeight
        );
        console.log("Drew high-res cropped section to offscreen canvas.");

        // Adjust annotation elements (rectangles)
        this.annotationElements = this.annotationElements
            .map(element => {
                const originalElementX = element.x * scaleX;
                const originalElementY = element.y * scaleY;
                const originalElementWidth = element.width * scaleX;
                const originalElementHeight = element.height * scaleY;
                const newX = originalElementX - clampedSourceX;
                const newY = originalElementY - clampedSourceY;
                const newWidth = originalElementWidth;
                const newHeight = originalElementHeight;
                return { ...element, x: Math.round(newX), y: Math.round(newY), width: Math.round(newWidth), height: Math.round(newHeight) };
            })
            .filter(element => {
                const elementRight = element.x + element.width;
                const elementBottom = element.y + element.height;
                return elementRight > 0 && elementBottom > 0 && element.x < newCanvasWidth && element.y < newCanvasHeight;
            });

        // Adjust text elements (position only)
         this.textElements = this.textElements
            .map(element => {
                 const originalElementX = element.x * scaleX;
                 const originalElementY = element.y * scaleY;
                 const newX = originalElementX - clampedSourceX;
                 const newY = originalElementY - clampedSourceY;
                 return { ...element, x: Math.round(newX), y: Math.round(newY) };
            })
            .filter(element => {
                 // Keep text slightly outside bounds to handle text partially visible
                 return element.x < newCanvasWidth + 10 && element.y < newCanvasHeight + 10 && element.x > -500 && element.y > -50;
            });

        // Adjust arrow elements
        this.arrowElements = this.arrowElements
            .map(element => {
                const originalX1 = element.x1 * scaleX;
                const originalY1 = element.y1 * scaleY;
                const originalX2 = element.x2 * scaleX;
                const originalY2 = element.y2 * scaleY;
                const newX1 = originalX1 - clampedSourceX;
                const newY1 = originalY1 - clampedSourceY;
                const newX2 = originalX2 - clampedSourceX;
                const newY2 = originalY2 - clampedSourceY;
                // Head size remains the same absolute pixel value for now
                return { ...element, x1: Math.round(newX1), y1: Math.round(newY1), x2: Math.round(newX2), y2: Math.round(newY2) };
            })
            .filter(element => {
                // Keep if either endpoint is somewhat within the new canvas bounds
                const isP1Visible = element.x1 > -20 && element.x1 < newCanvasWidth + 20 && element.y1 > -20 && element.y1 < newCanvasHeight + 20;
                const isP2Visible = element.x2 > -20 && element.x2 < newCanvasWidth + 20 && element.y2 > -20 && element.y2 < newCanvasHeight + 20;
                return isP1Visible || isP2Visible;
            });

        console.log(`Adjusted/Scaled/Filtered elements. Annotations: ${this.annotationElements.length}, Text: ${this.textElements.length}, Arrows: ${this.arrowElements.length}`);

        // Update cached canvas rect
        this.updateCanvasRect();

        // Handle mode transition and user feedback
        if (this.cropOnlyMode) {
            document.querySelectorAll('.tool-item').forEach(tool => { if(tool.id !== 'spinner') tool.style.display = 'flex'; });
            const cropToolElement = document.getElementById('cropTool');
            // Make crop tool visible again, but not active
            if (cropToolElement) { cropToolElement.style.display = 'flex'; cropToolElement.classList.remove('active'); }
            this.cropOnlyMode = false;
            try { if(chrome.storage) await chrome.storage.local.set({ cropOnlyMode: false }); } catch(e){ console.warn("Storage update failed", e)}
            this.activeTools.clear(); // Clear active tools set after crop-only mode
            this.showToast('Crop complete. Editing tools enabled.', false, 'success');
        } else {
            this.showToast('Crop applied.', false, 'success');
            const cropToolElement = document.getElementById('cropTool');
            if (cropToolElement) cropToolElement.classList.remove('active');
            this.activeTools.delete('crop');
        }

    } catch (error) {
        console.error("Error during crop finalization:", error);
        this.showToast(`Crop failed: ${error.message}`, false, 'error');
        this.redrawCanvas(); // Attempt redraw on error
    } finally {
        this.resetCropState(); // Reset selection state and redraw final result
        this.showSpinner(false);
    }
}


/**
 * Helper function to reset cropping state and redraw canvas.
 */
export function resetCropState() {
    this.cropStart = null;
    this.cropEnd = null;
    if (this.canvas) {
        // Determine appropriate cursor
        let newCursor = 'default';
        if (this.activeTools.has('text')) newCursor = 'text';
        else if (this.activeTools.has('crop') || this.activeTools.has('annotate') || this.activeTools.has('arrow')) newCursor = 'crosshair'; // Added arrow
        this.canvas.style.cursor = newCursor;
        // Redraw to remove guides and show current elements
        this.redrawCanvas();
    }
 }

/**
 * Copies the current canvas content to the clipboard as a PNG image.
 */
export async function copyToClipboard() {
    if (this.isEditingText) { this.finalizeTextInput(); }
    if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
        this.showToast("Cannot copy empty image.", false, 'error'); return; }
    if (this.isDrawing && this.activeTools.has('crop')) {
        this.showToast("Finalize cropping before copying.", false, 'warning'); return; }
    if (this.isDrawing && this.activeTools.has('arrow')) {
        this.cancelArrowDrawing(); // Cancel active arrow drawing
    }

    this.showSpinner(true);
    this.showToast('Preparing image for clipboard...', true, 'info');
    try {
        if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
            throw new Error('Clipboard API (write with ClipboardItem) is not supported.'); }
        if (!document.hasFocus()) { console.warn("Document focus lost, clipboard write might fail."); }

        // NOTE: This action is directly initiated by the user clicking the 'Copy' button.
        const finalCanvas = this.prepareFinalCanvas();
        const blob = await new Promise((resolve, reject) => {
            finalCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed.')), 'image/png', 1.0);
        });
        await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
        this.showToast('Screenshot copied to clipboard!', false, 'success');
    } catch (error) {
        console.error('Copy to clipboard failed:', error);
        this.showToast(`Copy failed: ${error.message || 'Unknown error'}`, false, 'error');
    } finally {
        this.showSpinner(false);
    }
}

/**
 * Saves the current canvas content as a PNG image file.
 */
export async function saveImage() {
     if (this.isEditingText) { this.finalizeTextInput(); }
     if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
        this.showToast("Cannot save empty image.", false, 'error'); return; }
     if (this.isDrawing && this.activeTools.has('crop')) {
         this.showToast("Finalize cropping before saving.", false, 'warning'); return; }
     if (this.isDrawing && this.activeTools.has('arrow')) {
         this.cancelArrowDrawing(); // Cancel active arrow drawing
     }

     this.showSpinner(true);
     this.showToast('Preparing image for download...', true, 'info');
     try {
         const finalCanvas = this.prepareFinalCanvas();
         const dataUrl = finalCanvas.toDataURL('image/png', 1.0);
         const { saveLocation } = await chrome.storage.sync.get({ saveLocation: 'SnipScreen_Captures' });
         const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z','');
         const sanitizedSaveLocation = saveLocation.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_\-\/]/g, '_');
         const filename = `${sanitizedSaveLocation}/SnipScreen-${timestamp}.png`;

         console.log(`Attempting to download to: ${filename}`);
         await this.tryDownload(dataUrl, filename, 0); // Reduced retries to 0 unless specific need
         this.showToast('Screenshot saved successfully!', false, 'success');
     } catch (error) {
         console.error('Save image failed:', error);
            if (error.message.includes('USER_CANCELED')) { this.showToast('Save cancelled by user.', false, 'info'); }
            else if (error.message.includes('INVALID_FILENAME')) { this.showToast(`Save failed: Invalid path "${error.filename}".`, false, 'error'); }
            else { this.showToast(`Save failed: ${error.message || 'Unknown error'}`, false, 'error'); }
     } finally {
         this.showSpinner(false);
     }
 }

/**
 * Attempts to download a file using chrome.downloads.download with retries.
 */
export async function tryDownload(url, filename, retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
          const downloadId = await chrome.downloads.download({ url: url, filename: filename, saveAs: false });
          console.log(`Download started with ID: ${downloadId}`);
          return; // Success
      } catch (error) {
        console.warn(`Download attempt ${attempt + 1} failed:`, error.message);
        if (attempt === retries) {
            const finalError = new Error(`Download failed after ${retries + 1} attempts: ${error.message}`);
            finalError.filename = filename; throw finalError;
        }
        // Only wait if retrying
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 300 + attempt * 200));
        }
      }
    }
 }

/**
 * Cancels the current arrow drawing operation.
 */
export function cancelArrowDrawing() {
    if (!this.isDrawing || !this.activeTools.has('arrow')) return;

    console.log("Canceling arrow drawing operation.");
    this.isDrawing = false;
    this.arrowStart = null;
    this.arrowEnd = null;

    // Restore canvas from before preview if possible
    if (this.lastImageDataBeforeArrow) {
        try {
            this.ctx.putImageData(this.lastImageDataBeforeArrow, 0, 0);
        } catch (error) {
            console.error("Error restoring canvas state after arrow cancel:", error);
            this.redrawCanvas(); // Fallback
        }
    } else {
        this.redrawCanvas(); // Fallback redraw
    }
    this.lastImageDataBeforeArrow = null; // Clear preview data

    // Reset cursor (assuming arrow tool is still technically active)
    if (this.canvas) this.canvas.style.cursor = 'crosshair';

    // Optional: Show toast?
    // this.showToast("Arrow drawing cancelled.", false, 'info');
}