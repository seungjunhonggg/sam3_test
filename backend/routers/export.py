"""Export router for exporting annotations in various formats."""
import json
import zipfile
import io
from datetime import datetime
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, Project, Image, Annotation

router = APIRouter()


class ExportRequest(BaseModel):
    """Export request model."""
    format: str  # coco, yolo, pascal_voc, mask
    include_images: bool = False


@router.get("/formats")
async def list_export_formats():
    """List available export formats."""
    return {
        "formats": [
            {
                "id": "coco",
                "name": "COCO JSON",
                "description": "COCO format annotations (JSON)"
            },
            {
                "id": "yolo",
                "name": "YOLO",
                "description": "YOLO format with normalized coordinates"
            },
            {
                "id": "yolo_seg",
                "name": "YOLO Segmentation",
                "description": "YOLO format with segmentation polygons"
            },
            {
                "id": "pascal_voc",
                "name": "Pascal VOC",
                "description": "Pascal VOC XML format"
            },
            {
                "id": "mask",
                "name": "Mask Images",
                "description": "Binary mask images (PNG)"
            },
            {
                "id": "sam3_training",
                "name": "SAM3 Training",
                "description": "Format ready for SAM3 fine-tuning"
            }
        ]
    }


@router.post("/project/{project_id}")
async def export_project(
    project_id: int,
    export_request: ExportRequest,
    db: AsyncSession = Depends(get_db)
):
    """Export project annotations."""
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get images with annotations
    images_result = await db.execute(
        select(Image).where(Image.project_id == project_id)
    )
    images = images_result.scalars().all()

    # Create export based on format
    if export_request.format == "coco":
        return await export_coco(project, images, db, export_request.include_images)
    elif export_request.format == "yolo":
        return await export_yolo(project, images, db, export_request.include_images, segmentation=False)
    elif export_request.format == "yolo_seg":
        return await export_yolo(project, images, db, export_request.include_images, segmentation=True)
    elif export_request.format == "pascal_voc":
        return await export_pascal_voc(project, images, db, export_request.include_images)
    elif export_request.format == "mask":
        return await export_masks(project, images, db)
    elif export_request.format == "sam3_training":
        return await export_sam3_training(project, images, db, export_request.include_images)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown format: {export_request.format}")


async def export_coco(
    project: Project,
    images: List[Image],
    db: AsyncSession,
    include_images: bool
) -> StreamingResponse:
    """Export in COCO format."""
    coco = {
        "info": {
            "description": project.name,
            "date_created": datetime.utcnow().isoformat(),
            "version": "1.0"
        },
        "licenses": [],
        "images": [],
        "annotations": [],
        "categories": [
            {"id": c["id"], "name": c["name"], "supercategory": ""}
            for c in (project.classes or [])
        ]
    }

    annotation_id = 1

    for image in images:
        # Add image
        coco["images"].append({
            "id": image.id,
            "file_name": image.filename,
            "width": image.width,
            "height": image.height
        })

        # Get annotations
        ann_result = await db.execute(
            select(Annotation).where(Annotation.image_id == image.id)
        )
        annotations = ann_result.scalars().all()

        for ann in annotations:
            segmentation = []
            if ann.polygon:
                segmentation = [[coord for point in ann.polygon for coord in point]]

            coco["annotations"].append({
                "id": annotation_id,
                "image_id": image.id,
                "category_id": ann.class_id,
                "segmentation": segmentation,
                "bbox": ann.bbox or [],
                "area": ann.area or 0,
                "iscrowd": 0
            })
            annotation_id += 1

    # Create response
    if include_images:
        # Create ZIP with annotations and images
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # Add annotations
            zip_file.writestr("annotations.json", json.dumps(coco, indent=2))

            # Add images
            for image in images:
                file_path = Path(image.file_path)
                if file_path.exists():
                    zip_file.write(file_path, f"images/{image.filename}")

        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={project.name}_coco.zip"
            }
        )
    else:
        # Return just the JSON
        return StreamingResponse(
            io.BytesIO(json.dumps(coco, indent=2).encode()),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={project.name}_coco.json"
            }
        )


async def export_yolo(
    project: Project,
    images: List[Image],
    db: AsyncSession,
    include_images: bool,
    segmentation: bool = False
) -> StreamingResponse:
    """Export in YOLO format."""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Create class file
        classes = [c["name"] for c in (project.classes or [])]
        zip_file.writestr("classes.txt", "\n".join(classes))

        # Create data.yaml
        data_yaml = f"""
train: ./images/train
val: ./images/val
nc: {len(classes)}
names: {classes}
"""
        zip_file.writestr("data.yaml", data_yaml.strip())

        for image in images:
            # Get annotations
            ann_result = await db.execute(
                select(Annotation).where(Annotation.image_id == image.id)
            )
            annotations = ann_result.scalars().all()

            lines = []
            for ann in annotations:
                if segmentation and ann.polygon:
                    # YOLO segmentation format: class_id x1 y1 x2 y2 ...
                    normalized_points = []
                    for point in ann.polygon:
                        normalized_points.append(point[0] / image.width)
                        normalized_points.append(point[1] / image.height)
                    coords_str = " ".join([f"{p:.6f}" for p in normalized_points])
                    lines.append(f"{ann.class_id} {coords_str}")
                elif ann.bbox:
                    # YOLO bbox format: class_id x_center y_center width height
                    x, y, w, h = ann.bbox
                    x_center = (x + w / 2) / image.width
                    y_center = (y + h / 2) / image.height
                    w_norm = w / image.width
                    h_norm = h / image.height
                    lines.append(f"{ann.class_id} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}")

            # Write label file
            label_filename = Path(image.filename).stem + ".txt"
            zip_file.writestr(f"labels/{label_filename}", "\n".join(lines))

            # Add image if requested
            if include_images:
                file_path = Path(image.file_path)
                if file_path.exists():
                    zip_file.write(file_path, f"images/{image.filename}")

    zip_buffer.seek(0)
    format_name = "yolo_seg" if segmentation else "yolo"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={project.name}_{format_name}.zip"
        }
    )


