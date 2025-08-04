/**
 * Toggles the active state of a tool (e.g., crop, annotate, text, arrow).
 * Deactivates other mutually exclusive tools.
 * @param {'crop' | 'annotate' | 'text' | 'arrow'} tool - The name of the tool to toggle.
 */
export function toggleTool(tool) {
  // Prevent activating other tools during initial crop mode
  if (this.state.cropOnlyMode && tool !== 'crop') {
    console.warn("Cannot activate other tools while in initial crop mode.");
    return;
  }
  
  // Prevent re-clicking crop tool during initial crop mode
  if (this.state.cropOnlyMode && tool === 'crop') {
    this.showToast("Drag on the image to select crop area.", false, 'info');
    return;
  }

  const toolElement = document.getElementById(`${tool}Tool`);
  if (!toolElement || toolElement.style.display === 'none') {
    console.warn(`Tool element for ${tool} not found or is hidden.`);
    return;
  }

  // Define mutually exclusive drawing/interaction tools
  const drawingTools = ['crop', 'annotate'];
  const otherDrawingTools = drawingTools.filter(t => t !== tool);

  // If the clicked tool is already active, deactivate it.
  if (this.isToolActive(tool)) {
    console.log(`Deactivating tool: ${tool}`);
    this.setToolActive(tool, false);
    
    // Animate tool deactivation
    toolElement.classList.remove('active');
    this.animateToolActivation(tool, false);
    
    // Reset cursor only if NO other drawing tool remains active
    const anyDrawingToolActive = drawingTools.some(t => this.isToolActive(t));
    if (!anyDrawingToolActive && this.canvas) {
      this.canvas.style.cursor = 'default';
      // Reset canvas transform
      this.canvas.style.transform = '';
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
      if (this.isToolActive(otherTool)) {
        console.log(`Deactivating conflicting tool: ${otherTool}`);
        this.setToolActive(otherTool, false);
        const otherElement = document.getElementById(`${otherTool}Tool`);
        if (otherElement) {
          otherElement.classList.remove('active');
          this.animateToolActivation(otherTool, false);
        }
      }
    });

    // Now activate the selected tool
    this.setToolActive(tool, true);
    toolElement.classList.add('active');
    
    // Animate tool activation
    this.animateToolActivation(tool, true);

    // Set cursor and provide feedback
    if (tool === 'crop' || tool === 'annotate') {
      if (this.canvas) {
        this.canvas.style.cursor = 'crosshair';
        // Add subtle canvas feedback
        this.canvas.style.transform = 'translateY(-1px) scale(1.002)';
      }
      this.showToast(tool === 'crop' ? "Drag to select crop area." : "Click and drag to draw rectangles.", false, 'info');
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
  if (!this.drawingState.cropStart || !this.drawingState.cropEnd || !this.isToolActive('crop') || !this.canvasState.originalImage || !this.offscreenCanvas) {
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
  const displayStartX = Math.min(this.drawingState.cropStart.x, this.drawingState.cropEnd.x);
  const displayStartY = Math.min(this.drawingState.cropStart.y, this.drawingState.cropEnd.y);
  const displayCropWidth = Math.max(1, Math.round(Math.abs(this.drawingState.cropEnd.x - this.drawingState.cropStart.x)));
  const displayCropHeight = Math.max(1, Math.round(Math.abs(this.drawingState.cropEnd.y - this.drawingState.cropStart.y)));

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
    const scaleX = this.canvasState.originalImage.naturalWidth / currentDisplayWidth;
    const scaleY = this.canvasState.originalImage.naturalHeight / currentDisplayHeight;

    // Calculate and clamp source rectangle on original image
    const sourceX = Math.round(clampedStartX * scaleX);
    const sourceY = Math.round(clampedStartY * scaleY);
    const sourceWidth = Math.round(clampedWidth * scaleX);
    const sourceHeight = Math.round(clampedHeight * scaleY);
    const clampedSourceX = Math.max(0, Math.min(sourceX, this.canvasState.originalImage.naturalWidth));
    const clampedSourceY = Math.max(0, Math.min(sourceY, this.canvasState.originalImage.naturalHeight));
    const clampedSourceWidth = Math.max(1, Math.min(sourceWidth, this.canvasState.originalImage.naturalWidth - clampedSourceX));
    const clampedSourceHeight = Math.max(1, Math.min(sourceHeight, this.canvasState.originalImage.naturalHeight - clampedSourceY));
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
      this.canvasState.originalImage,
      clampedSourceX, clampedSourceY, clampedSourceWidth, clampedSourceHeight,
      0, 0, newCanvasWidth, newCanvasHeight
    );
    console.log("Drew high-res cropped section to offscreen canvas.");

    // Adjust annotation elements (rectangles)
    this.elements.annotationElements = this.elements.annotationElements
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

    console.log("Adjusted annotation elements for crop.");

    // Update canvas rectangle cache
    this.updateCanvasRect();
    this.redrawCanvas();
    this.showToast("Crop completed successfully!", false, 'success');
    this.animateToolActivation('crop', false);
    this.setToolActive('crop', false);

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
  this.drawingState.cropStart = null;
  this.drawingState.cropEnd = null;
  if (this.canvas) {
    // Determine appropriate cursor
    let newCursor = 'default';
    if (this.isToolActive('crop') || this.isToolActive('annotate')) newCursor = 'crosshair';
    this.canvas.style.cursor = newCursor;
    // Reset canvas transform
    this.canvas.style.transform = '';
    // Redraw to remove guides and show current elements
    this.redrawCanvas();
  }
}

/**
 * Copies the current canvas content to the clipboard as a PNG image.
 */
export async function copyToClipboard() {
  if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
    this.showToast("Cannot copy empty image.", false, 'error'); 
    return; 
  }
  if (this.state.isDrawing && this.isToolActive('crop')) {
    this.showToast("Finalize cropping before copying.", false, 'warning'); 
    return; 
  }

  this.showSpinner(true);
  this.showToast('Preparing high-quality image for clipboard...', true, 'info');
  
  // Add visual feedback
  this.pulseAnimation('shareTool');
  
  try {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Clipboard API (write with ClipboardItem) is not supported.'); 
    }
    if (!document.hasFocus()) { 
      console.warn("Document focus lost, clipboard write might fail."); 
    }

    // NOTE: This action is directly initiated by the user clicking the 'Copy' button.
    const finalCanvas = this.prepareFinalCanvas();
    
    // Create high-quality blob with maximum quality settings
    const blob = await new Promise((resolve, reject) => {
      finalCanvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed.')), 
        'image/png', 
        1.0 // Maximum quality
      );
    });
    
    // Ensure the blob has the correct MIME type
    const highQualityBlob = new Blob([blob], { type: 'image/png' });
    
    await navigator.clipboard.write([ 
      new ClipboardItem({ 
        'image/png': highQualityBlob 
      }) 
    ]);
    
    this.showToast('High-quality screenshot copied to clipboard!', false, 'success');
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
  if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
    this.showToast("Cannot save empty image.", false, 'error'); 
    return; 
  }
  if (this.state.isDrawing && this.isToolActive('crop')) {
    this.showToast("Finalize cropping before saving.", false, 'warning'); 
    return; 
  }

  this.showSpinner(true);
  this.showToast('Preparing image for download...', true, 'info');
  
  // Add visual feedback
  this.pulseAnimation('saveTool');
  
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
    if (error.message.includes('USER_CANCELED')) { 
      this.showToast('Save cancelled by user.', false, 'info'); 
    }
    else if (error.message.includes('INVALID_FILENAME')) { 
      this.showToast(`Save failed: Invalid path "${error.filename}".`, false, 'error'); 
    }
    else { 
      this.showToast(`Save failed: ${error.message || 'Unknown error'}`, false, 'error'); 
    }
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
        finalError.filename = filename; 
        throw finalError;
      }
      // Only wait if retrying
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 300 + attempt * 200));
      }
    }
  }
}

