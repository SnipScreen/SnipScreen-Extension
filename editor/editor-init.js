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
  this.canvasState.originalImage = null;

  // Clear element arrays
  this.elements.annotationElements = [];

  // Clear UI elements / timeouts
  if (this.ui.toastElement) { 
    this.ui.toastElement.remove(); 
    this.ui.toastElement = null; 
  }
  if (this.ui.toastTimeout) { 
    clearTimeout(this.ui.toastTimeout); 
    this.ui.toastTimeout = null; 
  }
  this.canvasState.lastImageData = null;

  // Remove event listeners
  if (typeof this.removeEditorEventListeners === 'function') {
    this.removeEditorEventListeners();
  } else { 
    console.warn("removeEditorEventListeners function not found for cleanup."); 
  }

  // Reset active tools set
  this.state.activeTools.clear();
}

/**
 * Checks the mode (cropOnly or full editor) from storage and configures the UI accordingly.
 */
export async function checkMode() {
  try {
    const { cropOnlyMode } = await chrome.storage.local.get(['cropOnlyMode']);
    this.state.cropOnlyMode = !!cropOnlyMode; // Ensure boolean

    const cropTool = document.getElementById('cropTool');
    const spinnerTool = document.getElementById('spinner');

    if (this.state.cropOnlyMode) {
      console.log("Entering Crop Only Mode UI setup.");
      // Hide all tools initially except spinner (which is hidden by default)
      document.querySelectorAll('.tool-item').forEach(tool => {
        if(tool.id !== 'spinner') { 
          tool.style.display = 'none'; 
        }
      });
      // Explicitly show crop tool
      if (cropTool) {
        cropTool.style.display = 'flex';
        this.setToolActive('crop', true);
        cropTool.classList.add('active');
        if (this.canvas) this.canvas.style.cursor = 'crosshair';
      } else { 
        console.warn("Crop tool element not found during cropOnlyMode setup."); 
      }
      if(spinnerTool) { 
        spinnerTool.style.display = 'none'; 
      }

    } else {
      console.log("Entering Full Editor Mode UI setup.");
      // Show all tools except spinner
      document.querySelectorAll('.tool-item').forEach(tool => {
        if (tool.id !== 'spinner') { 
          tool.style.display = 'flex'; 
        } else { 
          tool.style.display = 'none'; 
        } // Explicitly hide spinner
      });
      if (cropTool) { 
        cropTool.classList.remove('active'); 
      } // Ensure crop not active
      if (this.canvas) { 
        this.canvas.style.cursor = 'default'; 
      }
    }
  } catch (error) {
    console.error("Failed to check mode:", error);
    this.showToast(`Error setting up editor mode: ${error.message}`, false, 'error');
    // Default to non-crop mode on error, show all tools except spinner
    this.state.cropOnlyMode = false;
    document.querySelectorAll('.tool-item').forEach(tool => {
      if (tool.id !== 'spinner') { 
        tool.style.display = 'flex'; 
      } else { 
        tool.style.display = 'none'; 
      }
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
    if (!currentScreenshot) { 
      throw new Error('No screenshot data found in storage.'); 
    }

    const img = new Image();
    img.onerror = (e) => {
      console.error('Image loading failed:', e);
      this.handleLoadFailure('Failed to load the screenshot image data.');
    };
    img.onload = () => {
      try {
        this.canvasState.originalImage = img;
        const originalWidth = this.canvasState.originalImage.naturalWidth;
        const originalHeight = this.canvasState.originalImage.naturalHeight;
        console.log(`Original image loaded: ${originalWidth}x${originalHeight}`);

        const canvasWidth = originalWidth;
        const canvasHeight = originalHeight;
        console.log(`Setting canvas bitmap size to: ${canvasWidth}x${canvasHeight}`);

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.offscreenCanvas.width = canvasWidth;
        this.offscreenCanvas.height = canvasHeight;

        // Set canvas to fit within the available space while maintaining aspect ratio
        const toolbarElement = document.querySelector('.toolbar');
        this.config.toolbarHeight = toolbarElement ? toolbarElement.offsetHeight : 64;
        const containerElement = document.getElementById('editorContainer');
        const containerRect = containerElement ? containerElement.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight - this.config.toolbarHeight };
        
        // Calculate available space
        const availableWidth = containerRect.width - 48; // Account for padding
        const availableHeight = containerRect.height - 48; // Account for padding
        
        // Calculate scale to fit within available space
        const scaleX = availableWidth / canvasWidth;
        const scaleY = availableHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
        
        // Set canvas display size
        this.canvas.style.width = `${canvasWidth * scale}px`;
        this.canvas.style.height = `${canvasHeight * scale}px`;
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = '100%';

        // Enable high-quality image smoothing for better clarity
        this.offscreenCtx.imageSmoothingEnabled = true;
        this.offscreenCtx.imageSmoothingQuality = 'high';
        this.offscreenCtx.clearRect(0,0, canvasWidth, canvasHeight);
        this.offscreenCtx.drawImage( this.canvasState.originalImage, 0, 0 );

        // Enable high-quality image smoothing for the main canvas as well
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Additional quality settings for crisp output
        this.ctx.textRenderingOptimization = 'optimizeQuality';
        this.offscreenCtx.textRenderingOptimization = 'optimizeQuality';
        
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);

        this.updateCanvasRect();

        this.canvas.style.opacity = '0';
        requestAnimationFrame(() => {
          this.canvas.style.transition = 'opacity 0.3s ease-in-out';
          this.canvas.style.opacity = '1';
        });

        if (this.state.cropOnlyMode && this.isToolActive('crop')) {
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
    try { 
      if (chrome.storage) await chrome.storage.local.remove(['currentScreenshot']); 
    } catch (removeError) { 
      console.warn("Failed to remove screenshot data after load failure:", removeError); 
    }
  }
}

/**
 * Handles the scenario where loading the screenshot fails.
 */
export function handleLoadFailure(message = 'Screenshot loading failed') {
  const canvasWidth = this.canvas?.width || 400;
  const canvasHeight = this.canvas?.height || 300;
  if(!this.canvas || !this.ctx) { 
    console.error("Canvas/context not available during load failure."); 
    return; 
  }

  this.canvas.width = canvasWidth; 
  this.canvas.height = canvasHeight;
  if (this.offscreenCanvas) { 
    this.offscreenCanvas.width = canvasWidth; 
    this.offscreenCanvas.height = canvasHeight; 
  }

  this.ctx.fillStyle = '#EEEEEE'; 
  this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  this.ctx.fillStyle = '#D32F2F'; 
  this.ctx.font = '16px sans-serif';
  this.ctx.textAlign = 'center'; 
  this.ctx.textBaseline = 'middle';
  this.ctx.fillText(message, canvasWidth / 2, canvasHeight / 2);

  this.updateCanvasRect();
  try { 
    if (chrome.storage) chrome.storage.local.remove(['currentScreenshot']); 
  } catch (removeError) { 
    console.warn("Failed to remove screenshot data during load failure:", removeError); 
  }
  // Disable tools
  document.querySelectorAll('.tool-item:not(#closeTool)').forEach(tool => { 
    if(tool.id !== 'spinner') { 
      tool.style.display = 'none'; 
    } 
  });
}

/**
 * Initializes event listeners for the toolbar tools.
 */
export function initializeTools() {
  const tools = {
    'cropTool': 'crop',
    'annotateTool': 'annotate', // Blackout
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
            this.toggleTool(action);
          } else if (typeof action === 'function') { // Action like save/copy
            // Deselect any active drawing tool before action
            ['crop', 'annotate'].forEach(toolName => {
              if (this.isToolActive(toolName)) { 
                this.toggleTool(toolName); 
              }
            });
            await action.call(this);
          }
        } catch (error) { 
          console.error(`Tool ${id} action failed:`, error); 
          this.showToast(`Tool error: ${error.message}`, false, 'error'); 
        }
      };
      if (toolElement._clickListener) { 
        toolElement.removeEventListener('click', toolElement._clickListener); 
      }
      toolElement._clickListener = listener;
      toolElement.addEventListener('click', listener);
    } else { 
      console.warn(`Tool element with ID ${id} not found.`); 
    }
  }
}

/**
 * Updates the cached canvas bounding rectangle.
 */
export function updateCanvasRect() {
  if (this.canvas) {
    this.ui.canvasRect = this.canvas.getBoundingClientRect();
    const toolbarElement = document.querySelector('.toolbar');
    this.config.toolbarHeight = toolbarElement ? toolbarElement.offsetHeight : 56;
  }
}