/**
 * Threads投稿自動化ツール（GAS完結版）
 * メインエントリーポイント・メニュー定義
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📱 Threads自動化')
    .addItem('🚀 投稿案を生成', 'generateFromScript')
    .addItem('📤 選択を投稿管理へ転送', 'transferToManagement')
    .addSeparator()
    .addItem('📡 選択行をThreadsに投稿', 'postSelectedRow')
    .addItem('📊 全投稿のインサイトを取得', 'fetchAllInsights')
    .addSeparator()
    .addItem('📈 ダッシュボードを更新', 'updateDashboard')
    .addSeparator()
    .addItem('⚙️ 初回セットアップ', 'showSetupWizard')
    .addToUi();

  // 初回セットアップ未完了なら自動でウィザード表示
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_COMPLETE') !== 'true') {
    showSetupWizard();
  }
}

/**
 * 台本入力シートから投稿案を生成
 */
function generateFromScript() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inputSheet = ss.getSheetByName('🎬 台本入力');
  if (!inputSheet) {
    SpreadsheetApp.getUi().alert('「🎬 台本入力」シートが見つかりません');
    return;
  }

  // アクティブな行の台本を取得
  const row = inputSheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('2行目以降の台本セルを選択してください');
    return;
  }

  const script = inputSheet.getRange(row, 1).getValue(); // A列: 台本
  const axis = inputSheet.getRange(row, 2).getValue();    // B列: 訴求軸メモ

  if (!script) {
    SpreadsheetApp.getUi().alert('A列に台本テキストを入力してください');
    return;
  }

  // ステータス更新
  inputSheet.getRange(row, 3).setValue('生成中...');
  inputSheet.getRange(row, 4).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    // パフォーマンス学習データを取得
    const performanceInsights = getPerformanceInsights_();

    // Gemini APIで投稿案を生成
    const drafts = callGeminiGenerate_(script, axis, performanceInsights);

    if (!drafts || drafts.length === 0) {
      inputSheet.getRange(row, 3).setValue('エラー: 生成結果なし');
      return;
    }

    // E〜I列に投稿案を書き込み（最大5案）
    for (let i = 0; i < Math.min(drafts.length, 5); i++) {
      inputSheet.getRange(row, 5 + i).setValue(drafts[i].text || drafts[i].content || '');
    }

    inputSheet.getRange(row, 3).setValue('完了');
    SpreadsheetApp.getUi().alert('投稿案を' + drafts.length + '件生成しました！\nE〜I列をご確認ください。');

  } catch (e) {
    inputSheet.getRange(row, 3).setValue('エラー: ' + e.message);
    SpreadsheetApp.getUi().alert('生成エラー: ' + e.message);
  }
}

/**
 * パフォーマンス学習用のインサイトサマリーを取得
 */
function getPerformanceInsights_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');
  if (!mgmtSheet || mgmtSheet.getLastRow() < 2) return '';

  const data = mgmtSheet.getDataRange().getValues();
  const headers = data[0];
  const scoreCol = headers.indexOf('バズスコア');
  const textCol = headers.indexOf('投稿テキスト');
  const likesCol = headers.indexOf('いいね数');
  const repliesCol = headers.indexOf('リプライ数');
  const repostsCol = headers.indexOf('リポスト数');

  if (scoreCol === -1 || textCol === -1) return '';

  // スコアがある行を収集
  const scored = [];
  for (let i = 1; i < data.length; i++) {
    const score = data[i][scoreCol];
    if (score && score > 0) {
      scored.push({
        text: data[i][textCol],
        score: score,
        likes: data[i][likesCol] || 0,
        replies: data[i][repliesCol] || 0,
        reposts: data[i][repostsCol] || 0,
      });
    }
  }

  if (scored.length < 5) return '';

  // スコア降順ソート
  scored.sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3);
  const bottom3 = scored.slice(-3);

  let insights = '## あなたの投稿パフォーマンス分析\n\n';
  insights += '### エンゲージメントが高い投稿\n';
  top3.forEach(p => {
    insights += `- [♥${p.likes} 💬${p.replies} ↻${p.reposts}] ${p.text.substring(0, 80)}\n`;
  });
  insights += '\n### エンゲージメントが低い投稿\n';
  bottom3.forEach(p => {
    insights += `- [♥${p.likes} 💬${p.replies} ↻${p.reposts}] ${p.text.substring(0, 80)}\n`;
  });

  return insights;
}
