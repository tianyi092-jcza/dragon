// Presentation-only cache: immutable layout bytes, no Scenario/navigation writes.
// 512px interiors with a tile gutter, bounded to 32 (<37 MiB RGBA), rather
// than 96 MiB per full season. Gutters prevent fractional-scale edge seams.
export function createChunkedTerrain(atlas, bytes, world, {
  createCanvas = () => document.createElement('canvas'), maxChunks = 32,
} = {}) {
  const { width, height, tileSize } = world;
  if (tileSize !== 16 || bytes.length !== width * height ||
      !Number.isInteger(maxChunks) || maxChunks < 1)
    throw new TypeError('Invalid chunked terrain');
  const layout = Uint8Array.from(bytes);
  const chunkTiles = 32;
  const pixels = chunkTiles * tileSize;
  const cache = new Map();
  let fractionalDprImage = null;
  function chunk(cx, cy) {
    const key = `${cx},${cy}`;
    let canvas = cache.get(key);
    if (canvas) cache.delete(key);
    else {
      canvas = createCanvas();
      const startX = Math.max(0, cx * chunkTiles - 1);
      const startY = Math.max(0, cy * chunkTiles - 1);
      canvas.width = (Math.min(width, (cx + 1) * chunkTiles + 1) - startX) * tileSize;
      canvas.height = (Math.min(height, (cy + 1) * chunkTiles + 1) - startY) * tileSize;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D unavailable');
      context.imageSmoothingEnabled = false;
      for (let ty = 0; ty < canvas.height / tileSize; ty++)
        for (let tx = 0; tx < canvas.width / tileSize; tx++) {
          const tile = layout[(startY + ty) * width + startX + tx];
          context.drawImage(atlas, (tile % 16) * 16, Math.floor(tile / 16) * 16,
            16, 16, tx * 16, ty * 16, 16, 16);
        }
    }
    cache.set(key, canvas);
    while (cache.size > maxChunks) cache.delete(cache.keys().next().value);
    return canvas;
  }
  return Object.freeze({
    draw(context, x, y, scale, viewportWidth, viewportHeight) {
      // MapView's approved product view is locked to 1:1 (zoomAt resets to 1).
      // Do not promise pixel equivalence at unimplemented fractional zoom levels.
      if (scale !== 1) throw new TypeError('Chunked terrain requires current 1:1 map scale');
      const transform = context.getTransform();
      if (!Number.isInteger(transform.a) || !Number.isInteger(transform.d)) {
        // Browser nearest-neighbour rounding differs by texture extent at
        // fractional DPR. Preserve the original single-texture sampling there.
        // This exceptional one-season buffer is discarded on integer DPR.
        if (!fractionalDprImage) {
          fractionalDprImage = createCanvas();
          fractionalDprImage.width = width * tileSize;
          fractionalDprImage.height = height * tileSize;
          const full = fractionalDprImage.getContext('2d');
          for (let cy = 0; cy < Math.ceil(height / chunkTiles); cy++)
            for (let cx = 0; cx < Math.ceil(width / chunkTiles); cx++)
              full.drawImage(chunk(cx, cy), Math.max(0, cx * pixels - tileSize), Math.max(0, cy * pixels - tileSize));
          cache.clear();
        }
        context.drawImage(fractionalDprImage, x, y, width * tileSize, height * tileSize);
        return;
      }
      fractionalDprImage = null;
      const left = Math.max(0, Math.floor(-x / (pixels * scale)));
      const top = Math.max(0, Math.floor(-y / (pixels * scale)));
      const right = Math.min(Math.ceil(width / chunkTiles), Math.ceil((viewportWidth - x) / (pixels * scale)));
      const bottom = Math.min(Math.ceil(height / chunkTiles), Math.ceil((viewportHeight - y) / (pixels * scale)));
      for (let cy = top; cy < bottom; cy++) for (let cx = left; cx < right; cx++) {
        const image = chunk(cx, cy);
        const leftEdge = Math.ceil(x + cx * pixels * scale);
        const topEdge = Math.ceil(y + cy * pixels * scale);
        const rightEdge = Math.ceil(x + Math.min(width * tileSize, (cx + 1) * pixels) * scale);
        const bottomEdge = Math.ceil(y + Math.min(height * tileSize, (cy + 1) * pixels) * scale);
        context.save();
        context.beginPath();
        context.rect(leftEdge, topEdge, rightEdge - leftEdge, bottomEdge - topEdge);
        context.clip();
        context.drawImage(image, x + Math.max(0, cx * pixels - tileSize) * scale,
          y + Math.max(0, cy * pixels - tileSize) * scale,
          image.width * scale, image.height * scale);
        context.restore();
      }
    },
    cacheSize: () => cache.size,
  });
}
