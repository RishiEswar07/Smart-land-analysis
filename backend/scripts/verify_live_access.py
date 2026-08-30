"""
scripts/verify_live_access.py
--------------------------------
Run this to confirm you can reach the real ESA WorldCover S3 bucket and
get a real classification back.

Usage:
    python scripts/verify_live_access.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.landcover_service import get_land_cover, LandCoverLookupError

CHECKPOINTS = [
    ("Madurai city center, TN", 9.9252, 78.1198, "likely Built-up"),
    ("Chennai coastline", 13.0500, 80.2824, "likely Water or Built-up"),
    ("Rural farmland near Thanjavur, TN", 10.7870, 79.1378, "likely Cropland"),
    ("Western Ghats forest, Kerala", 10.1600, 77.0600, "likely Tree cover"),
]

if __name__ == "__main__":
    print("Verifying live ESA WorldCover access via streamed COG reads...\n")
    any_failed = False

    for label, lat, lon, expectation in CHECKPOINTS:
        try:
            result = get_land_cover(lat, lon, year=2021)
            print(f"[OK] {label} ({lat}, {lon})")
            print(f"     Tile: {result.source_tile}  Source: {result.data_source}")
            print(f"     Class: {result.class_code} - {result.class_name}  ({expectation})")
            print(f"     Suitability: {result.construction_suitability} — {result.suitability_note}\n")
        except LandCoverLookupError as exc:
            any_failed = True
            print(f"[FAIL] {label} ({lat}, {lon}): {exc}\n")

    if any_failed:
        print("Some lookups failed — check your internet connection and that")
        print("amazonaws.com is reachable from this machine/network.")
        sys.exit(1)
    else:
        print("All live lookups succeeded — the S3 streaming path works end-to-end.")
