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
    .addItem('🎨 選択行の画像を生成', 'generateImageForPost')
    .addItem('🎨 全投稿の画像を一括生成', 'generateAllImages')
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
/**
 * Gemini API連携
 * - 投稿案生成
 * - バズパターン分析
 */

/**
 * Gemini APIで台本から投稿案を生成
 * @param {string} script - YouTube台本テキスト
 * @param {string} axis - 訴求軸メモ（任意）
 * @param {string} performanceInsights - パフォーマンス学習テキスト（任意）
 * @returns {Array<Object>} [{text: "投稿文", theme: "テーマ", format: "フォーマット型"}, ...]
 */
function callGeminiGenerate_(script, axis, performanceInsights) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません。セットアップを実行してください。');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('⚙️ 設定');

  // 生成数を設定から取得
  let draftCount = 3;
  if (settingsSheet) {
    draftCount = Number(settingsSheet.getRange('B5').getValue()) || 3;
  }

  // カスタムプロンプトテンプレートがあれば使用
  let customPrompt = '';
  if (settingsSheet) {
    customPrompt = settingsSheet.getRange('B11').getValue() || '';
  }

  const model = getGeminiModel_();

  // システムプロンプト
  const systemPrompt = `あなたはThreads投稿の専門家です。成果（いいね・リプライ・リポスト・フォロワー獲得）を最大化する投稿を作成してください。

## ルール
- 1投稿は150〜300文字が最適（500文字以内）
- 冒頭1行でスクロールを止める（数字・逆張り・問いかけのいずれかを使う）
- 必ず「リプライを誘発する仕掛け」を1つ入れる（二択質問・経験を聞く・予測させる等）
- 台本の内容をそのまま要約しない。台本から得られる気づき・学び・視点を独立した投稿として書く
- 各案は異なるテーマ・切り口にする
- ハッシュタグは付けない（別途管理するため）
- 絵文字は控えめに（0〜2個まで）`;

  // ユーザープロンプト構築
  let userPrompt = '';

  if (customPrompt) {
    userPrompt = customPrompt.replace('{SCRIPT}', script).replace('{AXIS}', axis || '');
  } else {
    userPrompt = `以下のYouTube台本から、Threads投稿を${draftCount}案生成してください。

## YouTube台本
${script}`;

    if (axis) {
      userPrompt += `\n\n## 訴求軸のヒント\n${axis}`;
    }
  }

  if (performanceInsights) {
    userPrompt += `\n\n${performanceInsights}\n上記の分析結果を参考に、エンゲージメントが高くなりやすいパターンで生成してください。`;
  }

  userPrompt += `\n\n## 出力形式
必ず以下のJSON配列で返してください（JSON以外のテキストは含めないで）:
[
  {"text": "投稿文1", "theme": "テーマタグ（2-3単語）", "format": "フォーマット型名"},
  {"text": "投稿文2", "theme": "テーマタグ", "format": "フォーマット型名"}
]

フォーマット型は以下から選択:
観察型 / 問いかけ型 / 対比型 / 告白型 / 逆張り型 / 変化型 / 行動提案型 / 学び型 / 失敗談型 / 数字型 / 賛否両論型`;

  // API呼び出し
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  const payload = {
    contents: [{
      parts: [{ text: userPrompt }]
    }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4096,
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Gemini API Error: ' + response.getContentText().substring(0, 200));
  }

  const json = JSON.parse(response.getContentText());
  const resultText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseJsonResponse_(resultText);
}

/**
 * GeminiレスポンスからJSON配列を抽出
 */
function parseJsonResponse_(text) {
  // ```json ... ``` を除去
  if (text.includes('```json')) {
    text = text.split('```json')[1].split('```')[0];
  } else if (text.includes('```')) {
    text = text.split('```')[1].split('```')[0];
  }

  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch (e) {
    // JSONパース失敗時はテキストをそのまま返す
    return [{ text: text.trim().substring(0, 500), theme: '', format: '' }];
  }
}

/**
 * Geminiでバズパターンを分析
 * @returns {string} 分析レポートテキスト
 */
