# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (Next.js + Mantine UI)
```bash
cd frontend
npm install
npm run dev      # Development server (port 3000)
npm run build    # Production build
npm run lint     # ESLint check
```

### Docker
```bash
docker-compose up -d                  # GPU mode
docker-compose --profile cpu up -d    # CPU mode (no GPU)
```

## Architecture

### Backend Structure
- **FastAPI application** at `backend/app/main.py` - mounts routers and static files
- **Configuration** at `backend/app/config.py` - uses pydantic-settings with `.env` file support
- **Database** at `backend/app/database.py` - SQLAlchemy async with SQLite (aiosqlite)
- **Routers** in `backend/routers/` - REST endpoints for projects, images, annotations, segmentation, training, export

### Key Services
- **SAM3Service** (`backend/services/sam3_service.py`):
  - Lazy-loads SAM3 model on first use
  - Falls back to mock mode when SAM3 is not installed (returns random polygons for testing)
  - Methods: `segment_with_text()`, `segment_with_points()`, `segment_with_box()`, `segment_auto()`
  - Converts masks to polygons and RLE format

- **TrainingService** (`backend/services/training_service.py`):
  - Handles SAM3 fine-tuning with LoRA support
  - Mock training mode available for testing

### Frontend Structure (Next.js 16 + Mantine UI 8)
- **Theme**: Apple-inspired design system in `frontend/src/lib/theme.ts`
  - Custom color palette (appleBlue, appleGray)
  - SF Pro font family styling
  - Rounded corners and subtle shadows
- **State Management**: Zustand stores in `frontend/src/lib/store.ts`
  - `useAnnotationStore` - manages canvas state, annotations, tool selection, SAM3 pending masks, undo/redo history
  - `useUIStore` - sidebar, panel tabs, loading state
- **API Client** at `frontend/src/lib/api.ts` - axios-based typed API calls
- **App Router Pages** in `frontend/src/app/`:
  - `/` - Project list with search and creation
  - `/projects/[id]` - Project detail with image upload and class management
  - `/projects/[id]/annotate` - Canvas-based annotation tool with SAM3 integration
  - `/training` - SAM3 fine-tuning dashboard

### Data Flow
1. Images uploaded via `/api/images/upload/{project_id}` → stored in `data/uploads/`
2. User selects tool in Annotator → triggers SAM3 segmentation via `/api/segmentation/*`
3. SAM3 returns masks as polygons → user confirms → saved as Annotation via `/api/annotations`
4. Export via `/api/export/project/{project_id}` generates COCO, YOLO, VOC, or mask formats

### Database Models
- **Project**: name, description, annotation_type, classes (JSON)
- **Image**: project_id, filename, status (pending/annotated/reviewed)
- **Annotation**: image_id, class_id, polygon (JSON), bbox, mask_rle
- **TrainingRun**: project_id, status, config, metrics, checkpoint_path

## Environment Variables
Key settings from `.env`:
- `DEVICE`: `cuda` or `cpu`
- `HF_TOKEN`: HuggingFace token for SAM3 model access
- `DATABASE_URL`: SQLite path (default: `sqlite+aiosqlite:///./data/labeling_tool.db`)
