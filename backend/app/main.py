"""Backend API main module."""

from api.v1.routers import example
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create FastAPI instance
app = FastAPI(
    title="Backend API",
    description="A FastAPI backend application",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(example.router, prefix="/api/v1/example", tags=["example"])


@app.get("/")
async def root():
    """Root endpoint returning API information"""
    return {"message": "Backend API is running", "version": "1.0.0", "docs": "/docs"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "API is operational"}


@app.get("/api/v1/status")
async def api_status():
    """API status endpoint"""
    return {
        "api_version": "v1",
        "status": "active",
        "endpoints": {"docs": "/docs", "health": "/health", "root": "/"},
    }
