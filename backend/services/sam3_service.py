"""SAM3 Model Service for segmentation operations."""
import logging
import sys
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
import numpy as np
from PIL import Image
import io
import base64

from app.config import settings

logger = logging.getLogger(__name__)


class SAM3Service:
    """Service class for SAM3 model operations."""

    def __init__(self):
        self._model = None
        self._processor = None
        self._video_predictor = None
        self._is_loaded = False
        self._current_image = None
        self._current_state = None

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def load_model(self, checkpoint: Optional[str] = None) -> bool:
        """Load the SAM3 model.

        Supports loading from:
        1. Custom checkpoint path (if provided)
        2. Local path (SAM3_LOCAL_PATH environment variable)
        3. HuggingFace (default, requires HF_TOKEN)
        """
        try:
            # Add local SAM3 path to Python path if configured
            local_path = settings.SAM3_LOCAL_PATH
            if local_path:
                local_path = Path(local_path)
                if local_path.exists():
                    # Add to Python path for importing
                    sam3_path = str(local_path)
                    if sam3_path not in sys.path:
                        sys.path.insert(0, sam3_path)
                    logger.info(f"Using local SAM3 from: {sam3_path}")
                else:
                    logger.warning(f"SAM3_LOCAL_PATH does not exist: {local_path}")

            # Import SAM3 modules
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor

            logger.info("Loading SAM3 model...")

            # Determine checkpoint to use
            model_checkpoint = checkpoint or settings.SAM3_CHECKPOINT

            # If local path is set and has model files, use it
            if local_path and local_path.exists():
                # Check for common model file patterns
                model_files = list(local_path.glob("*.pt")) + list(local_path.glob("*.pth")) + list(local_path.glob("*.bin"))
                if model_files and not model_checkpoint:
                    model_checkpoint = str(model_files[0])
                    logger.info(f"Found model checkpoint: {model_checkpoint}")

            # Build the model
            if model_checkpoint:
                logger.info(f"Loading model from checkpoint: {model_checkpoint}")
                self._model = build_sam3_image_model(checkpoint=model_checkpoint, device=settings.DEVICE)
            else:
                logger.info("Loading model from default/HuggingFace")
                self._model = build_sam3_image_model(device=settings.DEVICE)

            # Create processor
            self._processor = Sam3Processor(self._model)

            self._is_loaded = True
            logger.info("SAM3 model loaded successfully")
            return True

        except ImportError as e:
            logger.warning(f"SAM3 not installed, using mock mode: {e}")
            self._is_loaded = False
            return False
        except Exception as e:
            logger.error(f"Failed to load SAM3 model: {e}")
            self._is_loaded = False
            return False

    def ensure_loaded(self):
        """Ensure the model is loaded before use."""
        if not self._is_loaded:
            self.load_model()

    def set_image(self, image: Image.Image) -> Dict[str, Any]:
        """Set the current image for segmentation."""
        self.ensure_loaded()

        if self._processor:
            self._current_image = image
            self._current_state = self._processor.set_image(image)
            return {"status": "success", "image_size": image.size}

        # Mock mode - return simulated state
        self._current_image = image
        return {"status": "success", "image_size": image.size, "mode": "mock"}

    def segment_with_text(self, prompt: str) -> Dict[str, Any]:
        """Segment image using text prompt."""
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            output = self._processor.set_text_prompt(
                state=self._current_state,
                prompt=prompt
            )
            masks = output["masks"]
            boxes = output["boxes"]
            scores = output["scores"]

            return self._process_masks(masks, boxes, scores)

        # Mock mode - return simulated segmentation
        return self._mock_segmentation(prompt)

    def segment_with_points(
        self,
        points: List[Tuple[int, int]],
        labels: List[int]
    ) -> Dict[str, Any]:
        """Segment image using point prompts.

        Args:
            points: List of (x, y) coordinates
            labels: List of labels (1 for foreground, 0 for background)
        """
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            import torch
            points_tensor = torch.tensor(points, dtype=torch.float32)
            labels_tensor = torch.tensor(labels, dtype=torch.int32)

            output = self._processor.set_point_prompt(
                state=self._current_state,
                points=points_tensor,
                labels=labels_tensor
            )

            masks = output["masks"]
            boxes = output["boxes"]
            scores = output["scores"]

            return self._process_masks(masks, boxes, scores)

        # Mock mode
        return self._mock_segmentation(f"points_{len(points)}")

    def segment_with_box(self, box: Tuple[int, int, int, int]) -> Dict[str, Any]:
        """Segment image using bounding box prompt.

        Args:
            box: (x1, y1, x2, y2) coordinates
        """
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            import torch
            box_tensor = torch.tensor([box], dtype=torch.float32)

            output = self._processor.set_box_prompt(
                state=self._current_state,
                boxes=box_tensor
            )

            masks = output["masks"]
            boxes = output["boxes"]
            scores = output["scores"]

            return self._process_masks(masks, boxes, scores)

        # Mock mode
        return self._mock_segmentation(f"box_{box}")

    def segment_auto(self) -> Dict[str, Any]:
        """Automatic segmentation of all objects in image."""
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            output = self._processor.auto_segment(state=self._current_state)
            masks = output["masks"]
            boxes = output["boxes"]
            scores = output["scores"]

            return self._process_masks(masks, boxes, scores)

        # Mock mode
        return self._mock_segmentation("auto")

    def _process_masks(
        self,
        masks: Any,
        boxes: Any,
        scores: Any
    ) -> Dict[str, Any]:
        """Process masks into a serializable format."""
        import torch

        results = []

        if masks is None or len(masks) == 0:
            return {"masks": [], "count": 0}

        for i in range(len(masks)):
            mask = masks[i]
            if isinstance(mask, torch.Tensor):
                mask = mask.cpu().numpy()

            # Convert mask to polygon (simplified)
            polygon = self._mask_to_polygon(mask)

            # Convert mask to RLE
            rle = self._mask_to_rle(mask)

            # Get bounding box
            bbox = boxes[i] if boxes is not None else self._mask_to_bbox(mask)
            if isinstance(bbox, torch.Tensor):
                bbox = bbox.cpu().numpy().tolist()

            score = float(scores[i]) if scores is not None else 1.0

            results.append({
                "id": i,
                "polygon": polygon,
                "bbox": bbox,
                "rle": rle,
                "score": score,
                "area": int(np.sum(mask > 0.5))
            })

        return {"masks": results, "count": len(results)}

    def _mask_to_polygon(self, mask: np.ndarray) -> List[List[int]]:
        """Convert binary mask to polygon coordinates."""
        import cv2

        if mask.ndim == 3:
            mask = mask.squeeze()

        binary_mask = (mask > 0.5).astype(np.uint8)
        contours, _ = cv2.findContours(
            binary_mask,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours:
            return []

        # Get the largest contour
        largest = max(contours, key=cv2.contourArea)

        # Simplify polygon
        epsilon = 0.005 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)

        polygon = approx.squeeze().tolist()
        if isinstance(polygon[0], int):
            polygon = [polygon]

        return polygon

    def _mask_to_rle(self, mask: np.ndarray) -> str:
        """Convert binary mask to run-length encoding."""
        if mask.ndim == 3:
            mask = mask.squeeze()

        pixels = (mask > 0.5).flatten()
        runs = []
        run_start = 0
        run_length = 0

        for i, pixel in enumerate(pixels):
            if pixel:
                if run_length == 0:
                    run_start = i
                run_length += 1
            elif run_length > 0:
                runs.append(f"{run_start},{run_length}")
                run_length = 0

        if run_length > 0:
            runs.append(f"{run_start},{run_length}")

        return "|".join(runs)

    def _mask_to_bbox(self, mask: np.ndarray) -> List[int]:
        """Convert binary mask to bounding box."""
        if mask.ndim == 3:
            mask = mask.squeeze()

        rows = np.any(mask > 0.5, axis=1)
        cols = np.any(mask > 0.5, axis=0)

        if not rows.any() or not cols.any():
            return [0, 0, 0, 0]

        y1, y2 = np.where(rows)[0][[0, -1]]
        x1, x2 = np.where(cols)[0][[0, -1]]

        return [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]

    def _mock_segmentation(self, prompt: str) -> Dict[str, Any]:
        """Return mock segmentation results for testing."""
        if self._current_image is None:
            return {"masks": [], "count": 0}

        w, h = self._current_image.size

        # Generate random mock masks
        import random
        num_masks = random.randint(1, 5)
        results = []

        for i in range(num_masks):
            # Random bounding box
            x1 = random.randint(0, w // 2)
            y1 = random.randint(0, h // 2)
            x2 = random.randint(x1 + 50, min(x1 + 200, w))
            y2 = random.randint(y1 + 50, min(y1 + 200, h))

            # Create polygon from bbox
            polygon = [
                [x1, y1], [x2, y1], [x2, y2], [x1, y2]
            ]

            results.append({
                "id": i,
                "polygon": polygon,
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "rle": "",
                "score": random.uniform(0.7, 1.0),
                "area": (x2 - x1) * (y2 - y1)
            })

        return {
            "masks": results,
            "count": len(results),
            "mode": "mock",
            "prompt": prompt
        }

    def load_finetuned_model(self, checkpoint_path: str) -> bool:
        """Load a fine-tuned model checkpoint."""
        try:
            return self.load_model(checkpoint=checkpoint_path)
        except Exception as e:
            logger.error(f"Failed to load fine-tuned model: {e}")
            return False


# Global instance
sam3_service = SAM3Service()
