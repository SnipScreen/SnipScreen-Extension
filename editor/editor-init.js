/**
 * Performs initial cleanup when the editor is closing or unloading.
 */
export function cleanup() {
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['currentScreenshot', 'originalTab', 'cropOnlyMode'], () => {
        if (chrome.runtime.lastError) {
          console.warn('Error during cleanup storage removal:', chrome.runtime.lastError.message);
        } else {
          console.log('Temporary data cleared');
        }
      });
    }
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
  // Nullify properties safely
  this.ctx = null;
  this.canvas = null;
  this.offscreenCanvas = null;
  this.offscreenCtx = null;
  this.originalImage = null;

  // Clear element arrays
  this.annotationElements = [];
  this.textElements = [];
  this.arrowElements = [];
  this.selectedTextElement = null;
  this.movingTextElement = null;
  // REMOVED: this.movingArrowElement = null;
  this.isAddingText = false;
  this.isEditingText = false;
  this.isAddingArrow = false;

  // Clear UI elements / timeouts
  if (this.toastElement) { this.toastElement.remove(); this.toastElement = null; }
  if (this.toastTimeout) { clearTimeout(this.toastTimeout); this.toastTimeout = null; }
  if (this.textInputBlurTimeout) { clearTimeout(this.textInputBlurTimeout); this.textInputBlurTimeout = null; }
  this.lastImageDataBeforeArrow = null;

  // Remove event listeners
  if (typeof this.removeEditorEventListeners === 'function') {
      this.removeEditorEventListeners();
  } else { console.warn("removeEditorEventListeners function not found for cleanup."); }

  // Reset active tools set
  this.activeTools.clear();
}

// (... other functions in editor-init.js remain the same ...)

/**
 * Checks the mode (cropOnly or full editor) from storage and configures the UI accordingly.
 */
export async function checkMode() {
  try {
    const { cropOnlyMode } = await chrome.storage.local.get(['cropOnlyMode']);
    this.cropOnlyMode = !!cropOnlyMode; // Ensure boolean

    const cropTool = document.getElementById('cropTool');
    const spinnerTool = document.getElementById('spinner');

    if (this.cropOnlyMode) {
        console.log("Entering Crop Only Mode UI setup.");
        // Hide all tools initially except spinner (which is hidden by default)
        document.querySelectorAll('.tool-item').forEach(tool => {
            if(tool.id !== 'spinner') { tool.style.display = 'none'; }
        });
        // Explicitly show crop tool
        if (cropTool) {
            cropTool.style.display = 'flex';
            this.activeTools.add('crop');
            cropTool.classList.add('active');
            if (this.canvas) this.canvas.style.cursor = 'crosshair';
        } else { console.warn("Crop tool element not found during cropOnlyMode setup."); }
        if(spinnerTool) { spinnerTool.style.display = 'none'; }

    } else {
        console.log("Entering Full Editor Mode UI setup.");
        // Show all tools except spinner
        document.querySelectorAll('.tool-item').forEach(tool => {
            if (tool.id !== 'spinner') { tool.style.display = 'flex'; }
             else { tool.style.display = 'none'; } // Explicitly hide spinner
        });
        if (cropTool) { cropTool.classList.remove('active'); } // Ensure crop not active
        if (this.canvas) { this.canvas.style.cursor = 'default'; }
    }
  } catch (error) {
      console.error("Failed to check mode:", error);
      this.showToast(`Error setting up editor mode: ${error.message}`, false, 'error');
      // Default to non-crop mode on error, show all tools except spinner
      this.cropOnlyMode = false;
      document.querySelectorAll('.tool-item').forEach(tool => {
          if (tool.id !== 'spinner') { tool.style.display = 'flex'; }
           else { tool.style.display = 'none'; }
      });
      if (this.canvas) this.canvas.style.cursor = 'default';
  }
}

/**
 * Loads the screenshot image data from storage onto the canvas.
 */
