import { icon } from "leaflet/dist/leaflet-src.esm"


import iconUrl from "../assets/icons/marker.png"
import shadowUrl from "../assets/icons/marker-shadow.png"


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