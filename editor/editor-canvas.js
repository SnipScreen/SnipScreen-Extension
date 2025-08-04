/**
 * Draws the cropping guides overlay on the main canvas.
 * Assumes the base image (from offscreenCanvas) is already drawn via redrawCanvas.
 */
export function drawCropGuides(x, y, width, height) {
  if (!this.ctx || !this.canvas) return;
  // Clamp coordinates
  const canvasWidth = this.canvas.width;
  const canvasHeight = this.canvas.height;
  x = Math.max(0, Math.min(x, canvasWidth));
  y = Math.max(0, Math.min(y, canvasHeight));
  width = Math.max(0, Math.min(width, canvasWidth - x));
  height = Math.max(0, Math.min(height, canvasHeight - y));

  // --- Redraw underlying canvas state FIRST ---
  this.redrawCanvas(); // Includes base image, annotations, text, arrows

  // --- Now draw crop overlay and guides on top ---
  this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Overlay color
  // Draw overlay rectangles outside the crop area
  this.ctx.fillRect(0, 0, canvasWidth, y); // Top
  this.ctx.fillRect(0, y + height, canvasWidth, canvasHeight - (y + height)); // Bottom
  this.ctx.fillRect(0, y, x, height); // Left
  this.ctx.fillRect(x + width, y, canvasWidth - (x + width), height); // Right

  // Draw dashed border for the crop area
  this.ctx.setLineDash([4, 4]);
  this.ctx.strokeStyle = '#FFFFFF';
  this.ctx.lineWidth = 1;
  this.ctx.strokeRect(x, y, width, height);

  // Draw solid outer border for emphasis
  this.ctx.setLineDash([]);
  this.ctx.strokeStyle = '#007AFF';
  this.ctx.lineWidth = 2;
  this.ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);

  // Draw corner handles if area is large enough
  if (width > 10 && height > 10) {
    this.drawCornerHandles(x, y, width, height);
  }
  this.ctx.setLineDash([]); // Reset just in case
}

/**
 * Draws the interactive square corner handles for the crop selection box.
 */
export function drawCornerHandles(x, y, width, height) {
  if (!this.ctx) return;
  const handleSize = 8;
  const handleOffset = handleSize / 2;
  const corners = [ [x, y], [x + width, y], [x, y + height], [x + width, y + height] ];
  this.ctx.fillStyle = '#007AFF';
  this.ctx.strokeStyle = '#FFFFFF'; // White border for contrast
  this.ctx.lineWidth = 1;
  corners.forEach(([cx, cy]) => {
    this.ctx.fillRect(cx - handleOffset, cy - handleOffset, handleSize, handleSize);
    this.ctx.strokeRect(cx - handleOffset, cy - handleOffset, handleSize, handleSize);
  });
}

/**
 * Draws an arrow on the given canvas context.
 * @param {CanvasRenderingContext2D} ctx - The context to draw on.
 * @param {number} x1 - Start X coordinate.
 * @param {number} y1 - Start Y coordinate.
 * @param {number} x2 - End X coordinate (arrow tip).
 * @param {number} y2 - End Y coordinate (arrow tip).
 * @param {string} color - The color of the arrow.
 * @param {number} headSize - The length of the arrowhead lines.
 */
export function drawArrow(ctx, x1, y1, x2, y2, color, headSize) {
  if (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) < 1) return; // Avoid drawing zero-length arrows

  ctx.save(); // Save context state
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3; // <<<< INCREASED Line width for the arrow shaft

  // Draw line segment
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw arrowhead
  // Adjust angles for a slightly wider head to match thickness? Optional.
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const angle1 = angle + Math.PI / 7; // Angle for one side of the arrowhead (adjust divisor for width)
  const angle2 = angle - Math.PI / 7; // Angle for the other side

  const x3 = x2 - headSize * Math.cos(angle1);
  const y3 = y2 - headSize * Math.sin(angle1);
  const x4 = x2 - headSize * Math.cos(angle2);
  const y4 = y2 - headSize * Math.sin(angle2);

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill(); // Fill the arrowhead

  ctx.restore(); // Restore context state
}

/**
 * Creates a new canvas containing the final composed image (base + elements).
 * Used for saving or copying.
 * @returns {HTMLCanvasElement} A new canvas element with the final image data.
 */
export function prepareFinalCanvas() {
  const finalCanvas = document.createElement('canvas');
  const finalCtx = finalCanvas.getContext('2d', {
    alpha: true, // Keep alpha for PNG transparency
    willReadFrequently: false // Not reading back from this final canvas
  });

  if (!this.offscreenCanvas || this.offscreenCanvas.width === 0 || this.offscreenCanvas.height === 0) {
    console.error("Cannot prepare final canvas: Offscreen canvas is invalid.");
    finalCanvas.width = 1; 
    finalCanvas.height = 1; 
    return finalCanvas;
  }

  // Base image is the current state of the offscreen canvas
  const sourceWidth = this.offscreenCanvas.width;
  const sourceHeight = this.offscreenCanvas.height;
  finalCanvas.width = sourceWidth;
  finalCanvas.height = sourceHeight;

  // 1. Draw the base image
  finalCtx.imageSmoothingEnabled = false; // Preserve sharpness
  finalCtx.drawImage(this.offscreenCanvas, 0, 0);

  // 2. Draw Annotation Elements (Blackout Rects)
  if (this.elements.annotationElements && this.elements.annotationElements.length > 0) {
    this.elements.annotationElements.forEach(element => {
      if (!element) return;
      if (element.type === 'rect') {
        finalCtx.fillStyle = element.color;
        finalCtx.fillRect(element.x, element.y, element.width, element.height);
      }
      // Add other shapes here if implemented
    });
  }

  // 3. Draw Arrow Elements
  if (this.elements.arrowElements && this.elements.arrowElements.length > 0) {
    this.elements.arrowElements.forEach(element => {
      if (!element) return;
      if (element.type === 'arrow') {
        // Pass the correct headSize from the element or default
        const headSize = element.headSize || this.config.arrowHeadSize;
        this.drawArrow(finalCtx, element.x1, element.y1, element.x2, element.y2, element.color, headSize);
      }
    });
  }

  // 4. Draw Text Elements (on top)
  if (this.elements.textElements && this.elements.textElements.length > 0) {
    finalCtx.textBaseline = 'top';
    this.elements.textElements.forEach(element => {
      if (!element || !element.text) return;
      finalCtx.font = element.font;
      finalCtx.fillStyle = element.color;
      // Apply shadow for contrast
      finalCtx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      finalCtx.shadowOffsetX = 1; 
      finalCtx.shadowOffsetY = 1; 
      finalCtx.shadowBlur = 2;
      finalCtx.fillText(element.text, element.x, element.y);
      // Reset shadow
      finalCtx.shadowOffsetX = 0; 
      finalCtx.shadowOffsetY = 0; 
      finalCtx.shadowBlur = 0;
    });
  }

  console.log("Prepared final canvas including annotations, arrows, and text elements.");
  return finalCanvas;
}