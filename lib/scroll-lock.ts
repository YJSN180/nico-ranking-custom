// モーダル・ドロワー表示中に背景（ビューポート）のスクロールを止める。
//
// body ではなく html（documentElement）に overflow: hidden を付ける。
// body に付けると body がスクロールコンテナになり、position: sticky のヘッダーが
// ビューポートに追従しなくなる。しかも html が overflow-x を持つため body の overflow は
// ビューポートに伝わらず、スクロール自体も止まらない。
//
// ドロワーから設定モーダルを開くなど重なって使われるため、参照カウントで管理し、
// 最後の解除で元の値に戻す（個別に保存・復元すると、解除の順番次第で hidden のまま残る）。

let lockCount = 0
let savedOverflow = ''

export function lockViewportScroll(): () => void {
  const root = document.documentElement
  if (lockCount === 0) {
    savedOverflow = root.style.overflow
    root.style.overflow = 'hidden'
  }
  lockCount += 1

  let released = false
  return () => {
    if (released) return
    released = true
    lockCount -= 1
    if (lockCount === 0) {
      root.style.overflow = savedOverflow
    }
  }
}
