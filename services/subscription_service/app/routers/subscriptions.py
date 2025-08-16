from datetime import datetime, timedelta

from app import crud, models, schemas
from app.core.redis import redis_client
from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.post(
    "/",
    response_model=schemas.Subscription,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new subscription",
    responses={
        201: {"description": "Subscription created"},
        400: {"description": "User already has active subscription"},
        404: {"description": "Plan not found"},
    },
)
async def create_subscription(
    subscription: schemas.SubscriptionCreate, db: Session = Depends(get_db)
):
    # Check if plan exists
    db_plan = crud.get_plan(db, plan_id=subscription.plan_id)
    if not db_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )

    # Check for existing active subscription
    active_sub = crud.get_active_user_subscription(db, user_id=subscription.user_id)
    if active_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already has active subscription",
        )

    # Calculate end date based on plan duration
    end_date = datetime.utcnow() + timedelta(days=db_plan.duration_days)
    new_sub = crud.create_subscription(db, subscription=subscription, end_date=end_date)

    # Publish subscription created event
    await redis_client.publish_event(
        "subscription.changed",
        {
            "user_id": subscription.user_id,
            "plan_id": subscription.plan_id,
            "status": "active",
            "action": "created",
        },
    )

    return new_sub


@router.get(
    "/user/{user_id}",
    response_model=list[schemas.Subscription],
    summary="Get user's subscriptions",
)
async def read_user_subscriptions(
    user_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    return crud.get_user_subscriptions(db, user_id=user_id, skip=skip, limit=limit)


@router.patch(
    "/{subscription_id}/cancel",
    response_model=schemas.Subscription,
    summary="Cancel a subscription",
    responses={
        200: {"description": "Subscription canceled"},
        404: {"description": "Subscription not found"},
        400: {"description": "Subscription already canceled"},
    },
)
async def cancel_subscription(subscription_id: int, db: Session = Depends(get_db)):
    db_sub = crud.get_subscription(db, subscription_id=subscription_id)
    if not db_sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found"
        )
    if db_sub.status == "canceled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription already canceled",
        )

    updated_sub = crud.update_subscription_status(
        db, subscription_id=subscription_id, status="canceled"
    )

    # Publish subscription canceled event
    await redis_client.publish_event(
        "subscription.changed",
        {
            "user_id": updated_sub.user_id,
            "plan_id": updated_sub.plan_id,
            "status": "canceled",
            "action": "updated",
        },
    )

    return updated_sub
