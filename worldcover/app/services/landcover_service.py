"""
landcover_service.py
-----------------------
Core service: given a latitude/longitude, returns the real ESA
WorldCover 2021 (or 2020) land-cover class for that point.

Two data-source modes, chosen automatically:

  1. STREAM (default, no download needed) — opens the tile's COG
     directly over HTTPS using GDAL's /vsicurl/ virtual file system.
     Because ESA WorldCover tiles are genuine Cloud-Optimized GeoTIFFs
     (internally tiled + have overviews), GDAL only fetches the small
     number of file byte-ranges needed to read ONE pixel — not the
     whole ~40-100MB tile, and certainly not the ~124GB global archive.
     This is the recommended mode for a web app doing point lookups.

  2. LOCAL — if you've pre-downloaded tiles (see scripts/download_bbox_tiles.py)
     into a local directory, pass local_dir and this reads from disk
     instead. Useful for offline/air-gapped deployment or to avoid
     depending on AWS availability at request time.

Opened datasets are cached (per process) so repeat queries in the same
region don't reopen/re-handshake the same remote file every time.
"""

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import rasterio
from rasterio.errors import RasterioIOError

from app.utils.worldcover_classes import get_land_cover_class
from app.utils.worldcover_tiles import WorldCoverTile, get_tile_for_point

# GDAL tuning for remote COG reads over HTTP — keeps requests small and
# avoids GDAL trying to list a "directory" that doesn't exist on S3.
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "15")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "2")


class LandCoverLookupError(Exception):
    """Raised when a land-cover value can't be determined for a point (no data, unreachable source, etc.)."""


@dataclass
class LandCoverResult:
    latitude: float
    longitude: float
    class_code: int
    class_name: str
    category: str
    construction_suitability: str
    suitability_note: str
    source_tile: str
    data_source: str   # "remote-stream" or f"local:{path}"
    dataset_year: int


@lru_cache(maxsize=32)
def _open_dataset(path_or_url: str):
    """
    Opens (and caches) a rasterio dataset handle. Cached so repeated
    queries against the same tile — very likely in a real app, since
    users analyzing nearby plots hit the same tile — don't pay the
    remote-open cost every time.
    """
    try:
        return rasterio.open(path_or_url)
    except RasterioIOError as exc:
        raise LandCoverLookupError(f"Could not open land-cover tile: {path_or_url}") from exc


def _resolve_source(tile: WorldCoverTile, local_dir: Optional[str]) -> tuple[str, bool]:
    """Returns (path_or_url, is_local) — either a local file path (if present) or the /vsicurl/ streaming URL."""
    if local_dir:
        local_path = os.path.join(local_dir, tile.filename)
        if os.path.exists(local_path):
            return local_path, True
        raise LandCoverLookupError(
            f"local_dir was given but {tile.filename} isn't in it. "
            f"Either download it first (scripts/download_bbox_tiles.py) or omit "
            f"local_dir to stream it instead."
        )
    # /vsicurl/ tells GDAL to treat this HTTPS URL as a random-access
    # remote file (range requests), rather than downloading it whole.
    return f"/vsicurl/{tile.url}", False


def get_land_cover(lat: float, lon: float, year: int = 2021, local_dir: Optional[str] = None) -> LandCoverResult:
    """
    Returns the real ESA WorldCover land-cover class for (lat, lon).

    Args:
        lat, lon: WGS84 decimal degrees.
        year: 2021 (default, v200 algorithm) or 2020 (v100 algorithm).
        local_dir: optional path to a directory of pre-downloaded tile
            GeoTIFFs (see scripts/download_bbox_tiles.py). If omitted,
            streams the needed bytes directly from the public S3 bucket.

    Raises:
        LandCoverLookupError if the tile can't be reached/opened, or if
        the pixel at this location has no data.
    """
    tile = get_tile_for_point(lat, lon, year=year)
    source, is_local = _resolve_source(tile, local_dir)

    try:
        dataset = _open_dataset(source)
        # rasterio's .sample() takes (x, y) = (lon, lat) pairs, matching
        # this dataset's CRS (EPSG:4326, plain geographic degrees — no
        # reprojection needed for WorldCover).
        pixel_value = next(dataset.sample([(lon, lat)]))[0]
    except LandCoverLookupError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface any GDAL/network error clearly
        raise LandCoverLookupError(f"Failed to read land-cover pixel at ({lat}, {lon}): {exc}") from exc

    if pixel_value == 0:
        raise LandCoverLookupError(
            f"No land-cover data available at ({lat}, {lon}) — this pixel is masked "
            "as 'no data' in the ESA WorldCover product (rare; usually persistent cloud/gap)."
        )

    land_cover_class = get_land_cover_class(int(pixel_value))

    return LandCoverResult(
        latitude=lat,
        longitude=lon,
        class_code=land_cover_class.code,
        class_name=land_cover_class.name,
        category=land_cover_class.category,
        construction_suitability=land_cover_class.construction_suitability,
        suitability_note=land_cover_class.suitability_note,
        source_tile=tile.tile_code,
        data_source=f"local:{source}" if is_local else "remote-stream",
        dataset_year=year,
    )