function callGeminiAnalyze_() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return 'Gemini APIキー未設定';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');
  if (!mgmtSheet || mgmtSheet.getLastRow() < 2) return 'データ不足（投稿管理シートにデータがありません）';

  // 投稿データを収集
  const data = mgmtSheet.getDataRange().getValues();
  const headers = data[0];

  const posts = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const score = row[headers.indexOf('バズスコア')];
    if (!score || score <= 0) continue;

    posts.push({
      text: (row[headers.indexOf('投稿テキスト')] || '').toString().substring(0, 200),
      likes: row[headers.indexOf('いいね数')] || 0,
      replies: row[headers.indexOf('リプライ数')] || 0,
      reposts: row[headers.indexOf('リポスト数')] || 0,
      score: score,
      theme: row[headers.indexOf('テーマタグ')] || '',
      format: row[headers.indexOf('フォーマット型')] || '',
    });
  }

  if (posts.length < 5) return 'データ不足（スコアのある投稿が5件未満）';

  // スコア降順ソート
  posts.sort((a, b) => b.score - a.score);
  const top5 = posts.slice(0, 5);
  const bottom5 = posts.slice(-5);

  const prompt = `以下は同一ユーザーのThreads投稿のパフォーマンスデータです。

## エンゲージメントが高い投稿（上位5件）
${top5.map(p => `[♥${p.likes} 💬${p.replies} ↻${p.reposts} Score:${p.score}] テーマ:${p.theme} 型:${p.format}\n${p.text}`).join('\n\n')}

## エンゲージメントが低い投稿（下位5件）
${bottom5.map(p => `[♥${p.likes} 💬${p.replies} ↻${p.reposts} Score:${p.score}] テーマ:${p.theme} 型:${p.format}\n${p.text}`).join('\n\n')}

## 全体統計
- 総投稿数: ${posts.length}件
- 平均スコア: ${(posts.reduce((s, p) => s + p.score, 0) / posts.length).toFixed(1)}
- 最高スコア: ${posts[0].score}

## 分析してください
1. 高エンゲージメント投稿に共通するパターン（テーマ・構造・書き出し・リプライ誘発の仕掛け）
2. 低エンゲージメント投稿の改善ポイント
3. テーマ別のパフォーマンス傾向
4. 次の投稿で意識すべきアクション（3つ）

簡潔にまとめてください。`;

  const model = getGeminiModel_();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) return 'Gemini API Error';

  const json = JSON.parse(response.getContentText());
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '分析結果なし';
}
/**
 * Threads API連携
 * - 2ステップ投稿（コンテナ作成→公開）
 * - インサイト取得
 */

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

/**
 * 選択行をThreadsに投稿
 */
function postSelectedRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');
  if (!mgmtSheet) {
    SpreadsheetApp.getUi().alert('投稿管理シートが見つかりません');
    return;
  }

  const row = mgmtSheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('投稿する行を選択してください');
    return;
  }

  const headers = mgmtSheet.getRange(1, 1, 1, mgmtSheet.getLastColumn()).getValues()[0];
  const textCol = headers.indexOf('投稿テキスト');
  const statusCol = headers.indexOf('ステータス');
  const imgUrlCol = headers.indexOf('画像URL');

  // ヘッダーが見つからない場合は従来の固定列にフォールバック
  const text = textCol !== -1
    ? mgmtSheet.getRange(row, textCol + 1).getValue()
    : mgmtSheet.getRange(row, 3).getValue(); // C列: 投稿テキスト（旧来の固定列）
  const status = statusCol !== -1
    ? mgmtSheet.getRange(row, statusCol + 1).getValue()
    : mgmtSheet.getRange(row, 4).getValue(); // D列: ステータス（旧来の固定列）
  const imageUrl = imgUrlCol !== -1
    ? mgmtSheet.getRange(row, imgUrlCol + 1).getValue()
    : '';

  if (!text) {
    SpreadsheetApp.getUi().alert('投稿テキストがありません');
    return;
  }

  if (status === '投稿済') {
    SpreadsheetApp.getUi().alert('この投稿は既に投稿済みです');
    return;
  }

  // 確認ダイアログ
  const ui = SpreadsheetApp.getUi();
  const imageNote = imageUrl ? '\n\n🎨 画像付き投稿として送信します。' : '';
  const result = ui.alert(
    '投稿確認',
    '以下の内容をThreadsに投稿しますか？\n\n' + text.toString().substring(0, 200) + '...' + imageNote,
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) return;

  try {
    const postResult = imageUrl
      ? postToThreadsWithImage_(text.toString(), imageUrl.toString())
      : postToThreads_(text.toString());

    // シート更新
    mgmtSheet.getRange(row, 2).setValue(postResult.postId);  // Threads投稿ID
    mgmtSheet.getRange(row, 4).setValue('投稿済');            // ステータス
    mgmtSheet.getRange(row, 5).setValue(new Date());          // 投稿日時
    mgmtSheet.getRange(row, 14).setValue(new Date());         // 最終更新

    SpreadsheetApp.getUi().alert('✅ Threadsに投稿しました！\nPost ID: ' + postResult.postId);

  } catch (e) {
    mgmtSheet.getRange(row, 4).setValue('エラー');
    SpreadsheetApp.getUi().alert('❌ 投稿エラー: ' + e.message);
  }
}

