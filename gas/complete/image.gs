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
