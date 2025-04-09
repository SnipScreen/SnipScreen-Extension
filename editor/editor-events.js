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
    if (this.textInput) {
        this.textInput.removeEventListener('blur', this.boundHandleTextInputBlur);
        this.textInput.removeEventListener('keydown', this.boundHandleTextInputKeydown);
        this.textInput.removeEventListener('input', this.boundResizeTextInput);
        this.textInput.style.display = 'none';
    }
}


/**
 * Sets up listeners specifically for the text input overlay.
 */
export function setupTextInputListeners() {
    if (!this.textInput) {
        console.error("Text input overlay element not found.");
        return;
    }
    this.boundHandleTextInputBlur = this.handleTextInputBlur.bind(this);
    this.boundHandleTextInputKeydown = this.handleTextInputKeydown.bind(this);
    this.boundResizeTextInput = this.resizeTextInput.bind(this);
    this.textInput.addEventListener('blur', this.boundHandleTextInputBlur);
    this.textInput.addEventListener('keydown', this.boundHandleTextInputKeydown);
    this.textInput.addEventListener('input', this.boundResizeTextInput);
    console.log("Text input listeners setup.");
}


/**
 * Calculates the mouse position relative to the canvas, considering scaling.
 */
export function getMousePos(e) {
  if (!this.canvasRect) {
      this.updateCanvasRect();
      if (!this.canvasRect) {
          console.error("Canvas rectangle information unavailable.");
          return { x: 0, y: 0};
      }
  }
  const rect = this.canvasRect;
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
    if (!this.ctx || !this.textElements) return null;
    for (let i = this.textElements.length - 1; i >= 0; i--) {
        const element = this.textElements[i];
        if (!element || typeof element.x !== 'number' || typeof element.y !== 'number') continue;
        this.ctx.font = element.font;
        const metrics = this.ctx.measureText(element.text);
        const fontHeightMatch = element.font.match(/(\d+)(px|pt|em|rem)/);
        const fontHeight = fontHeightMatch ? parseInt(fontHeightMatch[1], 10) : 18;
        const textHeight = fontHeight * 1.2;
        const padding = this.textPadding;
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

// REMOVED: pointToLineSegmentDistanceSq function
// REMOVED: getArrowElementAtPos function

/**
 * Handles the mouse down event on the canvas.
 * Simplified: Only handles starting new drawings or moving text.
 */
export function handleMouseDown(e) {
  e.preventDefault();
  if (e.button !== 0) return; // Only left clicks

  const pos = this.getMousePos(e);

  // Reset interaction states
  this.isDrawing = false; // Assume not drawing initially
  this.selectedTextElement = null;
  this.movingTextElement = null;
  // REMOVED: this.movingArrowElement = null;

  // 1. Handle Text Input Finalization (if active)
  if (this.isEditingText && e.target === this.canvas) {
     console.log("Canvas clicked while editing text - finalizing.");
     if (this.textInputBlurTimeout) clearTimeout(this.textInputBlurTimeout);
     this.finalizeTextInput();
     return; // Stop further processing for this click
  }

  // 2. Check for Clicking Existing TEXT Element to Move (Only if no tool active)
  if (!this.activeTools.size) { // Only allow moving if NO tool is active
      const clickedTextElement = this.getTextElementAtPos(pos.x, pos.y);
      if (clickedTextElement) {
          this.isDrawing = true; // Use isDrawing flag for moving interaction
          this.selectedTextElement = clickedTextElement;
          this.movingTextElement = {
              element: clickedTextElement,
              startX: clickedTextElement.x, startY: clickedTextElement.y,
              offsetX: pos.x - clickedTextElement.x, offsetY: pos.y - clickedTextElement.y
          };
          if (this.canvas) this.canvas.style.cursor = 'move';
          console.log("Started moving text:", clickedTextElement.id);
          return; // Stop processing, we are moving text
      }
      // REMOVED: Check for clicking arrows to move
  }


  // 3. If NOT Moving Text, Check for Starting NEW Drawing Actions (if tool active)
  if (this.activeTools.has('text') && this.isAddingText) {
      this.isAddingText = false;
      this.showTextInput(pos.x, pos.y);
      return;
  }
  if (this.activeTools.has('arrow') && this.isAddingArrow) {
      this.isDrawing = true;
      this.arrowStart = pos;
      this.arrowEnd = pos;
      if(this.ctx && this.canvas) {
         try { this.lastImageDataBeforeArrow = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height); }
         catch (error) { console.error("Failed to getImageData for arrow preview:", error); this.lastImageDataBeforeArrow = null; }
      } else { this.lastImageDataBeforeArrow = null; }
      return;
  }
   if (this.activeTools.has('crop')) {
    this.isDrawing = true;
    this.cropStart = pos;
    this.cropEnd = pos;
    if (this.canvas) this.canvas.style.cursor = 'crosshair';
    return;
  }
  if (this.activeTools.has('annotate')) {
    this.isDrawing = true;
    this.annotateStart = pos;
    if(this.ctx && this.canvas) {
      try { this.lastImageDataBeforeAnnotate = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height); }
      catch (error) { console.error("Failed to getImageData (annotate):", error); this.lastImageDataBeforeAnnotate = null; }
    } else { this.lastImageDataBeforeAnnotate = null; }
    return;
  }

  // If none of the above conditions met
  this.isDrawing = false;
}


