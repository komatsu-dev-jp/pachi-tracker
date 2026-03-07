import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 部署データ
  const departments = [
    {
      name: "開発部",
      nameEn: "Development",
      description: "パチンコ・パチスロツールの設計・開発を担当",
      color: "#6366f1",
      icon: "💻",
      workflows: [
        {
          name: "新機能開発フロー",
          description: "新しいツール機能を企画から実装・リリースまで管理",
          order: 1,
          steps: [
            { name: "要件定義", description: "クライアントや営業からの要望を整理し要件を定義する", order: 1, assignee: "プロダクトマネージャー", deadline: "1週間" },
            { name: "技術設計", description: "システムアーキテクチャ・データ設計・API設計を行う", order: 2, assignee: "テックリード", deadline: "1週間" },
            { name: "実装", description: "コーディング・ユニットテスト作成・コードレビューを実施", order: 3, assignee: "開発エンジニア", deadline: "2〜4週間" },
            { name: "結合テスト", description: "各モジュールを統合し動作確認を行う", order: 4, assignee: "QAエンジニア", deadline: "1週間" },
            { name: "リリース", description: "本番環境へのデプロイ・動作確認・ドキュメント整備", order: 5, assignee: "DevOpsエンジニア", deadline: "2日" },
          ],
        },
        {
          name: "バグ修正フロー",
          description: "発見された不具合を迅速に修正・展開するプロセス",
          order: 2,
          steps: [
            { name: "バグ受付", description: "QAまたはカスタマーサポートからバグ報告を受付・記録", order: 1, assignee: "開発リード", deadline: "即日" },
            { name: "再現確認・調査", description: "バグの再現手順を確認し原因を特定する", order: 2, assignee: "開発エンジニア", deadline: "1〜2日" },
            { name: "修正実装", description: "バグ修正コードを実装しコードレビューを実施", order: 3, assignee: "開発エンジニア", deadline: "1〜3日" },
            { name: "テスト・検証", description: "修正が正しく機能し他への影響がないことを確認", order: 4, assignee: "QAエンジニア", deadline: "1日" },
            { name: "緊急リリース", description: "修正版を本番環境に適用・ユーザーへ通知", order: 5, assignee: "DevOpsエンジニア", deadline: "1日" },
          ],
        },
        {
          name: "コードレビューフロー",
          description: "品質を保つための標準コードレビュープロセス",
          order: 3,
          steps: [
            { name: "PRの作成", description: "実装完了後にプルリクエストを作成・変更内容を記述", order: 1, assignee: "開発エンジニア", deadline: "即日" },
            { name: "自動チェック", description: "CIによる自動テスト・Lintチェックを通過させる", order: 2, assignee: "CI/CDシステム", deadline: "30分" },
            { name: "ピアレビュー", description: "チームメンバー2名以上がコードをレビューしApprove", order: 3, assignee: "シニアエンジニア", deadline: "1〜2日" },
            { name: "マージ・デプロイ", description: "承認後にmainブランチへマージしステージング環境へデプロイ", order: 4, assignee: "開発リード", deadline: "即日" },
          ],
        },
      ],
    },
    {
      name: "営業部",
      nameEn: "Sales",
      description: "パチンコホールへの販売活動・顧客関係管理を担当",
      color: "#f59e0b",
      icon: "💼",
      workflows: [
        {
          name: "新規顧客獲得フロー",
          description: "リード発掘から契約締結までの営業プロセス",
          order: 1,
          steps: [
            { name: "リード発掘", description: "展示会・紹介・Web等からパチンコホールのリード情報を収集", order: 1, assignee: "営業担当", deadline: "随時" },
            { name: "アプローチ・ヒアリング", description: "初回接触を行い顧客の課題・ニーズをヒアリングする", order: 2, assignee: "営業担当", deadline: "1週間以内" },
            { name: "提案書作成", description: "ヒアリング内容をもとにカスタマイズした提案書を作成", order: 3, assignee: "営業担当 + 開発部", deadline: "1週間" },
            { name: "デモ・プレゼン", description: "製品デモを実施し提案内容をプレゼンテーション", order: 4, assignee: "営業担当", deadline: "要調整" },
            { name: "条件交渉・見積", description: "価格・サポート条件等の交渉と最終見積書提出", order: 5, assignee: "営業マネージャー", deadline: "1週間" },
            { name: "契約締結", description: "契約書の確認・署名・入金確認を完了", order: 6, assignee: "営業部長 + 経理", deadline: "随時" },
          ],
        },
        {
          name: "既存顧客フォローフロー",
          description: "既存顧客の満足度維持・アップセル・継続契約管理",
          order: 2,
          steps: [
            { name: "定期チェックイン", description: "月次で既存顧客に連絡し利用状況・満足度を確認", order: 1, assignee: "営業担当", deadline: "毎月" },
            { name: "利用状況分析", description: "システム利用データを分析し課題・改善点を特定", order: 2, assignee: "営業担当 + 開発部", deadline: "月次" },
            { name: "追加提案", description: "新機能・オプションサービスのアップセル提案を実施", order: 3, assignee: "営業担当", deadline: "四半期" },
            { name: "更新交渉", description: "契約更新の3ヶ月前から更新条件の交渉を開始", order: 4, assignee: "営業マネージャー", deadline: "契約3ヶ月前" },
          ],
        },
      ],
    },
    {
      name: "マーケティング部",
      nameEn: "Marketing",
      description: "市場調査・ブランディング・販売促進活動を担当",
      color: "#ec4899",
      icon: "📣",
      workflows: [
        {
          name: "キャンペーン企画・実施フロー",
          description: "マーケティングキャンペーンの立案から効果測定まで",
          order: 1,
          steps: [
            { name: "市場調査", description: "パチンコ業界のトレンド・競合製品・顧客ニーズを調査", order: 1, assignee: "マーケティングアナリスト", deadline: "2週間" },
            { name: "ターゲット設定", description: "ターゲットセグメント・ペルソナを定義し訴求ポイントを決定", order: 2, assignee: "マーケティングマネージャー", deadline: "1週間" },
            { name: "コンテンツ制作", description: "広告クリエイティブ・LP・資料等のコンテンツを制作", order: 3, assignee: "デザイナー + ライター", deadline: "2〜3週間" },
            { name: "チャネル展開", description: "Web・展示会・業界媒体等のチャネルでキャンペーンを展開", order: 4, assignee: "マーケティング担当", deadline: "キャンペーン期間" },
            { name: "効果測定・改善", description: "KPIに基づく効果測定とPDCAサイクルの実行", order: 5, assignee: "マーケティングアナリスト", deadline: "月次" },
          ],
        },
        {
          name: "製品ローンチフロー",
          description: "新製品・新機能のリリース告知から普及までのマーケティング",
          order: 2,
          steps: [
            { name: "ローンチ計画策定", description: "リリース日・告知スケジュール・プロモーション計画を策定", order: 1, assignee: "マーケティングマネージャー", deadline: "リリース6週間前" },
            { name: "プレスリリース作成", description: "業界メディア向けのプレスリリースを作成・配信", order: 2, assignee: "広報担当", deadline: "リリース2週間前" },
            { name: "告知コンテンツ制作", description: "SNS・メール・Web用の告知コンテンツを制作", order: 3, assignee: "デザイナー + ライター", deadline: "リリース1週間前" },
            { name: "リリース告知", description: "全チャネルで一斉に製品ローンチを告知・展開", order: 4, assignee: "マーケティングチーム", deadline: "リリース当日" },
            { name: "フォローアップ", description: "問い合わせ対応・追加コンテンツ発信・効果測定", order: 5, assignee: "マーケティング担当", deadline: "リリース後1ヶ月" },
          ],
        },
      ],
    },
    {
      name: "カスタマーサポート部",
      nameEn: "Customer Support",
      description: "顧客からの問い合わせ・技術サポート・クレーム対応を担当",
      color: "#10b981",
      icon: "🎧",
      workflows: [
        {
          name: "問い合わせ対応フロー",
          description: "顧客からの問い合わせを受付から解決まで管理",
          order: 1,
          steps: [
            { name: "問い合わせ受付", description: "電話・メール・チャットからの問い合わせを受付・チケット発行", order: 1, assignee: "サポート担当", deadline: "即日" },
            { name: "内容確認・分類", description: "問い合わせ内容を確認しカテゴリ・優先度を設定", order: 2, assignee: "サポート担当", deadline: "2時間以内" },
            { name: "一次回答", description: "FAQや既知の解決策で即時回答できる場合は即対応", order: 3, assignee: "サポート担当", deadline: "当日" },
            { name: "エスカレーション", description: "技術的に複雑な問題は開発部にエスカレーション", order: 4, assignee: "サポートリード + 開発部", deadline: "翌営業日" },
            { name: "解決・クローズ", description: "問題解決後に顧客へ連絡し満足度確認・チケットをクローズ", order: 5, assignee: "サポート担当", deadline: "解決次第" },
          ],
        },
        {
          name: "クレーム対応フロー",
          description: "顧客クレームを迅速かつ誠実に対応し信頼を維持",
          order: 2,
          steps: [
            { name: "クレーム受付・傾聴", description: "クレームを真摯に受け止め状況・経緯を詳しくヒアリング", order: 1, assignee: "サポートマネージャー", deadline: "即日" },
            { name: "事実確認・調査", description: "社内でクレームの事実確認を行い原因を特定", order: 2, assignee: "サポートマネージャー + 開発部", deadline: "1〜2日" },
            { name: "対応方針決定", description: "謝罪・補償・改善策等の対応方針を経営陣と協議して決定", order: 3, assignee: "部門長", deadline: "2日以内" },
            { name: "顧客への説明・対処", description: "調査結果と対応方針を顧客に丁寧に説明し実施", order: 4, assignee: "サポートマネージャー", deadline: "3日以内" },
            { name: "再発防止策の実施", description: "同様クレームが起きないよう社内プロセスを改善", order: 5, assignee: "各部門", deadline: "1ヶ月以内" },
          ],
        },
      ],
    },
    {
      name: "経理・財務部",
      nameEn: "Finance & Accounting",
      description: "財務管理・経理処理・予算管理・資金調達を担当",
      color: "#f97316",
      icon: "💰",
      workflows: [
        {
          name: "月次決算フロー",
          description: "毎月末の経理処理・決算報告を確実に実施",
          order: 1,
          steps: [
            { name: "経費データ集計", description: "各部署の経費申請・領収書を回収し勘定科目別に集計", order: 1, assignee: "経理担当", deadline: "月末3営業日前" },
            { name: "売上・入金確認", description: "売上計上・入金確認・未回収債権のチェックを実施", order: 2, assignee: "経理担当", deadline: "月末" },
            { name: "仕訳・入力", description: "すべての取引を会計システムに仕訳・入力", order: 3, assignee: "経理担当", deadline: "月末" },
            { name: "試算表確認・調整", description: "試算表を作成し異常値・入力ミスをチェック・修正", order: 4, assignee: "経理マネージャー", deadline: "翌月3日" },
            { name: "月次報告書作成", description: "P/L・B/S・キャッシュフロー等の月次報告書を作成", order: 5, assignee: "CFO", deadline: "翌月5日" },
          ],
        },
        {
          name: "予算管理フロー",
          description: "年間予算の策定から実績管理・修正までのサイクル",
          order: 2,
          steps: [
            { name: "事業計画の確認", description: "経営方針・事業目標を経営陣から共有を受ける", order: 1, assignee: "CFO", deadline: "期初1ヶ月前" },
            { name: "各部門への予算要求", description: "各部署に翌期の予算要求を提出させる", order: 2, assignee: "経理マネージャー", deadline: "期初2週間前" },
            { name: "予算審査・調整", description: "提出予算を審査し全社予算との整合性を調整", order: 3, assignee: "CFO + 経営陣", deadline: "期初1週間前" },
            { name: "予算承認・通知", description: "最終予算を役員会で承認し各部署へ通知", order: 4, assignee: "CEO + 取締役会", deadline: "期初" },
            { name: "月次予実管理", description: "予算対実績を毎月比較し差異原因を分析・報告", order: 5, assignee: "経理担当", deadline: "毎月5日" },
          ],
        },
        {
          name: "請求・入金管理フロー",
          description: "顧客への請求から入金確認・未収管理までのプロセス",
          order: 3,
          steps: [
            { name: "請求書発行", description: "契約・納品完了後に請求書を発行・顧客へ送付", order: 1, assignee: "経理担当", deadline: "納品後3日以内" },
            { name: "入金確認", description: "指定期日に入金確認を行いシステムへ消込処理", order: 2, assignee: "経理担当", deadline: "入金期日翌日" },
            { name: "未入金フォロー", description: "期日に未入金の場合は営業部と連携しフォロー連絡", order: 3, assignee: "経理担当 + 営業部", deadline: "期日後3日" },
            { name: "債権回収対応", description: "長期未収の場合は法的対応含む回収手続きを実施", order: 4, assignee: "CFO + 顧問弁護士", deadline: "30日超過後" },
          ],
        },
      ],
    },
    {
      name: "品質管理部",
      nameEn: "Quality Assurance",
      description: "製品・システムの品質保証・テスト・リリース管理を担当",
      color: "#8b5cf6",
      icon: "🔍",
      workflows: [
        {
          name: "リリース前テストフロー",
          description: "製品リリース前の包括的なテストプロセス",
          order: 1,
          steps: [
            { name: "テスト計画書作成", description: "テスト範囲・手法・スケジュール・担当者を定義したテスト計画書を作成", order: 1, assignee: "QAリード", deadline: "開発完了1週間前" },
            { name: "テストケース作成", description: "機能要件・非機能要件に基づくテストケースを網羅的に作成", order: 2, assignee: "QAエンジニア", deadline: "開発完了前" },
            { name: "機能テスト実施", description: "全機能の動作確認・境界値テスト・異常系テストを実施", order: 3, assignee: "QAエンジニア", deadline: "テスト期間" },
            { name: "回帰テスト", description: "既存機能への影響がないことを自動化テストで確認", order: 4, assignee: "QAエンジニア", deadline: "テスト期間" },
            { name: "パフォーマンステスト", description: "負荷テスト・応答速度・メモリ使用量等を測定・評価", order: 5, assignee: "QAエンジニア", deadline: "テスト期間" },
            { name: "リリース承認", description: "テスト結果レポートを確認し品質基準を満たすか判断・承認", order: 6, assignee: "QAマネージャー + CTO", deadline: "リリース前日" },
          ],
        },
        {
          name: "バグトラッキングフロー",
          description: "発見したバグの記録・優先順位付け・修正確認プロセス",
          order: 2,
          steps: [
            { name: "バグ発見・記録", description: "バグを発見したら再現手順・環境・スクリーンショットを詳細記録", order: 1, assignee: "QAエンジニア", deadline: "発見次第" },
            { name: "重要度・優先度設定", description: "バグの重要度（Critical/High/Medium/Low）と優先度を設定", order: 2, assignee: "QAリード", deadline: "1時間以内" },
            { name: "開発部への割り当て", description: "バグチケットを担当開発者に割り当て修正期限を設定", order: 3, assignee: "QAリード + 開発リード", deadline: "即日" },
            { name: "修正確認テスト", description: "開発者の修正完了後に再テストし問題が解消されたか確認", order: 4, assignee: "QAエンジニア", deadline: "修正完了後1日" },
            { name: "クローズ・記録", description: "テスト合格後チケットをクローズし知識ベースに記録", order: 5, assignee: "QAエンジニア", deadline: "確認後即日" },
          ],
        },
      ],
    },
    {
      name: "総務・人事部",
      nameEn: "HR & General Affairs",
      description: "採用・育成・労務管理・総務全般を担当",
      color: "#14b8a6",
      icon: "👥",
      workflows: [
        {
          name: "採用フロー",
          description: "人材要件の定義から内定・入社までの採用プロセス",
          order: 1,
          steps: [
            { name: "採用要件定義", description: "各部署の採用ニーズをヒアリングし人材要件・JDを作成", order: 1, assignee: "HRマネージャー + 採用部門", deadline: "採用開始1ヶ月前" },
            { name: "募集・ソーシング", description: "求人媒体・エージェント・リファラル等で候補者を募集", order: 2, assignee: "HR担当", deadline: "随時" },
            { name: "書類選考", description: "応募書類を選考基準に基づき評価・通過者に面接日程を連絡", order: 3, assignee: "HR担当 + 採用部門", deadline: "受付後3日" },
            { name: "一次面接", description: "HR担当との面接でカルチャーフィット・基本スキルを確認", order: 4, assignee: "HRマネージャー", deadline: "書類通過後1週間" },
            { name: "二次面接・技術評価", description: "部門長・技術担当との面接・実技テスト等を実施", order: 5, assignee: "部門長 + 技術リード", deadline: "一次通過後1週間" },
            { name: "内定・オファー", description: "最終合否を決定し内定者にオファーレターを提示", order: 6, assignee: "HRマネージャー + 経営陣", deadline: "最終面接後3日" },
          ],
        },
        {
          name: "入社オンボーディングフロー",
          description: "新入社員が早期に活躍できるための入社受け入れプロセス",
          order: 2,
          steps: [
            { name: "入社前準備", description: "PC・アカウント・席・備品等の入社前準備を完了させる", order: 1, assignee: "総務担当 + IT担当", deadline: "入社3日前" },
            { name: "入社初日オリエンテーション", description: "会社概要・規則・ツール・チームを紹介するオリエンテーション実施", order: 2, assignee: "HRマネージャー", deadline: "入社初日" },
            { name: "部署配属・業務説明", description: "所属部署での業務内容・目標・ルールの説明とツール設定", order: 3, assignee: "部門長 + メンター", deadline: "入社1週間" },
            { name: "OJT・実践研修", description: "メンターが実務を通じて必要なスキル・知識を指導", order: 4, assignee: "メンター", deadline: "入社1ヶ月" },
            { name: "1ヶ月・3ヶ月フィードバック", description: "上司・HR・本人の三者でフィードバック面談を実施し課題を確認", order: 5, assignee: "HRマネージャー + 上司", deadline: "入社1・3ヶ月後" },
          ],
        },
        {
          name: "評価・報酬管理フロー",
          description: "半期・年次の人事評価から昇給・昇格決定までのプロセス",
          order: 3,
          steps: [
            { name: "目標設定", description: "期初に個人・部門目標をMBO形式で設定し合意する", order: 1, assignee: "上司 + 本人", deadline: "期初2週間以内" },
            { name: "中間レビュー", description: "半期の進捗確認・フィードバック・目標修正を実施", order: 2, assignee: "上司 + 本人", deadline: "半期末" },
            { name: "自己評価", description: "期末に本人が目標達成度・行動評価を自己申告", order: 3, assignee: "全従業員", deadline: "期末2週間前" },
            { name: "上司評価・調整", description: "上司が評価し部門内で評価の公平性を確認・調整", order: 4, assignee: "部門長 + 役員", deadline: "期末" },
            { name: "評価フィードバック面談", description: "最終評価結果を本人にフィードバックし次期目標を議論", order: 5, assignee: "上司", deadline: "期初1週間以内" },
          ],
        },
      ],
    },
  ];

  console.log("🌱 Seeding database...");

  for (const dept of departments) {
    const { workflows, ...deptData } = dept;
    const department = await prisma.department.upsert({
      where: { name: deptData.name },
      update: deptData,
      create: deptData,
    });

    console.log(`✅ Created department: ${department.name}`);

    for (const wf of workflows) {
      const { steps, ...wfData } = wf;
      const workflow = await prisma.workflow.create({
        data: {
          ...wfData,
          departmentId: department.id,
        },
      });

      console.log(`  📋 Created workflow: ${workflow.name}`);

      for (const step of steps) {
        await prisma.step.create({
          data: {
            ...step,
            workflowId: workflow.id,
          },
        });
      }
    }
  }

  console.log("✨ Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
