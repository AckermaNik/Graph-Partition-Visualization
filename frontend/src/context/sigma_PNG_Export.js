/**
 * Export a Sigma v3 graph with optional overlay as PNG
 * @param {object} sigma Sigma instance
 * @param {HTMLCanvasElement} overlayCanvas Optional overlay canvas (can be null)
 * @param {string} filename Name of the exported PNG file
 */
export function exportGraphWithOverlay(sigma, overlayCanvas = null, filename = 'graph.png') {
  if (!sigma) throw new Error('Sigma instance is required');

  // 1. FORCE a synchronous render call
  // This draws the graph to the WebGL internal buffer IMMEDIATELY.
  sigma.render();

  // 1. Get Sigma's WebGL canvas
  const sigmaCanvas = sigma.getContainer().querySelector('canvas');
  if (!sigmaCanvas) throw new Error('Could not find Sigma canvas');

  const container = sigma.getContainer();
  // Find ALL canvases (Sigma v3 uses multiple: edges, nodes, labels, etc.)
  const layers = Array.from(container.querySelectorAll('canvas'));

  if (layers.length === 0) throw new Error('No canvases found');

  // 2. Create the export canvas based on the first layer's size
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = layers[0].width;
  exportCanvas.height = layers[0].height;
  const ctx = exportCanvas.getContext('2d');

  // 3. Fill the background white (otherwise it defaults to transparent/black)
  ctx.fillStyle = '#f8f9fa'; // light grey/white background
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  // 4. Draw every Sigma layer in order
  layers.forEach((canvas) => {
    ctx.drawImage(canvas, 0, 0);
  });

  // 5. Draw your UI Overlay (Buttons, Legend, etc.) if provided
  if (overlayCanvas instanceof HTMLCanvasElement) {
    ctx.drawImage(overlayCanvas, 0, 0);
  }

  // 5. Convert to PNG and trigger download
  // toDataURL is synchronous, ensuring we grab the pixels before the buffer clears
  const dataURL = exportCanvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  a.click();
}
