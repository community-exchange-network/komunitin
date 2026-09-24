import type { Image } from './types'

export const imageUrl = (image: Image | null | undefined) => image?.url
