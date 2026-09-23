// KI 6A03 出陣提交体 scenario 接线（P43）：native road context 获取 + 6E8F 提交。
// 5E80(AL=8) 玩家资金面板刷新是纯显示（P32 全树零规则写入、零 RNG），由调用方
//（gamebar HUD 刷新）投影，不入规则层。6A10 共享尾声（8853/1D46/20D6 设备帧）
// 沿用各进言既有 gamebar 尾（关闭接见+时钟+重绘），不另建消息分支。
import { scenarioNativeRoadContext } from "../scenarioassembly.js";
import { commitOriginalMonarchDeploy } from "./originalformation.js";

const stop = (at, field) => {
  throw new RangeError(
    `Web engineering Uncovered native monarch deploy ${field} at ${at}`,
  );
};

/**
 * 6A03 commit: 6E8F formation on the monarch slot, CF gate, [DI]&=0xFB.
 * Returns { cf:true } when 6E8F refuses (6A06 jb 6A10: partial writes stay
 * published, no bit clear, no display); { cf:false, slot } on success.
 */
export function performScenarioMonarchDeployCommit(sc, monarchIdx) {
  const context = scenarioNativeRoadContext(sc);
  if (!context) stop("6A03", "road context");
  return commitOriginalMonarchDeploy(sc, context, monarchIdx);
}
