import TsJapi from 'ts-japi'
import type { SerializerOptions } from '../../server/jsonapi-serialize'
import type { File } from './types'

const { Serializer } = TsJapi

export const FileSerializer = new Serializer<File>('files', {
  version: null,
  projection: {
    url: 1,
    mime: 1,
    key: 1,
    size: 1,
    filename: 1,
    resourceType: 1,
    created: 1,
    updated: 1,
  },
})

export const serializeFile = async (file: File, options?: SerializerOptions<File>) => {
  return FileSerializer.serialize(file, options)
}

export const serializeFiles = async (files: File[], options?: SerializerOptions<File>) => {
  return FileSerializer.serialize(files, options)
}