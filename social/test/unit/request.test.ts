import assert from 'node:assert/strict'
import test from 'node:test'
import qs from 'qs'
import type { Request } from 'express'
import { getCollectionParams, getResourceParams } from '../../src/server/request'

const createRequest = (query: string): Request => ({
	query: qs.parse(query, { comma: true }),
	params: {},
} as Request)

test('getCollectionParams parses pagination, sorting and filters generically', () => {
	const params = getCollectionParams(
		createRequest('sort=name&page[size]=1&page[after]=1&filter[access]=private'),
		{
			filter: ['code', 'name', 'access', 'search'],
			sort: ['created', 'updated', 'name', 'code'],
		}
	)

	assert.deepStrictEqual(params, {
		pagination: {
			cursor: 1,
			size: 1,
		},
		filters: {
			access: 'private',
		},
		sort: [{
			field: 'name',
			order: 'asc',
			isDefault: false,
		}],
		include: [],
		near: undefined,
	})
})

test('getCollectionParams supports sparse search filters', () => {
	const params = getCollectionParams(
		createRequest('filter[search]=organic'),
		{
			filter: ['code', 'name', 'access', 'search'],
			sort: ['created', 'updated', 'name', 'code'],
		}
	)

	assert.deepStrictEqual(params.filters, {
		search: 'organic',
	})
	assert.deepStrictEqual(params.pagination, {
		cursor: 0,
		size: 20,
	})
	assert.deepStrictEqual(params.sort, [{
		field: 'created',
		order: 'asc',
		isDefault: true,
	}])
})

test('getCollectionParams supports comma separated filter values', () => {
	const params = getCollectionParams(
		createRequest('filter[code]=code-one,code-two'),
		{
			filter: ['code', 'name', 'status', 'access', 'search'],
			sort: ['created', 'updated', 'name', 'code', 'distance'],
		}
	)

	assert.deepStrictEqual(params.filters, {
		code: ['code-one', 'code-two'],
	})
})

test('getCollectionParams supports multiple search-related endpoint shapes', () => {
	const categoryParams = getCollectionParams(
		createRequest('filter[search]=food'),
		{
			filter: ['code', 'name', 'access', 'search'],
			sort: ['created', 'updated', 'name', 'code'],
		}
	)
	const memberParams = getCollectionParams(
		createRequest('sort=name&filter[status]=pending'),
		{
			filter: ['code', 'name', 'type', 'status', 'access', 'search'],
			sort: ['created', 'updated', 'name', 'code'],
		}
	)
	const postParams = getCollectionParams(
		createRequest('filter[type]=offers'),
		{
			filter: ['code', 'type', 'status', 'access', 'member', 'category', 'search'],
			sort: ['created', 'updated', 'expires'],
		}
	)

	assert.deepStrictEqual(categoryParams.filters, { search: 'food' })
	assert.deepStrictEqual(memberParams.filters, { status: 'pending' })
	assert.deepStrictEqual(memberParams.sort, [{
		field: 'name',
		order: 'asc',
		isDefault: false,
	}])
	assert.deepStrictEqual(postParams.filters, { type: 'offers' })
})

test('getCollectionParams parses include and near with distance sorting', () => {
	const params = getCollectionParams(
		createRequest('include=settings&sort=-distance&near=41.4,2.1'),
		{
			filter: ['code', 'name', 'status', 'access', 'search'],
			sort: ['created', 'updated', 'name', 'code', 'distance'],
			include: ['settings'],
		}
	)

	assert.deepStrictEqual(params.include, ['settings'])
	assert.deepStrictEqual(params.sort, [{
		field: 'distance',
		order: 'desc',
		isDefault: false,
	}])
	assert.deepStrictEqual(params.near, {
		latitude: 41.4,
		longitude: 2.1,
	})
})

test('getCollectionParams rejects distance sorting without near', () => {
	assert.throws(
		() => getCollectionParams(
			createRequest('sort=distance'),
			{
				filter: ['code', 'name', 'status', 'access', 'search'],
				sort: ['created', 'updated', 'name', 'code', 'distance'],
			}
		),
		/Invalid query parameters/
	)
})

test('getCollectionParams rejects unknown filter keys', () => {
	assert.throws(
		() => getCollectionParams(
			createRequest('filter[unknown]=value'),
			{
				filter: ['code', 'name', 'access', 'search'],
				sort: ['created', 'updated', 'name', 'code'],
			}
		),
		/Invalid query parameters/
	)
})

test('getResourceParams defaults include and parses allowed include values', () => {
	const defaults = getResourceParams(createRequest(''), { include: ['settings'] })
	const explicit = getResourceParams(createRequest('include=settings'), { include: ['settings'] })

	assert.deepStrictEqual(defaults, { include: [] })
	assert.deepStrictEqual(explicit, { include: ['settings'] })
})
