// app/layout.tsx の head で同期実行する、テーマの初期適用スクリプト（塗る前に data-theme を当てる）。
//
// 設定の読み込み（hooks/use-user-preferences.ts）と同じ順・同じ条件でテーマを決める:
// Cookie「user-preferences」→ localStorage「user-preferences」の順に、version 1 の値だけを使う。
// 以前は localStorage だけを見ていた。Safari は JS で書いた Cookie の期限を最長 7 日に縮めるため、
// Cookie が切れると設定は localStorage から Cookie へ戻され localStorage 側は消える。その後の
// 読み込みでは head が light のまま塗り、ハイドレーション後に ThemeProvider が Cookie の
// テーマへ付け替えるので、画面がちらついていた。
export const THEME_INIT_SCRIPT = `(function () {
  var KEY = 'user-preferences';
  function themeOf(raw) {
    try {
      var value = JSON.parse(raw);
      return value && value.version === 1 ? value.theme || 'light' : null;
    } catch (e) {
      return null;
    }
  }
  var theme = null;
  try {
    var match = document.cookie.match(/(?:^|;\\s*)user-preferences=([^;]*)/);
    if (match && match[1]) theme = themeOf(decodeURIComponent(match[1]));
  } catch (e) {}
  if (!theme) {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored) theme = themeOf(stored);
    } catch (e) {}
  }
  if (theme) document.documentElement.setAttribute('data-theme', theme);
})();`
