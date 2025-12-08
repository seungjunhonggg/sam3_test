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

            # Build the model with correct parameter names
            if model_checkpoint:
                logger.info(f"Loading from checkpoint: {model_checkpoint}")
                self._model = build_sam3_image_model(
                    checkpoint_path=model_checkpoint,
                    device=device,
                    load_from_HF=False,  # 로컬 체크포인트 사용
                    enable_segmentation=True
                )
            else:
                self._model = build_sam3_image_model(
                    device=device,
                    load_from_HF=True,  # HuggingFace에서 다운로드
                    enable_segmentation=True
                )

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

    def _process_sam3_result(self, state: Dict) -> Dict[str, Any]:
        """Process SAM3 state into response format.

        SAM3 returns results in the state dictionary after calling prompt methods.
        Note: SAM3's _forward_grounding applies interpolate().sigmoid() before storing,
        so both masks and masks_logits are already in 0~1 range.

        - masks: Boolean/binary masks (masks_logits > 0.5)
        - masks_logits: Probability values after sigmoid (0~1 range, already interpolated to original size)
        - boxes: [x0, y0, x1, y1] in original image coordinates
        - scores: Confidence scores
        """
        try:
            import torch
            import cv2

            # 디버깅: SAM3 state 키 확인
            logger.info(f"SAM3 state keys: {list(state.keys()) if isinstance(state, dict) else type(state)}")

            # SAM3 masks 처리:
            # - masks: boolean masks (이미 > 0.5 threshold 적용됨)
            # - masks_logits: sigmoid 적용 후의 확률값 (0~1 범위, interpolate().sigmoid())
            # 둘 다 이미 sigmoid가 적용되어 있으므로 추가 sigmoid 불필요
            masks = state.get("masks", None)
            masks_logits = state.get("masks_logits", None)

            if masks is None and masks_logits is not None:
                masks = masks_logits
                logger.info("Using masks_logits (already sigmoid applied, 0~1 range)")
            elif masks is not None:
                logger.info("Using masks (already thresholded boolean)")

            boxes = state.get("boxes", None)
            scores = state.get("scores", None)

            # 원본 이미지 크기
            orig_h = state.get("original_height")
            orig_w = state.get("original_width")

            if orig_h is None or orig_w is None:
                if self._image_size:
                    orig_w, orig_h = self._image_size
                else:
                    logger.warning("Cannot determine original image size")
                    return {"masks": [], "count": 0}

            logger.info(f"Original image size: {orig_w}x{orig_h}")

            if masks is None:
                logger.warning("No masks in state")
                return {"masks": [], "count": 0}

            # masks 개수 확인
            if isinstance(masks, torch.Tensor):
                logger.info(f"Masks tensor shape: {masks.shape}, dtype: {masks.dtype}")
                num_masks = masks.shape[0]
            else:
                num_masks = len(masks)
                logger.info(f"Masks list length: {num_masks}")

            if num_masks == 0:
                return {"masks": [], "count": 0}

            masks_data = []

            # SAM3 예제 방식대로 마스크 순회: for mask in masks
            for i, mask in enumerate(masks):
                # 텐서인 경우 처리
                if isinstance(mask, torch.Tensor):
                    # mask[0]으로 첫 번째 채널 접근 (shape: [1, H, W] -> [H, W])
                    if mask.dim() == 3 and mask.shape[0] == 1:
                        mask_np = mask[0].cpu().numpy()
                    else:
                        mask_np = mask.cpu().numpy()
                else:
                    mask_np = np.array(mask)

                # 여전히 3D면 squeeze
                if mask_np.ndim == 3:
                    mask_np = mask_np.squeeze()

                logger.info(f"Mask {i} shape: {mask_np.shape}, dtype: {mask_np.dtype}, min: {mask_np.min():.4f}, max: {mask_np.max():.4f}")

                mask_h, mask_w = mask_np.shape

                # 마스크 크기가 원본과 다르면 리사이즈 (SAM3 내부 해상도 1008x1008에서)
                if mask_h != orig_h or mask_w != orig_w:
                    logger.info(f"Resizing mask from {mask_w}x{mask_h} to {orig_w}x{orig_h}")
                    mask_np = cv2.resize(mask_np.astype(np.float32), (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

                polygon = self._mask_to_polygon(mask_np)
                logger.info(f"Mask {i} polygon points: {len(polygon)}")

                # bbox 처리
                if boxes is not None and i < len(boxes):
                    bbox = boxes[i]
                    if isinstance(bbox, torch.Tensor):
                        bbox = bbox.cpu().numpy().tolist()
                    elif isinstance(bbox, np.ndarray):
                        bbox = bbox.tolist()
                    # SAM3 returns boxes in [x0, y0, x1, y1] pixel format
                    if bbox and len(bbox) == 4:
                        x0, y0, x1, y1 = bbox
                        bbox = [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]  # Convert to [x, y, w, h]
                else:
                    bbox = self._mask_to_bbox(mask_np)

                # score 처리
                if scores is not None and i < len(scores):
                    score_val = scores[i]
                    if isinstance(score_val, torch.Tensor):
                        score = float(score_val.cpu().numpy())
                    else:
                        score = float(score_val)
                else:
                    score = 1.0

                area = int(np.sum(mask_np > 0.5))

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

        # 마스크 값 범위 확인
        mask_min, mask_max = mask.min(), mask.max()
        logger.debug(f"Mask value range: {mask_min:.4f} ~ {mask_max:.4f}")

        # 마스크가 이미 binary (0/1 또는 True/False)인 경우
        if mask_max <= 1.0:
            binary_mask = (mask > 0.5).astype(np.uint8)
        else:
            # 마스크가 0-255 범위인 경우
            binary_mask = (mask > 127).astype(np.uint8)

        # binary_mask에서 positive pixel 수 확인
        positive_pixels = np.sum(binary_mask)
        logger.debug(f"Binary mask positive pixels: {positive_pixels}")

        if positive_pixels == 0:
            logger.warning("Mask has no positive pixels after thresholding")
            return []

        contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            logger.warning("No contours found in binary mask")
            return []

        logger.debug(f"Found {len(contours)} contours")

        largest = max(contours, key=cv2.contourArea)
        largest_area = cv2.contourArea(largest)
        logger.debug(f"Largest contour area: {largest_area}, points: {len(largest)}")

        if largest_area < 10:
            logger.warning(f"Largest contour area too small: {largest_area}")
            return []

        # 폴리곤 단순화 - epsilon을 작게 해서 더 많은 점 유지
        perimeter = cv2.arcLength(largest, True)
        epsilon = 0.001 * perimeter
        approx = cv2.approxPolyDP(largest, epsilon, True)

        logger.debug(f"After simplification: {len(approx)} points (epsilon={epsilon:.4f}, perimeter={perimeter:.2f})")

        # 단순화 후에도 최소 3개 점 필요
        if len(approx) < 3:
            logger.warning(f"Simplified polygon has only {len(approx)} points, using original contour")
            approx = largest

        polygon = approx.squeeze().tolist()

        # 1차원 배열인 경우 (점이 1개만 있을 때) 처리
        if isinstance(polygon[0], int):
            polygon = [polygon]

        # 여전히 3개 미만이면 빈 배열 반환
        if len(polygon) < 3:
            logger.warning(f"Final polygon has only {len(polygon)} points, returning empty")
            return []

        logger.debug(f"Final polygon has {len(polygon)} points")
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
