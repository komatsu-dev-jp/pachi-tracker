# P-EVIDENCE 翌日予測・精度向上版の数式仕様

更新日: 2026-07-27

## 結論

P-EVIDENCEは、単に「昨日よく回った台」を上位へ出す仕組みではありません。

現在は次の順に計算します。

1. 差玉から当日の実測回転率を推定する
2. 店舗・機種・島・曜日の過去傾向へ、データ量に応じて寄せる
3. 一晩で釘が変わる誤差を予測幅へ足す
4. 翌日の締め確率を予測平均と予測幅へ反映する
5. 平均値ではなく「安全側回転率」で台を並べる
6. 過去の推奨上位台に高め予測の癖があり、過去だけの検証で改善した場合に限り自動補正する

これにより、データが多いだけで信頼度が100%へ近づくことや、52台など多数から偶然上振れした1台を選びやすい問題を抑えます。

## 1. 差玉から当日回転率を出す

記号:

- `S`: 通常回転数
- `H`: 大当り回数
- `P`: 1回当り平均出玉
- `D`: 差玉
- `I`: 推定投入玉
- `r`: 250玉当り回転率

```text
I = H × P - D
r = 250 × S ÷ I
```

差玉は「払い出し − 投入」なので、投入玉は「払い出し − 差玉」で逆算できます。

## 2. 店舗・機種・島・曜日を使った事前平均

事前平均（データが薄いときの出発点）は、カタログボーダーだけではなく、当日より前の店舗・機種・島・曜日と、同日の他台を使います。

各グループの信頼度:

```text
groupReliability = groupInputBalls ÷ (groupInputBalls + 50,000)
```

事前平均:

```text
priorMean
  = border
  + Σ(groupWeight × groupReliability × groupResidual)
```

`groupResidual` は「そのグループの実測回転率 − その台のボーダー」です。補正幅は安全のため `±4回/k` に制限します。

同日平均では対象台自身を除外し、過去平均では対象日より後のデータを使いません。

## 3. 観測データと事前平均を合わせる

```text
effectivePriorBalls = max(2,500, muraCoef × 0.25)
dataConfidence
  = observedInputBalls
  ÷ (observedInputBalls + effectivePriorBalls)

basePrediction
  = observedRate × dataConfidence
  + priorMean × (1 − dataConfidence)
```

以前の `0.5^(投入玉/7000)` による半減期減衰は使いません。投入玉が増えるほど測定誤差は減りますが、一晩で釘が変わる可能性は消えないためです。

## 4. 一晩の日次変動

過去の「前日予測 → 翌日実測」から、測定誤差では説明できない一晩の変動を推定します。

```text
innovationError = previousPrediction − nextDayActual

processVariance
  = robustVariance(innovationError)
  − median(previousPosteriorVariance + nextDayMeasurementVariance)
```

店舗×機種の件数が少ない場合は全体値へ縮めます。12件未満では安全側の初期値 `SD = 1.75回/k` を使い、学習後も `1.5〜5.0回/k` の範囲に制限します。

翌日予測分散:

```text
nextDayVariance = posteriorVariance + processVariance
```

翌日信頼度:

```text
nextDayConfidence
  = dataConfidence × 4 ÷ (4 + processVariance)
```

大量の玉数があっても、初期の日次変動では信頼度は約57%が上限です。

重要: 日次変動は予測幅を広げる項目です。これだけでは予測平均を下げません。予測平均を下げるのは次の締め遷移です。

## 5. 締め遷移を予測平均へ反映する

締め確率 `p_tight` は、次を階層的に集計します。

- 現在が良状態か悪状態か
- 前日に急に開いたか
- 翌日の曜日
- イベント日の翌日か

件数が少ない条件は、8件分の全体事前値へ縮めます。

締め後平均は、過去の締め発生日における「実測 − ボーダー」の店舗×機種平均を全体平均へ縮めて求めます。

```text
mixtureMean
  = (1 − p_tight) × heldMean
  + p_tight × tightenedMean
```

締める場合と据え置く場合が混在する不確実性:

```text
transitionVariance
  = p_tight × (1 − p_tight)
  × (heldMean − tightenedMean)^2

finalVariance
  = nextDayVariance + transitionVariance
```

95%予測範囲:

```text
predictionLow  = finalMean − 1.96 × sqrt(finalVariance)
predictionHigh = finalMean + 1.96 × sqrt(finalVariance)
```

締め確率はここで回転率へ直接反映するため、同じ締め確率をスコアからもう一度減点しません。

## 6. 安全側回転率（LCB）で順位付け

LCBは Lower Confidence Bound（下側信頼限界のことです）の略です。

```text
safeRotation
  = finalPrediction − k × sqrt(finalVariance)

selectionMargin
  = safeRotation − effectiveBorder
```

現在は `k = 1.0` です。台の順位は `selectionMargin` が大きい順です。

平均予測が高くても予測幅が大きい台は下がり、少し平均が低くてもデータが安定した台が上がります。

## 7. 推奨上位台だけの偏り補正

過去の各日について、その日までのデータだけで安全側順位を作り、上位5台だけを別集計します。

```text
bias = average(prediction − actual)
reliability = n ÷ (n + 20)
proposedCorrection
  = −clamp(bias × reliability, −3, +3)
```

自動反映の条件:

- 上位5台の答え合わせが20件以上
- 日付を順に進める検証で、補正前より補正後のMAEが悪化しない
- 補正量が `0.05回/k` 以上

条件未達では計算候補だけを保持し、予測値は変更しません。

## 8. 店舗×機種の平均出玉補正

同じ日・店舗・機種・台番号の「差玉スキャン」と「実戦実測回転率」を組み合わせます。

```text
actualInputBalls = 250 × scanNormalSpins ÷ actualRate
impliedPayout
  = (actualInputBalls + scanDeltaBalls) ÷ scanHitCount

payoutFactor
  = median(impliedPayout ÷ catalogPayout)
```

実戦投入750玉以上、係数 `0.6〜1.4` の正常範囲にあるペアだけを使い、店舗×機種で10ペア以上になったら反映します。

学習に使った当日へ遡って補正せず、最新証拠日の翌日から適用します。これにより、同じ実戦記録を学習と予測へ二重使用しません。

実戦実測を予測へ追加した場合も、一晩の日次変動と締め遷移の分散は残します。実測量が増えても、翌日信頼度が日次変動による上限を超えることはありません。

## 9. イベント日とムラ係数

- 差玉解析の保存画面で「通常日・旧イベント日・特定日・店舗イベント」を選べます。
- 保存したイベント種別から「イベント日の翌日」の締め率を学習します。
- `P大海物語5 MTE2` には初期ムラ係数 `50,000玉` を明示登録しています。

## 10. 検証方法

バックテスト（過去データで予測を答え合わせすることです）は、日付を1日ずつ進めます。

過去日の予測を作るとき、後日のデータは次のどれにも使いません。

- 店舗・機種・島・曜日の事前平均
- 日次変動
- 締め確率
- 偏り補正

画面では次を確認できます。

- 全台のMAE・偏り・95%範囲内率
- 推奨上位5台だけのMAE・偏り
- verdict別・スコア帯別
- 日次変動SDと学習件数
- 偏り補正が「学習中・効果確認中・自動反映中」のどれか
- 店舗別平均出玉補正のペア件数
