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