/**
 * Threads API 2ステップ投稿
 * @param {string} text - 投稿テキスト
 * @returns {Object} {postId: string}
 */
function postToThreads_(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('THREADS_ACCESS_TOKEN');
  const userId = props.getProperty('THREADS_USER_ID');

  if (!token || !userId) {
    throw new Error('Threads APIの認証情報が設定されていません。セットアップを実行してください。');
  }

  // Step 1: メディアコンテナ作成
  const createUrl = THREADS_API_BASE + '/' + userId + '/threads';
  const createResponse = UrlFetchApp.fetch(createUrl, {
    method: 'post',
    payload: {
      media_type: 'TEXT',
      text: text,
      access_token: token,
    },
    muteHttpExceptions: true,
  });

  if (createResponse.getResponseCode() !== 200) {
    const err = JSON.parse(createResponse.getContentText());
    throw new Error('コンテナ作成失敗: ' + (err.error?.message || createResponse.getResponseCode()));
  }

  const containerId = JSON.parse(createResponse.getContentText()).id;

  // 待機（テキスト投稿は短めでOK）
  Utilities.sleep(5000);

  // Step 2: 公開
  const publishUrl = THREADS_API_BASE + '/' + userId + '/threads_publish';
  const publishResponse = UrlFetchApp.fetch(publishUrl, {
    method: 'post',
    payload: {
      creation_id: containerId,
      access_token: token,
    },
    muteHttpExceptions: true,
  });

  if (publishResponse.getResponseCode() !== 200) {
    const err = JSON.parse(publishResponse.getContentText());
    throw new Error('公開失敗: ' + (err.error?.message || publishResponse.getResponseCode()));
  }

  const postId = JSON.parse(publishResponse.getContentText()).id;
  return { postId: postId };
}

/**
 * 全投稿のインサイトを取得してシートに書き戻す
 */
function fetchAllInsights() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('THREADS_ACCESS_TOKEN');
  if (!token) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');
  const insightSheet = ss.getSheetByName('📊 インサイト');
  if (!mgmtSheet || !insightSheet) return;

  const data = mgmtSheet.getDataRange().getValues();
  if (data.length < 2) return;

  const headers = data[0];
  const threadsIdCol = headers.indexOf('Threads投稿ID');
  const statusCol = headers.indexOf('ステータス');
  const postIdCol = headers.indexOf('投稿ID');
  const likesCol = headers.indexOf('いいね数');
  const repliesCol = headers.indexOf('リプライ数');
  const repostsCol = headers.indexOf('リポスト数');
  const reachCol = headers.indexOf('リーチ数');
  const scoreCol = headers.indexOf('バズスコア');
  const updatedCol = headers.indexOf('最終更新');
  const postedAtCol = headers.indexOf('投稿日時');

  let updated = 0;
  const startTime = new Date().getTime();

  for (let i = 1; i < data.length; i++) {
    // 5分経過チェック（GAS制限対策）
    if (new Date().getTime() - startTime > 300000) break;

    const threadsId = data[i][threadsIdCol];
    const status = data[i][statusCol];

    if (!threadsId || status !== '投稿済') continue;

    try {
      const insights = fetchPostInsights_(threadsId.toString(), token);
      if (!insights) continue;

      const row = i + 1;
      const likes = insights.likes || 0;
      const replies = insights.replies || 0;
      const reposts = insights.reposts || 0;
      const views = insights.views || 0;

      // 投稿管理シート更新
      mgmtSheet.getRange(row, likesCol + 1).setValue(likes);
      mgmtSheet.getRange(row, repliesCol + 1).setValue(replies);
      mgmtSheet.getRange(row, repostsCol + 1).setValue(reposts);
      mgmtSheet.getRange(row, reachCol + 1).setValue(views);
      mgmtSheet.getRange(row, scoreCol + 1).setValue(calculateBuzzScore_(likes, replies, reposts));
      mgmtSheet.getRange(row, updatedCol + 1).setValue(new Date());

      // インサイトシートにログ追記
      const postedAt = data[i][postedAtCol];
      const elapsedHours = postedAt ? Math.round((new Date() - new Date(postedAt)) / 3600000) : '';

      insightSheet.appendRow([
        new Date(),
        data[i][postIdCol],
        threadsId,
        likes,
        replies,
        reposts,
        views,
        elapsedHours,
      ]);

      updated++;
      Utilities.sleep(500); // レート制限対策

    } catch (e) {
      // 個別エラーはスキップして続行
      continue;
    }
  }

  if (updated > 0) {
    Logger.log(updated + '件のインサイトを更新しました');
  }
}

