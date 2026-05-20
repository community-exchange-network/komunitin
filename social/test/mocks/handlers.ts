import { http, HttpResponse } from 'msw'
import { getJwks } from './auth'

let s3UploadStatus = 200

export const setS3UploadStatus = (status: number) => {
  s3UploadStatus = status
}

export const resetMockState = () => {
  s3UploadStatus = 200
}

export const handlers = [
  http.get(process.env.AUTH_JWKS_URL!, () => {
    return HttpResponse.json(getJwks())
  }),
  http.put('http://s3.test/:bucket/:key*', async ({ request }) => {
    if (s3UploadStatus >= 400) {
      return HttpResponse.text('error', { status: s3UploadStatus })
    }

    const body = await request.arrayBuffer()
    if (body.byteLength === 0) {
      return new HttpResponse(null, { status: 400 })
    }

    return HttpResponse.text('', {
      status: 200,
      headers: {
        etag: '"mock-etag"',
      },
    })
  }),
  http.put('http://:bucket.s3.test/:key*', async ({ request }) => {
    if (s3UploadStatus >= 400) {
      return HttpResponse.text('error', { status: s3UploadStatus })
    }

    const body = await request.arrayBuffer()
    if (body.byteLength === 0) {
      return new HttpResponse(null, { status: 400 })
    }

    return HttpResponse.text('', {
      status: 200,
      headers: {
        etag: '"mock-etag"',
      },
    })
  }),
]