/**
 * Handles the mouse move event on the canvas.
 * Simplified: Only handles drawing previews or moving text.
 */
export function handleMouseMove(e) {
  const pos = this.getMousePos(e);

  // --- Handle TEXT Moving ---
  if (this.movingTextElement && this.isDrawing) {
      this.movingTextElement.element.x = pos.x - this.movingTextElement.offsetX;
      this.movingTextElement.element.y = pos.y - this.movingTextElement.offsetY;
      requestAnimationFrame(() => {
          if (this.movingTextElement) this.redrawCanvas();
      });
      return; // Don't handle other logic if moving text
  }
  // REMOVED: Handle Arrow Moving

  // --- Update Cursor When Hovering (Not Moving) ---
  const noActiveToolOrInteraction = !this.activeTools.size && !this.isDrawing && !this.movingTextElement; // simplified check
  if (noActiveToolOrInteraction) {
      const hoveredText = this.getTextElementAtPos(pos.x, pos.y);
      // REMOVED: hoveredArrow check
      if (this.canvas) this.canvas.style.cursor = hoveredText ? 'move' : 'default';
  } else if (!this.isDrawing && this.activeTools.size > 0) {
      // Set cursor based on active tool if not drawing
      let cursor = 'default';
      if (this.activeTools.has('text') && this.isAddingText) cursor = 'text';
      else if (this.activeTools.has('crop') || this.activeTools.has('annotate') || (this.activeTools.has('arrow') && this.isAddingArrow)) cursor = 'crosshair';
      if (this.canvas) this.canvas.style.cursor = cursor;
  }


  // --- Handle Tool Drawing Previews ---
  if (!this.isDrawing) return; // Exit if not actively drawing a tool shape

  // 1. Crop Preview
  if (this.activeTools.has('crop') && this.cropStart) {
      this.cropEnd = pos;
      this.throttledDrawCropGuides(this.cropStart, this.cropEnd);
  }
  // 2. Annotate Preview
  else if (this.activeTools.has('annotate') && this.annotateStart) {
      requestAnimationFrame(() => {
          if (!this.isDrawing || !this.activeTools.has('annotate') || !this.annotateStart) return;
          if (this.lastImageDataBeforeAnnotate) {
             try{ this.ctx.putImageData(this.lastImageDataBeforeAnnotate, 0, 0); }
             catch(error) { console.error("Error putting image data for annotation preview:", error); this.redrawCanvas(); }
          } else { console.warn("Missing image data for annotation preview, redrawing canvas."); this.redrawCanvas(); }
          const startX = Math.min(this.annotateStart.x, pos.x);
          const startY = Math.min(this.annotateStart.y, pos.y);
          const width = Math.abs(pos.x - this.annotateStart.x);
          const height = Math.abs(pos.y - this.annotateStart.y);
          if (width > 0 && height > 0) {
              this.ctx.fillStyle = '#000000';
              this.ctx.fillRect(startX, startY, width, height);
          }
      });
  }
  // 3. Arrow Preview
  else if (this.activeTools.has('arrow') && this.arrowStart) {
       requestAnimationFrame(() => {
          if (!this.isDrawing || !this.activeTools.has('arrow') || !this.arrowStart) return;
          this.arrowEnd = pos;
          if (this.lastImageDataBeforeArrow) {
             try { this.ctx.putImageData(this.lastImageDataBeforeArrow, 0, 0); }
             catch(error) { console.error("Error putting image data for arrow preview:", error); this.redrawCanvas(); }
          } else { console.warn("Missing image data for arrow preview, redrawing canvas."); this.redrawCanvas(); }
          this.drawArrow(this.ctx, this.arrowStart.x, this.arrowStart.y, this.arrowEnd.x, this.arrowEnd.y, this.arrowColor, this.arrowHeadSize);
      });
  }
}

