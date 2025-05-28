'use client'

import { useState } from 'react'
import styles from './RankingTypeSelector.module.css'

const RANKING_TYPES = [
  { id: 'daily', label: '24時間総合', active: true },
  { id: 'weekly', label: '週間総合', active: false },
  { id: 'monthly', label: '月間総合', active: false },
  { id: 'hourly', label: '毎時総合', active: false },
]

export function RankingTypeSelector() {
  const [selectedType, setSelectedType] = useState('daily')

  return (
    <div className={styles.selectorContainer}>
      <select 
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        className={styles.selector}
      >
        {RANKING_TYPES.map(type => (
          <option key={type.id} value={type.id}>
            {type.label}ランキング
          </option>
        ))}
      </select>
      <div className={styles.note}>
        ※ 現在は24時間総合ランキングのみ表示されます
      </div>
    </div>
  )
}