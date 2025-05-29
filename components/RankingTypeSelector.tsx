'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RANKING_TYPES } from '@/types/enhanced-ranking'
import styles from './RankingTypeSelector.module.css'

interface RankingTypeSelectorProps {
  currentType: string
}

export function RankingTypeSelector({ currentType }: RankingTypeSelectorProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  
  const currentRanking = RANKING_TYPES.find(type => type.id === currentType) || RANKING_TYPES[1]
  
  const handleSelect = (typeId: string) => {
    setIsOpen(false)
    // Navigate to the new ranking type
    router.push(`/enhanced?type=${typeId}`)
  }
  
  return (
    <div className={styles.selectorContainer}>
      <button 
        className={styles.selectorButton}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{currentRanking?.label || '選択してください'}</span>
        <span className={`${styles.arrow} ${isOpen ? styles.arrowOpen : ''}`}>▼</span>
      </button>
      
      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownSection}>
            <div className={styles.dropdownLabel}>期間</div>
            {RANKING_TYPES.filter(type => !type.genre).map(type => (
              <button
                key={type.id}
                className={`${styles.dropdownItem} ${type.id === currentType ? styles.active : ''}`}
                onClick={() => handleSelect(type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
          
          <div className={styles.dropdownSection}>
            <div className={styles.dropdownLabel}>ジャンル別（24時間）</div>
            {RANKING_TYPES.filter(type => type.genre).map(type => (
              <button
                key={type.id}
                className={`${styles.dropdownItem} ${type.id === currentType ? styles.active : ''}`}
                onClick={() => handleSelect(type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
    </div>
  )
}