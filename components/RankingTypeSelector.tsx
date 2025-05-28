'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RANKING_TYPES } from '@/types/enhanced-ranking'

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
    <div className="selector-container">
      <button 
        className="selector-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{currentRanking?.label || '選択してください'}</span>
        <span className="arrow">▼</span>
      </button>
      
      {isOpen && (
        <div className="dropdown">
          <div className="dropdown-section">
            <div className="dropdown-label">期間</div>
            {RANKING_TYPES.filter(type => !type.genre).map(type => (
              <button
                key={type.id}
                className={`dropdown-item ${type.id === currentType ? 'active' : ''}`}
                onClick={() => handleSelect(type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
          
          <div className="dropdown-section">
            <div className="dropdown-label">ジャンル別（24時間）</div>
            {RANKING_TYPES.filter(type => type.genre).map(type => (
              <button
                key={type.id}
                className={`dropdown-item ${type.id === currentType ? 'active' : ''}`}
                onClick={() => handleSelect(type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <style jsx>{`
        .selector-container {
          position: relative;
        }
        
        .selector-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .selector-button:hover {
          background: #0052a3;
        }
        
        .arrow {
          font-size: 12px;
          transition: transform 0.2s;
          transform: ${isOpen ? 'rotate(180deg)' : 'rotate(0)'};
        }
        
        .dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          min-width: 250px;
          z-index: 1000;
          overflow: hidden;
        }
        
        .dropdown-section {
          padding: 12px 0;
          border-bottom: 1px solid #eee;
        }
        
        .dropdown-section:last-child {
          border-bottom: none;
        }
        
        .dropdown-label {
          padding: 8px 16px;
          font-size: 12px;
          font-weight: bold;
          color: #666;
          text-transform: uppercase;
        }
        
        .dropdown-item {
          display: block;
          width: 100%;
          padding: 12px 16px;
          background: none;
          border: none;
          text-align: left;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .dropdown-item:hover {
          background: #f5f5f5;
        }
        
        .dropdown-item.active {
          background: #e3f2fd;
          color: #0066cc;
          font-weight: 500;
        }
        
        @media (max-width: 768px) {
          .dropdown {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            border-radius: 16px 16px 0 0;
            max-height: 80vh;
            overflow-y: auto;
          }
        }
      `}</style>
    </div>
  )
}