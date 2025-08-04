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

  // Use the original image dimensions for maximum quality
  const sourceWidth = this.offscreenCanvas.width;
  const sourceHeight = this.offscreenCanvas.height;
  finalCanvas.width = sourceWidth;
  finalCanvas.height = sourceHeight;

  // Enable high-quality rendering for the final canvas
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';

  // Clear the canvas with a white background for better compatibility
  finalCtx.fillStyle = '#FFFFFF';
  finalCtx.fillRect(0, 0, sourceWidth, sourceHeight);

  // 1. Draw the base image with high quality
  finalCtx.drawImage(this.offscreenCanvas, 0, 0);

  // 2. Draw Annotation Elements (Blackout Rects) with crisp edges
  if (this.elements.annotationElements && this.elements.annotationElements.length > 0) {
    this.elements.annotationElements.forEach(element => {
      if (!element) return;
      if (element.type === 'rect') {
        // Use crisp black rectangles for better quality
        finalCtx.fillStyle = '#000000';
        finalCtx.fillRect(
          Math.round(element.x), 
          Math.round(element.y), 
          Math.round(element.width), 
          Math.round(element.height)
        );
      }
      // Add other shapes here if implemented
    });
  }

  console.log(`Prepared final canvas at ${sourceWidth}x${sourceHeight} resolution.`);
  return finalCanvas;
}