/**
 * 画像付きThreads投稿（2ステップ）
 * @param {string} text - 投稿テキスト
 * @param {string} imageUrl - 公開画像URL
 * @returns {Object} {postId: string}
 */
function postToThreadsWithImage_(text, imageUrl) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('THREADS_ACCESS_TOKEN');
  const userId = props.getProperty('THREADS_USER_ID');

  if (!token || !userId) {
    throw new Error('Threads APIの認証情報が設定されていません');
  }

  // Step 1: 画像コンテナ作成
  const createUrl = THREADS_API_BASE + '/' + userId + '/threads';
  const createResponse = UrlFetchApp.fetch(createUrl, {
    method: 'post',
    payload: {
      media_type: 'IMAGE',
      image_url: imageUrl,
      text: text,
      access_token: token,
    },
    muteHttpExceptions: true,
  });

  if (createResponse.getResponseCode() !== 200) {
    const err = JSON.parse(createResponse.getContentText());
    throw new Error('画像コンテナ作成失敗: ' + (err.error?.message || createResponse.getResponseCode()));
  }

  const containerId = JSON.parse(createResponse.getContentText()).id;

  // 画像の場合は少し長めに待機
  Utilities.sleep(10000);

  // Step 2: 公開
  const publishUrl = THREADS_API_BASE + '/' + userId + '/threads_publish';
  const publishResponse = UrlFetchApp.fetch(publishUrl, {
    method: 'post',
    payload: {
      creation_id: containerId,
      access_token: token,
    },
    muteHttpExceptions: true,
  });

  if (publishResponse.getResponseCode() !== 200) {
    const err = JSON.parse(publishResponse.getContentText());
    throw new Error('公開失敗: ' + (err.error?.message || publishResponse.getResponseCode()));
  }

  const postId = JSON.parse(publishResponse.getContentText()).id;
  return { postId: postId };
}

/**
 * 個別投稿のインサイトを取得
 * @param {string} threadsMediaId - Threads投稿ID
 * @param {string} token - アクセストークン
 * @returns {Object|null} {likes, replies, reposts, views}
 */
function fetchPostInsights_(threadsMediaId, token) {
  const url = THREADS_API_BASE + '/' + threadsMediaId + '/insights';

  const response = UrlFetchApp.fetch(url + '?metric=views,likes,replies,reposts&access_token=' + token, {
    method: 'get',
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) return null;

  const json = JSON.parse(response.getContentText());
  const metrics = {};

  (json.data || []).forEach(item => {
    const name = item.name;
    const values = item.values || [];
    if (values.length > 0) {
      metrics[name] = values[0].value || 0;
    }
  });

  return metrics;
}
/**
 * シート操作ユーティリティ
 */

/**
 * 台本入力シートの選択済み投稿案を投稿管理シートに転送
 */
function transferToManagement() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inputSheet = ss.getSheetByName('🎬 台本入力');
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');

  if (!inputSheet || !mgmtSheet) {
    SpreadsheetApp.getUi().alert('必要なシートが見つかりません。セットアップを実行してください。');
    return;
  }

  const row = inputSheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('台本の行を選択してください');
    return;
  }

  const scriptTitle = (inputSheet.getRange(row, 1).getValue() || '').toString().substring(0, 50);
  let transferred = 0;

  // E〜I列（5〜9列）の投稿案をチェック
  for (let col = 5; col <= 9; col++) {
    const text = inputSheet.getRange(row, col).getValue();
    if (text && text.toString().trim()) {
      const nextId = getNextId_(mgmtSheet);

      // テーマタグとフォーマット型をGeminiに自動付与
      let themeTag = '';
      let formatType = '';
      try {
        const tags = callGeminiTag_(text.toString());
        themeTag = tags.theme || '';
        formatType = tags.format || '';
      } catch (e) {
        // タグ付け失敗してもスキップ
      }

      mgmtSheet.appendRow([
        nextId,                    // 投稿ID
        '',                        // Threads投稿ID
        text.toString().trim(),    // 投稿テキスト
        '下書き',                  // ステータス
        '',                        // 投稿日時
        scriptTitle,               // 元台本
        '',                        // いいね数
        '',                        // リプライ数
        '',                        // リポスト数
        '',                        // リーチ数
        '',                        // バズスコア
        themeTag,                  // テーマタグ
        formatType,                // フォーマット型
        new Date(),                // 最終更新
        false,                     // 投稿する（チェックボックス）
      ]);
      transferred++;
    }
  }

  if (transferred > 0) {
    // チェックボックスの設定
    const lastRow = mgmtSheet.getLastRow();
    const checkRange = mgmtSheet.getRange(lastRow - transferred + 1, 15, transferred, 1);
    checkRange.insertCheckboxes();

    SpreadsheetApp.getUi().alert(transferred + '件を投稿管理シートに転送しました！');
  } else {
    SpreadsheetApp.getUi().alert('転送する投稿案が見つかりません。E〜I列に投稿案がありますか？');
  }
}

