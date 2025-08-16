from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class PlanBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    duration_days: int
    features: str  # JSON string of feature flags
    is_active: bool = True


class PlanCreate(PlanBase):
    pass


class Plan(PlanBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class SubscriptionBase(BaseModel):
    user_id: int
    plan_id: int
    status: str = "active"


class SubscriptionCreate(SubscriptionBase):
    pass


class Subscription(SubscriptionBase):
    id: int
    start_date: datetime
    end_date: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class SubscriptionChangedEvent(BaseModel):
    user_id: int
    plan_id: int
    status: str
    action: str  # created, updated, canceled
    timestamp: datetime = datetime.utcnow()
