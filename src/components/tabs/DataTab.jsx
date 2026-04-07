import React from "react";
import { C, f, sc, mono } from "../../constants";
import { Card, SecLabel, LineChart } from "../Atoms";

export function DataTab({ ev, S }) {
    const archives = S.archives || [];

    // Group archives by date to get daily totals for a chart
    const dailyData = React.useMemo(() => {
        const map = {};
        archives.forEach((a) => {
            const d = a.date || "";
            if (!map[d]) map[d] = 0;
            const invest = a.investYen || 0;
            const recovery = a.recoveryYen || 0;
            if (invest > 0 || recovery > 0) {
                map[d] += recovery - invest;
            } else {
                map[d] += a.stats?.workAmount || 0;
            }
        });
        return Object.entries(map)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, value]) => ({ label: date.slice(5), value: Math.round(value) }));
    }, [archives]);

    // Cumulative work amount data for chart
    const cumWorkData = React.useMemo(() => {
        return [...archives]
            .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
            .reduce(({ items, cum }, a) => {
                const newCum = cum + (a.stats?.workAmount || 0);
                return { items: [...items, { label: a.date?.slice(5) || "", value: Math.round(newCum) }], cum: newCum };
            }, { items: [], cum: 0 }).items;
    }, [archives]);

    const stats = [
        { label: "トータル収支", val: f(S.totalBalance), unit: "円", col: sc(S.totalBalance) },
        { label: "トータル仕事量", val: f(S.totalWorkAmount), unit: "円", col: sc(S.totalWorkAmount) },
        { label: "実測1Kスタート", val: ev.start1K > 0 ? f(ev.start1K, 1) : "—", unit: "回/K", col: C.teal },
        { label: "欠損/余剰", val: f(S.totalBalance - S.totalWorkAmount), unit: "円", col: sc(S.totalBalance - S.totalWorkAmount) },
    ];

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {stats.map((s, i) => (
                    <Card key={i} style={{ padding: "12px 16px", background: "rgba(255,255,255,0.02)" }}>
                        <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 700, letterSpacing: 0.5 }}>{s.label}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: s.col, fontFamily: mono }}>{s.val}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>{s.unit}</div>
                        </div>
                    </Card>
                ))}
            </div>

            <Card style={{ padding: 16, marginBottom: 16 }}>
                <SecLabel label="累計仕事量推移" />
                <div style={{ height: 160, marginTop: 8 }}>
                    {cumWorkData.length > 1 ? (
                        <LineChart data={cumWorkData} color={C.blue} />
                    ) : (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontSize: 12 }}>
                            データが不足しています
                        </div>
                    )}
                </div>
            </Card>

            <Card style={{ padding: 16, marginBottom: 16 }}>
                <SecLabel label="日別収支" />
                <div style={{ height: 160, marginTop: 8 }}>
                    {dailyData.length > 1 ? (
                        <LineChart data={dailyData} color={C.green} />
                    ) : (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontSize: 12 }}>
                            データが不足しています
                        </div>
                    )}
                </div>
            </Card>

            <Card style={{ padding: 16 }}>
                <SecLabel label="稼働サマリー" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginTop: 8 }}>
                    {[
                        ["稼働日数", `${archives.length}日`],
                        ["総回転数", `${f(S.totalNetRot)}回`],
                        ["初当たり回数", `${S.totalJpCount}回`],
                        ["平均仕事量/日", `${archives.length > 0 ? f(Math.round(S.totalWorkAmount / archives.length)) : 0}円`],
                        ["平均時給", `${S.totalHours > 0 ? f(Math.round(S.totalWorkAmount / S.totalHours)) : 0}円/h`],
                        ["稼働時間", `${f(S.totalHours, 1)}h`],
                    ].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                            <span style={{ fontSize: 11, color: C.sub }}>{l}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: mono }}>{v}</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
