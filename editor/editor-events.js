// Import the throttle utility
import { throttle } from './editor-utils.js';

/**
 * Sets up the primary event listeners for the canvas.
 */
export function setupEventListeners() {
  if (!this.canvas) {
    console.error("Canvas element not found for setting up event listeners.");
    return;
  }
  // Bind handlers to ensure 'this' context
  this.boundHandleMouseDown = this.handleMouseDown.bind(this);
  this.boundHandleMouseMove = this.handleMouseMove.bind(this);
  this.boundHandleMouseUp = this.handleMouseUp.bind(this);
  this.boundHandleMouseLeave = this.handleMouseLeave.bind(this);

  // Canvas Listeners
  this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
  this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
  this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
  this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave);
}

/**
 * Removes event listeners added by setupEventListeners.
 */
export function removeEditorEventListeners() {
  console.log("Removing editor event listeners.");
  if (this.canvas) {
    this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
    this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
    this.canvas.removeEventListener('mouseup', this.boundHandleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.boundHandleMouseLeave);
  }
}

/**
 * Calculates the mouse position relative to the canvas, considering scaling.
 */
export function getMousePos(e) {
  if (!this.ui.canvasRect) {
    this.updateCanvasRect();
    if (!this.ui.canvasRect) {
      console.error("Canvas rectangle information unavailable.");
      return { x: 0, y: 0};
    }
  }
  const rect = this.ui.canvasRect;
  const scaleX = rect.width === 0 ? 1 : this.canvas.width / rect.width;
  const scaleY = rect.height === 0 ? 1 : this.canvas.height / rect.height;
  const canvasX = (e.clientX - rect.left) * scaleX;
  const canvasY = (e.clientY - rect.top) * scaleY;
  const clampedX = Math.max(0, Math.min(canvasX, this.canvas.width));
  const clampedY = Math.max(0, Math.min(canvasY, this.canvas.height));
  return { x: clampedX, y: clampedY };
}

/**
 * Handles the mouse down event on the canvas.
 */
export function handleMouseDown(e) {
  e.preventDefault();
  if (e.button !== 0) return; // Only left clicks

  const pos = this.getMousePos(e);

  // Reset interaction states
  this.state.isDrawing = false;

  // Check for starting drawing actions (if tool active)
  if (this.isToolActive('crop')) {
    this.state.isDrawing = true;
    this.drawingState.cropStart = pos;
    this.drawingState.cropEnd = pos;
    if (this.canvas) {
      this.canvas.style.cursor = 'crosshair';
    }
    return;
  }
  
  if (this.isToolActive('annotate')) {
    this.state.isDrawing = true;
    this.drawingState.annotateStart = pos;
    this.saveCanvasState();
    return;
  }

  // If none of the above conditions met
  this.state.isDrawing = false;
}

/**
 * Handles the mouse move event on the canvas.
 */
export function handleMouseMove(e) {
  const pos = this.getMousePos(e);

  // Update cursor based on active tools
  if (!this.state.isDrawing && this.state.activeTools.size > 0) {
    let cursor = 'default';
    if (this.isToolActive('crop') || this.isToolActive('annotate')) cursor = 'crosshair';
    if (this.canvas) this.canvas.style.cursor = cursor;
  }

  // Handle tool drawing previews
  if (!this.state.isDrawing) return;

  // 1. Crop Preview
  if (this.isToolActive('crop') && this.drawingState.cropStart) {
    this.drawingState.cropEnd = pos;
    this.throttledDrawCropGuides(this.drawingState.cropStart, this.drawingState.cropEnd);
  }
  // 2. Annotate Preview
  else if (this.isToolActive('annotate') && this.drawingState.annotateStart) {
    requestAnimationFrame(() => {
      if (!this.state.isDrawing || !this.isToolActive('annotate') || !this.drawingState.annotateStart) return;
      this.restoreCanvasState();
      const startX = Math.min(this.drawingState.annotateStart.x, pos.x);
      const startY = Math.min(this.drawingState.annotateStart.y, pos.y);
      const width = Math.abs(pos.x - this.drawingState.annotateStart.x);
      const height = Math.abs(pos.y - this.drawingState.annotateStart.y);
      if (width > 0 && height > 0) {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(startX, startY, width, height);
      }
    });
  }
}

