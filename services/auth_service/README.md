# Authentication Service

A FastAPI-based authentication service with JWT, TOTP 2FA, and RBAC.

## Features

- User registration and login
- JWT token authentication (access + refresh tokens)
- Time-based One-Time Password (TOTP) 2FA
- Role-Based Access Control (RBAC)
- Redis event publishing
- Admin user seeding

## API Documentation

The service provides interactive API documentation at `/docs` when running.

### Authentication Flow

1. Register a new user at `/auth/register`
2. Login at `/auth/login` to get JWT tokens
3. Use access token in `Authorization: Bearer <token>` header
4. Refresh tokens at `/auth/refresh` when access token expires

### 2FA Flow

1. Enable 2FA at `/auth/2fa/enable` (returns provisioning URI)
2. Scan QR code in authenticator app
3. Verify code at `/auth/2fa/verify` to complete login

## Endpoints

| Endpoint           | Method | Description          |
| ------------------ | ------ | -------------------- |
| `/auth/register`   | POST   | Register new user    |
| `/auth/login`      | POST   | Authenticate user    |
| `/auth/refresh`    | POST   | Refresh access token |
| `/auth/2fa/enable` | POST   | Enable 2FA           |
| `/auth/2fa/verify` | POST   | Verify 2FA code      |

## Setup

1. Copy `.env.example` to `.env` and configure
2. Build and start services:

```bash
docker-compose up -d
```

## Environment Variables

- `JWT_SECRET`: Secret for JWT signing
- `REFRESH_SECRET_KEY`: Secret for refresh tokens
- `REDIS_URL`: Redis connection URL
- `POSTGRES_*`: Database connection settings
- `FIRST_ADMIN_EMAIL`: Initial admin email
- `FIRST_ADMIN_PASSWORD`: Initial admin password

## Testing

Run tests with:

```bash
pytest tests/
```