/**
 * Handles the mouse up event on the canvas.
 * Simplified: Only handles finalizing new drawings or text moving.
 */
export function handleMouseUp(e) {
  if (e.button !== 0) return; // Only left button

  const wasMovingText = this.movingTextElement; // Check specifically for text moving
  // REMOVED: wasMovingArrow check
  const wasDrawingTool = this.isDrawing && !wasMovingText; // Was drawing a new shape

  // --- Finalize TEXT Moving ---
  if (wasMovingText && this.isDrawing) {
      console.log(`Finished moving text:`, wasMovingText.element.id);
      this.redrawCanvas(); // Redraw one last time
      this.isDrawing = false;
      this.movingTextElement = null;
      // Reset cursor based on hover state at final position (only if no tool is active)
      if (!this.activeTools.size) {
         const finalPos = this.getMousePos(e);
         const hoveredText = this.getTextElementAtPos(finalPos.x, finalPos.y);
         if (this.canvas) this.canvas.style.cursor = hoveredText ? 'move' : 'default';
      } else {
          // Set cursor based on active tool
          let cursor = 'default';
          if (this.activeTools.has('text') && this.isAddingText) cursor = 'text';
          else if (this.activeTools.has('crop') || this.activeTools.has('annotate') || (this.activeTools.has('arrow') && this.isAddingArrow)) cursor = 'crosshair';
          if (this.canvas) this.canvas.style.cursor = cursor;
      }
      return; // Stop processing, move is done
  }
  // REMOVED: Finalize Arrow Moving block

  // --- Finalize Tool Drawing ---
  if (wasDrawingTool) {
      const pos = this.getMousePos(e);
      this.isDrawing = false; // Stop drawing state

      let activeToolName = null;
      if (this.activeTools.has('crop') && this.cropStart) activeToolName = 'crop';
      else if (this.activeTools.has('annotate') && this.annotateStart) activeToolName = 'annotate';
      else if (this.activeTools.has('arrow') && this.arrowStart) activeToolName = 'arrow';

      // Finalize based on the active tool
      if (activeToolName === 'crop') {
          this.cropEnd = pos;
          this.completeCrop();
      } else if (activeToolName === 'annotate') {
          const startX = Math.min(this.annotateStart.x, pos.x);
          const startY = Math.min(this.annotateStart.y, pos.y);
          const width = Math.abs(pos.x - this.annotateStart.x);
          const height = Math.abs(pos.y - this.annotateStart.y);
          if (width > 1 && height > 1) {
              const newAnnotation = { type: 'rect', id: `anno-${Date.now()}`, x: startX, y: startY, width: width, height: height, color: '#000000' };
              this.annotationElements.push(newAnnotation);
              this.redrawCanvas();
          } else {
              if (this.lastImageDataBeforeAnnotate) this.ctx.putImageData(this.lastImageDataBeforeAnnotate, 0, 0); else this.redrawCanvas();
          }
          this.annotateStart = null; this.lastImageDataBeforeAnnotate = null;
          if (this.activeTools.has('annotate') && this.canvas) this.canvas.style.cursor = 'crosshair';
      } else if (activeToolName === 'arrow') {
          this.arrowEnd = pos;
          const startX = this.arrowStart.x, startY = this.arrowStart.y;
          const endX = this.arrowEnd.x, endY = this.arrowEnd.y;
          const lengthSq = (endX - startX) ** 2 + (endY - startY) ** 2;
          if (lengthSq > 25) { // Min length check
              const newArrow = { type: 'arrow', id: `arrow-${Date.now()}`, x1: startX, y1: startY, x2: endX, y2: endY, color: this.arrowColor, headSize: this.arrowHeadSize };
              this.arrowElements.push(newArrow);
              this.redrawCanvas();
          } else {
              if (this.lastImageDataBeforeArrow) this.ctx.putImageData(this.lastImageDataBeforeArrow, 0, 0); else this.redrawCanvas();
          }
          this.arrowStart = null; this.arrowEnd = null; this.lastImageDataBeforeArrow = null;
          this.isAddingArrow = this.activeTools.has('arrow'); // Keep adding if tool active
          if (this.activeTools.has('arrow') && this.canvas) this.canvas.style.cursor = 'crosshair';
      }

      // General cleanup & cursor reset
      this.lastImageDataBeforeAnnotate = null;
      this.lastImageDataBeforeArrow = null;
      if (!this.activeTools.size && this.canvas) {
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
    if (this.movingTextElement && this.isDrawing) {
        console.log("Mouse left canvas while moving text, cancelling move.");
        this.movingTextElement.element.x = this.movingTextElement.startX;
        this.movingTextElement.element.y = this.movingTextElement.startY;
        this.isDrawing = false;
        this.movingTextElement = null;
        this.selectedTextElement = null;
        if (this.canvas) this.canvas.style.cursor = 'default';
        this.redrawCanvas();
        this.showToast("Text move cancelled.", false, 'info');
        return;
    }
    // REMOVED: Cancel Arrow Moving block

    // --- Cancel Tool Drawing ---
    if (this.isDrawing) { // Only cancel if actively drawing a tool shape
        console.log("Mouse left canvas during drawing, cancelling operation.");
        const toolWasCrop = this.activeTools.has('crop');
        const toolWasAnnotate = this.activeTools.has('annotate');
        const toolWasArrow = this.activeTools.has('arrow');
        this.isDrawing = false; // Stop drawing state FIRST

        let cursor = 'default'; // Default cursor after cancel

        if (toolWasCrop) {
            this.resetCropState();
            this.showToast("Crop cancelled (mouse left canvas).", false, 'info');
             if (this.activeTools.has('crop')) cursor = 'crosshair';
        }
        if (toolWasAnnotate) {
            if (this.lastImageDataBeforeAnnotate) {
               try { this.ctx.putImageData(this.lastImageDataBeforeAnnotate, 0, 0); }
               catch (error) { console.error("Error putting image data on mouse leave:", error); this.redrawCanvas(); }
            } else { this.redrawCanvas(); }
            this.annotateStart = null; this.lastImageDataBeforeAnnotate = null;
             this.showToast("Annotation cancelled (mouse left canvas).", false, 'info');
             if (this.activeTools.has('annotate')) cursor = 'crosshair';
        }
        if (toolWasArrow) {
            if (this.lastImageDataBeforeArrow) {
               try { this.ctx.putImageData(this.lastImageDataBeforeArrow, 0, 0); }
               catch (error) { console.error("Error putting image data on arrow mouse leave:", error); this.redrawCanvas(); }
            } else { this.redrawCanvas(); }
            this.arrowStart = null; this.arrowEnd = null; this.lastImageDataBeforeArrow = null;
             this.isAddingArrow = this.activeTools.has('arrow');
             this.showToast("Arrow drawing cancelled (mouse left canvas).", false, 'info');
             if (this.activeTools.has('arrow')) cursor = 'crosshair';
        }

        if (this.canvas) this.canvas.style.cursor = cursor;
        this.lastImageDataBeforeAnnotate = null;
        this.lastImageDataBeforeArrow = null;
    }
}

/**
 * Handles clicks on the document, primarily to finalize text input.
 */
export function handleDocumentClick(e) {
    if (this.isEditingText && e.target !== this.textInput && e.target !== this.canvas) {
        console.log("Document click detected outside text input/canvas.");
        if (this.textInputBlurTimeout) clearTimeout(this.textInputBlurTimeout);
        this.textInputBlurTimeout = setTimeout(() => {
             if (this.isEditingText) {
                 console.log("Finalizing text via document click timeout.");
                 this.finalizeTextInput();
             }
             this.textInputBlurTimeout = null;
        }, 50);
    }
}


// ====================================
// --- Text Input Specific Functions ---
// ====================================
// (showTextInput, hideTextInput, resizeTextInput, finalizeTextInput, handleTextInputBlur, handleTextInputKeydown remain unchanged)
export function showTextInput(x, y) {
    if (!this.textInput || !this.canvas || !this.canvasRect) {
        console.error("Cannot show text input - required elements missing.");
        return;
    }
    if (this.isEditingText) { console.warn("Tried to show text input while already editing."); return; }

    this.isEditingText = true;
    this.isAddingText = false;

    this.currentTextElement = { // Temporary object while editing
        id: `text-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text: '', x: x, y: y, font: this.textFont, color: this.textColor, isEditing: true
    };

    const scaleX = this.canvasRect.width / this.canvas.width;
    const scaleY = this.canvasRect.height / this.canvas.height;
    const overlayX = this.canvasRect.left + x * scaleX;
    const overlayY = this.canvasRect.top + y * scaleY;

    this.textInput.value = '';
    this.textInput.style.display = 'block';
    this.textInput.style.left = `${overlayX}px`;
    this.textInput.style.top = `${overlayY}px`;
    this.textInput.style.font = this.textFont;
    this.textInput.style.color = this.textColor;
    this.textInput.style.width = '30px';
    this.textInput.style.height = 'auto';
    this.resizeTextInput();

    setTimeout(() => this.textInput.focus(), 50);
    console.log("Showing text input at canvas coords:", x, y);

    const textToolElement = document.getElementById('textTool');
    if (textToolElement) textToolElement.classList.remove('active');
}

export function hideTextInput() {
    if (!this.textInput) return;
    this.textInput.style.display = 'none';
    this.textInput.value = '';
    this.isEditingText = false;
    this.currentTextElement = null;

    // Re-evaluate cursor based on active tools
    let newCursor = 'default';
     if (this.activeTools.has('text')) {
         newCursor = 'text';
         this.isAddingText = true; // Ready to add again if tool active
     } else if (this.activeTools.has('crop') || this.activeTools.has('annotate') || this.activeTools.has('arrow')) {
         newCursor = 'crosshair';
     }
     if (this.canvas) this.canvas.style.cursor = newCursor;

    console.log("Hiding text input.");
}

export function resizeTextInput() {
    if (!this.textInput || !this.ctx) return;
    this.ctx.font = this.textFont;
    const text = this.textInput.value;
    const lines = text.split('\n');
    let maxWidth = 0;
    lines.forEach(line => {
        const metrics = this.ctx.measureText(line || ' ');
        maxWidth = Math.max(maxWidth, metrics.width);
    });

    const newWidth = Math.max(30, maxWidth + this.textPadding * 2);
    const fontHeight = parseInt(this.textFont, 10) * 1.4;
    const newHeight = Math.max(fontHeight, lines.length * fontHeight + this.textPadding);

    this.textInput.style.width = `${newWidth}px`;
    this.textInput.style.height = `${newHeight}px`;
}

export function finalizeTextInput() {
    if (!this.isEditingText || !this.currentTextElement || !this.textInput) return;

    const enteredText = this.textInput.value;
    const wasEditingId = this.currentTextElement.id;
    console.log("Finalizing text input. Text:", enteredText);

    const currentX = this.currentTextElement.x;
    const currentY = this.currentTextElement.y;
    this.hideTextInput(); // Hides input, resets editing state

    if (enteredText.trim()) {
        const existingElementIndex = this.textElements.findIndex(el => el.id === wasEditingId);
        if (existingElementIndex > -1) {
            this.textElements[existingElementIndex].text = enteredText;
             this.textElements[existingElementIndex].isEditing = false;
            console.log("Updated existing text element:", wasEditingId);
        } else {
             const newElement = {
                 id: wasEditingId, text: enteredText, x: currentX, y: currentY,
                 font: this.textFont, color: this.textColor
             };
             this.textElements.push(newElement);
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
    if (this.textInputBlurTimeout || !this.isEditingText) return;
    this.textInputBlurTimeout = setTimeout(() => {
        if (this.isEditingText) {
            console.log("Finalizing text via blur timeout.");
            this.finalizeTextInput();
        }
        this.textInputBlurTimeout = null;
    }, 150);
}

export function handleTextInputKeydown(e) {
    if (!this.isEditingText) return;
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.textInputBlurTimeout) clearTimeout(this.textInputBlurTimeout);
        this.textInputBlurTimeout = null;
        this.finalizeTextInput();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        if (this.textInputBlurTimeout) clearTimeout(this.textInputBlurTimeout);
        this.textInputBlurTimeout = null;
        this.hideTextInput();
         this.redrawCanvas();
    } else {
         setTimeout(() => this.resizeTextInput(), 0);
    }
}


// Throttled draw crop guides
export const throttledDrawCropGuides = throttle(function(startPos, endPos) {
    if (!this.isDrawing || !this.cropStart || !this.activeTools.has('crop')) return;
    if (!startPos || typeof startPos.x !== 'number' ) { return; }
    try {
        const startX = Math.min(startPos.x, endPos.x);
        const startY = Math.min(startPos.y, endPos.y);
        const width = Math.abs(endPos.x - startPos.x);
        const height = Math.abs(endPos.y - startPos.y);
        this.drawCropGuides(startX, startY, width, height);
    } catch (error) { console.error("Error in throttledDrawCropGuides:", error); }
}, 16);