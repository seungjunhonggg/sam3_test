"""Project management router."""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, Project, Image, Annotation

router = APIRouter()


class ClassConfig(BaseModel):
    """Class configuration model."""
    name: str
    color: str
    id: int


class ProjectCreate(BaseModel):
    """Project creation request."""
    name: str
    description: Optional[str] = None
    annotation_type: str = "instance_segmentation"
    classes: List[ClassConfig] = []


class ProjectUpdate(BaseModel):
    """Project update request."""
    name: Optional[str] = None
    description: Optional[str] = None
    annotation_type: Optional[str] = None
    classes: Optional[List[ClassConfig]] = None


class ProjectResponse(BaseModel):
    """Project response model."""
    id: int
    name: str
    description: Optional[str]
    annotation_type: str
    classes: List[dict]
    image_count: int = 0
    annotation_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectStats(BaseModel):
    """Project statistics."""
    total_images: int
    annotated_images: int
    pending_images: int
    total_annotations: int
    annotations_by_class: dict


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new project."""
    db_project = Project(
        name=project.name,
        description=project.description,
        annotation_type=project.annotation_type,
        classes=[c.model_dump() for c in project.classes]
    )
    db.add(db_project)
    await db.commit()
    await db.refresh(db_project)

    return ProjectResponse(
        id=db_project.id,
        name=db_project.name,
        description=db_project.description,
        annotation_type=db_project.annotation_type,
        classes=db_project.classes,
        created_at=db_project.created_at,
        updated_at=db_project.updated_at
    )


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all projects."""
    result = await db.execute(
        select(Project).offset(skip).limit(limit)
    )
    projects = result.scalars().all()

    responses = []
    for project in projects:
        # Get counts
        img_count = await db.execute(
            select(func.count(Image.id)).where(Image.project_id == project.id)
        )
        ann_count = await db.execute(
            select(func.count(Annotation.id))
            .join(Image)
            .where(Image.project_id == project.id)
        )

        responses.append(ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            annotation_type=project.annotation_type,
            classes=project.classes or [],
            image_count=img_count.scalar() or 0,
            annotation_count=ann_count.scalar() or 0,
            created_at=project.created_at,
            updated_at=project.updated_at
        ))

    return responses


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a project by ID."""
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get counts
    img_count = await db.execute(
        select(func.count(Image.id)).where(Image.project_id == project.id)
    )
    ann_count = await db.execute(
        select(func.count(Annotation.id))
        .join(Image)
        .where(Image.project_id == project.id)
    )

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        annotation_type=project.annotation_type,
        classes=project.classes or [],
        image_count=img_count.scalar() or 0,
        annotation_count=ann_count.scalar() or 0,
        created_at=project.created_at,
        updated_at=project.updated_at
    )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_update: ProjectUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project_update.name is not None:
        project.name = project_update.name
    if project_update.description is not None:
        project.description = project_update.description
    if project_update.annotation_type is not None:
        project.annotation_type = project_update.annotation_type
    if project_update.classes is not None:
        project.classes = [c.model_dump() for c in project_update.classes]

    project.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(project)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        annotation_type=project.annotation_type,
        classes=project.classes or [],
        created_at=project.created_at,
        updated_at=project.updated_at
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a project and all associated data."""
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()


@router.get("/{project_id}/stats", response_model=ProjectStats)
async def get_project_stats(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get project statistics."""
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get image counts
    total_images = await db.execute(
        select(func.count(Image.id)).where(Image.project_id == project_id)
    )
    annotated_images = await db.execute(
        select(func.count(Image.id))
        .where(Image.project_id == project_id)
        .where(Image.status == "annotated")
    )
    pending_images = await db.execute(
        select(func.count(Image.id))
        .where(Image.project_id == project_id)
        .where(Image.status == "pending")
    )

    # Get annotation counts by class
    annotations_result = await db.execute(
        select(Annotation.class_name, func.count(Annotation.id))
        .join(Image)
        .where(Image.project_id == project_id)
        .group_by(Annotation.class_name)
    )

    annotations_by_class = {}
    total_annotations = 0
    for class_name, count in annotations_result:
        annotations_by_class[class_name] = count
        total_annotations += count

    return ProjectStats(
        total_images=total_images.scalar() or 0,
        annotated_images=annotated_images.scalar() or 0,
        pending_images=pending_images.scalar() or 0,
        total_annotations=total_annotations,
        annotations_by_class=annotations_by_class
    )
