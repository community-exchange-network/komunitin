import assert from 'node:assert/strict'
import test from 'node:test'
import qs from 'qs'
import type { Request } from 'express'
import { getCode, getCollectionParams, getIdParam, getResourceParams } from '../../src/server/request'

const createRequest = (query: string, params: Record<string, string> = {}): Request => ({
	query: qs.parse(query, { comma: true }),
	params,
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
			access: ['private'],
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
		search: ['organic'],
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
	const query = new URLSearchParams({
		'filter[code]': 'code-one,code-two',
	}).toString()
	assert.ok(query.includes('code-one%2Ccode-two'))

	const params = getCollectionParams(
		createRequest(query),
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

	assert.deepStrictEqual(categoryParams.filters, { search: ['food'] })
	assert.deepStrictEqual(memberParams.filters, { status: ['pending'] })
	assert.deepStrictEqual(memberParams.sort, [{
		field: 'name',
		order: 'asc',
		isDefault: false,
	}])
	assert.deepStrictEqual(postParams.filters, { type: ['offers'] })
})

test('getCollectionParams parses include and near with distance sorting', () => {
	const query = new URLSearchParams({
		include: 'settings,currency',
		sort: '-distance',
		near: '41.4,2.1',
	}).toString()
	const request = createRequest(query)
	assert.ok(query.includes('settings%2Ccurrency'))
	assert.strictEqual(request.query.include, 'settings,currency')
	assert.strictEqual(request.query.near, '41.4,2.1')

	const params = getCollectionParams(
		request,
		{
			filter: ['code', 'name', 'status', 'access', 'search'],
			sort: ['created', 'updated', 'name', 'code', 'distance'],
			include: ['settings', 'currency'],
		}
	)

	assert.deepStrictEqual(params.include, ['settings', 'currency'])
	assert.deepStrictEqual(params.sort, [{
		field: 'distance',
		order: 'desc',
		isDefault: false,
	}])
	assert.deepStrictEqual(params.near, {
		latitude: 2.1,
		longitude: 41.4,
	})
})

test('getCollectionParams rejects distance sorting without near', () => {
	assert.throws(
		() => getCollectionParams(
			createRequest('sort=distance'),
			{
				filter: ['code', 'name', 'status', 'access', 'search'],
				sort: ['created', 'updated', 'name', 'code', 'distance'],
				near: true,
			}
		),
		/Invalid query parameters/
	)
})

test('getCollectionParams rejects near where the route does not support it', () => {
	assert.throws(
		() => getCollectionParams(
			createRequest('near=2.1,41.4'),
			{ sort: ['created'] }
		),
		/Invalid query parameters/
	)
})

test('getCollectionParams validates longitude then latitude', () => {
	const options = { sort: ['created', 'distance'], near: true }
	assert.deepStrictEqual(
		getCollectionParams(createRequest('near=120,45'), options).near,
		{ longitude: 120, latitude: 45 },
	)
	assert.throws(
		() => getCollectionParams(createRequest('near=181,45'), options),
		/Invalid query parameters/,
	)
	assert.throws(
		() => getCollectionParams(createRequest('near=120,91'), options),
		/Invalid query parameters/,
	)
})

test('request query objects reject unknown top-level and pagination keys', () => {
	assert.throws(
		() => getCollectionParams(createRequest('legacy=value'), { sort: ['created'] }),
		/Invalid query parameters/,
	)
	assert.throws(
		() => getCollectionParams(createRequest('page[number]=1'), { sort: ['created'] }),
		/Invalid query parameters/,
	)
	assert.throws(
		() => getResourceParams(createRequest('legacy=value'), {}),
		/Invalid query parameters/,
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

test('request params reject include values when no includes are allowed', () => {
	assert.throws(
		() => getCollectionParams(
			createRequest('include=settings'),
			{ sort: ['created'] }
		),
		/Invalid query parameters/
	)

	assert.throws(
		() => getResourceParams(createRequest('include=settings'), {}),
		/Invalid query parameters/
	)
})

test('getCode validates route code params', () => {
	assert.strictEqual(
		getCode(createRequest('', { code: 'alpha.group_1-2' })),
		'alpha.group_1-2'
	)

	assert.throws(
		() => getCode(createRequest('', { code: 'bad code' })),
		/Invalid route parameter: code/
	)

	assert.throws(
		() => getCode(createRequest('', { code: 'a'.repeat(32) })),
		/Invalid route parameter: code/
	)
})

test('getIdParam validates UUID route params', () => {
	const id = '7c0ca2a9-ab7d-4f85-89a2-d8b425c1b7dc'

	assert.strictEqual(
		getIdParam(createRequest('', { member: id }), 'member'),
		id
	)

	assert.throws(
		() => getIdParam(createRequest('', { member: '123' }), 'member'),
		/Invalid route parameter: member/
	)
})
