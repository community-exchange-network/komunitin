import type { Post as DbPost } from '../../generated/prisma/client'
import type { Access, Location } from '../groups/schema'
import { Member } from '../members/types'
import type { CreateNeedAttributes, CreateOfferAttributes, Image, PatchNeedAttributes, PatchOfferAttributes, PostStatus } from './schema'

// Input types derived from request schema
type PatchPostExtraFields = {
  categoryId?: string | null
}

type CreatePostExtraFields = PatchPostExtraFields & {
  memberId: string
}

type OfferType = {
  type: 'offers'
}
type NeedType = {
  type: 'needs'
}

export type CreateOfferInput = CreateOfferAttributes & CreatePostExtraFields & OfferType

export type CreateNeedInput = CreateNeedAttributes & CreatePostExtraFields & NeedType

export type CreatePostInput = CreateOfferInput | CreateNeedInput

export type PatchOfferInput = PatchOfferAttributes & PatchPostExtraFields & OfferType

export type PatchNeedInput = PatchNeedAttributes & PatchPostExtraFields & NeedType

export type PatchPostInput = PatchOfferInput | PatchNeedInput
  

// Output type derived from Prisma model
interface BasePost extends Omit<DbPost, "data" | "latitude" | "longitude"> {
  status: PostStatus
  access: Access
  images: Image[] | null
  location: Location | null
  member: Member
}

export type OfferData = {
  value: string | null
}

export type NeedData = {
  fulfilled: Date | null
}

export type Offer = BasePost & OfferData & {
  type: 'offers'
}

export type Need = BasePost & NeedData & {
  type: 'needs'
}

export type Post = Offer | Need
