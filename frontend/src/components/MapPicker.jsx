import React, { useRef, useState, useCallback, useMemo } from 'react'
import Map, { NavigationControl, Source, Layer, Marker } from 'react-map-gl/maplibre'
import area from '@turf/area'
import centroid from '@turf/centroid'
import 'maplibre-gl/dist/maplibre-gl.css'

const SQM_TO_SQFT = 10.7639104

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error("MapPicker Runtime Error:", error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-red-600 p-4 text-center">
          <p className="font-semibold mb-2">Map failed to load</p>
          <p className="text-xs text-slate-500 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{this.state.error?.message}</p>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 text-sm"
          >
            Retry Map
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const mapStyle = {
  version: 8,
  sources: {
    'satellite': {
      type: 'raster',
      tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'],
      tileSize: 256
    }
  },
  layers: [
    {
      id: 'satellite-layer',
      type: 'raster',
      source: 'satellite',
      minzoom: 0,
      maxzoom: 22
    }
  ]
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
  height = '600px',
  flyToCenter = null
}) {
  const mapRef = useRef(null)

  // Native drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [draftCoords, setDraftCoords] = useState([])
  const [mousePos, setMousePos] = useState(null)

  // Handle fly-to
  React.useEffect(() => {
    if (flyToCenter && mapRef.current) {
      mapRef.current.flyTo({
        center: [flyToCenter.lng, flyToCenter.lat],
        zoom: 18,
        duration: 2000
      })
    }
  }, [flyToCenter])

  const handleDrawStart = useCallback(() => {
    setIsDrawing(true)
    setDraftCoords([])
    setMousePos(null)
    onPolygonChange?.(null)
  }, [onPolygonChange])

  const handleClear = useCallback(() => {
    setIsDrawing(false)
    setDraftCoords([])
    setMousePos(null)
    onPolygonChange?.(null)
  }, [onPolygonChange])

  const finishDrawing = useCallback(() => {
    if (draftCoords.length < 3) {
      alert("Please draw at least 3 points to form a polygon.")
      return
    }
    
    setIsDrawing(false)
    setMousePos(null)

    try {
      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[...draftCoords.map(c => [c.lng, c.lat]), [draftCoords[0].lng, draftCoords[0].lat]]]
        }
      }

      const areaSqFt = area(geojson) * SQM_TO_SQFT
      const centerFeature = centroid(geojson)
      const cent = { 
        lat: centerFeature.geometry.coordinates[1],
        lng: centerFeature.geometry.coordinates[0] 
      }

      onPolygonChange?.({ coords: draftCoords, areaSqFt, centroid: cent, geojson })
    } catch (err) {
      console.error("Error calculating polygon area/centroid:", err)
    }
  }, [draftCoords, onPolygonChange])

  const handleMapClick = useCallback((e) => {
    if (drawable && isDrawing) {
      if (e.originalEvent.target.closest('.first-point-marker')) return
      setDraftCoords(prev => [...prev, e.lngLat])
    } else if (onLocationSelect) {
      onLocationSelect({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    }
  }, [drawable, isDrawing, onLocationSelect])

  const handleMapMouseMove = useCallback((e) => {
    if (isDrawing && draftCoords.length > 0) {
      setMousePos(e.lngLat)
    }
  }, [isDrawing, draftCoords.length])

  // Derive final geojson for display (when not drawing)
  const currentCoords = activeBoundary?.coords || (polygon || [])
  const finalGeojson = currentCoords.length >= 3 ? {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[...currentCoords.map(c => [c.lng, c.lat]), [currentCoords[0].lng, currentCoords[0].lat]]]
    }
  } : null

  // Derive draft geojson for preview (while drawing)
  const draftGeojson = useMemo(() => {
    if (!isDrawing || draftCoords.length === 0) return null
    
    // Include the current mouse position as the "next" point for a live preview line
    const coordsWithMouse = [...draftCoords]
    if (mousePos) coordsWithMouse.push(mousePos)

    return {
      type: 'Feature',
      geometry: {
        type: coordsWithMouse.length >= 3 ? 'Polygon' : 'LineString',
        coordinates: coordsWithMouse.length >= 3 
          ? [[...coordsWithMouse.map(c => [c.lng, c.lat]), [coordsWithMouse[0].lng, coordsWithMouse[0].lat]]]
          : coordsWithMouse.map(c => [c.lng, c.lat])
      }
    }
  }, [isDrawing, draftCoords, mousePos])

  return (
    <div className="rounded-xl2 overflow-hidden border border-line shadow-card relative" style={{ height }}>
      {/* Floating Toolbar (only if drawable enabled) */}
      {drawable && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white/90 backdrop-blur-md p-2 rounded-xl shadow-lg border border-slate-200">
          {!isDrawing && !activeBoundary && (
            <button 
              onClick={handleDrawStart}
              className="text-xs font-semibold px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Draw Boundary Manually
            </button>
          )}
          
          {isDrawing && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-500 px-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Click points to draw
              </span>
              <button 
                onClick={finishDrawing}
                className="text-xs font-bold px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Finish Shape
              </button>
              <button 
                onClick={handleClear}
                className="text-xs font-semibold px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {!isDrawing && activeBoundary && (
            <button 
              onClick={handleClear}
              className="text-xs font-semibold px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              Clear Boundary
            </button>
          )}
        </div>
      )}

      <MapErrorBoundary>
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: center?.lng || 78.1198,
            latitude: center?.lat || 9.9252,
            zoom: zoom,
            pitch: 45,
            bearing: 0
          }}
          mapStyle={mapStyle}
          style={{ width: '100%', height: '100%' }}
          onClick={handleMapClick}
          onMouseMove={handleMapMouseMove}
          cursor={isDrawing ? 'crosshair' : 'pointer'}
          interactiveLayerIds={[]}
        >
          <NavigationControl position="bottom-right" visualizePitch={true} />

          {/* DRAFT PREVIEW (WHILE DRAWING) */}
          {isDrawing && draftGeojson && (
            <Source type="geojson" data={draftGeojson}>
              {draftGeojson.geometry.type === 'Polygon' && (
                <Layer 
                  id="draft-fill" 
                  type="fill" 
                  paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.3 }} 
                />
              )}
              <Layer 
                id="draft-line" 
                type="line" 
                paint={{ 'line-color': '#2563eb', 'line-width': 3, 'line-dasharray': [2, 2] }} 
              />
            </Source>
          )}

          {/* DRAFT NODES */}
          {isDrawing && draftCoords.map((c, i) => (
            <Marker key={i} longitude={c.lng} latitude={c.lat} anchor="center">
              <div 
                className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${i === 0 ? 'bg-green-500 first-point-marker cursor-pointer w-4 h-4' : 'bg-blue-500'}`}
                onClick={(e) => {
                  if (i === 0 && draftCoords.length >= 3) {
                    e.stopPropagation();
                    finishDrawing();
                  }
                }}
              />
            </Marker>
          ))}

          {/* FINAL BOUNDARY */}
          {!isDrawing && finalGeojson && (
            <Source type="geojson" data={finalGeojson}>
              <Layer 
                id="boundary-fill" 
                type="fill" 
                paint={{ 'fill-color': '#10b981', 'fill-opacity': 0.3 }} 
              />
              <Layer 
                id="boundary-line" 
                type="line" 
                paint={{ 'line-color': '#059669', 'line-width': 3 }} 
              />
            </Source>
          )}

          {/* SINGLE LOCATION MARKER */}
          {clickedLocation && (
            <Marker longitude={clickedLocation.lng} latitude={clickedLocation.lat} anchor="bottom">
              <div className="relative cursor-pointer hover:scale-110 transition-transform origin-bottom">
                <svg className="w-8 h-8 text-red-500 drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-4.198 0-8 3.403-8 7.602 0 4.198 3.469 9.21 8 16.398 4.531-7.188 8-12.2 8-16.398 0-4.199-3.801-7.602-8-7.602zm0 11c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3z"/>
                </svg>
              </div>
            </Marker>
          )}
        </Map>
      </MapErrorBoundary>
    </div>
  )
}
