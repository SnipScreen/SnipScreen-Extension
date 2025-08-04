// Import the throttle utility
import { throttle } from './editor-utils.js';

/**
 * Sets up the primary event listeners for the canvas and document.
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
  this.boundHandleDocumentClick = this.handleDocumentClick.bind(this); // For finalizing text

  // Canvas Listeners
  this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
  this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
  this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
  this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave);

  // Document Listener (for handling clicks outside text input)
  document.addEventListener('click', this.boundHandleDocumentClick, true);
}

/**
 * Removes event listeners added by setupEventListeners and text input setup.
 */
export function removeEditorEventListeners() {
  console.log("Removing editor event listeners.");
  if (this.canvas) {
    this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
    this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
    this.canvas.removeEventListener('mouseup', this.boundHandleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.boundHandleMouseLeave);
  }
  document.removeEventListener('click', this.boundHandleDocumentClick, true);

  // Remove text input listeners
  if (this.elements.textInput) {
    this.elements.textInput.removeEventListener('blur', this.boundHandleTextInputBlur);
    this.elements.textInput.removeEventListener('keydown', this.boundHandleTextInputKeydown);
    this.elements.textInput.removeEventListener('input', this.boundResizeTextInput);
    this.elements.textInput.style.display = 'none';
  }
}

/**
 * Sets up listeners specifically for the text input overlay.
 */
