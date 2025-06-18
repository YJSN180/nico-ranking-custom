/**
 * CDN Loader for Next.js Image Component
 * Provides fallback strategy for asset loading
 */

export interface ImageLoaderProps {
  src: string
  width: number
  quality?: number
}

export default function cdnLoader({ src, width, quality }: ImageLoaderProps): string {
  const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL
  
  // If no CDN configured, use default Vercel behavior
  if (!CDN_URL) {
    return `${src}?w=${width}&q=${quality || 75}`
  }
  
  // Handle absolute URLs (don't modify external URLs)
  if (src.startsWith('http')) {
    return src
  }
  
  // Construct CDN URL with optimization parameters
  const cdnUrl = `${CDN_URL}${src}`
  const params = new URLSearchParams({
    w: width.toString(),
    q: (quality || 75).toString(),
    fallback: encodeURIComponent(src) // For server-side fallback
  })
  
  return `${cdnUrl}?${params.toString()}`
}

/**
 * Get asset URL with CDN support
 */
export function getAssetUrl(path: string): string {
  const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL
  
  // If no CDN configured or absolute URL, return as-is
  if (!CDN_URL || path.startsWith('http')) {
    return path
  }
  
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  
  return `${CDN_URL}${normalizedPath}`
}