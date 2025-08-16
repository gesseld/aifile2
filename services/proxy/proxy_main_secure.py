import os

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "postgres"),
    "port": os.getenv("DB_PORT", "5432"),
    "user": os.getenv("DB_USER", "aifile"),
    "password": os.getenv("DB_PASSWORD", "aifile123"),
    "database": os.getenv("DB_NAME", "aifile"),
}

# Get the target URL from environment variable
TARGET_URL = os.getenv("TARGET_URL", "https://api.mistral.ai/v1")


async def get_api_key():
    """Fetch API key from PostgreSQL secrets management"""
    try:
        conn = await asyncpg.connect(**DB_CONFIG)
        result = await conn.fetchrow(
            "SELECT pgp_sym_decrypt(password::bytea, $1) as key FROM secrets_management.container_secrets "
            "WHERE service_name = 'mistral-proxy' AND username = 'api_key'",
            DB_CONFIG["password"],
        )
        await conn.close()
        return result["key"] if result else None
    except Exception as e:
        print(f"Error fetching API key: {str(e)}")
        return None


@app.get("/")
async def root():
    return {"message": "Proxy service is running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    url = f"{TARGET_URL}/{path}"
    api_key = await get_api_key()

    if not api_key:
        raise HTTPException(status_code=500, detail="Failed to retrieve API key")

    headers = dict(request.headers)
    headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        try:
            response = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=await request.body(),
                params=request.query_params,
            )

            if response.headers.get("content-type", "").startswith("application/json"):
                return response.json()
            return {"status_code": response.status_code, "content": response.text}
        except httpx.TimeoutException as e:
            raise HTTPException(status_code=408, detail=f"Request timeout: {str(e)}")
        except httpx.ConnectError as e:
            raise HTTPException(status_code=503, detail=f"Connection error: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
