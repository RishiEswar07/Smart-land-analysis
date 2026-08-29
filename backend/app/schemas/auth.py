"""
schemas/auth.py
----------------
Pydantic v2 request/response schemas for Authentication.

Field names match src/services/authService.js on the frontend exactly:
  - POST /auth/register  body: RegisterRequest -> UserResponse
  - POST /auth/login     body: LoginRequest    -> TokenResponse (has .access_token)
  - GET  /auth/me                              -> UserResponse
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"name": "Rishi Eswar", "email": "rishi@example.com", "password": "StrongPass123"}
        }
    )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    model_config = ConfigDict(
        json_schema_extra={"example": {"email": "rishi@example.com", "password": "StrongPass123"}}
    )


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
