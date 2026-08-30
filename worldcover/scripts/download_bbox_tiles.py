"""
scripts/download_bbox_tiles.py
---------------------------------
Downloads ONLY the ESA WorldCover tiles that intersect a given bounding
box, instead of the full ~124GB / 2631-tile global archive.

For point-lookup use cases (this app's "select a point, get its land
cover"), you likely don't need this at all — landcover_service.py
streams directly from S3 with zero download. Use this script only if
you want a local/offline copy (e.g. for a fully offline deployment, or
to batch-process many points without depending on AWS availability).

Usage:
    python download_bbox_tiles.py --preset india --out ./worldcover_tiles
    python download_bbox_tiles.py --bbox 8.0 76.0 13.5 80.5 --out ./tn_tiles
    python download_bbox_tiles.py --preset india --dry-run
"""

import argparse
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.utils.worldcover_tiles import get_tiles_for_bbox

# A few ready-made bounding boxes so you don't have to look them up.
# (min_lat, min_lon, max_lat, max_lon) — approximate, generous margins.
PRESET_BBOXES = {
    "india": (6.0, 68.0, 37.5, 97.5),
    "tamil_nadu": (8.0, 76.0, 13.5, 80.5),
    "karnataka": (11.5, 74.0, 18.5, 78.5),
    "maharashtra": (15.5, 72.5, 22.0, 80.5),
    "delhi_ncr": (28.0, 76.5, 29.0, 77.7),
}


def download_tiles(bbox, out_dir: str, year: int = 2021, dry_run: bool = False):
    os.makedirs(out_dir, exist_ok=True)
    tiles = get_tiles_for_bbox(*bbox, year=year)

    print(f"Bounding box {bbox} intersects {len(tiles)} tile(s):")
    for tile in tiles:
        print(f"  {tile.tile_code}  ->  {tile.url}")

    if dry_run:
        print("\n(dry run — nothing downloaded)")
        return

    print()
    for tile in tiles:
        dest = os.path.join(out_dir, tile.filename)
        if os.path.exists(dest):
            print(f"  [skip] {tile.filename} already exists")
            continue

        print(f"  [download] {tile.filename} ...", end=" ", flush=True)
        try:
            with requests.get(tile.url, stream=True, timeout=60) as resp:
                if resp.status_code == 404:
                    # Perfectly normal — not every 3x3 tile has land
                    # (e.g. pure open-ocean tiles aren't published).
                    print("not published (likely open ocean) — skipped")
                    continue
                resp.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=1024 * 1024):
                        f.write(chunk)
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f"done ({size_mb:.1f} MB)")
        except requests.RequestException as exc:
            print(f"FAILED: {exc}")

    print(f"\nDone. Tiles saved to: {os.path.abspath(out_dir)}")
    print(f"Use this path as `local_dir=` in landcover_service.get_land_cover(...).")


def main():
    parser = argparse.ArgumentParser(description="Download only the ESA WorldCover tiles needed for an area.")
    parser.add_argument("--preset", choices=sorted(PRESET_BBOXES.keys()), help="Use a ready-made bounding box")
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("MIN_LAT", "MIN_LON", "MAX_LAT", "MAX_LON"), help="Custom bounding box")
    parser.add_argument("--year", type=int, default=2021, choices=[2020, 2021])
    parser.add_argument("--out", default="./worldcover_tiles", help="Output directory")
    parser.add_argument("--dry-run", action="store_true", help="List tiles without downloading")
    args = parser.parse_args()

    if not args.preset and not args.bbox:
        parser.error("Provide either --preset or --bbox")

    bbox = PRESET_BBOXES[args.preset] if args.preset else tuple(args.bbox)
    download_tiles(bbox, args.out, year=args.year, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