export async function loadScreenshot() {
  try {
    const { currentScreenshot } = await chrome.storage.local.get(['currentScreenshot']);
    if (!currentScreenshot) { throw new Error('No screenshot data found in storage.'); }

    const img = new Image();
    img.onerror = (e) => {
        console.error('Image loading failed:', e);
        this.handleLoadFailure('Failed to load the screenshot image data.');
    };
    img.onload = () => {
      try {
        this.originalImage = img;
        const originalWidth = this.originalImage.naturalWidth;
        const originalHeight = this.originalImage.naturalHeight;
        console.log(`Original image loaded: ${originalWidth}x${originalHeight}`);

        const canvasWidth = originalWidth;
        const canvasHeight = originalHeight;
        console.log(`Setting canvas bitmap size to: ${canvasWidth}x${canvasHeight}`);

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.offscreenCanvas.width = canvasWidth;
        this.offscreenCanvas.height = canvasHeight;

        this.canvas.style.maxWidth = '100%';
        const toolbarElement = document.querySelector('.toolbar');
        this.toolbarHeight = toolbarElement ? toolbarElement.offsetHeight : 56;
        this.canvas.style.maxHeight = `calc(100vh - ${this.toolbarHeight + 48}px)`;
        this.canvas.style.width = 'auto';
        this.canvas.style.height = 'auto';

        this.offscreenCtx.imageSmoothingEnabled = false;
        this.offscreenCtx.clearRect(0,0, canvasWidth, canvasHeight);
        this.offscreenCtx.drawImage( this.originalImage, 0, 0 );

        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);

        this.updateCanvasRect();

        this.canvas.style.opacity = '0';
        requestAnimationFrame(() => {
          this.canvas.style.transition = 'opacity 0.3s ease-in-out';
          this.canvas.style.opacity = '1';
        });

        if (this.cropOnlyMode && this.activeTools.has('crop')) {
             if (this.canvas) this.canvas.style.cursor = 'crosshair';
        } else {
             if (this.canvas) this.canvas.style.cursor = 'default';
        }

      } catch (error) {
          console.error('Canvas setup failed after image load:', error);
          this.handleLoadFailure(`Canvas setup failed: ${error.message}`);
      }
    };
    img.src = currentScreenshot;

  } catch (error) {
    console.error('Failed to load screenshot:', error);
    this.handleLoadFailure(`Failed to load screenshot: ${error.message}`);
      try { if (chrome.storage) await chrome.storage.local.remove(['currentScreenshot']); }
      catch (removeError) { console.warn("Failed to remove screenshot data after load failure:", removeError); }
  }
}

/**
 * Handles the scenario where loading the screenshot fails.
 */
export function handleLoadFailure(message = 'Screenshot loading failed') {
  const canvasWidth = this.canvas?.width || 400;
  const canvasHeight = this.canvas?.height || 300;
  if(!this.canvas || !this.ctx) { console.error("Canvas/context not available during load failure."); return; }

    this.canvas.width = canvasWidth; this.canvas.height = canvasHeight;
    if (this.offscreenCanvas) { this.offscreenCanvas.width = canvasWidth; this.offscreenCanvas.height = canvasHeight; }

    this.ctx.fillStyle = '#EEEEEE'; this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    this.ctx.fillStyle = '#D32F2F'; this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
    this.ctx.fillText(message, canvasWidth / 2, canvasHeight / 2);

  this.updateCanvasRect();
    try { if (chrome.storage) chrome.storage.local.remove(['currentScreenshot']); }
    catch (removeError) { console.warn("Failed to remove screenshot data during load failure:", removeError); }
    // Disable tools
    document.querySelectorAll('.tool-item:not(#closeTool)').forEach(tool => { if(tool.id !== 'spinner') { tool.style.display = 'none'; } });
}


/**
 * Initializes event listeners for the toolbar tools.
 */
export function initializeTools() {
  const tools = {
    'cropTool': 'crop',
    'annotateTool': 'annotate', // Blackout
    'textTool': 'text',
    'arrowTool': 'arrow', // Added
    'shareTool': this.copyToClipboard,
    'saveTool': this.saveImage
  };

  for (const [id, action] of Object.entries(tools)) {
    const toolElement = document.getElementById(id);
    if (toolElement) {
      const listener = async (event) => {
          event.stopPropagation();
          try {
              if (typeof action === 'string') { // Tool toggle
                  if (this.isEditingText && ['crop', 'annotate', 'text', 'arrow'].includes(action)) { this.finalizeTextInput(); }
                  if (this.isDrawing && this.activeTools.has('arrow') && action !== 'arrow') {
                      console.log("Switching tool, canceling arrow draw");
                      this.cancelArrowDrawing();
                  }
                  this.toggleTool(action);
              } else if (typeof action === 'function') { // Action like save/copy
                  if (this.isEditingText) { this.finalizeTextInput(); }
                  if (this.isDrawing && this.activeTools.has('arrow')) {
                     console.log("Action clicked, canceling arrow draw");
                     this.cancelArrowDrawing();
                  }
                  // Deselect any active drawing tool before action
                  ['text', 'crop', 'annotate', 'arrow'].forEach(toolName => {
                      if (this.activeTools.has(toolName)) { this.toggleTool(toolName); }
                  });
                  await action.call(this);
              }
          } catch (error) { console.error(`Tool ${id} action failed:`, error); this.showToast(`Tool error: ${error.message}`, false, 'error'); }
      };
      if (toolElement._clickListener) { toolElement.removeEventListener('click', toolElement._clickListener); }
      toolElement._clickListener = listener;
      toolElement.addEventListener('click', listener);
    } else { console.warn(`Tool element with ID ${id} not found.`); }
  }
}

/**
 * Updates the cached canvas bounding rectangle.
 */
export function updateCanvasRect() {
    if (this.canvas) {
        this.canvasRect = this.canvas.getBoundingClientRect();
        const toolbarElement = document.querySelector('.toolbar');
        this.toolbarHeight = toolbarElement ? toolbarElement.offsetHeight : 56;
    }
}