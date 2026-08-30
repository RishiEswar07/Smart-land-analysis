"""
worldcover_tiles.py
--------------------
Computes the ESA WorldCover 10m tile code, filename, and download/stream
URL for a given latitude/longitude — verified against ESA's own
documentation (https://esa-worldcover.org/en/data-access) and the AWS
Registry of Open Data (https://registry.opendata.aws/esa-worldcover-vito/).

FACTS USED HERE (verified, not guessed):
- Product is delivered as 3x3 degree tiles, Cloud-Optimized GeoTIFFs (COG),
  in EPSG:4326 (plain lat/lon degrees — no reprojection needed).
- Tile code = 2-digit latitude + 3-digit longitude of the tile's
  LOWER-LEFT (south-west) corner, e.g. "N09E078" or "S48E036".
- Filename pattern: ESA_WorldCover_10m_<YEAR>_<VERSION>_<TILE>_Map.tif
- Public S3 bucket (no AWS account/credentials needed):
    https://esa-worldcover.s3.eu-central-1.amazonaws.com/<VERSION>/<YEAR>/map/<FILENAME>
  Confirmed working example (from ESA/terrabyte's own STAC catalog):
    .../v200/2021/map/ESA_WorldCover_10m_2021_v200_S57E159_Map.tif

2021 map uses algorithm version "v200". 2020 map uses "v100".
"""

from dataclasses import dataclass
import math

WORLDCOVER_S3_BASE = "https://esa-worldcover.s3.eu-central-1.amazonaws.com"

# year -> algorithm version string used in the file/path naming
_YEAR_TO_VERSION = {
    2020: "v100",
    2021: "v200",
}


@dataclass
class WorldCoverTile:
    tile_code: str      # e.g. "N09E078"
    filename: str        # e.g. "ESA_WorldCover_10m_2021_v200_N09E078_Map.tif"
    url: str              # full HTTPS URL to the COG on the public S3 bucket
    sw_lat: float          # south-west corner latitude of this 3x3 deg tile
    sw_lon: float            # south-west corner longitude of this 3x3 deg tile


def _tile_lower_left(lat: float, lon: float) -> tuple[int, int]:
    """
    Snaps a lat/lon to the lower-left corner of its enclosing 3x3 degree
    tile. The WorldCover grid is aligned to multiples of 3 starting at 0,
    so this is a straightforward floor-to-nearest-3 in each direction.
    """
    lat0 = int(math.floor(lat / 3.0) * 3)
    lon0 = int(math.floor(lon / 3.0) * 3)
    return lat0, lon0


def _format_tile_code(lat0: int, lon0: int) -> str:
    """Formats the SW corner as ESA's <N|S><2-digit><E|W><3-digit> tile code."""
    lat_hemi = "N" if lat0 >= 0 else "S"
    lon_hemi = "E" if lon0 >= 0 else "W"
    return f"{lat_hemi}{abs(lat0):02d}{lon_hemi}{abs(lon0):03d}"


def get_tile_for_point(lat: float, lon: float, year: int = 2021) -> WorldCoverTile:
    """
    Returns the WorldCoverTile (code, filename, URL, SW corner) that
    contains the given point.

    Raises ValueError for out-of-range coordinates or an unsupported year.
    """
    if not (-90.0 <= lat <= 90.0):
        raise ValueError(f"Latitude out of range: {lat}")
    if not (-180.0 <= lon <= 180.0):
        raise ValueError(f"Longitude out of range: {lon}")
    if year not in _YEAR_TO_VERSION:
        raise ValueError(f"Unsupported WorldCover year: {year}. Use 2020 or 2021.")

    version = _YEAR_TO_VERSION[year]
    lat0, lon0 = _tile_lower_left(lat, lon)
    tile_code = _format_tile_code(lat0, lon0)
    filename = f"ESA_WorldCover_10m_{year}_{version}_{tile_code}_Map.tif"
    url = f"{WORLDCOVER_S3_BASE}/{version}/{year}/map/{filename}"

    return WorldCoverTile(tile_code=tile_code, filename=filename, url=url, sw_lat=lat0, sw_lon=lon0)


def get_tiles_for_bbox(min_lat: float, min_lon: float, max_lat: float, max_lon: float, year: int = 2021) -> list[WorldCoverTile]:
    """
    Returns every WorldCoverTile that intersects the given bounding box —
    used to download just the tiles needed for a country/state/district
    instead of the full ~124 GB / 2631-tile global archive.
    """
    if min_lat > max_lat or min_lon > max_lon:
        raise ValueError("min_lat/min_lon must be <= max_lat/max_lon")

    lat0_start, lon0_start = _tile_lower_left(min_lat, min_lon)
    lat0_end, _ = _tile_lower_left(max_lat, min_lon)
    _, lon0_end = _tile_lower_left(min_lat, max_lon)

    tiles: list[WorldCoverTile] = []
    lat0 = lat0_start
    while lat0 <= lat0_end:
        lon0 = lon0_start
        while lon0 <= lon0_end:
            # Use the tile's center point to regenerate it via the
            # single-point function, keeping tile-code logic in one place.
            tiles.append(get_tile_for_point(lat0 + 1.5, lon0 + 1.5, year=year))
            lon0 += 3
        lat0 += 3

    return tiles