/**
 * 投稿管理シートの次のIDを生成
 */
function getNextId_(mgmtSheet) {
  const lastRow = mgmtSheet.getLastRow();
  if (lastRow < 2) return 'POST-001';

  const ids = mgmtSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(v => v);
  if (ids.length === 0) return 'POST-001';

  const maxNum = Math.max(...ids.map(id => {
    const m = id.toString().match(/POST-(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }));

  return 'POST-' + String(maxNum + 1).padStart(3, '0');
}

/**
 * バズスコアを計算
 */
function calculateBuzzScore_(likes, replies, reposts) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('⚙️ 設定');

  let wLikes = 1, wReplies = 2, wReposts = 3;
  if (settingsSheet) {
    wLikes = Number(settingsSheet.getRange('B8').getValue()) || 1;
    wReplies = Number(settingsSheet.getRange('B9').getValue()) || 2;
    wReposts = Number(settingsSheet.getRange('B10').getValue()) || 3;
  }

  return (likes * wLikes) + (replies * wReplies) + (reposts * wReposts);
}

/**
 * Geminiでテーマタグとフォーマット型を自動付与
 */
function callGeminiTag_(text) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { theme: '', format: '' };

  const model = getGeminiModel_();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  const payload = {
    contents: [{
      parts: [{
        text: '以下のThreads投稿にテーマタグとフォーマット型を付けてください。\n\n投稿文:\n' + text + '\n\nJSON形式で返してください: {"theme": "テーマ（2-3単語）", "format": "フォーマット型名"}\nフォーマット型は: 観察型/問いかけ型/対比型/告白型/逆張り型/変化型/行動提案型/学び型/失敗談型/数字型 のいずれか'
      }]
    }],
    generationConfig: { temperature: 0.1 }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const json = JSON.parse(response.getContentText());
  const resultText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

  try {
    const match = resultText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {}

  return { theme: '', format: '' };
}

/**
 * 設定シートからGeminiモデル名を取得
 */
function getGeminiModel_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('⚙️ 設定');
  if (settingsSheet) {
    const model = settingsSheet.getRange('B7').getValue();
    if (model) return model.toString();
  }
  return 'gemini-2.5-flash';
}
/**
 * ダッシュボード生成
 * - KPIサマリー
 * - TOP5ランキング
 * - テーマ別パフォーマンス
 * - Geminiバズパターン分析
 */

/**
 * ダッシュボードシートを全面更新
 */
function updateDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');
  const dashSheet = ss.getSheetByName('📈 ダッシュボード');

  if (!mgmtSheet || !dashSheet) {
    Logger.log('必要なシートが見つかりません');
    return;
  }

  // まずインサイトを最新化
  try {
    fetchAllInsights();
  } catch (e) {
    Logger.log('インサイト取得エラー（続行）: ' + e.message);
  }

  // ダッシュボードをクリア（ヘッダー以外）
  if (dashSheet.getLastRow() > 2) {
    dashSheet.getRange(3, 1, dashSheet.getLastRow() - 2, dashSheet.getLastColumn()).clearContent();
  }

  // 投稿データを収集
  const data = mgmtSheet.getDataRange().getValues();
  if (data.length < 2) {
    dashSheet.getRange('A3').setValue('データがまだありません。投稿を始めてください！');
    return;
  }

  const headers = data[0];
  const posts = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const score = row[headers.indexOf('バズスコア')];
    posts.push({
      id: row[headers.indexOf('投稿ID')],
      text: (row[headers.indexOf('投稿テキスト')] || '').toString(),
      status: row[headers.indexOf('ステータス')],
      postedAt: row[headers.indexOf('投稿日時')],
      likes: row[headers.indexOf('いいね数')] || 0,
      replies: row[headers.indexOf('リプライ数')] || 0,
      reposts: row[headers.indexOf('リポスト数')] || 0,
      reach: row[headers.indexOf('リーチ数')] || 0,
      score: score || 0,
      theme: row[headers.indexOf('テーマタグ')] || '',
      format: row[headers.indexOf('フォーマット型')] || '',
    });
  }

  const posted = posts.filter(p => p.status === '投稿済');
  const scored = posted.filter(p => p.score > 0);

  let currentRow = 3;

  // ── KPIサマリー ──
  dashSheet.getRange(currentRow, 1).setValue('📊 KPIサマリー').setFontSize(14).setFontWeight('bold');
  currentRow++;

  const totalPosts = posted.length;
  const totalDrafts = posts.filter(p => p.status === '下書き').length;
  const avgScore = scored.length > 0 ? (scored.reduce((s, p) => s + p.score, 0) / scored.length).toFixed(1) : '-';
  const maxScore = scored.length > 0 ? Math.max(...scored.map(p => p.score)) : '-';
  const totalLikes = posted.reduce((s, p) => s + p.likes, 0);
  const totalReplies = posted.reduce((s, p) => s + p.replies, 0);
  const totalReposts = posted.reduce((s, p) => s + p.reposts, 0);

  const kpiData = [
    ['投稿済み', totalPosts + '件', '下書き残: ' + totalDrafts + '件'],
    ['平均バズスコア', avgScore, '最高: ' + maxScore],
    ['総いいね', totalLikes, ''],
    ['総リプライ', totalReplies, '← Threadsアルゴリズムで最重要'],
    ['総リポスト', totalReposts, ''],
  ];
  dashSheet.getRange(currentRow, 1, kpiData.length, 3).setValues(kpiData);
  dashSheet.getRange(currentRow, 1, kpiData.length, 1).setFontWeight('bold');
  currentRow += kpiData.length + 1;

  // ── TOP5投稿 ──
  dashSheet.getRange(currentRow, 1).setValue('🏆 TOP5 投稿ランキング').setFontSize(14).setFontWeight('bold');
  currentRow++;

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5);

    dashSheet.getRange(currentRow, 1, 1, 5).setValues([['順位', '投稿（先頭80文字）', 'スコア', '♥/💬/↻', 'テーマ']]);
    dashSheet.getRange(currentRow, 1, 1, 5).setFontWeight('bold');
    currentRow++;

    top5.forEach((p, i) => {
      dashSheet.getRange(currentRow, 1, 1, 5).setValues([[
        '#' + (i + 1),
        p.text.substring(0, 80),
        p.score,
        '♥' + p.likes + ' 💬' + p.replies + ' ↻' + p.reposts,
        p.theme,
      ]]);
      currentRow++;
    });
  } else {
    dashSheet.getRange(currentRow, 1).setValue('（スコアのある投稿がまだありません）');
    currentRow++;
  }
  currentRow++;

  // ── テーマ別パフォーマンス ──
  dashSheet.getRange(currentRow, 1).setValue('🏷️ テーマ別パフォーマンス').setFontSize(14).setFontWeight('bold');
  currentRow++;

  const themeMap = {};
  scored.forEach(p => {
    if (!p.theme) return;
    if (!themeMap[p.theme]) {
      themeMap[p.theme] = { count: 0, totalScore: 0, totalLikes: 0, totalReplies: 0 };
    }
    themeMap[p.theme].count++;
    themeMap[p.theme].totalScore += p.score;
    themeMap[p.theme].totalLikes += p.likes;
    themeMap[p.theme].totalReplies += p.replies;
  });

  const themes = Object.entries(themeMap)
    .map(([theme, d]) => ({
      theme,
      count: d.count,
      avgScore: (d.totalScore / d.count).toFixed(1),
      avgLikes: (d.totalLikes / d.count).toFixed(1),
      avgReplies: (d.totalReplies / d.count).toFixed(1),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  if (themes.length > 0) {
    dashSheet.getRange(currentRow, 1, 1, 5).setValues([['テーマ', '投稿数', '平均スコア', '平均♥', '平均💬']]);
    dashSheet.getRange(currentRow, 1, 1, 5).setFontWeight('bold');
    currentRow++;

    themes.forEach(t => {
      dashSheet.getRange(currentRow, 1, 1, 5).setValues([[
        t.theme, t.count, t.avgScore, t.avgLikes, t.avgReplies
      ]]);
      currentRow++;
    });
  } else {
    dashSheet.getRange(currentRow, 1).setValue('（テーマタグのある投稿がまだありません）');
    currentRow++;
  }
  currentRow++;

  // ── フォーマット型別パフォーマンス ──
  dashSheet.getRange(currentRow, 1).setValue('📝 フォーマット型別パフォーマンス').setFontSize(14).setFontWeight('bold');
  currentRow++;

  const formatMap = {};
  scored.forEach(p => {
    if (!p.format) return;
    if (!formatMap[p.format]) {
      formatMap[p.format] = { count: 0, totalScore: 0 };
    }
    formatMap[p.format].count++;
    formatMap[p.format].totalScore += p.score;
  });

  const formats = Object.entries(formatMap)
    .map(([format, d]) => ({
      format,
      count: d.count,
      avgScore: (d.totalScore / d.count).toFixed(1),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  if (formats.length > 0) {
    dashSheet.getRange(currentRow, 1, 1, 3).setValues([['フォーマット型', '投稿数', '平均スコア']]);
    dashSheet.getRange(currentRow, 1, 1, 3).setFontWeight('bold');
    currentRow++;

    formats.forEach(f => {
      dashSheet.getRange(currentRow, 1, 1, 3).setValues([[f.format, f.count, f.avgScore]]);
      currentRow++;
    });
  }
  currentRow++;

  // ── Geminiバズパターン分析 ──
  dashSheet.getRange(currentRow, 1).setValue('🤖 AI分析レポート').setFontSize(14).setFontWeight('bold');
  currentRow++;

  if (scored.length >= 5) {
    try {
      const analysis = callGeminiAnalyze_();
      dashSheet.getRange(currentRow, 1).setValue(analysis);
      dashSheet.getRange(currentRow, 1).setWrap(true);
      // 分析テキスト用に列幅を広げる
      dashSheet.setColumnWidth(1, 600);
    } catch (e) {
      dashSheet.getRange(currentRow, 1).setValue('分析エラー: ' + e.message);
    }
  } else {
    dashSheet.getRange(currentRow, 1).setValue('（スコアのある投稿が5件以上になると、AIがバズパターンを分析します）');
  }
  currentRow += 2;

  // ── 最終更新時刻 ──
  dashSheet.getRange(currentRow, 1).setValue('最終更新: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')).setFontColor('#888');

  Logger.log('ダッシュボード更新完了');
}
/**
 * Nanobanana2（Gemini画像生成）連携
 * - 投稿テキストから画像を自動生成
 * - Google Driveに保存して公開URL取得
 * - スプシにプレビュー表示
 */

// 画像保存用フォルダ名
const IMAGE_FOLDER_NAME = 'Threads_Generated_Images';

/**
 * 投稿管理シートの選択行の投稿テキストから画像を生成
 */
function generateImageForPost() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');
  if (!mgmtSheet) {
    SpreadsheetApp.getUi().alert('投稿管理シートが見つかりません');
    return;
  }

  const row = mgmtSheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('画像を生成する行を選択してください');
    return;
  }

  const headers = mgmtSheet.getRange(1, 1, 1, mgmtSheet.getLastColumn()).getValues()[0];
  const textCol = headers.indexOf('投稿テキスト');
  const themeCol = headers.indexOf('テーマタグ');

  const postText = mgmtSheet.getRange(row, textCol + 1).getValue();
  const theme = mgmtSheet.getRange(row, themeCol + 1).getValue();

  if (!postText) {
    SpreadsheetApp.getUi().alert('投稿テキストがありません');
    return;
  }

  SpreadsheetApp.getUi().alert('画像を生成中です...（10〜20秒かかります）');

  try {
    // 画像生成プロンプトを構築
    const imagePrompt = buildImagePrompt_(postText, theme);

    // Nanobanana2で画像生成
    const imageBase64 = callNanobanana2_(imagePrompt);

    if (!imageBase64) {
      SpreadsheetApp.getUi().alert('画像の生成に失敗しました');
      return;
    }

    // Google Driveに保存
    const fileName = 'threads_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '.png';
    const fileUrl = saveImageToDrive_(imageBase64, fileName);

    // スプシに画像URLとプレビューを書き込み
    // 画像URL列と画像プレビュー列を確認/追加
    ensureImageColumns_(mgmtSheet, headers);

    const updatedHeaders = mgmtSheet.getRange(1, 1, 1, mgmtSheet.getLastColumn()).getValues()[0];
    const imgUrlCol = updatedHeaders.indexOf('画像URL');
    const imgPreviewCol = updatedHeaders.indexOf('画像プレビュー');

    mgmtSheet.getRange(row, imgUrlCol + 1).setValue(fileUrl);
    mgmtSheet.getRange(row, imgPreviewCol + 1).setFormula('=IMAGE("' + fileUrl + '", 1)');

    // 行の高さを調整して画像を見やすく
    mgmtSheet.setRowHeight(row, 150);

    SpreadsheetApp.getUi().alert('✅ 画像を生成しました！\n投稿管理シートの「画像プレビュー」列をご確認ください。');

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ 画像生成エラー: ' + e.message);
  }
}

/**
 * 全投稿案の画像を一括生成
 */
function generateAllImages() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mgmtSheet = ss.getSheetByName('📋 投稿管理');
  if (!mgmtSheet || mgmtSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('投稿管理シートにデータがありません');
    return;
  }

  const headers = mgmtSheet.getRange(1, 1, 1, mgmtSheet.getLastColumn()).getValues()[0];
  ensureImageColumns_(mgmtSheet, headers);

  const updatedHeaders = mgmtSheet.getRange(1, 1, 1, mgmtSheet.getLastColumn()).getValues()[0];
  const textCol = updatedHeaders.indexOf('投稿テキスト');
  const themeCol = updatedHeaders.indexOf('テーマタグ');
  const imgUrlCol = updatedHeaders.indexOf('画像URL');
  const imgPreviewCol = updatedHeaders.indexOf('画像プレビュー');
  const statusCol = updatedHeaders.indexOf('ステータス');

  const data = mgmtSheet.getDataRange().getValues();
  let generated = 0;
  const startTime = new Date().getTime();

  for (let i = 1; i < data.length; i++) {
    // 5分経過チェック
    if (new Date().getTime() - startTime > 280000) {
      SpreadsheetApp.getUi().alert(generated + '件生成しました（時間制限のため中断）。残りは再度実行してください。');
      return;
    }

    // 既に画像URLがある行はスキップ
    if (data[i][imgUrlCol]) continue;

    // 下書きの行のみ対象
    const status = data[i][statusCol];
    if (status !== '下書き' && status !== '投稿済') continue;

    const postText = data[i][textCol];
    const theme = data[i][themeCol];
    if (!postText) continue;

    try {
      const imagePrompt = buildImagePrompt_(postText.toString(), theme ? theme.toString() : '');
      const imageBase64 = callNanobanana2_(imagePrompt);

      if (imageBase64) {
        const fileName = 'threads_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' + (i) + '.png';
        const fileUrl = saveImageToDrive_(imageBase64, fileName);

        const row = i + 1;
        mgmtSheet.getRange(row, imgUrlCol + 1).setValue(fileUrl);
        mgmtSheet.getRange(row, imgPreviewCol + 1).setFormula('=IMAGE("' + fileUrl + '", 1)');
        mgmtSheet.setRowHeight(row, 150);

        generated++;
        Utilities.sleep(2000); // レート制限対策
      }
    } catch (e) {
      Logger.log('画像生成エラー（行' + (i + 1) + '）: ' + e.message);
      continue;
    }
  }

  SpreadsheetApp.getUi().alert('✅ ' + generated + '件の画像を生成しました！');
}

/**
 * 投稿テキストから画像生成用プロンプトを構築
 */
function buildImagePrompt_(postText, theme) {
  let prompt = 'Create a visually appealing, modern social media image for the following Threads post. ';
  prompt += 'The image should be eye-catching, clean, and professional. ';
  prompt += 'Do NOT include any text in the image. ';
  prompt += 'Use a warm, inviting color palette. ';
  prompt += 'Style: minimalist illustration or photography. ';
  prompt += 'Aspect ratio: square (1:1). ';

  if (theme) {
    prompt += '\nTheme/Topic: ' + theme + '. ';
  }

  prompt += '\nPost content for context (do not render this text in the image): ' + postText.substring(0, 300);

  return prompt;
}

/**
 * Nanobanana2（gemini-2.0-flash-exp-image-generation）で画像生成
 * @returns {string|null} base64エンコードされた画像データ
 */
function callNanobanana2_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

  const model = 'gemini-2.0-flash-exp-image-generation';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    const errText = response.getContentText().substring(0, 300);
    throw new Error('Nanobanana2 API Error (' + response.getResponseCode() + '): ' + errText);
  }

  const json = JSON.parse(response.getContentText());
  const candidates = json.candidates || [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
  }

  return null;
}

/**
 * base64画像をGoogle Driveに保存して公開URLを返す
 */
function saveImageToDrive_(base64Data, fileName) {
  // 画像フォルダを取得（なければ作成）
  let folder;
  const folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  }

  // base64デコードしてファイル作成
  const imageBytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(imageBytes, 'image/png', fileName);
  const file = folder.createFile(blob);

  // 公開共有設定
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Threads APIで使える直接URL形式
  const fileId = file.getId();
  return 'https://lh3.googleusercontent.com/d/' + fileId;
}

/**
 * 投稿管理シートに画像用の列がなければ追加
 */
function ensureImageColumns_(sheet, headers) {
  if (headers.indexOf('画像URL') === -1) {
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1).setValue('画像URL');
    sheet.getRange(1, lastCol + 2).setValue('画像プレビュー');
    sheet.getRange(1, lastCol + 1, 1, 2).setFontWeight('bold');
    sheet.setColumnWidth(lastCol + 1, 200);
    sheet.setColumnWidth(lastCol + 2, 200);
  }
}
