import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id') || 'default'
  
  // Simple hash function to generate consistent colors
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  // Generate color from hash
  const hue = Math.abs(hash) % 360
  const saturation = 70
  const lightness = 60
  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`
  
  // Get first character for avatar
  const initial = id.charAt(0).toUpperCase()
  
  // Generate SVG
  const svg = `
    <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="${color}"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="white" font-family="Arial, sans-serif" font-size="20" font-weight="600">
        ${initial}
      </text>
    </svg>
  `
  
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}