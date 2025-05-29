import { updateRankingData } from '@/lib/update-ranking'

// Re-export for backwards compatibility
export { updateRankingData }

// CLIから直接実行する場合
if (require.main === module) {
  updateRankingData()
    .then(result => {
      console.log('Update completed:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}