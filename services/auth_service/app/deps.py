from app import crud, models, schemas
from app.core.config import settings
from app.core.security import verify_token
from app.database import get_db
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        email = verify_token(token, settings.SECRET_KEY)
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = crud.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
        )
    return current_user


async def verify_role(role_name: str, user: models.User = Depends(get_current_user)):
    db = next(get_db())
    user_roles = (
        db.query(models.UserRole).filter(models.UserRole.user_id == user.id).all()
    )

    role_ids = [ur.role_id for ur in user_roles]
    required_role = db.query(models.Role).filter(models.Role.name == role_name).first()

    if not required_role or required_role.id not in role_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires {role_name} role"
        )
    return user


async def get_admin_user(user: models.User = Depends(get_current_user)) -> models.User:
    return await verify_role("admin", user)


def RoleChecker(role_name: str):
    def role_checker(user: models.User = Depends(get_current_user)) -> models.User:
        return verify_role(role_name, user)

    return role_checker
