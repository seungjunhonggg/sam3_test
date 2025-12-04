"""Image management router."""
import uuid
import shutil
from typing import List, Optional
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image as PILImage

from app.config import settings
from app.database import get_db, Project, Image, Annotation

router = APIRouter()


class ImageResponse(BaseModel):
    """Image response model."""
    id: int
    project_id: int
    filename: str
    original_filename: str
    width: int
    height: int
    file_size: int
    status: str
    annotation_count: int = 0
    url: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ImageUpdate(BaseModel):
    """Image update request."""
    status: Optional[str] = None


@router.post("/upload/{project_id}", response_model=List[ImageResponse])
async def upload_images(
    project_id: int,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload multiple images to a project."""
    # Verify project exists
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create project upload directory
    project_dir = settings.UPLOAD_DIR / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)

    uploaded_images = []

    for file in files:
        # Validate file type
        if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
            continue

        # Generate unique filename
        file_ext = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = project_dir / unique_filename

        # Save file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Get image dimensions
        try:
            with PILImage.open(file_path) as img:
                width, height = img.size
        except Exception:
            file_path.unlink()
            continue

        # Create database record
        db_image = Image(
            project_id=project_id,
            filename=unique_filename,
            original_filename=file.filename,
            file_path=str(file_path),
            width=width,
            height=height,
            file_size=len(content),
            mime_type=file.content_type,
            status="pending"
        )
        db.add(db_image)
        await db.flush()

        uploaded_images.append(ImageResponse(
            id=db_image.id,
            project_id=db_image.project_id,
            filename=db_image.filename,
            original_filename=db_image.original_filename,
            width=db_image.width,
            height=db_image.height,
            file_size=db_image.file_size,
            status=db_image.status,
            url=f"/uploads/{project_id}/{unique_filename}",
            created_at=db_image.created_at,
            updated_at=db_image.updated_at
        ))

    await db.commit()
    return uploaded_images


@router.get("/project/{project_id}", response_model=List[ImageResponse])
async def list_project_images(
    project_id: int,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all images in a project."""
    query = select(Image).where(Image.project_id == project_id)

    if status:
        query = query.where(Image.status == status)

    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    images = result.scalars().all()

    responses = []
    for image in images:
        # Get annotation count
        ann_result = await db.execute(
            select(Annotation).where(Annotation.image_id == image.id)
        )
        ann_count = len(ann_result.scalars().all())

        responses.append(ImageResponse(
            id=image.id,
            project_id=image.project_id,
            filename=image.filename,
            original_filename=image.original_filename,
            width=image.width,
            height=image.height,
            file_size=image.file_size,
            status=image.status,
            annotation_count=ann_count,
            url=f"/uploads/{image.project_id}/{image.filename}",
            created_at=image.created_at,
            updated_at=image.updated_at
        ))

    return responses


@router.get("/{image_id}", response_model=ImageResponse)
async def get_image(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get an image by ID."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Get annotation count
    ann_result = await db.execute(
        select(Annotation).where(Annotation.image_id == image.id)
    )
    ann_count = len(ann_result.scalars().all())

    return ImageResponse(
        id=image.id,
        project_id=image.project_id,
        filename=image.filename,
        original_filename=image.original_filename,
        width=image.width,
        height=image.height,
        file_size=image.file_size,
        status=image.status,
        annotation_count=ann_count,
        url=f"/uploads/{image.project_id}/{image.filename}",
        created_at=image.created_at,
        updated_at=image.updated_at
    )


@router.get("/{image_id}/file")
async def get_image_file(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get the actual image file."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = Path(image.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(
        path=str(file_path),
        media_type=image.mime_type,
        filename=image.original_filename
    )


@router.put("/{image_id}", response_model=ImageResponse)
async def update_image(
    image_id: int,
    image_update: ImageUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an image."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    if image_update.status is not None:
        image.status = image_update.status

    image.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(image)

    return ImageResponse(
        id=image.id,
        project_id=image.project_id,
        filename=image.filename,
        original_filename=image.original_filename,
        width=image.width,
        height=image.height,
        file_size=image.file_size,
        status=image.status,
        url=f"/uploads/{image.project_id}/{image.filename}",
        created_at=image.created_at,
        updated_at=image.updated_at
    )


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete an image and its annotations."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete file
    file_path = Path(image.file_path)
    if file_path.exists():
        file_path.unlink()

    await db.delete(image)
    await db.commit()


@router.get("/{image_id}/navigate")
async def navigate_images(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get previous and next images for navigation."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Get previous image
    prev_result = await db.execute(
        select(Image)
        .where(Image.project_id == image.project_id)
        .where(Image.id < image_id)
        .order_by(Image.id.desc())
        .limit(1)
    )
    prev_image = prev_result.scalar_one_or_none()

    # Get next image
    next_result = await db.execute(
        select(Image)
        .where(Image.project_id == image.project_id)
        .where(Image.id > image_id)
        .order_by(Image.id.asc())
        .limit(1)
    )
    next_image = next_result.scalar_one_or_none()

    return {
        "current_id": image_id,
        "previous_id": prev_image.id if prev_image else None,
        "next_id": next_image.id if next_image else None
    }
