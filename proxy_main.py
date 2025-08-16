import os

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

# Get the target URL from environment variable
TARGET_URL = os.getenv("TARGET_URL", "https://api.openai.com")
API_KEY = os.getenv("API_KEY", "")


@app.get("/")
async def root():
    return {"message": "Proxy service is running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    url = f"{TARGET_URL}/{path}"

    headers = dict(request.headers)
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        try:
            response = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=await request.body(),
                params=request.query_params,
            )

            # Return the response with proper status code
            if response.headers.get("content-type", "").startswith("application/json"):
                return response.json()
            else:
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
