"""
routers/landcover.py
-----------------------
REST API endpoint for real ESA WorldCover land-cover lookups.

    GET /api/v1/landcover?lat=9.9252&lon=78.1198
"""

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.landcover import LandCoverResponse
from app.services.landcover_service import get_land_cover, LandCoverLookupError

router = APIRouter(prefix="/landcover", tags=["Land Cover (ESA WorldCover)"])


@router.get(
    "",
    response_model=LandCoverResponse,
    status_code=status.HTTP_200_OK,
    summary="Get the real ESA WorldCover 2021 land-cover class for a coordinate",
)
async def get_landcover_for_point(
    lat: float = Query(..., ge=-90, le=90, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude in decimal degrees"),
    year: int = Query(2021, description="WorldCover dataset year: 2021 (v200) or 2020 (v100)"),
) -> LandCoverResponse:
    """
    Streams the relevant ESA WorldCover COG tile directly from the
    public S3 bucket (no local download) and returns the real land-cover
    classification at this exact point.
    """
    try:
        result = get_land_cover(lat, lon, year=year)
    except LandCoverLookupError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return LandCoverResponse(
        latitude=result.latitude,
        longitude=result.longitude,
        land_cover_class=result.class_code,
        land_cover_name=result.class_name,
        category=result.category,
        construction_suitability=result.construction_suitability,
        suitability_note=result.suitability_note,
        source_tile=result.source_tile,
        data_source=result.data_source,
        dataset_year=result.dataset_year,
    )
