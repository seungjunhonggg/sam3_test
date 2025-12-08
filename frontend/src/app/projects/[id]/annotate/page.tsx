'use client';

import { useEffect, useState, useRef, useCallback, use, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Group,
  Stack,
  Text,
  Button,
  ActionIcon,
  Tooltip,
  Paper,
  ColorSwatch,
  TextInput,
  Kbd,
  Loader,
  Center,
  ScrollArea,
  Divider,
  Badge,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconArrowRight,
  IconPointer,
  IconPolygon,
  IconSquare,
  IconBrush,
  IconSparkles,
  IconMessageCircle,
  IconCheck,
  IconX,
  IconTrash,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
  IconArrowBackUp,
  IconArrowForwardUp,
} from '@tabler/icons-react';
import { projectsApi, imagesApi, annotationsApi, segmentationApi, type Project, type Image, type Annotation, type AnnotationCreate, type ClassConfig, type SegmentationResult } from '@/lib/api';
import { useAnnotationStore, type Tool } from '@/lib/store';
import classes from './page.module.css';

interface Props {
  params: Promise<{ id: string }>;
}

const TOOLS: { id: Tool; icon: typeof IconPointer; label: string; shortcut: string }[] = [
  { id: 'select', icon: IconPointer, label: '선택', shortcut: 'V' },
  { id: 'polygon', icon: IconPolygon, label: '폴리곤', shortcut: 'P' },
  { id: 'bbox', icon: IconSquare, label: '바운딩 박스', shortcut: 'B' },
  { id: 'brush', icon: IconBrush, label: '브러시', shortcut: 'R' },
  { id: 'sam_point', icon: IconSparkles, label: 'SAM3 포인트', shortcut: 'S' },
  { id: 'sam_box', icon: IconSparkles, label: 'SAM3 박스', shortcut: 'X' },
  { id: 'sam_text', icon: IconMessageCircle, label: 'SAM3 텍스트', shortcut: 'T' },
];

