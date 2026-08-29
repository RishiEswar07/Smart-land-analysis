"""
dependencies/pagination.py
---------------------------
Reusable pagination dependency for list endpoints.

Using a dependency (instead of repeating `skip: int = 0, limit: int = 20`
as raw query params in every router) keeps validation rules in one
place and makes it trivial to reuse across Land, Analysis, Reports, etc.
"""

from dataclasses import dataclass

from fastapi import Query


@dataclass
class PaginationParams:
    skip: int
    limit: int


def get_pagination_params(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Max number of records to return (1-100)"),
) -> PaginationParams:
    return PaginationParams(skip=skip, limit=limit)
