'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Title,
  Text,
  Group,
  Button,
  ActionIcon,
  Stack,
  Box,
  SimpleGrid,
  Card,
  Image,
  Badge,
  Menu,
  Tabs,
  ColorSwatch,
  TextInput,
  Modal,
  ColorInput,
  Paper,
  Skeleton,
  Breadcrumbs,
  Anchor,
  Loader,
  Center,
} from '@mantine/core';
import { Dropzone, IMAGE_MIME_TYPE, FileWithPath } from '@mantine/dropzone';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconUpload,
  IconPhoto,
  IconX,
  IconTrash,
  IconEdit,
  IconDotsVertical,
  IconCheck,
  IconCloudUpload,
  IconDownload,
  IconPlus,
  IconArrowLeft,
  IconPencil,
} from '@tabler/icons-react';
import { AppShellWrapper } from '@/components/AppShell';
import { projectsApi, imagesApi, exportApi, type Project, type Image as ImageType, type ClassConfig } from '@/lib/api';
import classes from './page.module.css';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const projectId = parseInt(id);

  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<ImageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('images');

  // Class modal
  const [classModalOpened, { open: openClassModal, close: closeClassModal }] = useDisclosure(false);
  const [editingClass, setEditingClass] = useState<ClassConfig | null>(null);
  const [newClass, setNewClass] = useState({ name: '', color: '#4287f5' });

  // Export modal
  const [exportModalOpened, { open: openExportModal, close: closeExportModal }] = useDisclosure(false);
  const [exportFormat, setExportFormat] = useState('coco');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadProject();
    loadImages();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const response = await projectsApi.get(projectId);
      setProject(response.data);
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '프로젝트를 불러올 수 없습니다',
        color: 'red',
      });
      router.push('/');
    }
  };

  const loadImages = async () => {
    try {
      const response = await imagesApi.listByProject(projectId);
      setImages(response.data);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = useCallback(async (files: FileWithPath[]) => {
    setUploading(true);
    try {
      await imagesApi.upload(projectId, files);
      notifications.show({
        title: '성공',
        message: `${files.length}개의 이미지가 업로드되었습니다`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      loadImages();
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '이미지 업로드에 실패했습니다',
        color: 'red',
      });
    } finally {
      setUploading(false);
    }
  }, [projectId]);

  const handleDeleteImage = async (imageId: number) => {
    try {
      await imagesApi.delete(imageId);
      notifications.show({
        title: '성공',
        message: '이미지가 삭제되었습니다',
        color: 'green',
      });
      loadImages();
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '이미지 삭제에 실패했습니다',
        color: 'red',
      });
    }
  };

  const handleAddClass = async () => {
    if (!project || !newClass.name.trim()) return;

    const updatedClasses = [
      ...project.classes,
      {
        id: Math.max(...project.classes.map((c) => c.id), -1) + 1,
        name: newClass.name,
        color: newClass.color,
      },
    ];

    try {
      await projectsApi.update(projectId, { classes: updatedClasses });
      setProject({ ...project, classes: updatedClasses });
      setNewClass({ name: '', color: '#4287f5' });
      closeClassModal();
      notifications.show({
        title: '성공',
        message: '클래스가 추가되었습니다',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '클래스 추가에 실패했습니다',
        color: 'red',
      });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await exportApi.export(projectId, exportFormat, true);
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name || 'export'}_${exportFormat}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      closeExportModal();
      notifications.show({
        title: '성공',
        message: '내보내기가 완료되었습니다',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '내보내기에 실패했습니다',
        color: 'red',
      });
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'annotated':
        return <Badge color="green" size="xs">완료</Badge>;
      case 'reviewed':
        return <Badge color="blue" size="xs">검토됨</Badge>;
      default:
        return <Badge color="gray" size="xs">대기중</Badge>;
    }
  };

  if (!project) {
    return (
      <AppShellWrapper>
        <Center h="100vh">
          <Loader size="lg" />
        </Center>
      </AppShellWrapper>
    );
  }

  return (
    <AppShellWrapper>
      <Box className={classes.container}>
        {/* Header */}
        <Box className={classes.header}>
          <Container size="xl">
            <Breadcrumbs mb="md" separator="›">
              <Anchor href="/" size="sm" c="dimmed">프로젝트</Anchor>
              <Text size="sm">{project.name}</Text>
            </Breadcrumbs>

            <Group justify="space-between" align="flex-start">
              <Box>
                <Title order={1} className={classes.title}>
                  {project.name}
                </Title>
                {project.description && (
                  <Text c="dimmed" size="sm" mt={4}>
                    {project.description}
                  </Text>
                )}
              </Box>
              <Group>
                <Button
                  variant="light"
                  leftSection={<IconDownload size={18} />}
                  onClick={openExportModal}
                >
                  내보내기
                </Button>
              </Group>
            </Group>
          </Container>
        </Box>

        {/* Tabs */}
        <Container size="xl" py="md">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="images" leftSection={<IconPhoto size={16} />}>
                이미지 ({images.length})
              </Tabs.Tab>
              <Tabs.Tab value="classes" leftSection={<IconPencil size={16} />}>
                클래스 ({project.classes.length})
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="images" pt="lg">
              {/* Upload Zone */}
              <Dropzone
                onDrop={handleUpload}
                accept={IMAGE_MIME_TYPE}
                loading={uploading}
                className={classes.dropzone}
                mb="xl"
              >
                <Group justify="center" gap="xl" style={{ minHeight: 120, pointerEvents: 'none' }}>
                  <Dropzone.Accept>
                    <IconUpload size={48} stroke={1.5} color="#0071ff" />
                  </Dropzone.Accept>
                  <Dropzone.Reject>
                    <IconX size={48} stroke={1.5} color="#ff6b6b" />
                  </Dropzone.Reject>
                  <Dropzone.Idle>
                    <IconCloudUpload size={48} stroke={1.5} color="#86868b" />
                  </Dropzone.Idle>
                  <Stack gap={4}>
                    <Text size="lg" fw={500}>
                      이미지를 드래그하거나 클릭하여 업로드
                    </Text>
                    <Text size="sm" c="dimmed">
                      PNG, JPG, JPEG, WebP 형식 지원
                    </Text>
                  </Stack>
                </Group>
              </Dropzone>

              {/* Image Grid */}
              {loading ? (
                <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} height={160} radius="lg" />
                  ))}
                </SimpleGrid>
              ) : images.length === 0 ? (
                <Box className={classes.emptyState}>
                  <IconPhoto size={48} stroke={1} color="#86868b" />
                  <Text size="lg" fw={500} mt="md">
                    이미지가 없습니다
                  </Text>
                  <Text size="sm" c="dimmed">
                    위 영역에 이미지를 드래그하여 업로드하세요
                  </Text>
                </Box>
              ) : (
                <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
                  {images.map((image) => (
                    <Card
                      key={image.id}
                      className={classes.imageCard}
                      p={0}
                    >
                      <Card.Section pos="relative">
                        <Image
                          src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${image.url}`}
                          alt={image.original_filename}
                          height={140}
                          fit="cover"
                        />
                        <Box className={classes.imageOverlay}>
                          <Button
                            size="xs"
                            variant="white"
                            onClick={() => router.push(`/projects/${projectId}/annotate?image=${image.id}`)}
                          >
                            어노테이션
                          </Button>
                        </Box>
                        <Box className={classes.imageStatus}>
                          {getStatusBadge(image.status)}
                        </Box>
                        <Menu position="bottom-end" withArrow>
                          <Menu.Target>
                            <ActionIcon
                              variant="subtle"
                              color="white"
                              className={classes.imageMenu}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={14} />}
                              onClick={() => handleDeleteImage(image.id)}
                            >
                              삭제
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Card.Section>
                      <Box p="xs">
                        <Text size="xs" truncate>
                          {image.original_filename}
                        </Text>
                      </Box>
                    </Card>
                  ))}
                </SimpleGrid>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="classes" pt="lg">
              <Group justify="flex-end" mb="md">
                <Button
                  leftSection={<IconPlus size={16} />}
                  variant="light"
                  onClick={() => {
                    setEditingClass(null);
                    setNewClass({ name: '', color: '#4287f5' });
                    openClassModal();
                  }}
                >
                  클래스 추가
                </Button>
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {project.classes.map((cls) => (
                  <Paper key={cls.id} p="md" radius="lg" withBorder>
                    <Group justify="space-between">
                      <Group gap="sm">
                        <ColorSwatch color={cls.color} size={24} />
                        <Text fw={500}>{cls.name}</Text>
                      </Group>
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconEdit size={14} />}
                            onClick={() => {
                              setEditingClass(cls);
                              setNewClass({ name: cls.name, color: cls.color });
                              openClassModal();
                            }}
                          >
                            수정
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={async () => {
                              const updatedClasses = project.classes.filter((c) => c.id !== cls.id);
                              await projectsApi.update(projectId, { classes: updatedClasses });
                              setProject({ ...project, classes: updatedClasses });
                            }}
                          >
                            삭제
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            </Tabs.Panel>
          </Tabs>
        </Container>
      </Box>

      {/* Class Modal */}
      <Modal
        opened={classModalOpened}
        onClose={closeClassModal}
        title={editingClass ? '클래스 수정' : '새 클래스'}
        centered
      >
        <Stack gap="md">
          <TextInput
            label="클래스 이름"
            placeholder="예: 사람, 차량, 동물"
            value={newClass.name}
            onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
            required
          />
          <ColorInput
            label="색상"
            value={newClass.color}
            onChange={(value) => setNewClass({ ...newClass, color: value })}
            format="hex"
            swatches={['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeClassModal}>
              취소
            </Button>
            <Button onClick={handleAddClass}>
              {editingClass ? '수정' : '추가'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Export Modal */}
      <Modal
        opened={exportModalOpened}
        onClose={closeExportModal}
        title="데이터 내보내기"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            내보내기 형식을 선택하세요
          </Text>
          <SimpleGrid cols={2} spacing="sm">
            {[
              { value: 'coco', label: 'COCO JSON' },
              { value: 'yolo', label: 'YOLO' },
              { value: 'yolo_seg', label: 'YOLO 세그멘테이션' },
              { value: 'voc', label: 'Pascal VOC' },
              { value: 'mask', label: '마스크 이미지' },
              { value: 'sam3', label: 'SAM3 학습용' },
            ].map((format) => (
              <Paper
                key={format.value}
                p="md"
                radius="md"
                withBorder
                className={classes.formatOption}
                data-active={exportFormat === format.value || undefined}
                onClick={() => setExportFormat(format.value)}
              >
                <Text size="sm" fw={500}>{format.label}</Text>
              </Paper>
            ))}
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeExportModal}>
              취소
            </Button>
            <Button onClick={handleExport} loading={exporting}>
              내보내기
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShellWrapper>
  );
}
