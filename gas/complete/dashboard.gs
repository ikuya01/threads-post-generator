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
