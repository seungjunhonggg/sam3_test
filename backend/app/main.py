"""Main FastAPI application for SAM3 Labeling Tool."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from routers import projects, images, annotations, segmentation, training, export

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting SAM3 Labeling Tool...")
    await init_db()
    logger.info("Database initialized")

    # Initialize SAM3 model (lazy loading)
    from services.sam3_service import sam3_service
    logger.info("SAM3 service ready (lazy loading enabled)")

    yield

    # Shutdown
    logger.info("Shutting down SAM3 Labeling Tool...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered image labeling tool using Meta's SAM3 model",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

# Include routers
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(images.router, prefix="/api/images", tags=["Images"])
app.include_router(annotations.router, prefix="/api/annotations", tags=["Annotations"])
app.include_router(segmentation.router, prefix="/api/segmentation", tags=["Segmentation"])
app.include_router(training.router, prefix="/api/training", tags=["Training"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    from services.sam3_service import sam3_service
    return {
        "status": "healthy",
        "sam3_loaded": sam3_service.is_loaded,
        "device": settings.DEVICE
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
