from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserLogin(UserBase):
    password: str
    totp_code: Optional[str] = None


class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class TOTPEnableRequest(BaseModel):
    code: str


class TOTPEnableResponse(BaseModel):
    provisioning_uri: str


class TOTPVerifyRequest(BaseModel):
    code: str


class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None


class RoleOut(RoleBase):
    id: int

    class Config:
        from_attributes = True


class EventUserCreated(BaseModel):
    user_id: int
    email: str
    timestamp: datetime


class EventUserLogin(BaseModel):
    user_id: int
    email: str
    timestamp: datetime
    ip_address: Optional[str] = None
