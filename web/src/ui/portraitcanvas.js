// Presentation-only DOM host for an already decoded owned private portrait.
// Does not fetch, grant authority, create blob URLs or modify the PNG decoder.
export function createPortraitCanvas(handle, documentRef = globalThis.document) {
  if (!handle || handle.width !== 128 || handle.height !== 128 ||
      !handle.image || handle.image.width !== 128 || handle.image.height !== 128 ||
      typeof handle.dispose !== "function" || !documentRef ||
      typeof documentRef.createElement !== "function") {
    throw new TypeError("HUD_PORTRAIT_IMAGE");
  }
  const canvas = documentRef.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "君主頭像");
  // Same dimensions/pixel sampling/border as web/index.html #card img.
  Object.assign(canvas.style, {
    width: "128px", height: "128px", imageRendering: "pixelated",
    border: "1px solid #6b5335", borderRadius: "4px",
  });
  const context = canvas.getContext("2d");
  if (!context) throw new TypeError("HUD_PORTRAIT_CANVAS");
  context.imageSmoothingEnabled = false;
  context.drawImage(handle.image, 0, 0, 128, 128);
  return canvas;
}