async def export_pascal_voc(
    project: Project,
    images: List[Image],
    db: AsyncSession,
    include_images: bool
) -> StreamingResponse:
    """Export in Pascal VOC XML format."""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for image in images:
            # Get annotations
            ann_result = await db.execute(
                select(Annotation).where(Annotation.image_id == image.id)
            )
            annotations = ann_result.scalars().all()

            # Create XML
            xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<annotation>
    <folder>images</folder>
    <filename>{image.filename}</filename>
    <size>
        <width>{image.width}</width>
        <height>{image.height}</height>
        <depth>3</depth>
    </size>
"""
            for ann in annotations:
                if ann.bbox:
                    x, y, w, h = ann.bbox
                    xml += f"""    <object>
        <name>{ann.class_name}</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>{int(x)}</xmin>
            <ymin>{int(y)}</ymin>
            <xmax>{int(x + w)}</xmax>
            <ymax>{int(y + h)}</ymax>
        </bndbox>
    </object>
"""
            xml += "</annotation>"

            # Write XML file
            xml_filename = Path(image.filename).stem + ".xml"
            zip_file.writestr(f"annotations/{xml_filename}", xml)

            # Add image if requested
            if include_images:
                file_path = Path(image.file_path)
                if file_path.exists():
                    zip_file.write(file_path, f"images/{image.filename}")

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={project.name}_voc.zip"
        }
    )


async def export_masks(
    project: Project,
    images: List[Image],
    db: AsyncSession
) -> StreamingResponse:
    """Export binary mask images."""
    import numpy as np
    from PIL import Image as PILImage
    import cv2

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for image in images:
            # Get annotations
            ann_result = await db.execute(
                select(Annotation).where(Annotation.image_id == image.id)
            )
            annotations = ann_result.scalars().all()

            # Create masks for each class
            class_masks = {}

            for ann in annotations:
                if ann.polygon:
                    if ann.class_id not in class_masks:
                        class_masks[ann.class_id] = np.zeros(
                            (image.height, image.width), dtype=np.uint8
                        )

                    # Draw polygon
                    points = np.array(ann.polygon, dtype=np.int32)
                    cv2.fillPoly(class_masks[ann.class_id], [points], 255)

            # Save masks
            for class_id, mask in class_masks.items():
                class_name = next(
                    (c["name"] for c in (project.classes or []) if c["id"] == class_id),
                    f"class_{class_id}"
                )
                mask_filename = f"{Path(image.filename).stem}_{class_name}.png"

                # Convert to PNG bytes
                mask_image = PILImage.fromarray(mask)
                mask_buffer = io.BytesIO()
                mask_image.save(mask_buffer, format="PNG")
                mask_buffer.seek(0)

                zip_file.writestr(f"masks/{mask_filename}", mask_buffer.read())

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={project.name}_masks.zip"
        }
    )


async def export_sam3_training(
    project: Project,
    images: List[Image],
    db: AsyncSession,
    include_images: bool
) -> StreamingResponse:
    """Export in format ready for SAM3 fine-tuning."""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Create training manifest
        manifest = {
            "project_name": project.name,
            "annotation_type": project.annotation_type,
            "classes": project.classes or [],
            "samples": []
        }

        for image in images:
            # Get annotations
            ann_result = await db.execute(
                select(Annotation).where(Annotation.image_id == image.id)
            )
            annotations = ann_result.scalars().all()

            sample = {
                "image_id": image.id,
                "file_name": image.filename,
                "width": image.width,
                "height": image.height,
                "annotations": []
            }

            for ann in annotations:
                sample["annotations"].append({
                    "class_id": ann.class_id,
                    "class_name": ann.class_name,
                    "polygon": ann.polygon,
                    "bbox": ann.bbox,
                    "area": ann.area
                })

            manifest["samples"].append(sample)

            # Add image if requested
            if include_images:
                file_path = Path(image.file_path)
                if file_path.exists():
                    zip_file.write(file_path, f"images/{image.filename}")

        # Write manifest
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))

        # Create training script
        training_script = """#!/usr/bin/env python
# SAM3 Fine-tuning Script
# Generated by SAM3 Labeling Tool

import json
from pathlib import Path

# Load manifest
with open("manifest.json") as f:
    manifest = json.load(f)

print(f"Project: {manifest['project_name']}")
print(f"Classes: {len(manifest['classes'])}")
print(f"Samples: {len(manifest['samples'])}")

# TODO: Add SAM3 fine-tuning code here
# from sam3.training.trainer import Sam3Trainer
# trainer = Sam3Trainer(...)
# trainer.train(...)
"""
        zip_file.writestr("train.py", training_script)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={project.name}_sam3_training.zip"
        }
    )
