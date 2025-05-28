// ニコニコ動画の公式アイコンを模したSVGコンポーネント

export const ViewIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg 
    style={style}
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="currentColor"
  >
    <path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5S6.1 4.5 8 4.5s3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>
    <circle cx="8" cy="8" r="2"/>
  </svg>
)

export const CommentIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg 
    style={style}
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="currentColor"
  >
    <path d="M14 1H2C0.9 1 0 1.9 0 3v8c0 1.1 0.9 2 2 2h2v3l3-3h7c1.1 0 2-0.9 2-2V3c0-1.1-0.9-2-2-2z"/>
  </svg>
)

export const MylistIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg 
    style={style}
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="currentColor"
  >
    <path d="M2 2v12h12V2H2zm10 10H4V4h8v8zM6 7h4v1H6V7zm0 2h4v1H6V9z"/>
  </svg>
)

export const LikeIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg 
    style={style}
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="currentColor"
  >
    <path d="M8 14.5l-1-0.9C3.4 10.4 1 8.2 1 5.5 1 3.5 2.5 2 4.5 2c1.1 0 2.2 0.5 2.9 1.3l0.6 0.7 0.6-0.7C9.3 2.5 10.4 2 11.5 2 13.5 2 15 3.5 15 5.5c0 2.7-2.4 4.9-6 8.1L8 14.5z"/>
  </svg>
)