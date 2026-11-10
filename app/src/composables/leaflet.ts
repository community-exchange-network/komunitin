import type { LatLng, LatLngBounds } from "leaflet"
import { icon, latLng, latLngBounds } from "leaflet/dist/leaflet-src.esm"


import iconUrl from "../assets/icons/marker.png"
import shadowUrl from "../assets/icons/marker-shadow.png"


export type LngLat = [number, number]
type LeafletLatLng = [number, number]

export const toLeafletLatLng = (point: LngLat): LeafletLatLng => [point[1], point[0]]

export const fromLeafletLatLng = (point: LeafletLatLng): LngLat => [point[1], point[0]]

export const toLeafletBounds = (points?: LngLat[]): LatLngBounds | undefined => {
  const bounds = latLngBounds((points ?? []).map(toLeafletLatLng))
  return bounds.isValid() ? bounds : undefined
}

export const isUsableLngLat = (point: LngLat): boolean => {
  const [lng, lat] = point
  return Number.isFinite(lng)
    && Number.isFinite(lat)
    && lng >= -180
    && lng <= 180
    && lat >= -90
    && lat <= 90
    && (lng !== 0 || lat !== 0)
}

export const getBoundsAroundPoints = (points: LngLat[]): LngLat[] | undefined => {
  const bounds = toLeafletBounds(points.filter(isUsableLngLat))
  return bounds
    ? [
      fromLeafletLatLng([bounds.getSouthWest().lat, bounds.getSouthWest().lng]),
      fromLeafletLatLng([bounds.getNorthEast().lat, bounds.getNorthEast().lng])
    ]
    : undefined
}

export const getCenterOfBounds = (bounds: LngLat[] | undefined): LngLat | undefined => {
  const leafletBounds = toLeafletBounds(bounds)
  const center = leafletBounds?.getCenter()
  return center ? fromLeafletLatLng([center.lat, center.lng]) : undefined
}

const toLeafletLatLngObject = (point: LngLat): LatLng => latLng(toLeafletLatLng(point)) as LatLng

/**
 * Compute a bounding box around a center point that contains at least a given threshold of points
 * and adds a margin to the bounding box. This function helps to avoid showing a map that is too 
 * zoomed out due to outlier points.
 */
export const getBoundsAroundCenter = (
  center: LngLat,
  points: LngLat[],
  threshold: number,
  margin: number
): LngLat[] | undefined => {
  const centerLatLng = toLeafletLatLngObject(center)
  const distances = points
    .filter(isUsableLngLat)
    .map((point) => centerLatLng.distanceTo(toLeafletLatLngObject(point)))
    .sort((a, b) => a - b)

  if (distances.length === 0) {
    return undefined
  }

  const thresholdIndex = Math.floor((distances.length - 1) * threshold)
  const distance = distances[thresholdIndex]
  const bounds = centerLatLng.toBounds(2 * (1 + margin) * distance)
  return [
    fromLeafletLatLng([bounds.getSouthWest().lat, bounds.getSouthWest().lng]),
    fromLeafletLatLng([bounds.getNorthEast().lat, bounds.getNorthEast().lng])
  ]
}

export const useLeafletSettings = () => {
  return {
    markerIcon: icon({
      iconUrl,
      shadowUrl,
      iconSize: [25, 41],
      iconAnchor: [13, 41]
    }),
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    zoom: 12,
  }
}
