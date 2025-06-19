import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Redirect to the new Edge Function endpoint
  const url = new URL(request.url)
  url.pathname = '/api/edge/admin/ng-list-derived'
  
  // Forward the request to the new endpoint
  const response = await fetch(url.toString(), {
    headers: {
      'authorization': request.headers.get('authorization') || '',
      'cookie': request.headers.get('cookie') || ''
    }
  })
  
  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}

export async function DELETE(request: NextRequest) {
  // Redirect to the new Edge Function endpoint
  const url = new URL(request.url)
  url.pathname = '/api/edge/admin/ng-list-derived'
  
  // Forward the request to the new endpoint
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      'authorization': request.headers.get('authorization') || '',
      'cookie': request.headers.get('cookie') || ''
    }
  })
  
  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}