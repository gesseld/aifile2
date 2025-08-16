import json
from typing import List, Optional

from app import models, schemas
from sqlalchemy.orm import Session


def get_plan(db: Session, plan_id: int) -> Optional[models.Plan]:
    return db.query(models.Plan).filter(models.Plan.id == plan_id).first()


def get_plan_by_name(db: Session, name: str) -> Optional[models.Plan]:
    return db.query(models.Plan).filter(models.Plan.name == name).first()


def get_plans(db: Session, skip: int = 0, limit: int = 100) -> List[models.Plan]:
    return db.query(models.Plan).offset(skip).limit(limit).all()


def create_plan(db: Session, plan: schemas.PlanCreate) -> models.Plan:
    db_plan = models.Plan(**plan.dict())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan


def get_subscription(
    db: Session, subscription_id: int
) -> Optional[models.Subscription]:
    return (
        db.query(models.Subscription)
        .filter(models.Subscription.id == subscription_id)
        .first()
    )


def get_user_subscriptions(
    db: Session, user_id: int, skip: int = 0, limit: int = 100
) -> List[models.Subscription]:
    return (
        db.query(models.Subscription)
        .filter(models.Subscription.user_id == user_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_active_user_subscription(
    db: Session, user_id: int
) -> Optional[models.Subscription]:
    return (
        db.query(models.Subscription)
        .filter(models.Subscription.user_id == user_id)
        .filter(models.Subscription.status == "active")
        .first()
    )


def create_subscription(
    db: Session, subscription: schemas.SubscriptionCreate, end_date
) -> models.Subscription:
    sub_data = subscription.dict()
    sub_data["end_date"] = end_date
    db_sub = models.Subscription(**sub_data)
    db.add(db_sub)
    db.commit()
    db.refresh(db_sub)
    return db_sub


def update_subscription_status(
    db: Session, subscription_id: int, status: str
) -> models.Subscription:
    db_sub = (
        db.query(models.Subscription)
        .filter(models.Subscription.id == subscription_id)
        .first()
    )
    if db_sub:
        db_sub.status = status
        db.commit()
        db.refresh(db_sub)
    return db_sub


def get_user_entitlements(db: Session, user_id: int) -> dict:
    """Get user's feature entitlements based on active subscription"""
    active_sub = get_active_user_subscription(db, user_id)
    if not active_sub or active_sub.status != "active":
        return {}

    plan = get_plan(db, active_sub.plan_id)
    if not plan:
        return {}

    # Parse JSON features string
    try:
        return json.loads(plan.features)
    except (json.JSONDecodeError, TypeError):
        return {}


def check_user_feature_access(db: Session, user_id: int, feature: str) -> bool:
    """Check if user has access to specific feature"""
    entitlements = get_user_entitlements(db, user_id)
    return entitlements.get(feature, False)
