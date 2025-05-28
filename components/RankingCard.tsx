'use client'

import Image from 'next/image'
import { EnhancedRankingItem } from '@/types/enhanced-ranking'

interface RankingCardProps {
  item: EnhancedRankingItem
  isTop3: boolean
}

export function RankingCard({ item, isTop3 }: RankingCardProps) {
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'] // Gold, Silver, Bronze
  
  return (
    <div className={`ranking-card ${isTop3 ? 'ranking-card-top3' : ''}`}>
      <div className="rank-container">
        <div 
          className="rank-number"
          style={{ 
            backgroundColor: item.rank <= 3 ? rankColors[item.rank - 1] : '#666',
            color: item.rank <= 3 ? '#000' : '#fff'
          }}
        >
          {item.rank}
        </div>
      </div>
      
      <div className="content-container">
        <div className="thumbnail-container">
          <Image
            src={item.thumbURL}
            alt={item.title}
            width={isTop3 ? 160 : 120}
            height={isTop3 ? 90 : 67}
            className="thumbnail"
          />
          {item.duration && (
            <span className="duration">{item.duration}</span>
          )}
        </div>
        
        <div className="info-container">
          <h3 className="title">
            <a 
              href={`https://www.nicovideo.jp/watch/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.title}
            </a>
          </h3>
          
          <div className="uploader-info">
            {item.uploader.icon && (
              <Image
                src={item.uploader.icon}
                alt={item.uploader.name}
                width={24}
                height={24}
                className="uploader-icon"
              />
            )}
            <span className="uploader-name">{item.uploader.name}</span>
            <span className="upload-date">
              {new Date(item.uploadDate).toLocaleDateString('ja-JP')}
            </span>
          </div>
          
          <div className="stats-container">
            <div className="stat-item">
              <span className="stat-icon" data-testid="views-icon">👁</span>
              <span className="stat-value">{item.views.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-icon" data-testid="comments-icon">💬</span>
              <span className="stat-value">{item.comments.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-icon" data-testid="mylists-icon">📋</span>
              <span className="stat-value">{item.mylists.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-icon" data-testid="likes-icon">❤️</span>
              <span className="stat-value">{item.likes.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .ranking-card {
          display: flex;
          gap: 16px;
          padding: 16px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
          margin-bottom: 12px;
        }
        
        .ranking-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
        
        .ranking-card-top3 {
          background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
          border: 2px solid;
          border-color: ${item.rank === 1 ? '#FFD700' : item.rank === 2 ? '#C0C0C0' : '#CD7F32'};
        }
        
        .rank-container {
          display: flex;
          align-items: center;
        }
        
        .rank-number {
          width: ${isTop3 ? '48px' : '40px'};
          height: ${isTop3 ? '48px' : '40px'};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: ${isTop3 ? '20px' : '16px'};
        }
        
        .content-container {
          flex: 1;
          display: flex;
          gap: 16px;
        }
        
        .thumbnail-container {
          position: relative;
          flex-shrink: 0;
        }
        
        .thumbnail {
          border-radius: 4px;
          object-fit: cover;
        }
        
        .duration {
          position: absolute;
          bottom: 4px;
          right: 4px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 2px 6px;
          border-radius: 2px;
          font-size: 12px;
        }
        
        .info-container {
          flex: 1;
          min-width: 0;
        }
        
        .title {
          font-size: ${isTop3 ? '18px' : '16px'};
          font-weight: 600;
          margin: 0 0 8px 0;
          line-height: 1.4;
        }
        
        .title a {
          color: #0066cc;
          text-decoration: none;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        .title a:hover {
          text-decoration: underline;
        }
        
        .uploader-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 14px;
          color: #666;
        }
        
        .uploader-icon {
          border-radius: 50%;
        }
        
        .uploader-name {
          font-weight: 500;
        }
        
        .upload-date {
          margin-left: auto;
          font-size: 12px;
        }
        
        .stats-container {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        
        .stat-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 14px;
        }
        
        .stat-icon {
          font-size: 16px;
        }
        
        .stat-value {
          color: #333;
          font-weight: 500;
        }
        
        @media (max-width: 768px) {
          .ranking-card {
            flex-direction: column;
          }
          
          .content-container {
            flex-direction: column;
          }
          
          .stats-container {
            gap: 12px;
          }
        }
      `}</style>
    </div>
  )
}