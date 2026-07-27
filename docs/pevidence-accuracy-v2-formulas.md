# P-EVIDENCE 翌日予測・精度向上版の数式仕様

更新日: 2026-07-27

## 結論

P-EVIDENCEは、単に「昨日よく回った台」を上位へ出す仕組みではありません。

現在は次の順に計算します。

1. 差玉から当日の実測回転率を推定する
2. 店舗・機種・島・曜日の過去傾向へ、データ量に応じて寄せる
3. 一晩で釘が変わる誤差を予測幅へ足す
4. 翌日の締め確率を予測平均と予測幅へ反映する
5. 平均値ではなく「判断用下限（80%目標）」で候補を決める
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
- `σ_hit`: 大当り1回ごとの実出玉の標準偏差
- `step`: 差玉グラフの読取刻み（既定500玉）

```text
I = H × P - D
r = 250 × S ÷ I
```

差玉は「払い出し − 投入」なので、投入玉は「払い出し − 差玉」で逆算できます。

投入玉の観測誤差:

```text
inputVariance
  = H × σ_hit^2
  + step^2 ÷ 12
```

ここで使うのは「大当り1回ごとの出玉誤差」です。2,200回転を遊んだときの収支標準偏差は、初当たり回数の運まで含む別の数字なので、回転率の観測誤差には使いません。両方を混ぜると、同じ不確実性を二重に数えて予測幅が不自然に広がります。

`P大海物語5 MTE2` は特図1・特図2とも10R固定です。実出玉を1,400玉として計算し、大当り1回ごとの出玉標準偏差は `σ_hit = 0`、グラフの読取誤差だけを残します。

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

表示用の95%予測範囲:

```text
predictionLow  = finalMean − 1.959964 × sqrt(finalVariance)
predictionHigh = finalMean + 1.959964 × sqrt(finalVariance)
```

締め確率はここで回転率へ直接反映するため、同じ締め確率をスコアからもう一度減点しません。

この95%範囲は「起こり得る広い範囲」を見るための表示です。下端は下位2.5%点なので、毎日の着席基準には使いません。

## 6. 判断用下限（80%目標）で候補判定

着席判断には下位20%点を使います。言い換えると、実際の翌日回転率が下限以上になる割合を80%へ合わせる指標です。

```text
decisionLower
  = finalMean − k × sqrt(finalVariance)

selectionMargin
  = decisionLower − (effectiveBorder + 0.5)
```

翌日実績が100件未満では、標準正規分布の下位20%点に対応する `k = 0.841621` を暫定値として使います。

100件に達したら、その時点までの予測と翌日実績だけで係数を校正します。

```text
standardizedOverprediction
  = (prediction − actual) ÷ predictionSD

k
  = empirical80thPercentile(standardizedOverprediction)
```

直近最大300件を使い、極端な値による暴走を防ぐため `k` は `0.25〜2.5` に制限します。各過去日の予測では、その日より後の実績を使いません。

「座る基準」は実質ボーダーより0.5回/k高い値です。基準を超える確率も同じ平均・分散から計算します。

```text
seatThreshold = effectiveBorder + 0.5

P(rotation >= seatThreshold)
  = Φ((finalMean − seatThreshold) ÷ predictionSD)
```

候補表示:

- `候補`: 判断用下限が座る基準以上
- `試し打ち`: 下限は未達だが、基準超え確率が50%以上
- `見送り`: 基準超え確率が50%未満、または締め傾向を検知
- `算定待ち`: 最新の有効データがない

台の順位は `selectionMargin` が大きい順です。

平均予測が高くても予測幅が大きい台は下がり、少し平均が低くてもデータが安定した台が上がります。

## 7. 推奨上位台だけの偏り補正

過去の各日について、その日までのデータだけで判断用下限の順位を作り、上位5台だけを別集計します。

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
- 判断用下限の校正
- 偏り補正

画面では次を確認できます。

- 全台のMAE・偏り・95%範囲内率
- 判断用下限以上になった割合（目標80%）と分位点損失
- 座る基準超え確率のBrierスコア（確率予測の誤差です）
- 誤着席率と見逃し率
- 推奨上位5台だけのMAE・偏り
- verdict別・スコア帯別・信頼度帯別・データ量帯別
- 日次変動SDと学習件数
- 判断用下限が「暫定値・実績校正済み」のどちらか
- 偏り補正が「学習中・効果確認中・自動反映中」のどれか
- 店舗別平均出玉補正のペア件数
