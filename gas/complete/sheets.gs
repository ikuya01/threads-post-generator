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
