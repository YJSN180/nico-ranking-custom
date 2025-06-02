// 開発サーバーで「もっと見る」ボタンをテストするスクリプト
import puppeteer from 'puppeteer'

async function testLoadMoreButton() {
  console.log('=== 「もっと見る」ボタンのテスト ===\n')
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  
  try {
    const page = await browser.newPage()
    
    // 開発サーバーにアクセス
    console.log('開発サーバーにアクセス中...')
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' })
    
    // ランキングアイテムが表示されるまで待つ
    await page.waitForSelector('[data-testid="ranking-item"]', { timeout: 10000 })
    
    // 表示されているアイテム数を確認
    const initialItemCount = await page.$$eval('[data-testid="ranking-item"]', items => items.length)
    console.log(`\n初期表示アイテム数: ${initialItemCount}件`)
    
    // ページのHTMLを確認（デバッグ用）
    const pageContent = await page.content()
    const hasLoadMoreText = pageContent.includes('もっと見る')
    console.log(`「もっと見る」テキストの存在: ${hasLoadMoreText}`)
    
    // ボタンを探す（複数のセレクタを試す）
    const buttonSelectors = [
      'button:has-text("もっと見る")',
      'button[text()*="もっと見る"]',
      'button:contains("もっと見る")',
      '//button[contains(text(), "もっと見る")]'
    ]
    
    let button = null
    for (const selector of buttonSelectors) {
      try {
        if (selector.startsWith('//')) {
          // XPath
          const elements = await page.$x(selector)
          if (elements.length > 0) {
            button = elements[0]
            console.log(`\nボタン発見（XPath）: ${selector}`)
            break
          }
        } else {
          // CSS selector
          button = await page.$(selector)
          if (button) {
            console.log(`\nボタン発見（CSS）: ${selector}`)
            break
          }
        }
      } catch (e) {
        // セレクタが無効な場合は次を試す
      }
    }
    
    // より汎用的な方法でボタンを探す
    if (!button) {
      const buttons = await page.$$('button')
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn)
        if (text && text.includes('もっと見る')) {
          button = btn
          console.log('\nボタン発見（テキスト検索）')
          break
        }
      }
    }
    
    if (button) {
      console.log('\n✅ 「もっと見る」ボタンが見つかりました！')
      
      // ボタンのテキストを取得
      const buttonText = await page.evaluate(el => el.textContent, button)
      console.log(`ボタンテキスト: ${buttonText}`)
      
      // ボタンをクリック
      await button.click()
      
      // 新しいアイテムが読み込まれるのを待つ
      await page.waitForTimeout(1000)
      
      // 新しいアイテム数を確認
      const newItemCount = await page.$$eval('[data-testid="ranking-item"]', items => items.length)
      console.log(`\nクリック後のアイテム数: ${newItemCount}件`)
      
      if (newItemCount > initialItemCount) {
        console.log('✅ 追加のアイテムが正常に読み込まれました！')
      } else {
        console.log('❌ アイテムが追加されませんでした')
      }
    } else {
      console.log('\n❌ 「もっと見る」ボタンが見つかりませんでした')
      console.log('\n考えられる原因:')
      console.log('1. データが100件以下しかない')
      console.log('2. ボタンのレンダリングに問題がある')
      console.log('3. 条件判定に問題がある')
      
      // データ件数をコンソールで確認
      const dataInfo = await page.evaluate(() => {
        // @ts-ignore
        const reactProps = document.querySelector('#__next > div')?._reactInternalFiber?.return?.stateNode?.props
        return {
          hasReactProps: !!reactProps,
          // 他の方法でデータを探す
          scriptTags: Array.from(document.querySelectorAll('script')).map(s => s.innerHTML.substring(0, 100))
        }
      })
      
      console.log('\nページ情報:', JSON.stringify(dataInfo, null, 2))
    }
    
  } catch (error) {
    console.error('エラー:', error)
  } finally {
    await browser.close()
  }
}

testLoadMoreButton().catch(console.error)