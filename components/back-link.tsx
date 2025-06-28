import Link from 'next/link'
import styles from './back-link.module.css'

interface BackLinkProps {
  href?: string
  text?: string
  className?: string
}

export function BackLink({ 
  href = '/', 
  text = 'トップページに戻る',
  className = ''
}: BackLinkProps) {
  return (
    <Link 
      href={href}
      className={`${styles.backLink} ${className}`.trim()}
    >
      ← {text}
    </Link>
  )
}