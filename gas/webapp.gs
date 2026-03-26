/**
 * Threads投稿下書き受信用 Google Apps Script
 *
 * セットアップ手順:
 * 1. 新しいスプレッドシートを作成（または既存のものを使用）
 * 2. メニュー「拡張機能」→「Apps Script」
 * 3. このコードを貼り付けて保存
 * 4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 実行するユーザー: 自分
 *    - アクセス: 全員
 * 5. デプロイ → 表示されたURLをコピー → .env の GAS_WEBAPP_URL に設定
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("threads_drafts") || ss.insertSheet("threads_drafts");

    // ヘッダーがなければ作成
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "生成日時", "案番号", "投稿文", "文字数",
        "ソース", "ソース詳細",
        "理由", "ステータス"
      ]);
      sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
      sheet.setColumnWidth(1, 140);  // 生成日時
      sheet.setColumnWidth(2, 50);   // 案番号
      sheet.setColumnWidth(3, 500);  // 投稿文（Threadsは最大500文字なので幅広め）
      sheet.setColumnWidth(4, 50);   // 文字数
      sheet.setColumnWidth(5, 100);  // ソース
      sheet.setColumnWidth(6, 200);  // ソース詳細
      sheet.setColumnWidth(7, 250);  // 理由
      sheet.setColumnWidth(8, 80);   // ステータス
    }

    var drafts = data.drafts || [];
    var timestamp = data.timestamp || new Date().toLocaleString("ja-JP");

    for (var i = 0; i < drafts.length; i++) {
      var d = drafts[i];
      sheet.appendRow([
        timestamp,
        d.draft_no || (i + 1),
        d.content || "",
        d.char_count || (d.content || "").length,
        d.source || "",
        d.source_detail || "",
        d.reasoning || "",
        "未投稿"
      ]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", count: drafts.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "Threads投稿下書きAPI稼働中" }))
    .setMimeType(ContentService.MimeType.JSON);
}
