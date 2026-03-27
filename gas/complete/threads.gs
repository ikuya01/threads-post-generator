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

  const text = mgmtSheet.getRange(row, 3).getValue(); // C列: 投稿テキスト
  const status = mgmtSheet.getRange(row, 4).getValue(); // D列: ステータス

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
  const result = ui.alert(
    '投稿確認',
    '以下の内容をThreadsに投稿しますか？\n\n' + text.toString().substring(0, 200) + '...',
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) return;

  try {
    const postResult = postToThreads_(text.toString());

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
