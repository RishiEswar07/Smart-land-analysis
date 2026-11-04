import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import Map, { NavigationControl, Source, Layer, Marker } from 'react-map-gl/maplibre'
import area from '@turf/area'
import centroid from '@turf/centroid'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  calculateGeodesicArea,
  calculatePolygonAreaSqFt,
  calculatePolygonPerimeter,
  validatePolygonGeometry,
} from '../services/gisService'

const SQM_TO_SQFT = 10.7639104

// Map style configurations
export const MAP_LAYERS = {
  satellite: {
    id: 'satellite',
    name: 'Satellite',
    icon: '🛰️',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    style: {
      version: 8,
      sources: {
        'satellite-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        },
      },
      layers: [
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-tiles',
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    },
  },
  street: {
    id: 'street',
    name: 'Street Map',
    icon: '🗺️',
    attribution: 'OpenStreetMap contributors, CARTO',
    style: {
      version: 8,
      sources: {
        'carto-tiles': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        },
      },
      layers: [
        {
          id: 'street-layer',
          type: 'raster',
          source: 'carto-tiles',
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    },
  },
  terrain: {
    id: 'terrain',
    name: 'Terrain Topo',
    icon: '⛰️',
    attribution: 'Esri, USGS, NOAA',
    style: {
      version: 8,
      sources: {
        'terrain-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri',
        },
      },
      layers: [
        {
          id: 'terrain-layer',
          type: 'raster',
          source: 'terrain-tiles',
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    },
  },
}

// Preset visual color palettes for multi-parcel comparison
const PARCEL_COLOR_PALETTES = [
  { fill: '#10B981', stroke: '#059669', badgeBg: 'bg-emerald-500', name: 'Emerald' }, // Land 1
  { fill: '#3B82F6', stroke: '#1D4ED8', badgeBg: 'bg-blue-600', name: 'Royal Blue' },  // Land 2
  { fill: '#F59E0B', stroke: '#D97706', badgeBg: 'bg-amber-500', name: 'Amber Gold' },  // Land 3
]

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('MapPicker Runtime Error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-50 text-rose-600 p-6 text-center rounded-2xl border border-rose-200 shadow-sm">
          <span className="text-3xl mb-2">⚠️</span>
          <p className="font-bold text-base mb-1">Map Renderer Error</p>
          <p className="text-xs text-slate-500 max-w-sm mb-4">{this.state.error?.message || 'WebGL context could not be initialized.'}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs"
          >
            Retry Map
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function MapPicker({
  center,
  zoom = 18,
  onPolygonChange,
  onLocationSelect,
  drawable = false,
  polygon = null,
  activeBoundary = null,
  clickedLocation = null,
  height = '620px',
  flyToCenter = null,
  // Multi-Land props (backward-compatible: defaults to single-land mode)
  multiLand = false,
  lands = null,
  activeLandIndex = 0,
  onActiveLandChange = null,
  onMultiLandChange = null,
}) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)

  // Map layer state
  const [activeLayer, setActiveLayer] = useState('satellite')
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [isMapLoading, setIsMapLoading] = useState(false)

  // Drawing & editing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draftCoords, setDraftCoords] = useState([])
  const [mousePos, setMousePos] = useState(null)
  const [activeDragIndex, setActiveDragIndex] = useState(null)
  const [validationError, setValidationError] = useState(null)

  // Multi-land state management (internal when lands prop not provided, or synced)
  const [internalLands, setInternalLands] = useState([
    { id: 1, name: 'Land 1', coords: [], areaSqFt: 0, status: 'empty', color: PARCEL_COLOR_PALETTES[0] },
    { id: 2, name: 'Land 2', coords: [], areaSqFt: 0, status: 'empty', color: PARCEL_COLOR_PALETTES[1] },
    { id: 3, name: 'Land 3', coords: [], areaSqFt: 0, status: 'empty', color: PARCEL_COLOR_PALETTES[2] },
  ])
  const [activeSlot, setActiveSlot] = useState(activeLandIndex || 0)

  // Synchronize external lands prop if multiLand is enabled
  useEffect(() => {
    if (multiLand && Array.isArray(lands) && lands.length > 0) {
      setInternalLands(lands)
    }
  }, [multiLand, lands])

  // Synchronize single-land activeBoundary into draft/final coordinates
  const currentCoords = useMemo(() => {
    if (multiLand) {
      return internalLands[activeSlot]?.coords || []
    }
    return activeBoundary?.coords || (polygon || [])
  }, [multiLand, internalLands, activeSlot, activeBoundary, polygon])

  // Handle Fly-To Search Target
  useEffect(() => {
    if (flyToCenter && mapRef.current) {
      mapRef.current.flyTo({
        center: [flyToCenter.lng, flyToCenter.lat],
        zoom: 18,
        duration: 1800,
      })
    }
  }, [flyToCenter])

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Geolocation handler (My Location)
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [longitude, latitude],
            zoom: 19,
            duration: 1500,
          })
        }
        if (onLocationSelect && !isDrawing && !isEditing) {
          onLocationSelect({ lat: latitude, lng: longitude })
        }
      },
      (err) => {
        console.warn('Geolocation lookup failed:', err.message)
        alert('Could not retrieve your GPS location. Please check location permissions.')
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [isDrawing, isEditing, onLocationSelect])

  // Toggle Fullscreen
  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch((err) => {
        console.warn('Fullscreen request failed:', err)
      })
    } else {
      document.exitFullscreen?.().catch((err) => {
        console.warn('Exit fullscreen failed:', err)
      })
    }
  }, [])

  // Reset Map View
  const handleResetView = useCallback(() => {
    if (!mapRef.current) return
    const defaultLng = center?.lng || 78.1198
    const defaultLat = center?.lat || 9.9252
    mapRef.current.flyTo({
      center: [defaultLng, defaultLat],
      zoom: 18,
      pitch: 0,
      bearing: 0,
      duration: 1200,
    })
  }, [center])

  // Calculate area and perimeter from coordinates
  const calculateGeometryPayload = useCallback((coords) => {
    if (!coords || coords.length < 3) return null
    const coordsRing = [...coords.map((c) => [c.lng, c.lat]), [coords[0].lng, coords[0].lat]]
    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coordsRing],
      },
    }

    let areaSqFt = calculatePolygonAreaSqFt(coords)
    if (!areaSqFt || areaSqFt <= 0) {
      areaSqFt = area(geojson) * SQM_TO_SQFT
    }
    const centerFeature = centroid(geojson)
    const cent = {
      lat: centerFeature.geometry.coordinates[1],
      lng: centerFeature.geometry.coordinates[0],
    }

    const { sqMeters, cents, acres } = calculateGeodesicArea(coords)
    const perimeter = calculatePolygonPerimeter(coords)

    return {
      coords,
      areaSqFt: Math.round(areaSqFt * 10) / 10,
      sqMeters,
      cents,
      acres,
      perimeterFeet: perimeter.feet,
      perimeterMeters: perimeter.meters,
      centroid: cent,
      geojson,
    }
  }, [])

  // Start Drawing
  const handleDrawStart = useCallback(() => {
    setIsDrawing(true)
    setIsEditing(false)
    setDraftCoords([])
    setMousePos(null)
    setValidationError(null)

    if (multiLand) {
      setInternalLands((prev) => {
        const next = [...prev]
        next[activeSlot] = { ...next[activeSlot], status: 'drawing', coords: [], areaSqFt: 0 }
        onMultiLandChange?.(next)
        return next
      })
    } else {
      onPolygonChange?.(null)
    }
  }, [multiLand, activeSlot, onMultiLandChange, onPolygonChange])

  // Undo Last Point
  const handleUndoPoint = useCallback(() => {
    setValidationError(null)
    if (isDrawing && draftCoords.length > 0) {
      setDraftCoords((prev) => prev.slice(0, prev.length - 1))
    } else if (isEditing && currentCoords.length > 3) {
      const updated = currentCoords.slice(0, currentCoords.length - 1)
      const payload = calculateGeometryPayload(updated)
      if (multiLand) {
        setInternalLands((prev) => {
          const next = [...prev]
          next[activeSlot] = { ...next[activeSlot], coords: updated, areaSqFt: payload.areaSqFt, payload }
          onMultiLandChange?.(next)
          return next
        })
      } else {
        onPolygonChange?.(payload)
      }
    }
  }, [isDrawing, isEditing, draftCoords, currentCoords, calculateGeometryPayload, multiLand, activeSlot, onMultiLandChange, onPolygonChange])

  // Finish Drawing
  const finishDrawing = useCallback(() => {
    setValidationError(null)
    if (draftCoords.length < 3) {
      setValidationError('Please place at least 3 points on the map to enclose the parcel boundary.')
      return
    }

    const val = validatePolygonGeometry(draftCoords)
    if (!val.isValid) {
      setValidationError(val.reason)
      return
    }

    try {
      const payload = calculateGeometryPayload(draftCoords)
      setIsDrawing(false)
      setIsEditing(false)
      setMousePos(null)

      if (multiLand) {
        setInternalLands((prev) => {
          const next = [...prev]
          next[activeSlot] = {
            ...next[activeSlot],
            coords: draftCoords,
            areaSqFt: payload.areaSqFt,
            status: 'completed',
            payload,
          }
          onMultiLandChange?.(next)
          return next
        })
      } else {
        onPolygonChange?.(payload)
      }
    } catch (err) {
      console.error('Error calculating polygon area/centroid:', err)
      setValidationError('Could not calculate area for this boundary geometry. Please try redrawing.')
    }
  }, [draftCoords, calculateGeometryPayload, multiLand, activeSlot, onMultiLandChange, onPolygonChange])

  // Clear Boundary (Active Land Only in multiLand)
  const handleClear = useCallback(() => {
    setIsDrawing(false)
    setIsEditing(false)
    setDraftCoords([])
    setMousePos(null)
    setValidationError(null)

    if (multiLand) {
      setInternalLands((prev) => {
        const next = [...prev]
        next[activeSlot] = { ...next[activeSlot], coords: [], areaSqFt: 0, status: 'empty', payload: null }
        onMultiLandChange?.(next)
        return next
      })
    } else {
      onPolygonChange?.(null)
    }
  }, [multiLand, activeSlot, onMultiLandChange, onPolygonChange])

  // Toggle Edit Mode (Drag Vertices)
  const handleToggleEdit = useCallback(() => {
    if (isDrawing) return
    setIsEditing((prev) => !prev)
    setValidationError(null)
  }, [isDrawing])

  // Update vertex during drag
  const handleVertexDrag = useCallback(
    (index, newLngLat) => {
      const baseCoords = isDrawing ? draftCoords : currentCoords
      if (!baseCoords || !baseCoords[index]) return
      const nextCoords = [...baseCoords]
      nextCoords[index] = newLngLat

      const val = validatePolygonGeometry(nextCoords)
      if (!val.isValid) {
        setValidationError(val.reason)
      } else {
        setValidationError(null)
      }

      if (isDrawing) {
        setDraftCoords(nextCoords)
      } else {
        const payload = calculateGeometryPayload(nextCoords)
        if (multiLand) {
          setInternalLands((prev) => {
            const next = [...prev]
            next[activeSlot] = { ...next[activeSlot], coords: nextCoords, areaSqFt: payload?.areaSqFt || 0, payload }
            onMultiLandChange?.(next)
            return next
          })
        } else {
          onPolygonChange?.(payload)
        }
      }
    },
    [isDrawing, draftCoords, currentCoords, calculateGeometryPayload, multiLand, activeSlot, onMultiLandChange, onPolygonChange]
  )

  // Map Click
  const handleMapClick = useCallback(
    (e) => {
      // Ignore click if clicking directly on a vertex node marker
      if (e.originalEvent?.target?.closest('.vertex-node-marker')) return

      if (drawable && isDrawing) {
        setValidationError(null)
        setDraftCoords((prev) => [...prev, e.lngLat])
      } else if (!isDrawing && !isEditing && onLocationSelect) {
        onLocationSelect({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      }
    },
    [drawable, isDrawing, isEditing, onLocationSelect]
  )

  // Map Mouse Move (Rubberband line)
  const handleMapMouseMove = useCallback(
    (e) => {
      if (isDrawing && draftCoords.length > 0) {
        setMousePos(e.lngLat)
      }
    },
    [isDrawing, draftCoords.length]
  )

  // Live draft GeoJSON preview while drawing
  const draftGeojson = useMemo(() => {
    if (!isDrawing || draftCoords.length === 0) return null
    const coordsWithMouse = [...draftCoords]
    if (mousePos) coordsWithMouse.push(mousePos)

    return {
      type: 'Feature',
      geometry: {
        type: coordsWithMouse.length >= 3 ? 'Polygon' : 'LineString',
        coordinates:
          coordsWithMouse.length >= 3
            ? [[...coordsWithMouse.map((c) => [c.lng, c.lat]), [coordsWithMouse[0].lng, coordsWithMouse[0].lat]]]
            : coordsWithMouse.map((c) => [c.lng, c.lat]),
      },
    }
  }, [isDrawing, draftCoords, mousePos])

  // Live Area Preview while drawing
  const livePreviewArea = useMemo(() => {
    if (draftCoords.length < 3) return null
    return calculateGeodesicArea(draftCoords)
  }, [draftCoords])

  // Current Active Land Info
  const activeLand = multiLand ? internalLands[activeSlot] : { name: 'Parcel Boundary', coords: currentCoords }
  const hasFinishedPolygon = !isDrawing && currentCoords && currentCoords.length >= 3

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden border border-slate-200/90 shadow-md bg-slate-900 flex flex-col"
      style={{ height: isFullscreen ? '100vh' : height }}
    >
      {/* ---------------- 1. TOP FLOATING CONTROL BAR ---------------- */}
      <div className="absolute top-3 left-3 right-3 sm:right-auto z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        {/* Layer Selector Dropdown */}
        <div className="relative pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsLayerMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-md text-slate-700 hover:text-ink text-xs font-bold rounded-xl border border-slate-200 shadow-md transition-all active:scale-95"
            title="Switch Map Layers"
          >
            <span>{MAP_LAYERS[activeLayer]?.icon}</span>
            <span className="hidden sm:inline">{MAP_LAYERS[activeLayer]?.name}</span>
            <span className="text-[10px] text-slate-400">▼</span>
          </button>

          {isLayerMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-48 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl py-1 z-30 animate-fadeUp">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1 block">
                Map Layer
              </span>
              {Object.values(MAP_LAYERS).map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    setActiveLayer(layer.id)
                    setIsLayerMenuOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center justify-between hover:bg-slate-100 transition-colors ${
                    activeLayer === layer.id ? 'text-blue-600 bg-blue-50/70 font-bold' : 'text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{layer.icon}</span>
                    <span>{layer.name}</span>
                  </span>
                  {activeLayer === layer.id && <span className="text-blue-600 font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Locate Me (GPS) */}
        <button
          type="button"
          onClick={handleLocateMe}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-md text-slate-700 hover:text-blue-600 text-xs font-bold rounded-xl border border-slate-200 shadow-md transition-all active:scale-95"
          title="Zoom to My Current Location"
        >
          <span>🎯</span>
          <span className="hidden sm:inline">My Location</span>
        </button>

        {/* Reset Map View */}
        <button
          type="button"
          onClick={handleResetView}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-md text-slate-700 hover:text-ink text-xs font-bold rounded-xl border border-slate-200 shadow-md transition-all active:scale-95"
          title="Reset View to Centroid"
        >
          <span>🔄</span>
          <span className="hidden sm:inline">Reset View</span>
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-md text-slate-700 hover:text-ink text-xs font-bold rounded-xl border border-slate-200 shadow-md transition-all active:scale-95"
          title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
        >
          <span>{isFullscreen ? '✕' : '⛶'}</span>
          <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
      </div>

      {/* ---------------- 2. MAP CANVAS ---------------- */}
      <div className="flex-1 w-full h-full relative">
        {/* Subtle Map Tile Loading Indicator */}
        {isMapLoading && (
          <div className="absolute top-14 left-3 z-20 pointer-events-none flex items-center gap-1.5 px-3 py-1 bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-medium rounded-full shadow-md animate-fadeUp">
            <span className="w-2 h-2 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <span>Loading map tiles…</span>
          </div>
        )}

        <MapErrorBoundary>
          <Map
            ref={mapRef}
            initialViewState={{
              longitude: center?.lng || 78.1198,
              latitude: center?.lat || 9.9252,
              zoom: zoom,
              pitch: 0,
              bearing: 0,
            }}
            minZoom={2}
            maxZoom={20}
            mapStyle={MAP_LAYERS[activeLayer].style}
            style={{ width: '100%', height: '100%' }}
            onClick={handleMapClick}
            onMouseMove={handleMapMouseMove}
            onDataLoading={() => setIsMapLoading(true)}
            onIdle={() => setIsMapLoading(false)}
            onError={(e) => {
              // Log gracefully without breaking user canvas or showing false missing data
              console.warn('MapLibre tile loading notice:', e?.error?.message || e)
            }}
            cursor={isDrawing ? 'crosshair' : isEditing ? 'move' : 'pointer'}
            interactiveLayerIds={[]}
          >
            {/* Built-in Navigation Controls (Bottom-Right) */}
            <NavigationControl position="bottom-right" showCompass={true} visualizePitch={true} />

            {/* DRAFT PREVIEW (WHILE DRAWING) */}
            {isDrawing && draftGeojson && (
              <Source id="draft-source" type="geojson" data={draftGeojson}>
                {draftGeojson.geometry.type === 'Polygon' && (
                  <Layer
                    id="draft-fill"
                    type="fill"
                    paint={{ 'fill-color': '#3B82F6', 'fill-opacity': 0.25 }}
                  />
                )}
                <Layer
                  id="draft-line"
                  type="line"
                  paint={{ 'line-color': '#2563EB', 'line-width': 2.5, 'line-dasharray': [2, 2] }}
                />
              </Source>
            )}

            {/* DRAFT VERTEX NODES */}
            {isDrawing &&
              draftCoords.map((c, i) => (
                <Marker key={`draft-${i}`} longitude={c.lng} latitude={c.lat} anchor="center">
                  <div
                    className={`vertex-node-marker rounded-full border-2 border-white shadow-md transition-transform ${
                      i === 0
                        ? 'bg-emerald-500 w-4 h-4 cursor-pointer hover:scale-125 ring-2 ring-emerald-300 animate-pulse'
                        : 'bg-blue-600 w-3 h-3'
                    }`}
                    onClick={(e) => {
                      if (i === 0 && draftCoords.length >= 3) {
                        e.stopPropagation()
                        finishDrawing()
                      }
                    }}
                    title={i === 0 ? 'Click to close polygon' : `Vertex #${i + 1}`}
                  />
                </Marker>
              ))}

            {/* RENDER ALL PARCEL POLYGONS (Single or Multi-Land) */}
            {multiLand
              ? internalLands.map((parcel, pIdx) => {
                  if (!parcel.coords || parcel.coords.length < 3) return null
                  const parcelGeojson = {
                    type: 'Feature',
                    geometry: {
                      type: 'Polygon',
                      coordinates: [
                        [...parcel.coords.map((c) => [c.lng, c.lat]), [parcel.coords[0].lng, parcel.coords[0].lat]],
                      ],
                    },
                  }
                  const color = parcel.color || PARCEL_COLOR_PALETTES[pIdx % PARCEL_COLOR_PALETTES.length]
                  const isActive = pIdx === activeSlot

                  return (
                    <Source key={`parcel-${parcel.id || pIdx}`} type="geojson" data={parcelGeojson}>
                      <Layer
                        id={`parcel-fill-${pIdx}`}
                        type="fill"
                        paint={{ 'fill-color': color.fill, 'fill-opacity': isActive ? 0.35 : 0.2 }}
                      />
                      <Layer
                        id={`parcel-line-${pIdx}`}
                        type="line"
                        paint={{
                          'line-color': color.stroke,
                          'line-width': isActive ? 3.5 : 2,
                          'line-dasharray': isActive ? [1] : [2, 1],
                        }}
                      />
                    </Source>
                  )
                })
              : hasFinishedPolygon && (
                  <Source
                    id="single-boundary-source"
                    type="geojson"
                    data={{
                      type: 'Feature',
                      geometry: {
                        type: 'Polygon',
                        coordinates: [
                          [
                            ...currentCoords.map((c) => [c.lng, c.lat]),
                            [currentCoords[0].lng, currentCoords[0].lat],
                          ],
                        ],
                      },
                    }}
                  >
                    <Layer
                      id="boundary-fill"
                      type="fill"
                      paint={{ 'fill-color': '#10B981', 'fill-opacity': 0.3 }}
                    />
                    <Layer
                      id="boundary-line"
                      type="line"
                      paint={{ 'line-color': '#059669', 'line-width': 3 }}
                    />
                  </Source>
                )}

            {/* EDITABLE VERTEX HANDLES (WHEN EDITING MODE IS ACTIVE) */}
            {isEditing &&
              currentCoords.map((c, i) => (
                <Marker
                  key={`edit-${i}`}
                  longitude={c.lng}
                  latitude={c.lat}
                  anchor="center"
                  draggable={true}
                  onDragStart={() => setActiveDragIndex(i)}
                  onDrag={(e) => handleVertexDrag(i, e.lngLat)}
                  onDragEnd={() => setActiveDragIndex(null)}
                >
                  <div
                    className={`vertex-node-marker w-4 h-4 rounded-full border-2 border-white shadow-lg cursor-grab active:cursor-grabbing hover:scale-125 transition-transform ${
                      activeDragIndex === i ? 'bg-amber-400 scale-125 ring-2 ring-amber-300' : 'bg-emerald-600'
                    }`}
                    title={`Drag vertex #${i + 1} to reshape`}
                  />
                </Marker>
              ))}

            {/* SINGLE LOCATION POINT MARKER (Direct Area Input or Click Pin) */}
            {clickedLocation && !isDrawing && (
              <Marker longitude={clickedLocation.lng} latitude={clickedLocation.lat} anchor="bottom">
                <div className="relative cursor-pointer hover:scale-110 transition-transform origin-bottom group">
                  <svg className="w-8 h-8 text-rose-500 drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-4.198 0-8 3.403-8 7.602 0 4.198 3.469 9.21 8 16.398 4.531-7.188 8-12.2 8-16.398 0-4.199-3.801-7.602-8-7.602zm0 11c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3z" />
                  </svg>
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    Selected Location
                  </span>
                </div>
              </Marker>
            )}
          </Map>
        </MapErrorBoundary>

        {/* ---------------- 3. FLOATING ACTION PANEL (DESKTOP) & BOTTOM SHEET (MOBILE) ---------------- */}
        {drawable && (
          <div
            className={`absolute z-20 transition-all duration-300 ease-in-out ${
              // Responsive: Desktop right floating panel vs Mobile bottom docked sheet
              'bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:top-3 sm:right-3 sm:w-80'
            }`}
          >
            <div className="bg-white/95 backdrop-blur-md rounded-t-2xl sm:rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[75vh] sm:max-h-[calc(100vh-120px)]">
              {/* Panel Header */}
              <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📐</span>
                  <span className="text-xs font-extrabold text-slate-800 tracking-wide uppercase">
                    {multiLand ? 'Multi-Parcel Tool' : 'Land Boundary Tool'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPanelCollapsed((v) => !v)}
                  className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center text-xs font-bold transition-colors"
                  title={isPanelCollapsed ? 'Expand Panel' : 'Collapse Panel'}
                >
                  {isPanelCollapsed ? '▲' : '▼'}
                </button>
              </div>

              {/* Panel Body (Collapsible) */}
              {!isPanelCollapsed && (
                <div className="p-4 overflow-y-auto space-y-3.5 text-xs text-slate-700">
                  {/* Multi-Land Slot Switcher */}
                  {multiLand && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Select Parcel to Trace
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {internalLands.map((parcel, idx) => {
                          const isActive = activeSlot === idx
                          const color = parcel.color || PARCEL_COLOR_PALETTES[idx]
                          return (
                            <button
                              key={parcel.id || idx}
                              type="button"
                              onClick={() => {
                                if (isDrawing) return
                                setActiveSlot(idx)
                                onActiveLandChange?.(idx)
                              }}
                              className={`p-2 rounded-xl border text-left transition-all ${
                                isActive
                                  ? 'bg-blue-50/80 border-blue-500 shadow-xs ring-1 ring-blue-400'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`w-2.5 h-2.5 rounded-full ${color.badgeBg}`} />
                                <span className="font-bold text-[11px] truncate text-ink">{parcel.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 block">
                                {parcel.coords?.length >= 3
                                  ? `${Math.round(parcel.areaSqFt).toLocaleString()} sq.ft`
                                  : 'Not Drawn'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step-by-Step Contextual Status / Guidance */}
                  <div
                    className={`p-3 rounded-xl border text-xs leading-relaxed ${
                      validationError
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : isDrawing
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : isEditing
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : hasFinishedPolygon
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    {validationError ? (
                      <div className="flex items-start gap-1.5 font-semibold">
                        <span>⚠️</span>
                        <span>{validationError}</span>
                      </div>
                    ) : isDrawing ? (
                      <div>
                        <div className="flex items-center gap-2 font-bold mb-1">
                          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                          <span>Drawing in Progress ({draftCoords.length} points)</span>
                        </div>
                        <p className="text-[11px] text-blue-800">
                          Click corner boundaries on the map. Click the green starting node or "Finish Shape" when done.
                        </p>
                      </div>
                    ) : isEditing ? (
                      <div>
                        <div className="flex items-center gap-2 font-bold mb-1">
                          <span>✋</span>
                          <span>Edit Mode Active</span>
                        </div>
                        <p className="text-[11px] text-amber-800">
                          Click and drag any round vertex handle on the map to adjust parcel boundaries.
                        </p>
                      </div>
                    ) : hasFinishedPolygon ? (
                      <div>
                        <div className="flex items-center gap-1.5 font-bold mb-1 text-emerald-800">
                          <span>✓</span>
                          <span>Boundary Verified</span>
                        </div>
                        <p className="text-[11px] text-emerald-700">
                          Parcel geometry is valid. You can edit vertices or redraw anytime.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold block mb-1">How to draw:</span>
                        <p className="text-[11px]">
                          Click "Start Drawing" below, then click 3 or more corners on the map to enclose the property.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Live Area Metrics Display */}
                  {(livePreviewArea || hasFinishedPolygon) && (
                    <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Calculated Land Area
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-[10px] text-slate-400 block">Square Feet</span>
                          <strong className="text-blue-700 text-xs">
                            {Math.round(
                              livePreviewArea?.sqFt || activeBoundary?.areaSqFt || activeLand?.areaSqFt || 0
                            ).toLocaleString()}{' '}
                            sq.ft
                          </strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-[10px] text-slate-400 block">Cents</span>
                          <strong className="text-slate-800 text-xs">
                            {(
                              livePreviewArea?.cents ||
                              activeBoundary?.cents ||
                              (activeLand?.areaSqFt ? (activeLand.areaSqFt / 435.6).toFixed(2) : 0)
                            )}{' '}
                            cents
                          </strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-[10px] text-slate-400 block">Square Meters</span>
                          <strong className="text-slate-800 text-xs">
                            {Math.round(
                              livePreviewArea?.sqMeters || activeBoundary?.sqMeters || 0
                            ).toLocaleString()}{' '}
                            m²
                          </strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-[10px] text-slate-400 block">Perimeter</span>
                          <strong className="text-slate-800 text-xs">
                            {activeBoundary?.perimeterFeet || 0} ft
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Drawing Actions Toolbar */}
                  <div className="space-y-2 pt-1">
                    {!isDrawing ? (
                      <>
                        <button
                          type="button"
                          onClick={handleDrawStart}
                          className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                        >
                          <span>✏️</span>
                          <span>{hasFinishedPolygon ? 'Redraw Boundary' : 'Start Drawing'}</span>
                        </button>

                        {hasFinishedPolygon && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={handleToggleEdit}
                              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                                isEditing
                                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <span>{isEditing ? '✓ Done Editing' : '✋ Edit Vertices'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleClear}
                              className="py-2 px-3 bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <span>🗑️ Clear</span>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={finishDrawing}
                          disabled={draftCoords.length < 3}
                          className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                        >
                          <span>✅</span>
                          <span>Finish Boundary ({draftCoords.length} pts)</span>
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleUndoPoint}
                            disabled={draftCoords.length === 0}
                            className="py-2 px-3 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-colors"
                          >
                            <span>↩️ Undo</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClear}
                            className="py-2 px-3 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-colors"
                          >
                            <span>Cancel</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Attribution footer bar */}
      <div className="bg-slate-900/90 text-slate-400 px-3 py-1 text-[10px] flex items-center justify-between border-t border-slate-800">
        <span>© Smart Land GIS • {MAP_LAYERS[activeLayer]?.attribution}</span>
        <span className="hidden sm:inline">MapLibre GL & Turf.js Geodetic Engine</span>
      </div>
    </div>
  )
}
