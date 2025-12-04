"""Training router for SAM3 fine-tuning."""
import json
from typing import List, Optional
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, Project, Image, Annotation, TrainingRun
from services.training_service import training_service

router = APIRouter()


class TrainingConfig(BaseModel):
    """Training configuration."""
    batch_size: int = 4
    learning_rate: float = 1e-5
    num_epochs: int = 10
    freeze_image_encoder: bool = True
    use_lora: bool = True
    lora_rank: int = 8
    validation_split: float = 0.1


class TrainingRunCreate(BaseModel):
    """Training run creation request."""
    project_id: int
    name: str
    config: TrainingConfig = TrainingConfig()


class TrainingRunResponse(BaseModel):
    """Training run response model."""
    id: int
    project_id: int
    name: str
    status: str
    batch_size: int
    learning_rate: float
    num_epochs: int
    config: dict
    checkpoint_path: Optional[str]
    metrics: dict
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class TrainingLogsResponse(BaseModel):
    """Training logs response."""
    logs: List[str]
    status: str


@router.post("/", response_model=TrainingRunResponse, status_code=status.HTTP_201_CREATED)
async def create_training_run(
    training_create: TrainingRunCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Create and start a new training run."""
    # Verify project exists
    result = await db.execute(
        select(Project).where(Project.id == training_create.project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if there are annotated images
    images_result = await db.execute(
        select(Image)
        .where(Image.project_id == training_create.project_id)
        .where(Image.status == "annotated")
    )
    annotated_images = images_result.scalars().all()

    if len(annotated_images) < 5:
        raise HTTPException(
            status_code=400,
            detail="At least 5 annotated images are required for training"
        )

    # Create training run record
    config_dict = training_create.config.model_dump()
    db_training = TrainingRun(
        project_id=training_create.project_id,
        name=training_create.name,
        status="pending",
        batch_size=config_dict["batch_size"],
        learning_rate=config_dict["learning_rate"],
        num_epochs=config_dict["num_epochs"],
        config=config_dict
    )
    db.add(db_training)
    await db.commit()
    await db.refresh(db_training)

    # Prepare dataset
    dataset_path = await prepare_training_dataset(
        db, training_create.project_id, db_training.id
    )

    # Start training in background
    background_tasks.add_task(
        start_training_task,
        db_training.id,
        training_create.project_id,
        dataset_path,
        config_dict
    )

    return TrainingRunResponse(
        id=db_training.id,
        project_id=db_training.project_id,
        name=db_training.name,
        status=db_training.status,
        batch_size=db_training.batch_size,
        learning_rate=db_training.learning_rate,
        num_epochs=db_training.num_epochs,
        config=db_training.config,
        checkpoint_path=db_training.checkpoint_path,
        metrics=db_training.metrics or {},
        started_at=db_training.started_at,
        completed_at=db_training.completed_at,
        created_at=db_training.created_at
    )


async def prepare_training_dataset(
    db: AsyncSession,
    project_id: int,
    training_run_id: int
) -> Path:
    """Prepare dataset for training."""
    # Create dataset directory
    dataset_dir = settings.DATA_DIR / "training" / f"run_{training_run_id}"
    dataset_dir.mkdir(parents=True, exist_ok=True)

    images_dir = dataset_dir / "images"
    masks_dir = dataset_dir / "masks"
    images_dir.mkdir(exist_ok=True)
    masks_dir.mkdir(exist_ok=True)

    # Get project info
    project_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = project_result.scalar_one()

    # Get annotated images
    images_result = await db.execute(
        select(Image)
        .where(Image.project_id == project_id)
        .where(Image.status == "annotated")
    )
    images = images_result.scalars().all()

    # Prepare annotations in COCO format for training
    coco_annotations = {
        "images": [],
        "annotations": [],
        "categories": [
            {"id": c["id"], "name": c["name"]}
            for c in (project.classes or [])
        ]
    }

    annotation_id = 1

    for image in images:
        # Copy image
        import shutil
        src_path = Path(image.file_path)
        dst_path = images_dir / image.filename
        if src_path.exists():
            shutil.copy(src_path, dst_path)

        # Add image info
        coco_annotations["images"].append({
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
            coco_ann = {
                "id": annotation_id,
                "image_id": image.id,
                "category_id": ann.class_id,
                "segmentation": [
                    [coord for point in ann.polygon for coord in point]
                ] if ann.polygon else [],
                "bbox": ann.bbox or [],
                "area": ann.area or 0,
                "iscrowd": 0
            }
            coco_annotations["annotations"].append(coco_ann)
            annotation_id += 1

    # Save annotations
    with open(dataset_dir / "annotations.json", "w") as f:
        json.dump(coco_annotations, f, indent=2)

    return dataset_dir


async def start_training_task(
    training_run_id: int,
    project_id: int,
    dataset_path: Path,
    config: dict
):
    """Background task to start training."""
    from app.database import async_session

    async with async_session() as db:
        # Update status to running
        result = await db.execute(
            select(TrainingRun).where(TrainingRun.id == training_run_id)
        )
        training_run = result.scalar_one()
        training_run.status = "running"
        training_run.started_at = datetime.utcnow()
        await db.commit()

        try:
            # Start training
            success = await training_service.start_training(
                training_run_id,
                project_id,
                dataset_path,
                config
            )

            # Wait for training to complete (polling)
            import asyncio
            while True:
                status = training_service.get_status(training_run_id)
                if status in ["completed", "failed"]:
                    break
                await asyncio.sleep(5)

            # Update final status
            result = await db.execute(
                select(TrainingRun).where(TrainingRun.id == training_run_id)
            )
            training_run = result.scalar_one()
            training_run.status = status
            training_run.completed_at = datetime.utcnow()
            training_run.logs = "\n".join(training_service.get_logs(training_run_id))

            if status == "completed":
                checkpoint_path = settings.FINETUNED_DIR / f"run_{training_run_id}" / "best_model.pt"
                if checkpoint_path.exists():
                    training_run.checkpoint_path = str(checkpoint_path)

            await db.commit()

        except Exception as e:
            result = await db.execute(
                select(TrainingRun).where(TrainingRun.id == training_run_id)
            )
            training_run = result.scalar_one()
            training_run.status = "failed"
            training_run.logs = str(e)
            await db.commit()


@router.get("/project/{project_id}", response_model=List[TrainingRunResponse])
async def list_project_training_runs(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List all training runs for a project."""
    result = await db.execute(
        select(TrainingRun)
        .where(TrainingRun.project_id == project_id)
        .order_by(TrainingRun.created_at.desc())
    )
    runs = result.scalars().all()

    return [
        TrainingRunResponse(
            id=run.id,
            project_id=run.project_id,
            name=run.name,
            status=run.status,
            batch_size=run.batch_size,
            learning_rate=run.learning_rate,
            num_epochs=run.num_epochs,
            config=run.config or {},
            checkpoint_path=run.checkpoint_path,
            metrics=run.metrics or {},
            started_at=run.started_at,
            completed_at=run.completed_at,
            created_at=run.created_at
        )
        for run in runs
    ]


@router.get("/{training_id}", response_model=TrainingRunResponse)
async def get_training_run(
    training_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a training run by ID."""
    result = await db.execute(
        select(TrainingRun).where(TrainingRun.id == training_id)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Training run not found")

    # Update with live status if running
    if run.status == "running":
        live_status = training_service.get_status(training_id)
        if live_status != "running":
            run.status = live_status
            await db.commit()

    return TrainingRunResponse(
        id=run.id,
        project_id=run.project_id,
        name=run.name,
        status=run.status,
        batch_size=run.batch_size,
        learning_rate=run.learning_rate,
        num_epochs=run.num_epochs,
        config=run.config or {},
        checkpoint_path=run.checkpoint_path,
        metrics=run.metrics or {},
        started_at=run.started_at,
        completed_at=run.completed_at,
        created_at=run.created_at
    )


@router.get("/{training_id}/logs", response_model=TrainingLogsResponse)
async def get_training_logs(
    training_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get logs for a training run."""
    result = await db.execute(
        select(TrainingRun).where(TrainingRun.id == training_id)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Training run not found")

    # Get live logs if running
    if run.status == "running":
        logs = training_service.get_logs(training_id)
    else:
        logs = run.logs.split("\n") if run.logs else []

    return TrainingLogsResponse(
        logs=logs,
        status=run.status
    )


@router.post("/{training_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_training(
    training_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Cancel a running training job."""
    result = await db.execute(
        select(TrainingRun).where(TrainingRun.id == training_id)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Training run not found")

    if run.status != "running":
        raise HTTPException(status_code=400, detail="Training is not running")

    success = await training_service.cancel_training(training_id)

    if success:
        run.status = "cancelled"
        await db.commit()

    return {"success": success}


@router.post("/{training_id}/apply")
async def apply_finetuned_model(
    training_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Apply a fine-tuned model checkpoint."""
    result = await db.execute(
        select(TrainingRun).where(TrainingRun.id == training_id)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Training run not found")

    if not run.checkpoint_path:
        raise HTTPException(status_code=400, detail="No checkpoint available")

    from services.sam3_service import sam3_service
    success = sam3_service.load_finetuned_model(run.checkpoint_path)

    return {"success": success, "checkpoint": run.checkpoint_path}
