export const dynamic = 'force-static'
export const revalidate = 600 // 10 minutes

export default function StaticPage() {
  // Return minimal HTML that will be enhanced with inline script
  return (
    <html lang="ja">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ニコラン(Re:turn) - 高速版</title>
        <style dangerouslySetInnerHTML={{ __html: `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }
          .header { background: #333; color: white; padding: 1rem; text-align: center; }
          .container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
          .selector { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
          .selector a { padding: 0.5rem 1rem; background: white; border-radius: 4px; text-decoration: none; color: #333; }
          .selector a.active { background: #007bff; color: white; }
          .ranking-item { background: white; margin-bottom: 1rem; padding: 1rem; border-radius: 8px; display: grid; grid-template-columns: 60px 120px 1fr; gap: 1rem; align-items: center; position: relative; }
          .rank { font-size: 1.5rem; font-weight: bold; color: #666; text-align: center; }
          .thumb { width: 120px; height: 80px; object-fit: cover; border-radius: 4px; }
          .info h3 { margin-bottom: 0.5rem; font-size: 1rem; }
          .info a { color: #0066cc; text-decoration: none; }
          .info a:hover { text-decoration: underline; }
          .meta { display: flex; gap: 1rem; color: #666; font-size: 0.9rem; }
          .loading { text-align: center; padding: 2rem; color: #666; }
          @media (max-width: 600px) {
            .ranking-item { grid-template-columns: 1fr; }
            .rank { position: absolute; top: 0.5rem; left: 0.5rem; background: rgba(255,255,255,0.9); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
            .thumb { width: 100%; height: auto; }
          }
        ` }} />
      </head>
      <body>
        <header className="header">
          <h1>ニコラン(Re:turn) - 高速版</h1>
        </header>
        
        <div className="container">
          <nav className="selector">
            <a href="?genre=all" className="active">総合</a>
            <a href="?genre=game">ゲーム</a>
            <a href="?genre=anime">アニメ</a>
            <a href="?genre=music">音楽・サウンド</a>
            <a href="?genre=entertainment">エンタメ</a>
            <a href="?genre=dance">ダンス</a>
            <a href="?genre=vocaloid">VOCALOID</a>
          </nav>
          
          <main id="content">
            <div className="loading">読み込み中...</div>
          </main>
        </div>
        
        <script dangerouslySetInnerHTML={{ __html: `
          // Minimal data loader
          (function() {
            const params = new URLSearchParams(location.search);
            const genre = params.get('genre') || 'all';
            const period = params.get('period') || '24h';
            
            // Update active states
            document.querySelectorAll('.selector a').forEach(a => {
              const href = a.getAttribute('href');
              if (href.includes('genre=' + genre)) {
                a.classList.add('active');
              } else {
                a.classList.remove('active');
              }
            });
            
            // Fetch and render
            fetch('/api/ranking?genre=' + genre + '&period=' + period)
              .then(r => r.json())
              .then(data => {
                const items = data.items || [];
                if (items.length === 0) {
                  document.getElementById('content').innerHTML = '<div class="loading">データがありません</div>';
                  return;
                }
                
                document.getElementById('content').innerHTML = items.slice(0, 100).map((item, i) => 
                  '<article class="ranking-item">' +
                    '<div class="rank">' + (i + 1) + '</div>' +
                    '<img src="' + item.thumbURL + '" alt="" class="thumb" loading="' + (i < 3 ? 'eager' : 'lazy') + '">' +
                    '<div class="info">' +
                      '<h3><a href="https://www.nicovideo.jp/watch/' + item.id + '" target="_blank">' + 
                        item.title + 
                      '</a></h3>' +
                      '<div class="meta">' +
                        '<span>' + (item.views || 0).toLocaleString() + ' 再生</span>' +
                        '<span>' + (item.comments || 0).toLocaleString() + ' コメ</span>' +
                        '<span>' + (item.mylists || 0).toLocaleString() + ' マイリス</span>' +
                      '</div>' +
                    '</div>' +
                  '</article>'
                ).join('');
              })
              .catch(() => {
                document.getElementById('content').innerHTML = '<div class="loading">エラーが発生しました</div>';
              });
          })();
        ` }} />
      </body>
    </html>
  )
}