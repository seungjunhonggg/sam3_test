"""SAM3 Model Service for segmentation operations."""
import logging
import sys
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
import numpy as np
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)


class SAM3Service:
    """Service class for SAM3 model operations."""

    def __init__(self):
        self._model = None
        self._processor = None
        self._is_loaded = False
        self._current_image = None
        self._current_state = None
        self._image_size = None  # (width, height)
        self._confidence_threshold = 0.5  # Default confidence threshold

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def load_model(self, checkpoint: Optional[str] = None) -> bool:
        """Load the SAM3 model."""
        try:
            # Add local SAM3 path to Python path if configured
            local_path = settings.SAM3_LOCAL_PATH
            if local_path:
                local_path = Path(local_path)
                if local_path.exists():
                    sam3_path = str(local_path)
                    if sam3_path not in sys.path:
                        sys.path.insert(0, sam3_path)
                    logger.info(f"Using local SAM3 from: {sam3_path}")

            # Import SAM3 modules
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor

            logger.info("Loading SAM3 model...")

            model_checkpoint = checkpoint or settings.SAM3_CHECKPOINT
            device = settings.DEVICE

            # Build the model
            if model_checkpoint:
                logger.info(f"Loading from checkpoint: {model_checkpoint}")
                self._model = build_sam3_image_model(checkpoint=model_checkpoint, device=device)
            else:
                self._model = build_sam3_image_model(device=device)

            # Create processor
            self._processor = Sam3Processor(self._model, device=device)

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

        self._current_image = image
        self._image_size = image.size  # (width, height)

        if self._processor:
            image_np = np.array(image)
            self._current_state = self._processor.set_image(image_np)
            return {"status": "success", "image_size": image.size}

        # Mock mode
        return {"status": "success", "image_size": image.size, "mode": "mock"}

    def set_confidence_threshold(self, threshold: float) -> Dict[str, Any]:
        """Set the confidence threshold for filtering results."""
        self._confidence_threshold = max(0.0, min(1.0, threshold))

        if self._processor and self._current_state:
            try:
                self._processor.set_confidence_threshold(self._confidence_threshold, self._current_state)
                return {"status": "success", "threshold": self._confidence_threshold}
            except Exception as e:
                logger.warning(f"Failed to set confidence threshold: {e}")

        return {"status": "success", "threshold": self._confidence_threshold, "mode": "mock"}

    def reset_prompts(self) -> Dict[str, Any]:
        """Reset all prompts and return to image-only state."""
        if self._processor and self._current_state:
            try:
                self._processor.reset_all_prompts(self._current_state)
                return {"status": "success"}
            except Exception as e:
                logger.error(f"Failed to reset prompts: {e}")
                return {"error": str(e)}
        return {"status": "success", "mode": "mock"}

    def segment_with_text(self, prompt: str, reset: bool = True) -> Dict[str, Any]:
        """Segment image using text prompt.

        Args:
            prompt: Text description of what to segment
            reset: If True, reset previous prompts before applying (default: True)
        """
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            try:
                if reset:
                    self._processor.reset_all_prompts(self._current_state)
                result = self._processor.set_text_prompt(prompt, self._current_state)
                return self._process_sam3_result(result)
            except Exception as e:
                logger.error(f"Text segmentation error: {e}")
                return {"error": str(e)}

        return self._mock_segmentation(prompt)

    def segment_with_points(
        self,
        points: List[Tuple[int, int]],
        labels: List[int],
        reset: bool = True
    ) -> Dict[str, Any]:
        """Segment using point prompts (converted to small boxes).

        Args:
            points: List of (x, y) pixel coordinates
            labels: List of labels (1=positive/include, 0=negative/exclude)
            reset: If True, reset previous prompts before applying (default: True)
        """
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            try:
                if reset:
                    self._processor.reset_all_prompts(self._current_state)

                width, height = self._image_size
                result = None

                for (x, y), label in zip(points, labels):
                    box_size = 0.02  # 2% of image
                    center_x = x / width
                    center_y = y / height
                    box = [center_x, center_y, box_size, box_size]
                    is_positive = label == 1
                    result = self._processor.add_geometric_prompt(box, is_positive, self._current_state)

                if result:
                    return self._process_sam3_result(result)
                return {"masks": [], "count": 0}

            except Exception as e:
                logger.error(f"Point segmentation error: {e}")
                return {"error": str(e)}

        return self._mock_segmentation(f"points_{len(points)}")

    def segment_with_box(
        self,
        box: Tuple[int, int, int, int],
        is_positive: bool = True,
        reset: bool = True
    ) -> Dict[str, Any]:
        """Segment using bounding box prompt.

        Args:
            box: Bounding box as (x1, y1, x2, y2) in pixel coordinates
            is_positive: True for positive/include box, False for negative/exclude box
            reset: If True, reset previous prompts before applying (default: True)
        """
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            try:
                if reset:
                    self._processor.reset_all_prompts(self._current_state)

                width, height = self._image_size
                x1, y1, x2, y2 = box

                center_x = ((x1 + x2) / 2) / width
                center_y = ((y1 + y2) / 2) / height
                box_width = abs(x2 - x1) / width
                box_height = abs(y2 - y1) / height

                normalized_box = [center_x, center_y, box_width, box_height]
                result = self._processor.add_geometric_prompt(normalized_box, is_positive, self._current_state)

                return self._process_sam3_result(result)

            except Exception as e:
                logger.error(f"Box segmentation error: {e}")
                return {"error": str(e)}

        return self._mock_segmentation(f"box_{box}")

    def segment_with_combined_prompts(
        self,
        text_prompt: Optional[str] = None,
        boxes: Optional[List[Dict[str, Any]]] = None,
        points: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Segment using combined prompts (text + boxes + points).

        This allows interactive refinement by combining multiple prompt types.

        Args:
            text_prompt: Optional text description
            boxes: Optional list of boxes, each as {"box": [x1, y1, x2, y2], "is_positive": bool}
            points: Optional list of points, each as {"point": [x, y], "label": 0 or 1}
        """
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        if self._processor and self._current_state:
            try:
                self._processor.reset_all_prompts(self._current_state)
                result = None
                width, height = self._image_size

                # Apply text prompt first
                if text_prompt:
                    result = self._processor.set_text_prompt(text_prompt, self._current_state)

                # Add box prompts (for refinement)
                if boxes:
                    for box_data in boxes:
                        box = box_data.get("box", [])
                        is_positive = box_data.get("is_positive", True)
                        if len(box) == 4:
                            x1, y1, x2, y2 = box
                            center_x = ((x1 + x2) / 2) / width
                            center_y = ((y1 + y2) / 2) / height
                            box_width = abs(x2 - x1) / width
                            box_height = abs(y2 - y1) / height
                            normalized_box = [center_x, center_y, box_width, box_height]
                            result = self._processor.add_geometric_prompt(
                                normalized_box, is_positive, self._current_state
                            )

                # Add point prompts (converted to small boxes)
                if points:
                    for point_data in points:
                        point = point_data.get("point", [])
                        label = point_data.get("label", 1)
                        if len(point) == 2:
                            x, y = point
                            box_size = 0.02  # 2% of image
                            center_x = x / width
                            center_y = y / height
                            box = [center_x, center_y, box_size, box_size]
                            is_positive = label == 1
                            result = self._processor.add_geometric_prompt(
                                box, is_positive, self._current_state
                            )

                if result:
                    return self._process_sam3_result(result)
                return {"masks": [], "count": 0}

            except Exception as e:
                logger.error(f"Combined prompt segmentation error: {e}")
                return {"error": str(e)}

        # Mock mode
        prompt_desc = f"text={text_prompt}, boxes={len(boxes or [])}, points={len(points or [])}"
        return self._mock_segmentation(prompt_desc)

    def segment_auto(self) -> Dict[str, Any]:
        """Automatic segmentation."""
        if self._current_image is None:
            return {"error": "No image set. Call set_image first."}

        return self.segment_with_text("all objects")

    def _process_sam3_result(self, result: Dict) -> Dict[str, Any]:
        """Process SAM3 result into response format."""
        try:
            masks = result.get("masks", result.get("pred_masks", []))
            boxes = result.get("boxes", result.get("pred_boxes", []))
            scores = result.get("scores", result.get("pred_scores", []))

            if masks is None or len(masks) == 0:
                return {"masks": [], "count": 0}

            import torch
            masks_data = []

            for i in range(len(masks)):
                mask = masks[i]
                if isinstance(mask, torch.Tensor):
                    mask = mask.cpu().numpy()

                polygon = self._mask_to_polygon(mask)

                if boxes is not None and i < len(boxes):
                    bbox = boxes[i]
                    if isinstance(bbox, torch.Tensor):
                        bbox = bbox.cpu().numpy().tolist()
                    # SAM3 returns boxes in [x0, y0, x1, y1] pixel format
                    if bbox and len(bbox) == 4:
                        x0, y0, x1, y1 = bbox
                        bbox = [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]  # Convert to [x, y, w, h]
                else:
                    bbox = self._mask_to_bbox(mask)

                score = float(scores[i]) if scores is not None and i < len(scores) else 1.0
                area = int(np.sum(mask > 0.5)) if isinstance(mask, np.ndarray) else 0

                masks_data.append({
                    "id": i,
                    "polygon": polygon,
                    "bbox": bbox,
                    "rle": "",
                    "score": score,
                    "area": area
                })

            return {"masks": masks_data, "count": len(masks_data)}

        except Exception as e:
            logger.error(f"Error processing SAM3 result: {e}")
            return {"masks": [], "count": 0, "error": str(e)}

    def _mask_to_polygon(self, mask: np.ndarray) -> List[List[int]]:
        """Convert binary mask to polygon."""
        import cv2

        if mask.ndim == 3:
            mask = mask.squeeze()

        binary_mask = (mask > 0.5).astype(np.uint8)
        contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return []

        largest = max(contours, key=cv2.contourArea)
        epsilon = 0.005 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)

        polygon = approx.squeeze().tolist()
        if isinstance(polygon[0], int):
            polygon = [polygon]

        return polygon

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
        """Return mock segmentation results."""
        if self._current_image is None:
            return {"masks": [], "count": 0}

        w, h = self._current_image.size

        import random
        num_masks = random.randint(1, 3)
        results = []

        for i in range(num_masks):
            x1 = random.randint(0, w // 2)
            y1 = random.randint(0, h // 2)
            x2 = random.randint(x1 + 50, min(x1 + 200, w))
            y2 = random.randint(y1 + 50, min(y1 + 200, h))

            polygon = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]

            results.append({
                "id": i,
                "polygon": polygon,
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "rle": "",
                "score": random.uniform(0.7, 1.0),
                "area": (x2 - x1) * (y2 - y1)
            })

        return {"masks": results, "count": len(results), "mode": "mock", "prompt": prompt}

    def load_finetuned_model(self, checkpoint_path: str) -> bool:
        """Load a fine-tuned model checkpoint."""
        try:
            return self.load_model(checkpoint=checkpoint_path)
        except Exception as e:
            logger.error(f"Failed to load fine-tuned model: {e}")
            return False


# Global instance
sam3_service = SAM3Service()