export default function AnnotatePage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = parseInt(id);
  const initialImageId = searchParams.get('image');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);  // 이미지 캐싱용
  const imageLoadedRef = useRef<string | null>(null);  // 현재 로드된 이미지 URL 추적

  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [samLoading, setSamLoading] = useState(false);
  const [textPrompt, setTextPrompt] = useState('');

  const {
    annotations,
    setAnnotations,
    addAnnotation,
    removeAnnotation,
    selectedAnnotationId,
    selectAnnotation,
    selectedClassId,
    selectClass,
    activeTool,
    setActiveTool,
    currentPoints,
    setCurrentPoints,
    addPoint,
    clearCurrentPoints,
    isDrawing,
    setIsDrawing,
    samPendingMasks,
    setSamPendingMasks,
    clearSamPending,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    resetView,
    undo,
    redo,
  } = useAnnotationStore();

  const currentImage = images[currentImageIndex];

  // Hotkeys
  useHotkeys([
    ['v', () => setActiveTool('select')],
    ['p', () => setActiveTool('polygon')],
    ['b', () => setActiveTool('bbox')],
    ['r', () => setActiveTool('brush')],
    ['s', () => setActiveTool('sam_point')],
    ['x', () => setActiveTool('sam_box')],
    ['t', () => setActiveTool('sam_text')],
    ['Escape', () => handleCancel()],
    ['Delete', () => selectedAnnotationId && handleDeleteAnnotation(selectedAnnotationId)],
    ['mod+z', () => undo()],
    ['mod+shift+z', () => redo()],
    ['ArrowLeft', () => goToPreviousImage()],
    ['ArrowRight', () => goToNextImage()],
  ]);

  useEffect(() => {
    loadData();
  }, [projectId]);

  useEffect(() => {
    if (currentImage) {
      loadAnnotations();
      initializeSam();
      loadImage();  // 이미지 로드 분리
    }
  }, [currentImage?.id]);

  // 이미지가 로드된 후에만 캔버스 그리기
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      drawCanvas();
    }
  }, [annotations, currentPoints, samPendingMasks, zoom, panOffset, selectedAnnotationId]);

  // 이미지 로드 함수 (한 번만 로드하고 캐싱)
  const loadImage = useCallback(() => {
    if (!currentImage) return;

    const imageUrl = `http://localhost:8000${currentImage.url || `/uploads/${projectId}/${currentImage.filename}`}`;

    // 이미 같은 이미지가 로드되어 있으면 스킵
    if (imageLoadedRef.current === imageUrl && imageRef.current) {
      drawCanvas();
      return;
    }

    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => {
      imageRef.current = img;
      imageLoadedRef.current = imageUrl;
      drawCanvas();
    };
  }, [currentImage, projectId]);

  const loadData = async () => {
    try {
      const [projectRes, imagesRes] = await Promise.all([
        projectsApi.get(projectId),
        imagesApi.listByProject(projectId),
      ]);
      setProject(projectRes.data);
      setImages(imagesRes.data);

      if (initialImageId) {
        const index = imagesRes.data.findIndex((img: Image) => img.id === parseInt(initialImageId));
        if (index >= 0) setCurrentImageIndex(index);
      }

      if (projectRes.data.classes.length > 0) {
        selectClass(projectRes.data.classes[0].id);
      }
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '데이터를 불러올 수 없습니다',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAnnotations = async () => {
    if (!currentImage) return;
    try {
      const response = await annotationsApi.listByImage(currentImage.id);
      setAnnotations(response.data);
    } catch (error) {
      console.error('Failed to load annotations:', error);
    }
  };

  const initializeSam = async () => {
    if (!currentImage) return;
    try {
      await segmentationApi.setImage(currentImage.id);
    } catch (error) {
      console.error('Failed to initialize SAM:', error);
    }
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    // 캐시된 이미지가 없으면 그리지 않음
    if (!canvas || !ctx || !img || !currentImage) return;

    // 캔버스 크기 설정 (이미지 크기와 동일)
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }

    // 캔버스 클리어 및 이미지 그리기
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw annotations
    annotations.forEach((ann) => {
      if (!ann.polygon) return;
      const cls = project?.classes.find((c) => c.id === ann.class_id);
      const color = cls?.color || '#0071ff';
      const isSelected = ann.id === selectedAnnotationId;

      drawPolygon(ctx, ann.polygon, color, isSelected);
    });

    // Draw pending SAM masks
    samPendingMasks.forEach((mask) => {
      const cls = project?.classes.find((c) => c.id === selectedClassId);
      const color = cls?.color || '#0071ff';
      drawPolygon(ctx, mask.polygon, color, false, 0.4);
    });

    // Draw current drawing points
    if (currentPoints.length > 0) {
      const cls = project?.classes.find((c) => c.id === selectedClassId);
      const color = cls?.color || '#0071ff';

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentPoints[0][0], currentPoints[0][1]);
      currentPoints.forEach((point) => {
        ctx.lineTo(point[0], point[1]);
      });
      ctx.stroke();

      // Draw points
      currentPoints.forEach((point) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point[0], point[1], 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [currentImage, annotations, currentPoints, samPendingMasks, selectedAnnotationId, selectedClassId, project]);

  const drawPolygon = (
    ctx: CanvasRenderingContext2D,
    polygon: number[][],
    color: string,
    isSelected: boolean,
    opacity: number = 0.3
  ) => {
    if (!polygon || polygon.length < 3) return;

    ctx.fillStyle = `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 3 : 2;

    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    polygon.forEach((point) => {
      ctx.lineTo(point[0], point[1]);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !currentImage) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    switch (activeTool) {
      case 'select':
        // Check if clicked on an annotation
        const clickedAnn = annotations.find((ann) => ann.polygon && isPointInPolygon([x, y], ann.polygon));
        selectAnnotation(clickedAnn?.id || null);
        break;

      case 'polygon':
        addPoint([x, y]);
        setIsDrawing(true);
        break;

      case 'sam_point':
        setSamLoading(true);
        try {
          const response = await segmentationApi.segmentPoints([{ x, y, label: 1 }]);
          setSamPendingMasks(response.data.masks);
        } catch (error) {
          notifications.show({
            title: '오류',
            message: 'SAM3 세그멘테이션에 실패했습니다',
            color: 'red',
          });
        } finally {
          setSamLoading(false);
        }
        break;
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'bbox' || activeTool === 'sam_box') {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      setCurrentPoints([[x, y]]);
      setIsDrawing(true);
    }
  };

  const handleCanvasMouseUp = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || currentPoints.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    const [x1, y1] = currentPoints[0];
    const box = [Math.min(x1, x), Math.min(y1, y), Math.max(x1, x), Math.max(y1, y)];

    if (activeTool === 'bbox') {
      // Create bbox as polygon
      const polygon = [
        [box[0], box[1]],
        [box[2], box[1]],
        [box[2], box[3]],
        [box[0], box[3]],
      ];
      await saveAnnotation(polygon, 'bbox');
    } else if (activeTool === 'sam_box') {
      setSamLoading(true);
      try {
        const response = await segmentationApi.segmentBox({
          x1: box[0],
          y1: box[1],
          x2: box[2],
          y2: box[3]
        });
        setSamPendingMasks(response.data.masks);
      } catch (error) {
        notifications.show({
          title: '오류',
          message: 'SAM3 세그멘테이션에 실패했습니다',
          color: 'red',
        });
      } finally {
        setSamLoading(false);
      }
    }

    clearCurrentPoints();
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && activeTool === 'polygon' && currentPoints.length >= 3) {
      await saveAnnotation(currentPoints);
      clearCurrentPoints();
    }
  };

  const handleTextSubmit = async () => {
    if (!textPrompt.trim()) return;

    setSamLoading(true);
    try {
      const response = await segmentationApi.segmentText(textPrompt);
      setSamPendingMasks(response.data.masks);
      setTextPrompt('');
    } catch (error) {
      notifications.show({
        title: '오류',
        message: 'SAM3 텍스트 세그멘테이션에 실패했습니다',
        color: 'red',
      });
    } finally {
      setSamLoading(false);
    }
  };

  const saveAnnotation = async (polygon: number[][], annotationType: string = 'polygon', isAutoGenerated: boolean = false) => {
    if (!currentImage || selectedClassId === null || !project) {
      notifications.show({
        title: '오류',
        message: '클래스를 선택해주세요',
        color: 'red',
      });
      return;
    }

    // Get class name from project classes
    const selectedClass = project.classes.find(c => c.id === selectedClassId);
    if (!selectedClass) {
      notifications.show({
        title: '오류',
        message: '유효한 클래스를 선택해주세요',
        color: 'red',
      });
      return;
    }

    try {
      const bbox = getBboxFromPolygon(polygon);
      const annotationData: AnnotationCreate = {
        image_id: currentImage.id,
        class_name: selectedClass.name,
        class_id: selectedClassId,
        annotation_type: annotationType,
        polygon,
        bbox,
        is_auto_generated: isAutoGenerated,
      };
      const response = await annotationsApi.create(annotationData);
      addAnnotation(response.data);
      notifications.show({
        title: '성공',
        message: '어노테이션이 저장되었습니다',
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to save annotation:', error);
      notifications.show({
        title: '오류',
        message: '어노테이션 저장에 실패했습니다',
        color: 'red',
      });
    }
  };

  const confirmSamMasks = async () => {
    for (const mask of samPendingMasks) {
      await saveAnnotation(mask.polygon, 'polygon', true);  // SAM generated masks are auto-generated
    }
    clearSamPending();
  };

  const handleDeleteAnnotation = async (id: number) => {
    try {
      await annotationsApi.delete(id);
      removeAnnotation(id);
      notifications.show({
        title: '성공',
        message: '어노테이션이 삭제되었습니다',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '어노테이션 삭제에 실패했습니다',
        color: 'red',
      });
    }
  };

  const handleCancel = () => {
    clearCurrentPoints();
    clearSamPending();
    selectAnnotation(null);
  };

  const goToPreviousImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
      clearSamPending();
    }
  };

  const goToNextImage = () => {
    if (currentImageIndex < images.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
      clearSamPending();
    }
  };

  const isPointInPolygon = (point: number[], polygon: number[][]): boolean => {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      if (((yi > point[1]) !== (yj > point[1])) &&
          (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  const getBboxFromPolygon = (polygon: number[][]): number[] => {
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    return [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    ];
  };

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Box className={classes.container} onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Top Bar */}
      <Box className={classes.topBar}>
        <Group justify="space-between" h="100%" px="md">
          <Group gap="md">
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => router.push(`/projects/${projectId}`)}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Text fw={500}>
              {currentImage?.original_filename || '이미지 없음'}
            </Text>
            <Badge variant="light" color="blue">
              {currentImageIndex + 1} / {images.length}
            </Badge>
          </Group>

          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={goToPreviousImage} disabled={currentImageIndex === 0}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ActionIcon variant="subtle" onClick={goToNextImage} disabled={currentImageIndex === images.length - 1}>
              <IconArrowRight size={18} />
            </ActionIcon>
            <Divider orientation="vertical" mx="xs" />
            <Tooltip label="실행 취소 (Ctrl+Z)">
              <ActionIcon variant="subtle" onClick={undo}>
                <IconArrowBackUp size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="다시 실행 (Ctrl+Shift+Z)">
              <ActionIcon variant="subtle" onClick={redo}>
                <IconArrowForwardUp size={18} />
              </ActionIcon>
            </Tooltip>
            <Divider orientation="vertical" mx="xs" />
            <Tooltip label="축소">
              <ActionIcon variant="subtle" onClick={() => setZoom(zoom - 0.1)}>
                <IconZoomOut size={18} />
              </ActionIcon>
            </Tooltip>
            <Text size="sm" w={50} ta="center">{Math.round(zoom * 100)}%</Text>
            <Tooltip label="확대">
              <ActionIcon variant="subtle" onClick={() => setZoom(zoom + 0.1)}>
                <IconZoomIn size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="초기화">
              <ActionIcon variant="subtle" onClick={resetView}>
                <IconZoomReset size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>

      <Box className={classes.content}>
        {/* Left Toolbar */}
        <Paper className={classes.toolbar} shadow="sm" p="xs">
          <Stack gap="xs">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Tooltip key={tool.id} label={`${tool.label} (${tool.shortcut})`} position="right">
                  <ActionIcon
                    variant={activeTool === tool.id ? 'filled' : 'subtle'}
                    color={activeTool === tool.id ? 'blue' : 'gray'}
                    size="lg"
                    onClick={() => setActiveTool(tool.id)}
                  >
                    <Icon size={20} />
                  </ActionIcon>
                </Tooltip>
              );
            })}
          </Stack>
        </Paper>

        {/* Canvas Area */}
        <Box className={classes.canvasArea} ref={containerRef}>
          {samLoading && (
            <Box className={classes.samLoading}>
              <Loader size="lg" />
              <Text mt="md">SAM3 처리 중...</Text>
            </Box>
          )}

          {activeTool === 'sam_text' && (
            <Paper className={classes.textPromptBar} shadow="sm" p="sm">
              <Group gap="sm">
                <TextInput
                  placeholder="세그멘테이션할 객체를 설명하세요..."
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
                  style={{ flex: 1 }}
                />
                <Button onClick={handleTextSubmit} loading={samLoading}>
                  검색
                </Button>
              </Group>
            </Paper>
          )}

          {samPendingMasks.length > 0 && (
            <Paper className={classes.samConfirmBar} shadow="sm" p="sm">
              <Group justify="space-between">
                <Text size="sm">{samPendingMasks.length}개의 마스크가 감지되었습니다</Text>
                <Group gap="sm">
                  <Button
                    variant="subtle"
                    color="gray"
                    leftSection={<IconX size={16} />}
                    onClick={clearSamPending}
                  >
                    취소
                  </Button>
                  <Button
                    leftSection={<IconCheck size={16} />}
                    onClick={confirmSamMasks}
                  >
                    확인
                  </Button>
                </Group>
              </Group>
            </Paper>
          )}

          <canvas
            ref={canvasRef}
            className={classes.canvas}
            style={{ transform: `scale(${zoom})` }}
            onClick={handleCanvasClick}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={handleCanvasMouseUp}
          />
        </Box>

        {/* Right Panel */}
        <Paper className={classes.rightPanel} shadow="sm">
          <ScrollArea h="100%">
            <Stack gap="md" p="md">
              {/* Classes */}
              <Box>
                <Text size="sm" fw={600} mb="sm">클래스</Text>
                <Stack gap="xs">
                  {project?.classes.map((cls) => (
                    <Paper
                      key={cls.id}
                      p="xs"
                      radius="md"
                      className={classes.classItem}
                      data-active={selectedClassId === cls.id || undefined}
                      onClick={() => selectClass(cls.id)}
                    >
                      <Group gap="sm">
                        <ColorSwatch color={cls.color} size={16} />
                        <Text size="sm">{cls.name}</Text>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Box>

              <Divider />

              {/* Annotations */}
              <Box>
                <Text size="sm" fw={600} mb="sm">
                  어노테이션 ({annotations.length})
                </Text>
                <Stack gap="xs">
                  {annotations.map((ann) => {
                    const cls = project?.classes.find((c) => c.id === ann.class_id);
                    return (
                      <Paper
                        key={ann.id}
                        p="xs"
                        radius="md"
                        className={classes.annotationItem}
                        data-active={selectedAnnotationId === ann.id || undefined}
                        onClick={() => selectAnnotation(ann.id)}
                      >
                        <Group justify="space-between">
                          <Group gap="sm">
                            <ColorSwatch color={cls?.color || '#ccc'} size={12} />
                            <Text size="xs">{cls?.name || '알 수 없음'}</Text>
                          </Group>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAnnotation(ann.id);
                            }}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Paper>
                    );
                  })}
                  {annotations.length === 0 && (
                    <Text size="xs" c="dimmed" ta="center" py="md">
                      어노테이션이 없습니다
                    </Text>
                  )}
                </Stack>
              </Box>
            </Stack>
          </ScrollArea>
        </Paper>
      </Box>
    </Box>
  );
}
