"""
worldcover_classes.py
------------------------
The official ESA WorldCover 11-class legend, verified against ESA's own
product pages and independently cross-checked against the Microsoft
Planetary Computer, Google Earth Engine, and Digital Earth Africa
catalog entries for this dataset (all four sources give byte-identical
code/name/color values) — these are NOT placeholder/guessed values.

Also maps the 11 official classes onto the 8 simplified categories
requested for the Smart Land Analysis Platform UI, plus a first-pass
construction-suitability verdict per class. The suitability verdict is
a domain-knowledge heuristic (same "transparent rule-based" spirit as
the rest of this project's suitability engine) — it is NOT derived
from the land-cover data itself, which only tells you *what* is on the
ground today, not whether building there is advisable. Treat it as a
starting signal, not a final answer.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class LandCoverClass:
    code: int
    name: str                    # official ESA WorldCover class name
    color_hex: str                # official legend color
    category: str                  # simplified category for this app's UI
    construction_suitability: str   # Suitable / Caution / Unsuitable
    suitability_note: str


# Official ESA WorldCover 10m legend (both v100/2020 and v200/2021 use
# the same 11 classes/codes/colors).
WORLDCOVER_CLASSES: dict[int, LandCoverClass] = {
    10: LandCoverClass(
        10, "Tree cover", "#006400", "Tree cover",
        "Caution",
        "Land is forested. Building requires clearance/deforestation permits and raises environmental-impact and soil-stability considerations.",
    ),
    20: LandCoverClass(
        20, "Shrubland", "#ffbb22", "Shrubland",
        "Suitable",
        "Shrub-covered land is generally clearable and buildable, subject to normal site preparation.",
    ),
    30: LandCoverClass(
        30, "Grassland", "#ffff4c", "Grassland",
        "Suitable",
        "Open grassland is typically straightforward to build on, subject to soil and drainage checks.",
    ),
    40: LandCoverClass(
        40, "Cropland", "#f096ff", "Cropland",
        "Caution",
        "Active farmland. Buildable, but check local agricultural-land-conversion regulations and irrigation infrastructure before proceeding.",
    ),
    50: LandCoverClass(
        50, "Built-up", "#fa0000", "Built-up",
        "Suitable",
        "Already-developed/urbanized land. Generally the most straightforward category for further construction, subject to zoning.",
    ),
    60: LandCoverClass(
        60, "Bare / sparse vegetation", "#b4b4b4", "Bare/sparse vegetation",
        "Suitable",
        "Little to no vegetation to clear. Often used for new development, but verify soil quality (may indicate erosion or poor topsoil).",
    ),
    70: LandCoverClass(
        70, "Snow and ice", "#f0f0f0", "Bare/sparse vegetation",
        "Unsuitable",
        "Permanent snow/ice cover — not relevant for most of India, included for dataset completeness. Not buildable as-is.",
    ),
    80: LandCoverClass(
        80, "Permanent water bodies", "#0064c8", "Water",
        "Unsuitable",
        "Open water (river, lake, reservoir, sea). Not buildable — verify site selection, this coordinate may be misplaced.",
    ),
    90: LandCoverClass(
        90, "Herbaceous wetland", "#0096a0", "Wetland",
        "Unsuitable",
        "Wetland — typically ecologically protected, poor load-bearing soil, high flood risk. Construction strongly discouraged without specialist assessment.",
    ),
    95: LandCoverClass(
        95, "Mangroves", "#00cf75", "Wetland",
        "Unsuitable",
        "Mangrove forest — ecologically protected coastal wetland in most jurisdictions. Construction is normally prohibited.",
    ),
    100: LandCoverClass(
        100, "Moss and lichen", "#fae6a0", "Bare/sparse vegetation",
        "Caution",
        "Sparse ground cover, typically found in cold/alpine regions — rare in India. Verify terrain and altitude before proceeding.",
    ),
}


def get_land_cover_class(code: int) -> LandCoverClass:
    """
    Looks up the LandCoverClass for a raw ESA WorldCover pixel value.
    Raises ValueError for any code outside the official 11-class legend
    (e.g. 0, which WorldCover reserves for "no data") — callers should
    treat that as "no data available for this location", not silently
    default to a guessed class.
    """
    if code not in WORLDCOVER_CLASSES:
        raise ValueError(
            f"Pixel value {code} is not a valid ESA WorldCover class code. "
            "Valid codes: 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100. "
            "A value of 0 means 'no data' for this pixel."
        )
    return WORLDCOVER_CLASSES[code]
