import pytest
from app import crud, schemas
from app.models import Plan, Subscription
from fastapi import status
from sqlalchemy.orm import Session


@pytest.fixture
def feature_plan(session: Session):
    plan = schemas.PlanCreate(
        name="Feature Plan",
        price=9.99,
        duration_days=30,
        features='{"premium_feature": true, "basic_feature": true}',
    )
    return crud.create_plan(session, plan=plan)


@pytest.fixture
def no_feature_plan(session: Session):
    plan = schemas.PlanCreate(
        name="No Feature Plan",
        price=4.99,
        duration_days=30,
        features='{"premium_feature": false, "basic_feature": true}',
    )
    return crud.create_plan(session, plan=plan)


def test_entitlements_check(session: Session, feature_plan: Plan):
    # Create active subscription
    crud.create_subscription(
        session,
        subscription=schemas.SubscriptionCreate(user_id=1, plan_id=feature_plan.id),
        end_date=None,  # No expiration
    )

    # Check feature access
    entitlements = crud.get_user_entitlements(session, user_id=1)
    assert entitlements["premium_feature"] is True
    assert entitlements["basic_feature"] is True


def test_entitlements_api(client, session, feature_plan: Plan, no_feature_plan: Plan):
    from app.database import get_db

    # Create subscription with features
    sub = crud.create_subscription(
        session,
        subscription=schemas.SubscriptionCreate(user_id=1, plan_id=feature_plan.id),
        end_date=None,
    )

    # Test specific feature check
    response = client.get("/entitlements/1?feature=premium_feature")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["has_access"] is True

    # Test all features
    response = client.get("/entitlements/1")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["features"]["premium_feature"] is True

    # Test no access
    crud.update_subscription_status(session, subscription_id=sub.id, status="canceled")
    response = client.get("/entitlements/1?feature=premium_feature")
    assert response.json()["has_access"] is False
