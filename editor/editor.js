import * as Utils from './editor-utils.js';
import * as UI from './editor-ui.js';
import * as Init from './editor-init.js';
import * as CanvasOps from './editor-canvas.js';
import * as Tools from './editor-tools.js';
import * as Events from './editor-events.js';

class ScreenshotEditor {
  constructor() {
    // Core canvas setup
    this.canvas = document.getElementById('editorCanvas');
    if (!this.canvas) throw new Error("Editor canvas element not found!");
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
        alpha: false,
        willReadFrequently: false
    });

    // State management - simplified
    this.state = {
      activeTools: new Set(),
      isDrawing: false,
      isEditingText: false,
      cropOnlyMode: false
    };

    // Drawing state
    this.drawingState = {
      cropStart: null,
      cropEnd: null,
      annotateStart: null,
      arrowStart: null,
      arrowEnd: null
    };

    // Canvas state management
    this.canvasState = {
      originalImage: null,
      lastImageData: null
    };

    // UI elements
    this.elements = {
      annotationElements: [],
      textElements: [],
      arrowElements: [],
      selectedTextElement: null,
      movingTextElement: null,
      textInput: document.getElementById('textInputOverlay')
    };

    // Configuration
    this.config = {
      textFont: '20px sans-serif',
      textColor: '#FF0000',
      arrowColor: '#FF0000',
      arrowHeadSize: 25,
      textPadding: 4,
      maxCanvasSize: { width: 1920, height: 1080 },
      toolbarHeight: 56
    };

    // UI state
    this.ui = {
      canvasRect: null,
      toastElement: null,
      toastTimeout: null,
      textInputBlurTimeout: null
    };

    // Assign Methods from Modules
    Object.assign(ScreenshotEditor.prototype, Utils);
    Object.assign(ScreenshotEditor.prototype, UI);
    Object.assign(ScreenshotEditor.prototype, Init);
    Object.assign(ScreenshotEditor.prototype, CanvasOps);
    Object.assign(ScreenshotEditor.prototype, Tools);
    Object.assign(ScreenshotEditor.prototype, Events);

    // Throttled functions
    this.throttledDrawCropGuides = Events.throttledDrawCropGuides;

    // Initialize Editor
    try {
      this.boundCleanup = this.cleanup.bind(this);
      this.boundUpdateCanvasRect = this.updateCanvasRect.bind(this);

      this.updateCanvasRect();
      this.checkMode();
      this.initializeTools();
      this.loadScreenshot();
      this.setupEventListeners();
      this.setupTextInputListeners();

      window.addEventListener('resize', this.boundUpdateCanvasRect);
      window.addEventListener('beforeunload', this.boundCleanup);

    } catch (error) {
      console.error('Editor initialization failed:', error);
      if (this.showToast) {
        this.showToast(`Editor setup failed: ${error.message}`, false, 'error');
      }
      if(this.handleLoadFailure) {
          this.handleLoadFailure(`Editor setup failed: ${error.message}`);
      }
    }
  }

  // Centralized redraw function for the VISIBLE canvas
  redrawCanvas() {
    if (!this.ctx || !this.offscreenCanvas || !this.canvas) {
      console.error("Redraw called without valid context or canvases.");
      return;
    }
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Ensure high-quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Draw base image
    ctx.drawImage(this.offscreenCanvas, 0, 0);

    // 2. Draw Annotations (Blackout Rects)
    this.elements.annotationElements.forEach(element => {
      if (!element) return;
      if (element.type === 'rect') {
        ctx.fillStyle = element.color;
        ctx.fillRect(element.x, element.y, element.width, element.height);
      }
    });

    // 3. Draw Arrows
    this.elements.arrowElements.forEach(element => {
      if (!element) return;
      if (element.type === 'arrow') {
        const headSize = element.headSize || this.config.arrowHeadSize;
        this.drawArrow(ctx, element.x1, element.y1, element.x2, element.y2, element.color || this.config.arrowColor, headSize);
      }
    });

    // 4. Draw Text Elements (On top)
    ctx.textBaseline = 'top';
    this.elements.textElements.forEach(element => {
      if (!element || !element.text) return;
      ctx.font = element.font || this.config.textFont;
      ctx.fillStyle = element.color || this.config.textColor;
      // Add shadow for visibility contrast
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 2;
      ctx.fillText(element.text, element.x, element.y);
      // Reset shadow
      ctx.shadowOffsetX = 0; 
      ctx.shadowOffsetY = 0; 
      ctx.shadowBlur = 0;
    });
  }

  // Helper methods for state management
  isToolActive(toolName) {
    return this.state.activeTools.has(toolName);
  }

  setToolActive(toolName, active) {
    if (active) {
      this.state.activeTools.add(toolName);
    } else {
      this.state.activeTools.delete(toolName);
    }
  }

  clearDrawingState() {
    this.drawingState = {
      cropStart: null,
      cropEnd: null,
      annotateStart: null,
      arrowStart: null,
      arrowEnd: null
    };
    this.state.isDrawing = false;
  }

  saveCanvasState() {
    if (this.ctx && this.canvas) {
      try {
        this.canvasState.lastImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      } catch (error) {
        console.error("Failed to save canvas state:", error);
        this.canvasState.lastImageData = null;
      }
    }
  }

  restoreCanvasState() {
    if (this.canvasState.lastImageData && this.ctx) {
      try {
        this.ctx.putImageData(this.canvasState.lastImageData, 0, 0);
      } catch (error) {
        console.error("Failed to restore canvas state:", error);
        this.redrawCanvas();
      }
    } else {
      this.redrawCanvas();
    }
  }

} // End of ScreenshotEditor class

// Global Initialization
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.screenshotEditor = new ScreenshotEditor();
    console.log("Screenshot Editor Initialized");
  } catch (error) {
    console.error("Failed to initialize ScreenshotEditor:", error);
    const container = document.getElementById('editorContainer') || document.body;
    container.innerHTML = `<div style="color: red; padding: 20px; text-align: center; font-family: sans-serif;"><h2>Error Initializing Editor</h2><p>${error.message}</p><p>Please try reloading the page or check the browser console for details.</p></div>`;
  }
});