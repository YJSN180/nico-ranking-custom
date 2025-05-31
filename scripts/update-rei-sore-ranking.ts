// 例のソレジャンルのランキング更新スクリプト
import { updateReiSoreRanking } from '../lib/rei-sore-ranking'

async function main() {
  console.log('例のソレジャンルのランキング更新を開始します...')
  
  try {
    await updateReiSoreRanking()
    console.log('ランキング更新が完了しました')
  } catch (error) {
    console.error('ランキング更新中にエラーが発生しました:', error)
    process.exit(1)
  }
}

main()