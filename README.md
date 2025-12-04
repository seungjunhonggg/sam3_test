# SAM3 Labeling Tool

AI-powered image labeling tool using Meta's Segment Anything Model 3 (SAM3). Features a modern web interface inspired by Roboflow with support for text, point, and box prompts for automatic segmentation.

## Features

### Labeling Tools
- **Polygon Tool**: Draw polygons manually for precise annotations
- **Bounding Box Tool**: Quick rectangular annotations
- **Brush Tool**: Paint masks directly on images
- **SAM3 Point**: Click on objects to auto-segment using SAM3
- **SAM3 Box**: Draw a box to segment objects within
- **SAM3 Text**: Describe objects in natural language (SAM3's open-vocabulary feature)

### Project Management
- Create and manage multiple labeling projects
- Define custom class labels with colors
- Track annotation progress (pending, annotated, reviewed)
- Upload multiple images via drag & drop

### Export Formats
- **COCO JSON**: Standard COCO format annotations
- **YOLO**: YOLO format for object detection
- **YOLO Segmentation**: YOLO format with polygon coordinates
- **Pascal VOC**: XML format annotations
- **Mask Images**: Binary mask PNGs
- **SAM3 Training**: Format ready for SAM3 fine-tuning

### Fine-tuning
- Train SAM3 on your labeled data directly from the UI
- Configure training parameters (batch size, learning rate, epochs)
- Support for LoRA efficient fine-tuning
- Real-time training logs and progress
- Apply fine-tuned models for better segmentation

## Requirements

### For GPU (Recommended)
- Python 3.12+
- CUDA 12.6+
- PyTorch 2.7+
- NVIDIA GPU with 16GB+ VRAM (for full SAM3 model)

### For CPU (Limited functionality)
- Python 3.12+
- PyTorch 2.7+
- Note: SAM3 inference will be slow without GPU

## Installation

### Option 1: Docker (Recommended)

```bash
# With NVIDIA GPU
docker-compose up -d

# CPU only (development)
docker-compose --profile cpu up -d
```

### Option 2: Manual Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd sam3-labeling-tool
```

2. **Install SAM3**
```bash
# Create conda environment
conda create -n sam3 python=3.12
conda activate sam3

# Install PyTorch with CUDA
pip install torch==2.7.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

# Clone and install SAM3
git clone https://github.com/facebookresearch/sam3.git
cd sam3
pip install -e .
cd ..
```

3. **Authenticate with HuggingFace**
```bash
# Request access at https://huggingface.co/facebook/sam3
huggingface-cli login
```

4. **Install Backend**
```bash
cd backend
pip install -r requirements.txt
```

5. **Install Frontend**
```bash
cd frontend
npm install
```

6. **Start the application**
```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend (development)
cd frontend
npm run dev
```

7. **Open the application**
```
http://localhost:3000
```

## Usage

### Creating a Project

1. Click "New Project" on the Projects page
2. Enter project name and description
3. Select annotation type (instance segmentation, semantic, or bounding box)
4. Default classes will be created - customize them later

### Uploading Images

1. Open your project
2. Drag & drop images or click to select files
3. Supported formats: PNG, JPG, JPEG, WebP, BMP

### Annotating Images

1. Click "Annotate" on any image
2. Select a class from the right panel
3. Choose a tool:
   - **V** - Select: Click to select annotations
   - **P** - Polygon: Click to add points, Enter to complete
   - **B** - Box: Click and drag to draw boxes
   - **S** - SAM3 Point: Click on objects for auto-segmentation
   - **X** - SAM3 Box: Draw a box for auto-segmentation
   - **T** - SAM3 Text: Type description for open-vocabulary segmentation

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| P | Polygon tool |
| B | Bounding box tool |
| S | SAM3 point tool |
| X | SAM3 box tool |
| T | SAM3 text tool |
| Enter | Complete polygon |
| Escape | Cancel current action |
| Delete | Delete selected annotation |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Arrow Left/Right | Previous/Next image |

### Fine-tuning SAM3

1. Go to your project's Training page
2. Click "New Run"
3. Configure training parameters:
   - **Batch Size**: 4 (adjust based on GPU memory)
   - **Learning Rate**: 1e-5
   - **Epochs**: 10
   - **Use LoRA**: Recommended for efficient training
4. Click "Start Training"
5. Monitor progress in real-time
6. Click "Apply Model" when complete to use your fine-tuned model

### Exporting Data

1. Open your project
2. Click "Export"
3. Select format (COCO, YOLO, etc.)
4. Choose whether to include images
5. Download the exported file

## API Reference

The backend exposes a RESTful API:

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a project
- `GET /api/projects/{id}` - Get project details
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### Images
- `POST /api/images/upload/{project_id}` - Upload images
- `GET /api/images/project/{project_id}` - List project images
- `GET /api/images/{id}` - Get image details
- `DELETE /api/images/{id}` - Delete image

### Annotations
- `GET /api/annotations/image/{image_id}` - Get image annotations
- `POST /api/annotations` - Create annotation
- `POST /api/annotations/bulk` - Create multiple annotations
- `PUT /api/annotations/{id}` - Update annotation
- `DELETE /api/annotations/{id}` - Delete annotation

### Segmentation (SAM3)
- `POST /api/segmentation/set-image/{image_id}` - Set current image
- `POST /api/segmentation/text` - Segment with text prompt
- `POST /api/segmentation/points` - Segment with point prompts
- `POST /api/segmentation/box` - Segment with box prompt
- `POST /api/segmentation/auto` - Auto-segment all objects

### Training
- `GET /api/training/project/{project_id}` - List training runs
- `POST /api/training` - Start new training run
- `GET /api/training/{id}/logs` - Get training logs
- `POST /api/training/{id}/cancel` - Cancel training
- `POST /api/training/{id}/apply` - Apply fine-tuned model

### Export
- `GET /api/export/formats` - List available export formats
- `POST /api/export/project/{project_id}` - Export project data

## Project Structure

```
sam3-labeling-tool/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py         # Configuration settings
│   │   ├── database.py       # Database models
│   │   └── main.py           # FastAPI application
│   ├── routers/
│   │   ├── projects.py       # Project endpoints
│   │   ├── images.py         # Image endpoints
│   │   ├── annotations.py    # Annotation endpoints
│   │   ├── segmentation.py   # SAM3 endpoints
│   │   ├── training.py       # Training endpoints
│   │   └── export.py         # Export endpoints
│   ├── services/
│   │   ├── sam3_service.py   # SAM3 model service
│   │   └── training_service.py # Training service
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── store/            # Zustand state management
│   │   ├── utils/            # API utilities
│   │   └── styles/           # CSS styles
│   ├── package.json
│   └── vite.config.ts
├── data/                     # Data storage
├── models/                   # Model checkpoints
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## Troubleshooting

### SAM3 not loading
- Ensure you have requested and received access to SAM3 on HuggingFace
- Run `huggingface-cli login` with your token
- Check GPU memory (SAM3 requires ~16GB VRAM)

### Training fails
- Ensure at least 5 annotated images
- Reduce batch size if running out of GPU memory
- Check training logs for specific errors

### Slow segmentation
- GPU is required for real-time segmentation
- CPU mode works but is significantly slower

## License

This project is for educational and research purposes. SAM3 model is released under Meta's license - see [facebook/sam3](https://github.com/facebookresearch/sam3) for details.

## Acknowledgments

- [Meta AI - SAM3](https://github.com/facebookresearch/sam3)
- [Roboflow](https://roboflow.com) for UI/UX inspiration
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://reactjs.org/)
