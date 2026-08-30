"""
test_landcover_service.py
----------------------------
Tests the landcover service against synthetic GeoTIFFs matching the exact
tile-naming convention and CRS the real service expects, with KNOWN pixel
values placed at KNOWN coordinates.

This tests the sampling, indexing, and classification logic in local_dir mode.
"""

import os
import sys
import tempfile

import numpy as np
import rasterio
from rasterio.transform import from_origin

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.landcover_service import get_land_cover, LandCoverLookupError
from app.utils.worldcover_tiles import get_tile_for_point


def build_synthetic_tile(tmp_dir: str, lat: float, lon: float, class_code: int) -> str:
    """
    Builds a 3x3-degree, 10m-equivalent-grid GeoTIFF named EXACTLY like
    a real WorldCover tile would be for this point, filled entirely
    with `class_code`, so any sample within it returns a known value.
    """
    tile = get_tile_for_point(lat, lon, year=2021)
    path = os.path.join(tmp_dir, tile.filename)

    width = height = 300
    pixel_size = 3.0 / width  # 3-degree tile
    transform = from_origin(tile.sw_lon, tile.sw_lat + 3.0, pixel_size, pixel_size)

    data = np.full((height, width), class_code, dtype=np.uint8)

    with rasterio.open(
        path, "w",
        driver="GTiff",
        height=height, width=width,
        count=1, dtype=np.uint8,
        crs="EPSG:4326",
        transform=transform,
        nodata=0,
    ) as dst:
        dst.write(data, 1)

    return path


def run():
    tmp_dir = os.path.join(tempfile.gettempdir(), "synthetic_worldcover")
    os.makedirs(tmp_dir, exist_ok=True)

    test_cases = [
        # (lat, lon, class_code, expected_name, expected_category, expected_suitability)
        (9.9252, 78.1198, 50, "Built-up", "Built-up", "Suitable"),
        (11.0168, 76.9558, 10, "Tree cover", "Tree cover", "Caution"),
        (13.0827, 80.2707, 80, "Permanent water bodies", "Water", "Unsuitable"),
        (28.6139, 77.2090, 90, "Herbaceous wetland", "Wetland", "Unsuitable"),
        (26.9124, 75.7873, 40, "Cropland", "Cropland", "Caution"),
    ]

    print(f"{'Lat,Lon':<20} {'Code':<6} {'Class Name':<25} {'Category':<20} {'Suitability':<12} {'Result'}")
    print("-" * 100)

    all_passed = True
    for lat, lon, code, expected_name, expected_cat, expected_suit in test_cases:
        build_synthetic_tile(tmp_dir, lat, lon, code)
        result = get_land_cover(lat, lon, year=2021, local_dir=tmp_dir)

        ok = (
            result.class_code == code
            and result.class_name == expected_name
            and result.category == expected_cat
            and result.construction_suitability == expected_suit
        )
        all_passed &= ok
        status = "PASS" if ok else "FAIL"
        print(f"{lat:.4f},{lon:.4f}   {result.class_code:<6} {result.class_name:<25} {result.category:<20} {result.construction_suitability:<12} {status}")

    print("-" * 100)

    # No-data (code 0) should raise a clear error
    build_synthetic_tile(tmp_dir, 20.0, 78.0, 0)
    try:
        get_land_cover(20.0, 78.0, year=2021, local_dir=tmp_dir)
        print("NO-DATA TEST: FAIL (should have raised LandCoverLookupError)")
        all_passed = False
    except LandCoverLookupError as e:
        print(f"NO-DATA TEST: PASS (correctly raised: {e})")

    print()
    print("ALL TESTS PASSED" if all_passed else "SOME TESTS FAILED")
    return all_passed


if __name__ == "__main__":
    success = run()
    sys.exit(0 if success else 1)
