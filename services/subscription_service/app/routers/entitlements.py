from typing import Any, Dict

from app import crud, schemas
from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/entitlements", tags=["entitlements"])


@router.get(
    "/{user_id}",
    response_model=Dict[str, Any],
    summary="Get user entitlements",
    responses={
        200: {"description": "User entitlements"},
        404: {"description": "User not found"},
    },
)
async def get_entitlements(
    user_id: int, feature: str = None, db: Session = Depends(get_db)
):
    """Get all feature entitlements for a user or check specific feature access."""
    # Get user's active subscription first, then any subscription if none active
    subscription = crud.get_active_user_subscription(db, user_id=user_id)
    if not subscription:
        # Check for any subscription (including canceled ones)
        subscriptions = crud.get_user_subscriptions(db, user_id=user_id)
        if not subscriptions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="No subscription found"
            )
        subscription = subscriptions[0]  # Get most recent subscription

    # Get plan features
    plan = crud.get_plan(db, plan_id=subscription.plan_id)
    import json

    features = json.loads(plan.features) if plan.features else {}

    # Check if subscription is active
    has_active_access = subscription.status == "active"

    # If checking specific feature
    if feature:
        return {
            "has_access": features.get(feature, False) and has_active_access,
            "feature": feature,
            "plan_id": plan.id,
            "plan_name": plan.name,
        }

    # Return all features
    return {
        "features": {k: (v and has_active_access) for k, v in features.items()},
        "plan_id": plan.id,
        "plan_name": plan.name,
        "subscription_status": subscription.status,
        "valid_until": subscription.end_date,
    }
