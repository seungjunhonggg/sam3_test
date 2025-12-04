"""Annotation management router."""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, Image, Annotation

router = APIRouter()


class AnnotationCreate(BaseModel):
    """Annotation creation request."""
    image_id: int
    class_name: str
    class_id: int
    annotation_type: str  # polygon, bbox, mask, point
    polygon: Optional[List[List[float]]] = None
    bbox: Optional[List[float]] = None  # [x, y, width, height]
    mask_rle: Optional[str] = None
    points: Optional[List[List[float]]] = None
    area: Optional[float] = None
    confidence: Optional[float] = None
    is_auto_generated: bool = False


class AnnotationUpdate(BaseModel):
    """Annotation update request."""
    class_name: Optional[str] = None
    class_id: Optional[int] = None
    polygon: Optional[List[List[float]]] = None
    bbox: Optional[List[float]] = None
    mask_rle: Optional[str] = None
    points: Optional[List[List[float]]] = None


class AnnotationResponse(BaseModel):
    """Annotation response model."""
    id: int
    image_id: int
    class_name: str
    class_id: int
    annotation_type: str
    polygon: Optional[List[List[float]]]
    bbox: Optional[List[float]]
    mask_rle: Optional[str]
    points: Optional[List[List[float]]]
    area: Optional[float]
    confidence: Optional[float]
    is_auto_generated: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BulkAnnotationCreate(BaseModel):
    """Bulk annotation creation request."""
    image_id: int
    annotations: List[AnnotationCreate]


