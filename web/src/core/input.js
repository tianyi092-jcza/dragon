// 输入处理 — 滚轮缩放 / 拖拽平移 / 悬停拾取 / 点击选择
export function attachInput(view, { onHover, onSelect, uiHit, onWheel, beginPanelDrag }) {
  const cv = view.cv;
  let drag = null;

  window.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      onWheel?.(e);
    },
    { passive: false },
  );

  cv.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // 仅左键触发地图拖拽平移
    drag = {
      mx: e.clientX,
      my: e.clientY,
      startX: e.clientX, startY: e.clientY,
      movePanel: beginPanelDrag?.(e.clientX, e.clientY),
      moved: false,
      ui: uiHit?.(e.clientX, e.clientY),
    };
  });

  // 右键点击处理 (contextmenu): 优先派发给 onSelect 处理 UI/层级回退
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    drag = null; // 右键立即打断任何拖拽状态
    onSelect?.(view.pick(e.clientX, e.clientY), e);
  });

  addEventListener("mouseup", (e) => {
    if (e.button === 0) {
      if (drag && !drag.moved) onSelect?.(view.pick(e.clientX, e.clientY), e);
      drag = null;
    }
  });

  addEventListener("mousemove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.mx,
        dy = e.clientY - drag.my;
      if (drag.movePanel) {
        const tx = e.clientX - drag.startX, ty = e.clientY - drag.startY;
        if (Math.abs(tx) + Math.abs(ty) > 3) drag.moved = true;
        if (drag.moved) drag.movePanel(tx, ty);
      } else if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.ui && !drag.movePanel) {
        view.pan(dx, dy);
      }
      drag.mx = e.clientX;
      drag.my = e.clientY;
      view.draw();
    } else {
      onHover?.(view.pick(e.clientX, e.clientY), e);
    }
  });
  addEventListener("blur", () => { drag = null; });
  addEventListener("keydown", (e) => {
    if (e.key === "0") {
      view.fit();
      view.draw();
    }
  });
  addEventListener("resize", () => {
    view.clampCam?.(); // 窗口变化后重新钳制地图边界
    view.draw();
  });
}
