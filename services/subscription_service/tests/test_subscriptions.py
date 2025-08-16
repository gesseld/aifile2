from datetime import datetime, timedelta

import pytest
from app import crud, schemas
from app.models import Plan, Subscription
from fastapi import status
from sqlalchemy.orm import Session


@pytest.fixture
def test_plan(session: Session):
    plan = schemas.PlanCreate(
        name="Test Plan", price=9.99, duration_days=30, features="{}"
    )
    return crud.create_plan(session, plan=plan)


def test_create_subscription(session: Session, test_plan: Plan):
    sub_data = schemas.SubscriptionCreate(user_id=1, plan_id=test_plan.id)
    subscription = crud.create_subscription(
        session, subscription=sub_data, end_date=datetime.utcnow() + timedelta(days=30)
    )
    assert subscription.id is not None
    assert subscription.status == "active"
    assert subscription.user_id == 1


def test_get_user_subscriptions(session: Session, test_plan: Plan):
    # Create 2 subscriptions for user 1
    crud.create_subscription(
        session,
        subscription=schemas.SubscriptionCreate(user_id=1, plan_id=test_plan.id),
        end_date=datetime.utcnow() + timedelta(days=30),
    )
    crud.create_subscription(
        session,
        subscription=schemas.SubscriptionCreate(user_id=1, plan_id=test_plan.id),
        end_date=datetime.utcnow() + timedelta(days=30),
    )

    subs = crud.get_user_subscriptions(session, user_id=1)
    assert len(subs) == 2
    assert all(sub.user_id == 1 for sub in subs)


def test_cancel_subscription(session: Session, test_plan: Plan):
    sub = crud.create_subscription(
        session,
        subscription=schemas.SubscriptionCreate(user_id=1, plan_id=test_plan.id),
        end_date=datetime.utcnow() + timedelta(days=30),
    )
    updated = crud.update_subscription_status(
        session, subscription_id=sub.id, status="canceled"
    )
    assert updated.status == "canceled"


def test_subscription_api(client, test_plan: Plan):
    # Test creation
    response = client.post(
        "/subscriptions/", json={"user_id": 1, "plan_id": test_plan.id}
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["user_id"] == 1

    # Test cancellation
    response = client.patch(f"/subscriptions/{data['id']}/cancel")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "canceled"
