import pytest
from app import crud, schemas
from app.models import Plan
from fastapi import status
from sqlalchemy.orm import Session


def test_create_plan(session: Session):
    plan_data = schemas.PlanCreate(
        name="Premium",
        description="Premium plan",
        price=9.99,
        duration_days=30,
        features='{"feature1": true, "feature2": false}',
    )
    plan = crud.create_plan(session, plan=plan_data)
    assert plan.id is not None
    assert plan.name == "Premium"
    assert plan.price == 9.99
    assert plan.features == '{"feature1": true, "feature2": false}'


def test_get_plan(session: Session):
    plan_data = schemas.PlanCreate(
        name="Basic",
        description="Basic plan",
        price=4.99,
        duration_days=30,
        features="{}",
    )
    plan = crud.create_plan(session, plan=plan_data)
    stored_plan = crud.get_plan(session, plan_id=plan.id)
    assert stored_plan.id == plan.id
    assert stored_plan.name == "Basic"


def test_get_plans(session: Session):
    plan1 = schemas.PlanCreate(name="Plan1", price=1.99, duration_days=7, features="{}")
    plan2 = schemas.PlanCreate(
        name="Plan2", price=2.99, duration_days=14, features="{}"
    )
    crud.create_plan(session, plan=plan1)
    crud.create_plan(session, plan=plan2)

    plans = crud.get_plans(session)
    assert len(plans) == 2
    assert {p.name for p in plans} == {"Plan1", "Plan2"}


def test_plan_api(client):
    response = client.post(
        "/plans/",
        json={
            "name": "Test",
            "price": 5.99,
            "duration_days": 30,
            "features": "{}",  # Must be JSON string, not dict
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == "Test"

    response = client.get(f"/plans/{data['id']}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == data["id"]
