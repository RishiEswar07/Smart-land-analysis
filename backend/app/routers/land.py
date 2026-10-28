"""
routers/land.py
----------------
REST API endpoints for Land Management (Module 2).

Endpoints:
    POST   /api/v1/lands
    GET    /api/v1/lands
    GET    /api/v1/lands/{land_id}
    PUT    /api/v1/lands/{land_id}
    DELETE /api/v1/lands/{land_id}

Thin by design — all business logic lives in services/land_service.py.
This file only: parses/validates HTTP input (via Pydantic + FastAPI),
calls the service layer, and maps results/errors to HTTP responses.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.pagination import PaginationParams, get_pagination_params
from app.models.user import User
from app.schemas.comparison import ParcelComparisonRequest, ParcelComparisonResponse
from app.schemas.land import LandCreate, LandListResponse, LandResponse, LandUpdate
from app.services import comparison_service, land_service
from app.services.building_rule_service import evaluate_building_rules
from app.services.exceptions import NotFoundError
from app.services.facility_service import fetch_nearby_facilities

router = APIRouter(prefix="/lands", tags=["Land Management"])


@router.post(
    "",
    response_model=LandResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new land record",
)
async def create_land(
    payload: LandCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LandResponse:
    """Creates a new land/plot entry, owned by the logged-in user."""
    land = await land_service.create_land(db, payload, user_id=current_user.id)
    return LandResponse.model_validate(land)


@router.get(
    "",
    response_model=LandListResponse,
    status_code=status.HTTP_200_OK,
    summary="List the current user's land records (paginated)",
)
async def list_lands(
    pagination: PaginationParams = Depends(get_pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LandListResponse:
    """Returns a paginated list of the logged-in user's lands, most recently created first."""
    lands, total = await land_service.list_lands(
        db, skip=pagination.skip, limit=pagination.limit, user_id=current_user.id
    )
    return LandListResponse(
        total=total,
        skip=pagination.skip,
        limit=pagination.limit,
        items=[LandResponse.model_validate(land) for land in lands],
    )


@router.get(
    "/{land_id}",
    response_model=LandResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a single land record by id",
)
async def get_land(
    land_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LandResponse:
    """Fetches one land record owned by the current user. Returns 404 if it doesn't exist or not owned."""
    try:
        land = await land_service.get_land(db, land_id, user_id=current_user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return LandResponse.model_validate(land)


@router.get(
    "/{land_id}/facilities",
    status_code=status.HTTP_200_OK,
    summary="Get nearby facilities with real geodesic distances in km",
)
async def get_land_facilities(
    land_id: uuid.UUID,
    radius_km: float = Query(5.0, ge=1.0, le=50.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetches real nearby facilities around the parcel owned by current user using OpenStreetMap Overpass."""
    try:
        land = await land_service.get_land(db, land_id, user_id=current_user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    lat = land.latitude
    lng = land.longitude
    if lat is None or lng is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Land record has no valid coordinates.")

    data = await fetch_nearby_facilities(lat, lng, radius_km=radius_km)
    return {
        **data,
        **data.get("categories", {}),
    }


@router.get(
    "/nearby-facilities/search",
    status_code=status.HTTP_200_OK,
    summary="Query nearby facilities by coordinates without requiring a saved land record",
)
async def search_nearby_facilities(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
    radius_km: float = Query(5.0, ge=1.0, le=50.0),
):
    """Interactive preview of nearby facilities and geodesic distances in km."""
    data = await fetch_nearby_facilities(lat, lng, radius_km=radius_km)
    return {
        **data,
        **data.get("categories", {}),
    }


@router.get(
    "/planning-rules/calculate",
    status_code=status.HTTP_200_OK,
    summary="Interactive preview of TNCDBR 2019 FSI, setbacks, and building planning rules",
)
async def calculate_planning_rules_preview(
    area_sqft: float = Query(..., gt=0, description="Plot area in square feet"),
    road_width_ft: float = Query(..., gt=0, description="Abutting road right-of-way width in feet"),
    building_type: Optional[str] = Query("Individual House", description="Target building occupancy type"),
    plot_width_ft: Optional[float] = Query(None, gt=0, description="Optional plot frontage / width in feet"),
    plot_depth_ft: Optional[float] = Query(None, gt=0, description="Optional plot depth in feet"),
):
    """Calculates preliminary TNCDBR 2019 planning parameters without requiring a saved parcel."""
    return evaluate_building_rules(
        area_sqft=area_sqft,
        road_width_ft=road_width_ft,
        building_type=building_type,
        plot_width_ft=plot_width_ft,
        plot_depth_ft=plot_depth_ft,
    )


@router.post(
    "/compare",
    response_model=ParcelComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Multi-parcel side-by-side comparison and building-specific ranking",
)
async def compare_parcels(
    payload: ParcelComparisonRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ParcelComparisonResponse:
    """
    Compares 2 or 3 parcels owned by the authenticated user across suitability, risk,
    road access, and TNCDBR 2019 statutory building planning rules.
    """
    try:
        return await comparison_service.compare_parcels(
            db=db,
            user_id=current_user.id,
            parcel_ids=payload.parcel_ids,
            target_building_type=payload.building_type or "Individual House",
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.get(
    "/{land_id}/planning-rules",
    status_code=status.HTTP_200_OK,
    summary="Get TNCDBR 2019 FSI, setbacks, and building planning rules for a land parcel",
)
async def get_land_planning_rules(
    land_id: uuid.UUID,
    building_type: Optional[str] = Query(None, description="Target building occupancy type"),
    plot_width_ft: Optional[float] = Query(None, gt=0, description="Optional plot frontage in feet"),
    plot_depth_ft: Optional[float] = Query(None, gt=0, description="Optional plot depth in feet"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetches and evaluates TNCDBR 2019 planning rules strictly for a parcel owned by the logged-in user."""
    try:
        land = await land_service.get_land(db, land_id, user_id=current_user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    target_btype = building_type or "Individual House"
    return evaluate_building_rules(
        area_sqft=land.area_sqft,
        road_width_ft=land.road_width,
        building_type=target_btype,
        plot_width_ft=plot_width_ft,
        plot_depth_ft=plot_depth_ft,
        boundary_geojson=land.boundary_geojson,
    )


@router.put(
    "/{land_id}",
    response_model=LandResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a land record (partial update)",
)
async def update_land(
    land_id: uuid.UUID,
    payload: LandUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LandResponse:
    """
    Updates only the fields provided in the request body for land owned by current user.
    Returns 404 if the land doesn't exist or is not owned, 422 if the payload is invalid.
    """
    try:
        land = await land_service.update_land(db, land_id, payload, user_id=current_user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return LandResponse.model_validate(land)


@router.delete(
    "/{land_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a land record",
)
async def delete_land(
    land_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Deletes a land record owned by current user. Returns 404 if it doesn't exist or is not owned."""
    try:
        await land_service.delete_land(db, land_id, user_id=current_user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    # 204 No Content — no response body returned