export function setupTextInputListeners() {
  if (!this.elements.textInput) {
    console.error("Text input overlay element not found.");
    return;
  }
  this.boundHandleTextInputBlur = this.handleTextInputBlur.bind(this);
  this.boundHandleTextInputKeydown = this.handleTextInputKeydown.bind(this);
  this.boundResizeTextInput = this.resizeTextInput.bind(this);
  this.elements.textInput.addEventListener('blur', this.boundHandleTextInputBlur);
  this.elements.textInput.addEventListener('keydown', this.boundHandleTextInputKeydown);
  this.elements.textInput.addEventListener('input', this.boundResizeTextInput);
  console.log("Text input listeners setup.");
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
 * Finds the text element at a given canvas coordinate.
 */
export function getTextElementAtPos(x, y) {
  if (!this.ctx || !this.elements.textElements) return null;
  for (let i = this.elements.textElements.length - 1; i >= 0; i--) {
    const element = this.elements.textElements[i];
    if (!element || typeof element.x !== 'number' || typeof element.y !== 'number') continue;
    this.ctx.font = element.font;
    const metrics = this.ctx.measureText(element.text);
    const fontHeightMatch = element.font.match(/(\d+)(px|pt|em|rem)/);
    const fontHeight = fontHeightMatch ? parseInt(fontHeightMatch[1], 10) : 18;
    const textHeight = fontHeight * 1.2;
    const padding = this.config.textPadding;
    const elX = element.x - padding;
    const elY = element.y - padding;
    const elWidth = metrics.width + 2 * padding;
    const elHeight = textHeight + 2 * padding;
    if (x >= elX && x <= elX + elWidth && y >= elY && y <= elY + elHeight) {
      return element;
    }
  }
  return null;
}

/**
 * Handles the mouse down event on the canvas.
 * Simplified: Only handles starting new drawings or moving text.
 */
export function handleMouseDown(e) {
  e.preventDefault();
  if (e.button !== 0) return; // Only left clicks

  const pos = this.getMousePos(e);

  // Reset interaction states
  this.state.isDrawing = false; // Assume not drawing initially
  this.elements.selectedTextElement = null;
  this.elements.movingTextElement = null;

  // 1. Handle Text Input Finalization (if active)
  if (this.state.isEditingText && e.target === this.canvas) {
    console.log("Canvas clicked while editing text - finalizing.");
    if (this.ui.textInputBlurTimeout) clearTimeout(this.ui.textInputBlurTimeout);
    this.finalizeTextInput();
    return; // Stop further processing for this click
  }

  // 2. Check for Clicking Existing TEXT Element to Move (Only if no tool active)
  if (!this.state.activeTools.size) { // Only allow moving if NO tool is active
    const clickedTextElement = this.getTextElementAtPos(pos.x, pos.y);
    if (clickedTextElement) {
      this.state.isDrawing = true; // Use isDrawing flag for moving interaction
      this.elements.selectedTextElement = clickedTextElement;
      this.elements.movingTextElement = {
        element: clickedTextElement,
        startX: clickedTextElement.x, startY: clickedTextElement.y,
        offsetX: pos.x - clickedTextElement.x, offsetY: pos.y - clickedTextElement.y
      };
      if (this.canvas) this.canvas.style.cursor = 'move';
      console.log("Started moving text:", clickedTextElement.id);
      return; // Stop processing, we are moving text
    }
  }

  // 3. If NOT Moving Text, Check for Starting NEW Drawing Actions (if tool active)
  if (this.isToolActive('text')) {
    this.showTextInput(pos.x, pos.y);
    return;
  }
  
  if (this.isToolActive('arrow')) {
    this.state.isDrawing = true;
    this.drawingState.arrowStart = pos;
    this.drawingState.arrowEnd = pos;
    this.saveCanvasState();
    return;
  }
  
  if (this.isToolActive('crop')) {
    this.state.isDrawing = true;
    this.drawingState.cropStart = pos;
    this.drawingState.cropEnd = pos;
    if (this.canvas) this.canvas.style.cursor = 'crosshair';
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
 * Simplified: Only handles drawing previews or moving text.
 */
export function handleMouseMove(e) {
  const pos = this.getMousePos(e);

  // --- Handle TEXT Moving ---
  if (this.elements.movingTextElement && this.state.isDrawing) {
    this.elements.movingTextElement.element.x = pos.x - this.elements.movingTextElement.offsetX;
    this.elements.movingTextElement.element.y = pos.y - this.elements.movingTextElement.offsetY;
    requestAnimationFrame(() => {
      if (this.elements.movingTextElement) this.redrawCanvas();
    });
    return; // Don't handle other logic if moving text
  }

  // --- Update Cursor When Hovering (Not Moving) ---
  const noActiveToolOrInteraction = !this.state.activeTools.size && !this.state.isDrawing && !this.elements.movingTextElement;
  if (noActiveToolOrInteraction) {
    const hoveredText = this.getTextElementAtPos(pos.x, pos.y);
    if (this.canvas) this.canvas.style.cursor = hoveredText ? 'move' : 'default';
  } else if (!this.state.isDrawing && this.state.activeTools.size > 0) {
    // Set cursor based on active tool if not drawing
    let cursor = 'default';
    if (this.isToolActive('text')) cursor = 'text';
    else if (this.isToolActive('crop') || this.isToolActive('annotate') || this.isToolActive('arrow')) cursor = 'crosshair';
    if (this.canvas) this.canvas.style.cursor = cursor;
  }

  // --- Handle Tool Drawing Previews ---
  if (!this.state.isDrawing) return; // Exit if not actively drawing a tool shape

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
  // 3. Arrow Preview
  else if (this.isToolActive('arrow') && this.drawingState.arrowStart) {
    requestAnimationFrame(() => {
      if (!this.state.isDrawing || !this.isToolActive('arrow') || !this.drawingState.arrowStart) return;
      this.drawingState.arrowEnd = pos;
      this.restoreCanvasState();
      this.drawArrow(this.ctx, this.drawingState.arrowStart.x, this.drawingState.arrowStart.y, this.drawingState.arrowEnd.x, this.drawingState.arrowEnd.y, this.config.arrowColor, this.config.arrowHeadSize);
    });
  }
}

/**
 * Handles the mouse up event on the canvas.
 * Simplified: Only handles finalizing new drawings or text moving.
 */
export function handleMouseUp(e) {
  if (e.button !== 0) return; // Only left button

  const wasMovingText = this.elements.movingTextElement;
  const wasDrawingTool = this.state.isDrawing && !wasMovingText; // Was drawing a new shape

  // --- Finalize TEXT Moving ---
  if (wasMovingText && this.state.isDrawing) {
    console.log(`Finished moving text:`, wasMovingText.element.id);
    this.redrawCanvas(); // Redraw one last time
    this.state.isDrawing = false;
    this.elements.movingTextElement = null;
    // Reset cursor based on hover state at final position (only if no tool is active)
    if (!this.state.activeTools.size) {
      const finalPos = this.getMousePos(e);
      const hoveredText = this.getTextElementAtPos(finalPos.x, finalPos.y);
      if (this.canvas) this.canvas.style.cursor = hoveredText ? 'move' : 'default';
    } else {
      // Set cursor based on active tool
      let cursor = 'default';
      if (this.isToolActive('text')) cursor = 'text';
      else if (this.isToolActive('crop') || this.isToolActive('annotate') || this.isToolActive('arrow')) cursor = 'crosshair';
      if (this.canvas) this.canvas.style.cursor = cursor;
    }
    return; // Stop processing, move is done
  }

  // --- Finalize Tool Drawing ---
  if (wasDrawingTool) {
    const pos = this.getMousePos(e);
    this.state.isDrawing = false; // Stop drawing state

    let activeToolName = null;
    if (this.isToolActive('crop') && this.drawingState.cropStart) activeToolName = 'crop';
    else if (this.isToolActive('annotate') && this.drawingState.annotateStart) activeToolName = 'annotate';
    else if (this.isToolActive('arrow') && this.drawingState.arrowStart) activeToolName = 'arrow';

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
      } else {
        this.restoreCanvasState();
      }
      this.drawingState.annotateStart = null;
      if (this.isToolActive('annotate') && this.canvas) this.canvas.style.cursor = 'crosshair';
    } else if (activeToolName === 'arrow') {
      this.drawingState.arrowEnd = pos;
      const startX = this.drawingState.arrowStart.x, startY = this.drawingState.arrowStart.y;
      const endX = this.drawingState.arrowEnd.x, endY = this.drawingState.arrowEnd.y;
      const lengthSq = (endX - startX) ** 2 + (endY - startY) ** 2;
      if (lengthSq > 25) { // Min length check
        const newArrow = { 
          type: 'arrow', 
          id: `arrow-${Date.now()}`, 
          x1: startX, y1: startY, x2: endX, y2: endY, 
          color: this.config.arrowColor, 
          headSize: this.config.arrowHeadSize 
        };
        this.elements.arrowElements.push(newArrow);
        this.redrawCanvas();
      } else {
        this.restoreCanvasState();
      }
      this.drawingState.arrowStart = null; 
      this.drawingState.arrowEnd = null;
      if (this.isToolActive('arrow') && this.canvas) this.canvas.style.cursor = 'crosshair';
    }

    // General cleanup & cursor reset
    if (!this.state.activeTools.size && this.canvas) {
      this.canvas.style.cursor = 'default';
    }
  }
}

/**
 * Handles the mouse leave event on the canvas.
 * Simplified: Only cancels active tool drawing or text moving.
 */
export function handleMouseLeave(e) {
  // --- Cancel TEXT Moving ---
  if (this.elements.movingTextElement && this.state.isDrawing) {
    console.log("Mouse left canvas while moving text, cancelling move.");
    this.elements.movingTextElement.element.x = this.elements.movingTextElement.startX;
    this.elements.movingTextElement.element.y = this.elements.movingTextElement.startY;
    this.state.isDrawing = false;
    this.elements.movingTextElement = null;
    this.elements.selectedTextElement = null;
    if (this.canvas) this.canvas.style.cursor = 'default';
    this.redrawCanvas();
    this.showToast("Text move cancelled.", false, 'info');
    return;
  }

  // --- Cancel Tool Drawing ---
  if (this.state.isDrawing) { // Only cancel if actively drawing a tool shape
    console.log("Mouse left canvas during drawing, cancelling operation.");
    const toolWasCrop = this.isToolActive('crop');
    const toolWasAnnotate = this.isToolActive('annotate');
    const toolWasArrow = this.isToolActive('arrow');
    this.state.isDrawing = false; // Stop drawing state FIRST

    let cursor = 'default'; // Default cursor after cancel

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
    if (toolWasArrow) {
      this.restoreCanvasState();
      this.drawingState.arrowStart = null; 
      this.drawingState.arrowEnd = null;
      this.showToast("Arrow drawing cancelled (mouse left canvas).", false, 'info');
      if (this.isToolActive('arrow')) cursor = 'crosshair';
    }

    if (this.canvas) this.canvas.style.cursor = cursor;
  }
}

/**
 * Handles clicks on the document, primarily to finalize text input.
 */
export function handleDocumentClick(e) {
  if (this.state.isEditingText && e.target !== this.elements.textInput && e.target !== this.canvas) {
    console.log("Document click detected outside text input/canvas.");
    if (this.ui.textInputBlurTimeout) clearTimeout(this.ui.textInputBlurTimeout);
    this.ui.textInputBlurTimeout = setTimeout(() => {
      if (this.state.isEditingText) {
        console.log("Finalizing text via document click timeout.");
        this.finalizeTextInput();
      }
      this.ui.textInputBlurTimeout = null;
    }, 50);
  }
}

// ====================================
// --- Text Input Specific Functions ---
// ====================================

export function showTextInput(x, y) {
  if (!this.elements.textInput || !this.canvas || !this.ui.canvasRect) {
    console.error("Cannot show text input - required elements missing.");
    return;
  }
  if (this.state.isEditingText) { 
    console.warn("Tried to show text input while already editing."); 
    return; 
  }

  this.state.isEditingText = true;

  this.currentTextElement = { // Temporary object while editing
    id: `text-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: '', x: x, y: y, font: this.config.textFont, color: this.config.textColor, isEditing: true
  };

  const scaleX = this.ui.canvasRect.width / this.canvas.width;
  const scaleY = this.ui.canvasRect.height / this.canvas.height;
  const overlayX = this.ui.canvasRect.left + x * scaleX;
  const overlayY = this.ui.canvasRect.top + y * scaleY;

  this.elements.textInput.value = '';
  this.elements.textInput.style.display = 'block';
  this.elements.textInput.style.left = `${overlayX}px`;
  this.elements.textInput.style.top = `${overlayY}px`;
  this.elements.textInput.style.font = this.config.textFont;
  this.elements.textInput.style.color = this.config.textColor;
  this.elements.textInput.style.width = '30px';
  this.elements.textInput.style.height = 'auto';
  this.resizeTextInput();

  setTimeout(() => this.elements.textInput.focus(), 50);
  console.log("Showing text input at canvas coords:", x, y);

  const textToolElement = document.getElementById('textTool');
  if (textToolElement) textToolElement.classList.remove('active');
}

export function hideTextInput() {
  if (!this.elements.textInput) return;
  this.elements.textInput.style.display = 'none';
  this.elements.textInput.value = '';
  this.state.isEditingText = false;
  this.currentTextElement = null;

  // Re-evaluate cursor based on active tools
  let newCursor = 'default';
  if (this.isToolActive('text')) {
    newCursor = 'text';
  } else if (this.isToolActive('crop') || this.isToolActive('annotate') || this.isToolActive('arrow')) {
    newCursor = 'crosshair';
  }
  if (this.canvas) this.canvas.style.cursor = newCursor;

  console.log("Hiding text input.");
}

export function resizeTextInput() {
  if (!this.elements.textInput || !this.ctx) return;
  this.ctx.font = this.config.textFont;
  const text = this.elements.textInput.value;
  const lines = text.split('\n');
  let maxWidth = 0;
  lines.forEach(line => {
    const metrics = this.ctx.measureText(line || ' ');
    maxWidth = Math.max(maxWidth, metrics.width);
  });

  const newWidth = Math.max(30, maxWidth + this.config.textPadding * 2);
  const fontHeight = parseInt(this.config.textFont, 10) * 1.4;
  const newHeight = Math.max(fontHeight, lines.length * fontHeight + this.config.textPadding);

  this.elements.textInput.style.width = `${newWidth}px`;
  this.elements.textInput.style.height = `${newHeight}px`;
}

export function finalizeTextInput() {
  if (!this.state.isEditingText || !this.currentTextElement || !this.elements.textInput) return;

  const enteredText = this.elements.textInput.value;
  const wasEditingId = this.currentTextElement.id;
  console.log("Finalizing text input. Text:", enteredText);

  const currentX = this.currentTextElement.x;
  const currentY = this.currentTextElement.y;
  this.hideTextInput(); // Hides input, resets editing state

  if (enteredText.trim()) {
    const existingElementIndex = this.elements.textElements.findIndex(el => el.id === wasEditingId);
    if (existingElementIndex > -1) {
      this.elements.textElements[existingElementIndex].text = enteredText;
      this.elements.textElements[existingElementIndex].isEditing = false;
      console.log("Updated existing text element:", wasEditingId);
    } else {
      const newElement = {
        id: wasEditingId, text: enteredText, x: currentX, y: currentY,
        font: this.config.textFont, color: this.config.textColor
      };
      this.elements.textElements.push(newElement);
      console.log("Added new text element:", wasEditingId);
    }
    this.redrawCanvas();
  } else {
    console.log("No text entered or only whitespace, cancelling add/edit.");
    this.redrawCanvas();
  }
  this.currentTextElement = null;
}

export function handleTextInputBlur(e) {
  console.log("Text input blur event.");
  if (this.ui.textInputBlurTimeout || !this.state.isEditingText) return;
  this.ui.textInputBlurTimeout = setTimeout(() => {
    if (this.state.isEditingText) {
      console.log("Finalizing text via blur timeout.");
      this.finalizeTextInput();
    }
    this.ui.textInputBlurTimeout = null;
  }, 150);
}

export function handleTextInputKeydown(e) {
  if (!this.state.isEditingText) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (this.ui.textInputBlurTimeout) clearTimeout(this.ui.textInputBlurTimeout);
    this.ui.textInputBlurTimeout = null;
    this.finalizeTextInput();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (this.ui.textInputBlurTimeout) clearTimeout(this.ui.textInputBlurTimeout);
    this.ui.textInputBlurTimeout = null;
    this.hideTextInput();
    this.redrawCanvas();
  } else {
    setTimeout(() => this.resizeTextInput(), 0);
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