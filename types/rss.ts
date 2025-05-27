export interface RSSItem {
  title?: string
  link?: string
  description?: string
  'nico:views'?: string
}

export interface RSSChannel {
  title?: string
  link?: string
  description?: string
  item?: RSSItem | RSSItem[]
}

export interface RSSDocument {
  rss?: {
    channel?: RSSChannel
  }
}