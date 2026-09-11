// 开局流程只等待选择/进入游戏，不绘制、不加载资源、不碰运行态与存档。
// 保留现有Web循环边界；不是根据UI注释重新推导/修改原版规则。
export async function runStartFlow(steps, initialAction) {
  let nextAct = initialAction;
  for (;;) {
    const act = nextAct === undefined ? await steps.chooseAction() : nextAct;
    nextAct = undefined;
    if (act === 0) {
      const idx = await steps.chooseChapter();
      if (idx < 0) continue;
      let back = false;
      for (;;) {
        const faction = await steps.chooseFaction(idx);
        if (faction < 0) {
          back = true;
          break;
        }
        // undefined返回势力选择；null表示原军师；object表示自定军师。
        const advisor = await steps.chooseAdvisor(idx, faction);
        if (advisor === undefined) continue;
        await steps.beginNewGame(idx, faction, advisor);
        return;
      }
      if (back) continue;
    }
    const slot = await steps.chooseSave();
    if (slot < 0) continue;
    await steps.beginSavedGame(slot);
    return;
  }
}
