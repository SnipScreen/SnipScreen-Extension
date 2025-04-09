import * as Utils from './editor-utils.js';
import * as UI from './editor-ui.js';
import * as Init from './editor-init.js';
import * as CanvasOps from './editor-canvas.js';
import * as Tools from './editor-tools.js';
import * as Events from './editor-events.js';

class ScreenshotEditor {
  constructor() {
    this.canvas = document.getElementById('editorCanvas');
    if (!this.canvas) throw new Error("Editor canvas element not found!");
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
        alpha: false,
        willReadFrequently: false
    });

    this.activeTools = new Set();
    this.isDrawing = false;
    this.cropStart = null;
    this.cropEnd = null;
    this.annotateStart = null;
    this.lastImageDataBeforeAnnotate = null;

    this.originalImage = null;

    this.annotationElements = [];
    this.textElements = [];
    this.arrowElements = [];

    this.isAddingText = false;
    this.isEditingText = false;
    this.movingTextElement = null;
    this.textInput = document.getElementById('textInputOverlay');
    this.selectedTextElement = null;

    // Default annotation styles
    this.textFont = '20px sans-serif';
    this.textColor = '#FF0000'; // Red
    this.arrowColor = '#FF0000'; // Red

    this.textPadding = 4;
    this.textInputBlurTimeout = null;

    // Arrow state
    this.isAddingArrow = false;
    this.arrowStart = null;
    this.arrowEnd = null;
    this.arrowHeadSize = 25;
    this.lastImageDataBeforeArrow = null;

    // Editor state
    this.maxCanvasSize = { width: 1920, height: 1080 };
    this.cropOnlyMode = false;
    this.canvasRect = null;
    this.toolbarHeight = 56;
    this.toastElement = null;
    this.toastTimeout = null;

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
  } // End constructor

    // Centralized redraw function for the VISIBLE canvas
    redrawCanvas() {
        if (!this.ctx || !this.offscreenCanvas || !this.canvas) {
            console.error("Redraw called without valid context or canvases.");
            return;
        }
        const ctx = this.ctx;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw base image
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.offscreenCanvas, 0, 0);

        // 2. Draw Annotations (Blackout Rects)
        this.annotationElements.forEach(element => {
            if (!element) return;
            if (element.type === 'rect') {
                ctx.fillStyle = element.color;
                ctx.fillRect(element.x, element.y, element.width, element.height);
            }
        });

        // 3. Draw Arrows
        this.arrowElements.forEach(element => {
            if (!element) return;
            if (element.type === 'arrow') {
                const headSize = element.headSize || this.arrowHeadSize;
                this.drawArrow(ctx, element.x1, element.y1, element.x2, element.y2, element.color || this.arrowColor, headSize);
            }
        });

        // 4. Draw Text Elements (On top)
        ctx.textBaseline = 'top';
        this.textElements.forEach(element => {
            if (!element || !element.text) return;
            ctx.font = element.font || this.textFont;
            ctx.fillStyle = element.color || this.textColor;
            // Add shadow for visibility contrast
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.shadowBlur = 2;
            ctx.fillText(element.text, element.x, element.y);
            // Reset shadow
            ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = 0;
        });
    } // End redrawCanvas

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