/**
 * Handles the mouse up event on the canvas.
 */
export function handleMouseUp(e) {
  if (e.button !== 0) return;

  const wasDrawingTool = this.state.isDrawing;

  // Finalize tool drawing
  if (wasDrawingTool) {
    const pos = this.getMousePos(e);
    this.state.isDrawing = false;

    let activeToolName = null;
    if (this.isToolActive('crop') && this.drawingState.cropStart) activeToolName = 'crop';
    else if (this.isToolActive('annotate') && this.drawingState.annotateStart) activeToolName = 'annotate';

    // Finalize based on the active tool
    if (activeToolName === 'crop') {
      this.drawingState.cropEnd = pos;
      this.completeCrop();
    } else if (activeToolName === 'annotate') {
      const startX = Math.min(this.drawingState.annotateStart.x, pos.x);
      const startY = Math.min(this.drawingState.annotateStart.y, pos.y);
      const width = Math.abs(pos.x - this.drawingState.annotateStart.x);
      const height = Math.abs(pos.y - this.drawingState.annotateStart.y);
      if (width > 1 && height > 1) {
        const newAnnotation = { 
          type: 'rect', 
          id: `anno-${Date.now()}`, 
          x: startX, y: startY, width: width, height: height, color: '#000000' 
        };
        this.elements.annotationElements.push(newAnnotation);
        this.redrawCanvas();
        this.showToast("Annotation added", false, 'success');
      } else {
        this.restoreCanvasState();
      }
      this.drawingState.annotateStart = null;
      if (this.isToolActive('annotate') && this.canvas) this.canvas.style.cursor = 'crosshair';
    }

    // General cleanup & cursor reset
    if (!this.state.activeTools.size && this.canvas) {
      this.canvas.style.cursor = 'default';
    }
  }
}

/**
 * Handles the mouse leave event on the canvas.
 */
export function handleMouseLeave(e) {
  // Cancel tool drawing
  if (this.state.isDrawing) {
    console.log("Mouse left canvas during drawing, cancelling operation.");
    const toolWasCrop = this.isToolActive('crop');
    const toolWasAnnotate = this.isToolActive('annotate');
    this.state.isDrawing = false;

    let cursor = 'default';

    if (toolWasCrop) {
      this.resetCropState();
      this.showToast("Crop cancelled (mouse left canvas).", false, 'info');
      if (this.isToolActive('crop')) cursor = 'crosshair';
    }
    if (toolWasAnnotate) {
      this.restoreCanvasState();
      this.drawingState.annotateStart = null;
      this.showToast("Annotation cancelled (mouse left canvas).", false, 'info');
      if (this.isToolActive('annotate')) cursor = 'crosshair';
    }

    if (this.canvas) {
      this.canvas.style.cursor = cursor;
    }
  }
}

// Throttled draw crop guides
export const throttledDrawCropGuides = throttle(function(startPos, endPos) {
  if (!this.state.isDrawing || !this.drawingState.cropStart || !this.isToolActive('crop')) return;
  if (!startPos || typeof startPos.x !== 'number' ) { return; }
  try {
    const startX = Math.min(startPos.x, endPos.x);
    const startY = Math.min(startPos.y, endPos.y);
    const width = Math.abs(endPos.x - startPos.x);
    const height = Math.abs(endPos.y - startPos.y);
    this.drawCropGuides(startX, startY, width, height);
  } catch (error) { 
    console.error("Error in throttledDrawCropGuides:", error); 
  }
}, 16);