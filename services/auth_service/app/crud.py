from datetime import datetime, timedelta

from app import models, schemas
from app.core.security import get_password_hash
from sqlalchemy.orm import Session


def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()


def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(email=user.email, password=hashed_password, is_active=True)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user_totp_secret(db: Session, user_id: int, totp_secret: str):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    db_user.totp_secret = totp_secret
    db.commit()
    db.refresh(db_user)
    return db_user


def create_session(db: Session, user_id: int, refresh_token: str, expires_at: datetime):
    db_session = models.Session(
        user_id=user_id,
        refresh_token=refresh_token,
        expires_at=expires_at,
        is_active=True,
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


def get_session(db: Session, refresh_token: str):
    return (
        db.query(models.Session)
        .filter(
            models.Session.refresh_token == refresh_token,
            models.Session.is_active == True,
            models.Session.expires_at > datetime.utcnow(),
        )
        .first()
    )


def revoke_session(db: Session, refresh_token: str):
    db_session = get_session(db, refresh_token)
    if db_session:
        db_session.is_active = False
        db.commit()
        return True
    return False


def revoke_all_sessions(db: Session, user_id: int):
    db.query(models.Session).filter(
        models.Session.user_id == user_id, models.Session.is_active == True
    ).update({"is_active": False})
    db.commit()
    return True


def get_role_by_name(db: Session, name: str):
    return db.query(models.Role).filter(models.Role.name == name).first()


def assign_role_to_user(db: Session, user_id: int, role_id: int):
    db_user_role = models.UserRole(user_id=user_id, role_id=role_id)
    db.add(db_user_role)
    db.commit()
    db.refresh(db_user_role)
    return db_user_role
