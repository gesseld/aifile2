from app import crud, models, schemas
from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post(
    "/",
    response_model=schemas.Plan,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new subscription plan",
    responses={
        201: {"description": "Plan created successfully"},
        400: {"description": "Plan already exists"},
        422: {"description": "Validation error"},
    },
)
async def create_plan(plan: schemas.PlanCreate, db: Session = Depends(get_db)):
    db_plan = crud.get_plan_by_name(db, name=plan.name)
    if db_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Plan already exists"
        )
    return crud.create_plan(db, plan=plan)


@router.get(
    "/", response_model=list[schemas.Plan], summary="List all subscription plans"
)
async def read_plans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_plans(db, skip=skip, limit=limit)


@router.get(
    "/{plan_id}",
    response_model=schemas.Plan,
    summary="Get plan details",
    responses={
        200: {"description": "Plan details"},
        404: {"description": "Plan not found"},
    },
)
async def read_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = crud.get_plan(db, plan_id=plan_id)
    if not db_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )
    return db_plan
