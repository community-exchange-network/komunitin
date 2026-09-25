import {
  getBoundsAroundCenter,
  getBoundsAroundPoints,
  getCenterOfBounds,
  isUsableLngLat,
  toLeafletBounds
} from "../leaflet"

describe("leaflet composables", () => {
  it("rejects null-island and invalid coordinates", () => {
    expect(isUsableLngLat([0, 0])).toBe(false)
    expect(isUsableLngLat([181, 0])).toBe(false)
    expect(isUsableLngLat([0, 91])).toBe(false)
    expect(isUsableLngLat([2.17, 41.39])).toBe(true)
  })

  it("builds bounds from the threshold distance around the center", () => {
    const center = [2.17, 41.39] as [number, number]
    const bounds = getBoundsAroundCenter(center, [
      [0, 0],
      [2.17, 41.3904],
      [2.17, 41.3909],
      [2.17, 42],
    ], 0.5, 0.1)
    const leafletBounds = toLeafletBounds(bounds)

    expect(leafletBounds?.contains([41.3904, 2.17])).toBe(true)
    expect(leafletBounds?.contains([41.3909, 2.17])).toBe(true)
    expect(leafletBounds?.contains([42, 2.17])).toBe(false)
  })

  it("builds bounds and center around points using lng-lat coordinates", () => {
    const bounds = getBoundsAroundPoints([
      [1, 41],
      [2, 42],
    ])

    expect(bounds).toEqual([[1, 41], [2, 42]])
    expect(getCenterOfBounds(bounds)).toEqual([1.5, 41.5])
  })
})
