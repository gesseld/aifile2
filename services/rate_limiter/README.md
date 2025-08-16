# Rate Limiter Service

Redis-based rate limiting service using sliding window algorithm.

## Features

- Sliding window rate limiting
- Configurable limits per action type
- Health checks with Redis connectivity
- REST API endpoint for checking limits

## API Endpoints

### `GET /api/v1/rate_limit/check`

Check if a request should be allowed based on rate limits.

**Parameters:**

- `userId`: User identifier
- `action`: Action being performed

**Responses:**

- 200: Request allowed
- 429: Rate limit exceeded

### `GET /health`

Service health check

## Configuration

Environment variables:

- `REDIS_URL`: Redis connection URL (default: redis://redis:6379)
- `DEFAULT_RATE_LIMIT`: Default requests per minute (default: 60)

## Running the Service

```bash
docker-compose up
```

The service will be available at `http://localhost:8003`
