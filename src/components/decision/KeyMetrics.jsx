import { MiniStat } from "../Atoms";
import { sc, sp, f } from "../../constants";

export function KeyMetrics({ ev }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
      <MiniStat label="EV/K" val={ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"} col={sc(ev.ev1K)} />
      <MiniStat label="ボーダー差" val={ev.bDiff !== 0 ? sp(ev.bDiff, 1) : "—"} col={sc(ev.bDiff)} />
      <MiniStat label="1Kスタート" val={ev.start1K > 0 ? f(ev.start1K, 1) : "—"} col={sc(ev.bDiff)} />
      <MiniStat label="仕事量" val={ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—"} col={sc(ev.workAmount)} />
    </div>
  );
}