@router.post("/", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    annotation: AnnotationCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new annotation."""
    # Verify image exists
    result = await db.execute(
        select(Image).where(Image.id == annotation.image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    db_annotation = Annotation(
        image_id=annotation.image_id,
        class_name=annotation.class_name,
        class_id=annotation.class_id,
        annotation_type=annotation.annotation_type,
        polygon=annotation.polygon,
        bbox=annotation.bbox,
        mask_rle=annotation.mask_rle,
        points=annotation.points,
        area=annotation.area,
        confidence=annotation.confidence,
        is_auto_generated=annotation.is_auto_generated
    )
    db.add(db_annotation)

    # Update image status
    image.status = "annotated"
    image.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(db_annotation)

    return AnnotationResponse(
        id=db_annotation.id,
        image_id=db_annotation.image_id,
        class_name=db_annotation.class_name,
        class_id=db_annotation.class_id,
        annotation_type=db_annotation.annotation_type,
        polygon=db_annotation.polygon,
        bbox=db_annotation.bbox,
        mask_rle=db_annotation.mask_rle,
        points=db_annotation.points,
        area=db_annotation.area,
        confidence=db_annotation.confidence,
        is_auto_generated=db_annotation.is_auto_generated,
        created_at=db_annotation.created_at,
        updated_at=db_annotation.updated_at
    )


@router.post("/bulk", response_model=List[AnnotationResponse])
async def create_bulk_annotations(
    bulk_request: BulkAnnotationCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create multiple annotations at once."""
    # Verify image exists
    result = await db.execute(
        select(Image).where(Image.id == bulk_request.image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    created_annotations = []

    for annotation in bulk_request.annotations:
        db_annotation = Annotation(
            image_id=bulk_request.image_id,
            class_name=annotation.class_name,
            class_id=annotation.class_id,
            annotation_type=annotation.annotation_type,
            polygon=annotation.polygon,
            bbox=annotation.bbox,
            mask_rle=annotation.mask_rle,
            points=annotation.points,
            area=annotation.area,
            confidence=annotation.confidence,
            is_auto_generated=annotation.is_auto_generated
        )
        db.add(db_annotation)
        await db.flush()

        created_annotations.append(AnnotationResponse(
            id=db_annotation.id,
            image_id=db_annotation.image_id,
            class_name=db_annotation.class_name,
            class_id=db_annotation.class_id,
            annotation_type=db_annotation.annotation_type,
            polygon=db_annotation.polygon,
            bbox=db_annotation.bbox,
            mask_rle=db_annotation.mask_rle,
            points=db_annotation.points,
            area=db_annotation.area,
            confidence=db_annotation.confidence,
            is_auto_generated=db_annotation.is_auto_generated,
            created_at=db_annotation.created_at,
            updated_at=db_annotation.updated_at
        ))

    # Update image status
    image.status = "annotated"
    image.updated_at = datetime.utcnow()

    await db.commit()
    return created_annotations


@router.get("/image/{image_id}", response_model=List[AnnotationResponse])
async def list_image_annotations(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List all annotations for an image."""
    result = await db.execute(
        select(Annotation).where(Annotation.image_id == image_id)
    )
    annotations = result.scalars().all()

    return [
        AnnotationResponse(
            id=ann.id,
            image_id=ann.image_id,
            class_name=ann.class_name,
            class_id=ann.class_id,
            annotation_type=ann.annotation_type,
            polygon=ann.polygon,
            bbox=ann.bbox,
            mask_rle=ann.mask_rle,
            points=ann.points,
            area=ann.area,
            confidence=ann.confidence,
            is_auto_generated=ann.is_auto_generated,
            created_at=ann.created_at,
            updated_at=ann.updated_at
        )
        for ann in annotations
    ]


@router.get("/{annotation_id}", response_model=AnnotationResponse)
async def get_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get an annotation by ID."""
    result = await db.execute(
        select(Annotation).where(Annotation.id == annotation_id)
    )
    annotation = result.scalar_one_or_none()

    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    return AnnotationResponse(
        id=annotation.id,
        image_id=annotation.image_id,
        class_name=annotation.class_name,
        class_id=annotation.class_id,
        annotation_type=annotation.annotation_type,
        polygon=annotation.polygon,
        bbox=annotation.bbox,
        mask_rle=annotation.mask_rle,
        points=annotation.points,
        area=annotation.area,
        confidence=annotation.confidence,
        is_auto_generated=annotation.is_auto_generated,
        created_at=annotation.created_at,
        updated_at=annotation.updated_at
    )


@router.put("/{annotation_id}", response_model=AnnotationResponse)
async def update_annotation(
    annotation_id: int,
    annotation_update: AnnotationUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an annotation."""
    result = await db.execute(
        select(Annotation).where(Annotation.id == annotation_id)
    )
    annotation = result.scalar_one_or_none()

    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    if annotation_update.class_name is not None:
        annotation.class_name = annotation_update.class_name
    if annotation_update.class_id is not None:
        annotation.class_id = annotation_update.class_id
    if annotation_update.polygon is not None:
        annotation.polygon = annotation_update.polygon
    if annotation_update.bbox is not None:
        annotation.bbox = annotation_update.bbox
    if annotation_update.mask_rle is not None:
        annotation.mask_rle = annotation_update.mask_rle
    if annotation_update.points is not None:
        annotation.points = annotation_update.points

    annotation.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(annotation)

    return AnnotationResponse(
        id=annotation.id,
        image_id=annotation.image_id,
        class_name=annotation.class_name,
        class_id=annotation.class_id,
        annotation_type=annotation.annotation_type,
        polygon=annotation.polygon,
        bbox=annotation.bbox,
        mask_rle=annotation.mask_rle,
        points=annotation.points,
        area=annotation.area,
        confidence=annotation.confidence,
        is_auto_generated=annotation.is_auto_generated,
        created_at=annotation.created_at,
        updated_at=annotation.updated_at
    )


@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete an annotation."""
    result = await db.execute(
        select(Annotation).where(Annotation.id == annotation_id)
    )
    annotation = result.scalar_one_or_none()

    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    await db.delete(annotation)
    await db.commit()


@router.delete("/image/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image_annotations(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete all annotations for an image."""
    result = await db.execute(
        select(Annotation).where(Annotation.image_id == image_id)
    )
    annotations = result.scalars().all()

    for annotation in annotations:
        await db.delete(annotation)

    # Update image status
    img_result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = img_result.scalar_one_or_none()
    if image:
        image.status = "pending"
        image.updated_at = datetime.utcnow()

    await db.commit()
