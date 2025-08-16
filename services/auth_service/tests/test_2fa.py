import pyotp
import pytest
from app.core.security import get_password_hash
from app.database import get_db
from app.main import app
from app.models import User
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_2fa_enable(client: TestClient, clean_db: Session):
    # Create test user without 2FA
    user = User(
        email="2fa_enable_test@example.com",
        password=get_password_hash("testpassword"),
        totp_secret=None,
        is_active=True,
    )
    clean_db.add(user)
    clean_db.commit()

    login_response = client.post(
        "/api/v1/auth/login", data={"username": user.email, "password": "testpassword"}
    )
    assert login_response.status_code == 200
    access_token = login_response.json().get("access_token")

    # Enable 2FA
    enable_response = client.post(
        "/api/v1/auth/2fa/enable", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert enable_response.status_code == 200
    assert "provisioning_uri" in enable_response.json()


def test_2fa_verification(client: TestClient, clean_db: Session):
    # Create test user with 2FA enabled
    totp_secret = pyotp.random_base32()
    user = User(
        email="2fa_verify_test@example.com",
        password=get_password_hash("testpassword"),
        totp_secret=totp_secret,
        is_active=True,
    )
    clean_db.add(user)
    clean_db.commit()

    # Generate valid TOTP code for login
    totp = pyotp.TOTP(totp_secret)
    code = totp.now()

    # Login with 2FA code
    login_response = client.post(
        "/api/v1/auth/login",
        data={
            "username": user.email,
            "password": "testpassword",
            "scope": f"totp_code:{code}",
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.json().get("access_token")
    assert access_token is not None

    # Test the 2FA verify endpoint separately
    verify_response = client.post(
        "/api/v1/auth/2fa/verify",
        json={"code": code},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert verify_response.status_code == 200
    assert "access_token" in verify_response.json()
