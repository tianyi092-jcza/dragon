import {
  showInstanceMessage,
  startSingleInstance,
} from "./core/singleinstance.js";

try {
  const runtime = await startSingleInstance();
  if (runtime?.state === "active") {
    const { mountOpening } = await import("../intro/app.js");
    const opening = await mountOpening();
    const { publicPlayerRequest, launchPublicPlayer, bindFormalGame } = await import("./player/playerpublic.js");
    const request = publicPlayerRequest(location.search);
    const module = await import("./main.js");
    if (request) await launchPublicPlayer({ opening, startApp: module.startApp, request });
    else await module.startApp(opening, { formalBinder: bindFormalGame });
  } else {
    // 已由 singleinstance 显示阻塞说明；绝不能初始化第二个 App/RAF/存档写入者。
  }
} catch (error) {
  showInstanceMessage(`遊戲無法啟動。\n${error?.message ?? error}`);
}
