def test_signup_login_flow(client):
    # Test signup
    signup_data = {"email": "test@example.com", "password": "password123"}
    response = client.post("/api/v1/auth/signup", json=signup_data)
    assert response.status_code == 200
    assert "access_token" in response.json()

    # Test login
    login_data = {"email": "test@example.com", "password": "password123"}
    response = client.post("/api/v1/auth/login", json=login_data)
    assert response.status_code == 200
    assert "access_token" in response.json()

    # Test protected endpoint (stub)
    token = response.json()["access_token"]
    response = client.get(
        "/api/v1/auth/devices", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 501
