"""Database configuration and models."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, JSON
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class Project(Base):
    """Project model for organizing labeling tasks."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    annotation_type = Column(String(50), default="instance_segmentation")  # instance_segmentation, semantic, bbox
    classes = Column(JSON, default=list)  # List of class names with colors
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    images = relationship("Image", back_populates="project", cascade="all, delete-orphan")
    training_runs = relationship("TrainingRun", back_populates="project", cascade="all, delete-orphan")


class Image(Base):
    """Image model for storing uploaded images."""
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(50), nullable=False)
    status = Column(String(50), default="pending")  # pending, annotated, reviewed, approved
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="images")
    annotations = relationship("Annotation", back_populates="image", cascade="all, delete-orphan")


class Annotation(Base):
    """Annotation model for storing segmentation masks and labels."""
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("images.id"), nullable=False)
    class_name = Column(String(255), nullable=False)
    class_id = Column(Integer, nullable=False)
    annotation_type = Column(String(50), nullable=False)  # polygon, bbox, mask, point

    # Geometry data (stored as JSON)
    polygon = Column(JSON, nullable=True)  # [[x1,y1], [x2,y2], ...]
    bbox = Column(JSON, nullable=True)  # [x, y, width, height]
    mask_rle = Column(Text, nullable=True)  # Run-length encoded mask
    points = Column(JSON, nullable=True)  # For point annotations

    # Metadata
    area = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    is_auto_generated = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    image = relationship("Image", back_populates="annotations")


class TrainingRun(Base):
    """Training run model for fine-tuning SAM3."""
    __tablename__ = "training_runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(String(50), default="pending")  # pending, running, completed, failed

    # Training parameters
    batch_size = Column(Integer, default=4)
    learning_rate = Column(Float, default=1e-5)
    num_epochs = Column(Integer, default=10)
    config = Column(JSON, default=dict)

    # Results
    checkpoint_path = Column(String(512), nullable=True)
    metrics = Column(JSON, default=dict)  # loss, accuracy, etc.
    logs = Column(Text, nullable=True)

    # Timestamps
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="training_runs")


# Database engine and session
engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
