"""
services/exceptions.py
-----------------------
Domain-level exceptions raised by the service layer.

Routers catch these and translate them into proper HTTP responses,
keeping HTTP concerns (status codes) out of the service layer and
business-logic concerns out of the router layer.
"""


class NotFoundError(Exception):
    """Raised when a requested entity does not exist."""

    def __init__(self, entity: str, identifier: str):
        self.entity = entity
        self.identifier = identifier
        super().__init__(f"{entity} with id '{identifier}' was not found.")
