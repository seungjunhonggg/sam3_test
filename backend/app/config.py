"""Configuration settings for the SAM3 Labeling Tool."""
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings."""

    # App settings
    APP_NAME: str = "SAM3 Labeling Tool"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Paths
    BASE_DIR: Path = Path(__file__).parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    UPLOAD_DIR: Path = DATA_DIR / "uploads"
    PROJECTS_DIR: Path = DATA_DIR / "projects"
    MODELS_DIR: Path = BASE_DIR / "models"
    CHECKPOINTS_DIR: Path = MODELS_DIR / "checkpoints"
    FINETUNED_DIR: Path = MODELS_DIR / "finetuned"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/labeling_tool.db"

    # SAM3 Model settings
    SAM3_MODEL_TYPE: str = "sam3"
    SAM3_CHECKPOINT: Optional[str] = None
    SAM3_LOCAL_PATH: Optional[str] = None  # Local path to SAM3 model (e.g., "/path/to/sam3")
    DEVICE: str = "cuda"  # or "cpu"

    # HuggingFace settings (only used if SAM3_LOCAL_PATH is not set)
    HF_TOKEN: Optional[str] = None
    HF_MODEL_ID: str = "facebook/sam3"

    # CORS settings - "*" allows all origins (for development/internal use)
    # For production, specify exact origins like ["http://192.168.1.100:3000"]
    CORS_ORIGINS: list[str] = ["*"]

    # Upload settings
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_IMAGE_TYPES: list[str] = ["image/jpeg", "image/png", "image/webp", "image/bmp"]

    # Training settings
    DEFAULT_BATCH_SIZE: int = 4
    DEFAULT_LEARNING_RATE: float = 1e-5
    DEFAULT_NUM_EPOCHS: int = 10

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Create necessary directories
for dir_path in [settings.DATA_DIR, settings.UPLOAD_DIR, settings.PROJECTS_DIR,
                 settings.MODELS_DIR, settings.CHECKPOINTS_DIR, settings.FINETUNED_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)
