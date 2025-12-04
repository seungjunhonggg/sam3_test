"""Segmentation router for SAM3 operations."""
import io
import base64
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image as PILImage

from app.database import get_db, Image
from services.sam3_service import sam3_service

router = APIRouter()


class PointPrompt(BaseModel):
    """Point prompt for segmentation."""
    x: int
    y: int
    label: int = 1  # 1 for foreground, 0 for background


class BoxPrompt(BaseModel):
    """Box prompt for segmentation."""
    x1: int
    y1: int
    x2: int
    y2: int


class TextPromptRequest(BaseModel):
    """Text prompt request for segmentation."""
    image_id: Optional[int] = None
    prompt: str


class PointPromptRequest(BaseModel):
    """Point prompt request for segmentation."""
    image_id: Optional[int] = None
    points: List[PointPrompt]


class BoxPromptRequest(BaseModel):
    """Box prompt request for segmentation."""
    image_id: Optional[int] = None
    box: BoxPrompt


class AutoSegmentRequest(BaseModel):
    """Auto segmentation request."""
    image_id: int


class SegmentationResult(BaseModel):
    """Segmentation result."""
    id: int
    polygon: List[List[float]]
    bbox: List[float]
    score: float
    area: int
    rle: Optional[str] = None


class SegmentationResponse(BaseModel):
    """Segmentation response."""
    masks: List[SegmentationResult]
    count: int
    mode: Optional[str] = None


@router.post("/set-image/{image_id}")
async def set_image(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Set the current image for segmentation from database."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Load image
    try:
        pil_image = PILImage.open(image.file_path)
        response = sam3_service.set_image(pil_image)
        return {
            "status": "success",
            "image_id": image_id,
            "image_size": [image.width, image.height],
            **response
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/set-image-upload")
async def set_image_upload(
    file: UploadFile = File(...)
):
    """Set the current image for segmentation from upload."""
    try:
        content = await file.read()
        pil_image = PILImage.open(io.BytesIO(content))
        response = sam3_service.set_image(pil_image)
        return {
            "status": "success",
            "image_size": list(pil_image.size),
            **response
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/text", response_model=SegmentationResponse)
async def segment_with_text(
    request: TextPromptRequest,
    db: AsyncSession = Depends(get_db)
):
    """Segment using text prompt (SAM3's open-vocabulary feature)."""
    # If image_id is provided, set the image first
    if request.image_id:
        result = await db.execute(
            select(Image).where(Image.id == request.image_id)
        )
        image = result.scalar_one_or_none()

        if not image:
            raise HTTPException(status_code=404, detail="Image not found")

        pil_image = PILImage.open(image.file_path)
        sam3_service.set_image(pil_image)

    # Run segmentation
    try:
        result = sam3_service.segment_with_text(request.prompt)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        masks = [
            SegmentationResult(
                id=m["id"],
                polygon=m["polygon"],
                bbox=m["bbox"],
                score=m["score"],
                area=m["area"],
                rle=m.get("rle")
            )
            for m in result["masks"]
        ]

        return SegmentationResponse(
            masks=masks,
            count=result["count"],
            mode=result.get("mode")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/points", response_model=SegmentationResponse)
async def segment_with_points(
    request: PointPromptRequest,
    db: AsyncSession = Depends(get_db)
):
    """Segment using point prompts."""
    # If image_id is provided, set the image first
    if request.image_id:
        result = await db.execute(
            select(Image).where(Image.id == request.image_id)
        )
        image = result.scalar_one_or_none()

        if not image:
            raise HTTPException(status_code=404, detail="Image not found")

        pil_image = PILImage.open(image.file_path)
        sam3_service.set_image(pil_image)

    # Convert points
    points = [(p.x, p.y) for p in request.points]
    labels = [p.label for p in request.points]

    # Run segmentation
    try:
        result = sam3_service.segment_with_points(points, labels)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        masks = [
            SegmentationResult(
                id=m["id"],
                polygon=m["polygon"],
                bbox=m["bbox"],
                score=m["score"],
                area=m["area"],
                rle=m.get("rle")
            )
            for m in result["masks"]
        ]

        return SegmentationResponse(
            masks=masks,
            count=result["count"],
            mode=result.get("mode")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/box", response_model=SegmentationResponse)
async def segment_with_box(
    request: BoxPromptRequest,
    db: AsyncSession = Depends(get_db)
):
    """Segment using bounding box prompt."""
    # If image_id is provided, set the image first
    if request.image_id:
        result = await db.execute(
            select(Image).where(Image.id == request.image_id)
        )
        image = result.scalar_one_or_none()

        if not image:
            raise HTTPException(status_code=404, detail="Image not found")

        pil_image = PILImage.open(image.file_path)
        sam3_service.set_image(pil_image)

    # Run segmentation
    try:
        box = (request.box.x1, request.box.y1, request.box.x2, request.box.y2)
        result = sam3_service.segment_with_box(box)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        masks = [
            SegmentationResult(
                id=m["id"],
                polygon=m["polygon"],
                bbox=m["bbox"],
                score=m["score"],
                area=m["area"],
                rle=m.get("rle")
            )
            for m in result["masks"]
        ]

        return SegmentationResponse(
            masks=masks,
            count=result["count"],
            mode=result.get("mode")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto", response_model=SegmentationResponse)
async def segment_auto(
    request: AutoSegmentRequest,
    db: AsyncSession = Depends(get_db)
):
    """Automatic segmentation of all objects in image."""
    result = await db.execute(
        select(Image).where(Image.id == request.image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    pil_image = PILImage.open(image.file_path)
    sam3_service.set_image(pil_image)

    try:
        result = sam3_service.segment_auto()

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        masks = [
            SegmentationResult(
                id=m["id"],
                polygon=m["polygon"],
                bbox=m["bbox"],
                score=m["score"],
                area=m["area"],
                rle=m.get("rle")
            )
            for m in result["masks"]
        ]

        return SegmentationResponse(
            masks=masks,
            count=result["count"],
            mode=result.get("mode")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_segmentation_status():
    """Get SAM3 model status."""
    return {
        "loaded": sam3_service.is_loaded,
        "has_image": sam3_service._current_image is not None
    }


@router.post("/load-model")
async def load_model(
    checkpoint: Optional[str] = None
):
    """Load or reload the SAM3 model."""
    try:
        success = sam3_service.load_model(checkpoint)
        return {
            "success": success,
            "loaded": sam3_service.is_loaded
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
