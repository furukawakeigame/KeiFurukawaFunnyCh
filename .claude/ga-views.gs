// トップページにゲームごとのビュー数を出すための Google Apps Script。
// Google アナリティクスから全期間のページビュー数を読み、JSON で返す。
// 設定手順は CLAUDE.md の「ビュー数の表示」を参照。

const PROPERTY_ID = '559038100'; // G-で始まるIDではなく、数字だけのプロパティID

function doGet() {
  const cache = CacheService.getScriptCache();
  let json = cache.get('views');
  if (!json) {
    const report = AnalyticsData.Properties.runReport({
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      dateRanges: [{ startDate: '2015-08-14', endDate: 'today' }],
      limit: 10000,
    }, 'properties/' + PROPERTY_ID);
    const views = {};
    (report.rows || []).forEach(row => {
      // /games/xxx/index.html や ?query 付きも /games/xxx/ にまとめる
      const path = row.dimensionValues[0].value.split('?')[0].replace(/index\.html$/, '');
      views[path] = (views[path] || 0) + Number(row.metricValues[0].value);
    });
    json = JSON.stringify(views);
    cache.put('views', json, 3600); // 1時間ごとに更新
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
