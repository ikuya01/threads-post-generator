/**
 * 初回セットアップウィザード
 */
function showSetupWizard() {
  const html = HtmlService.createHtmlOutput(getSetupHtml_())
    .setTitle('⚙️ 初回セットアップ')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getSetupHtml_() {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', sans-serif; padding: 16px; color: #333; }
    h2 { font-size: 18px; margin-bottom: 8px; }
    p { font-size: 13px; color: #666; margin-bottom: 16px; }
    label { display: block; font-weight: bold; margin: 12px 0 4px; font-size: 13px; }
    input, textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box; }
    textarea { height: 60px; resize: vertical; }
    button { margin-top: 20px; width: 100%; padding: 12px; background: #0095f6; color: white; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
    button:hover { background: #0081d6; }
    .success { color: #22c55e; font-weight: bold; margin-top: 12px; }
    .error { color: #ef4444; margin-top: 12px; }
    .step { background: #f8f9fa; padding: 12px; border-radius: 8px; margin: 8px 0; }
    .step-num { display: inline-block; background: #0095f6; color: white; width: 24px; height: 24px; text-align: center; border-radius: 50%; margin-right: 8px; font-size: 13px; line-height: 24px; }
  </style>
</head>
<body>
  <h2>Threads自動化ツール セットアップ</h2>
  <p>3つのAPIキーを設定するだけで完了です。</p>

  <div class="step">
    <span class="step-num">1</span>
    <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a> でGemini APIキーを取得
  </div>

  <label>Gemini APIキー</label>
  <input type="text" id="geminiKey" placeholder="AIza...">

  <div class="step" style="margin-top: 16px;">
    <span class="step-num">2</span>
    <a href="https://developers.facebook.com/" target="_blank">Meta for Developers</a> でThreadsトークンを取得
  </div>

  <label>Threads アクセストークン</label>
  <textarea id="threadsToken" placeholder="THR..."></textarea>

  <label>Threads ユーザーID</label>
  <input type="text" id="threadsUserId" placeholder="数字のID">

  <button onclick="save()">✅ 保存してセットアップ完了</button>

  <div id="status"></div>

  <script>
    function save() {
      const geminiKey = document.getElementById('geminiKey').value.trim();
      const threadsToken = document.getElementById('threadsToken').value.trim();
      const threadsUserId = document.getElementById('threadsUserId').value.trim();

      if (!geminiKey) {
        document.getElementById('status').innerHTML = '<p class="error">Gemini APIキーを入力してください</p>';
        return;
      }

      document.getElementById('status').innerHTML = '<p>保存中...</p>';
      google.script.run
        .withSuccessHandler(function() {
          document.getElementById('status').innerHTML = '<p class="success">✅ セットアップ完了！<br>台本入力シートから始めてください。</p>';
        })
        .withFailureHandler(function(e) {
          document.getElementById('status').innerHTML = '<p class="error">エラー: ' + e.message + '</p>';
        })
        .saveApiKeys(geminiKey, threadsToken, threadsUserId);
    }
  </script>
</body>
</html>`;
}

/**
 * APIキーをScript Propertiesに保存
 */
function saveApiKeys(geminiKey, threadsToken, threadsUserId) {
  const props = PropertiesService.getScriptProperties();

  if (geminiKey) props.setProperty('GEMINI_API_KEY', geminiKey);
  if (threadsToken) props.setProperty('THREADS_ACCESS_TOKEN', threadsToken);
  if (threadsUserId) props.setProperty('THREADS_USER_ID', threadsUserId);
  props.setProperty('SETUP_COMPLETE', 'true');
  props.setProperty('TOKEN_SAVED_AT', new Date().toISOString());

  // 設定シート更新
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('⚙️ 設定');
  if (settingsSheet) {
    settingsSheet.getRange('B2').setValue(geminiKey ? '設定済み ✓' : '未設定');
    settingsSheet.getRange('B3').setValue(threadsToken ? '設定済み ✓' : '未設定');
    settingsSheet.getRange('B4').setValue(threadsUserId || '未設定');
    settingsSheet.getRange('B12').setValue('TRUE');
  }

  // シートが未作成なら作成
  initializeSheets_();

  // トリガー設定
  createTriggersIfNeeded_();
}

/**
 * 必要なシートを初期化
 */
function initializeSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 🎬 台本入力
  let sheet = ss.getSheetByName('🎬 台本入力');
  if (!sheet) {
    sheet = ss.insertSheet('🎬 台本入力');
    sheet.appendRow(['台本テキスト', '訴求軸メモ', 'ステータス', '生成日時', '案1', '案2', '案3', '案4', '案5', '転送']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setColumnWidth(1, 400);
    sheet.setColumnWidth(5, 350);
    sheet.setColumnWidth(6, 350);
    sheet.setColumnWidth(7, 350);
    sheet.setColumnWidth(8, 350);
    sheet.setColumnWidth(9, 350);
  }

  // 📋 投稿管理
  sheet = ss.getSheetByName('📋 投稿管理');
  if (!sheet) {
    sheet = ss.insertSheet('📋 投稿管理');
    sheet.appendRow([
      '投稿ID', 'Threads投稿ID', '投稿テキスト', 'ステータス', '投稿日時',
      '元台本', 'いいね数', 'リプライ数', 'リポスト数', 'リーチ数',
      'バズスコア', 'テーマタグ', 'フォーマット型', '最終更新', '投稿する'
    ]);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
    sheet.setColumnWidth(3, 500);
    sheet.setColumnWidth(12, 120);
    sheet.setColumnWidth(13, 120);
  }

  // 📊 インサイト
  sheet = ss.getSheetByName('📊 インサイト');
  if (!sheet) {
    sheet = ss.insertSheet('📊 インサイト');
    sheet.appendRow(['記録日時', '投稿ID', 'Threads投稿ID', 'いいね数', 'リプライ数', 'リポスト数', 'リーチ数', '経過時間(h)']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  }

  // 📈 ダッシュボード
  sheet = ss.getSheetByName('📈 ダッシュボード');
  if (!sheet) {
    sheet = ss.insertSheet('📈 ダッシュボード');
    sheet.getRange('A1').setValue('📈 パフォーマンスダッシュボード').setFontSize(16).setFontWeight('bold');
    sheet.getRange('A2').setValue('「📱 Threads自動化 → ダッシュボードを更新」で最新化されます').setFontColor('#888');
  }

  // ⚙️ 設定
  sheet = ss.getSheetByName('⚙️ 設定');
  if (!sheet) {
    sheet = ss.insertSheet('⚙️ 設定');
    const settings = [
      ['項目', '値', '説明'],
      ['Gemini APIキー', '未設定', 'Google AI Studioで取得'],
      ['Threads トークン', '未設定', 'Meta Developer Appで取得'],
      ['Threads ユーザーID', '未設定', 'Meta Developer Appで確認'],
      ['生成案数', '3', '1回の生成で作る投稿案の数'],
      ['インサイト取得間隔', '6', '時間ごとに自動取得'],
      ['Geminiモデル', 'gemini-2.5-flash', '使用するGeminiモデル'],
      ['バズスコア重み（いいね）', '1', ''],
      ['バズスコア重み（リプライ）', '2', 'Threadsアルゴリズムで最重要'],
      ['バズスコア重み（リポスト）', '3', '拡散力が最も高い'],
      ['プロンプトテンプレート', '', '空欄ならデフォルト使用'],
      ['セットアップ完了', 'FALSE', ''],
    ];
    sheet.getRange(1, 1, settings.length, 3).setValues(settings);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 300);
    sheet.setColumnWidth(3, 250);
  }
}

/**
 * 定期トリガーを作成（未作成の場合のみ）
 */
function createTriggersIfNeeded_() {
  const triggers = ScriptApp.getProjectTriggers();
  const existingNames = triggers.map(t => t.getHandlerFunction());

  if (!existingNames.includes('fetchAllInsights')) {
    ScriptApp.newTrigger('fetchAllInsights')
      .timeBased()
      .everyHours(6)
      .create();
  }

  if (!existingNames.includes('updateDashboard')) {
    ScriptApp.newTrigger('updateDashboard')
      .timeBased()
      .everyDays(1)
      .atHour(0)
      .create();
  }
}
