import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Redirect to static HTML for ultra-fast performance
  const url = new URL('/static.html', request.url)
  
  // Preserve query parameters
  const searchParams = request.nextUrl.searchParams
  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value)
  })
  
  return NextResponse.redirect(url, { status: 302 })
}