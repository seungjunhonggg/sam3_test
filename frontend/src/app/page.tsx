'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Title,
  Text,
  SimpleGrid,
  Card,
  Group,
  Badge,
  Button,
  ActionIcon,
  Menu,
  Stack,
  Box,
  TextInput,
  Modal,
  Textarea,
  Select,
  ColorSwatch,
  Progress,
  Skeleton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconDotsVertical,
  IconTrash,
  IconEdit,
  IconCheck,
  IconSearch,
  IconFolder,
} from '@tabler/icons-react';
import { AppShellWrapper } from '@/components/AppShell';
import { projectsApi, type Project, type ClassConfig } from '@/lib/api';
import classes from './page.module.css';

const DEFAULT_CLASSES: ClassConfig[] = [
  { id: 0, name: '객체', color: '#FF6B6B' },
  { id: 1, name: '사람', color: '#4ECDC4' },
  { id: 2, name: '차량', color: '#45B7D1' },
  { id: 3, name: '동물', color: '#96CEB4' },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [opened, { open, close }] = useDisclosure(false);

  // New project form
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    annotation_type: 'instance' as 'instance' | 'semantic' | 'bbox',
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await projectsApi.list();
      setProjects(response.data);
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '프로젝트 목록을 불러올 수 없습니다',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      notifications.show({
        title: '오류',
        message: '프로젝트 이름을 입력해주세요',
        color: 'red',
      });
      return;
    }

    try {
      await projectsApi.create({
        ...newProject,
        classes: DEFAULT_CLASSES,
      });
      notifications.show({
        title: '성공',
        message: '프로젝트가 생성되었습니다',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      close();
      setNewProject({ name: '', description: '', annotation_type: 'instance' });
      loadProjects();
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '프로젝트 생성에 실패했습니다',
        color: 'red',
      });
    }
  };

  const handleDeleteProject = async (id: number) => {
    try {
      await projectsApi.delete(id);
      notifications.show({
        title: '성공',
        message: '프로젝트가 삭제되었습니다',
        color: 'green',
      });
      loadProjects();
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '프로젝트 삭제에 실패했습니다',
        color: 'red',
      });
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAnnotationTypeLabel = (type: string) => {
    switch (type) {
      case 'instance':
        return '인스턴스 세그멘테이션';
      case 'semantic':
        return '시맨틱 세그멘테이션';
      case 'bbox':
        return '바운딩 박스';
      default:
        return type;
    }
  };

  return (
    <AppShellWrapper>
      <Box className={classes.container}>
        {/* Header */}
        <Box className={classes.header}>
          <Container size="xl">
            <Group justify="space-between" align="center">
              <Box>
                <Title order={1} className={classes.title}>
                  프로젝트
                </Title>
                <Text c="dimmed" size="sm" mt={4}>
                  SAM3를 활용한 AI 이미지 라벨링
                </Text>
              </Box>
              <Button
                leftSection={<IconPlus size={18} />}
                radius="md"
                onClick={open}
                className={classes.createButton}
              >
                새 프로젝트
              </Button>
            </Group>
          </Container>
        </Box>

        {/* Search */}
        <Container size="xl" py="md">
          <TextInput
            placeholder="프로젝트 검색..."
            leftSection={<IconSearch size={18} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            radius="md"
            size="md"
            className={classes.searchInput}
          />
        </Container>

        {/* Project Grid */}
        <Container size="xl" pb="xl">
          {loading ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={200} radius="lg" />
              ))}
            </SimpleGrid>
          ) : filteredProjects.length === 0 ? (
            <Box className={classes.emptyState}>
              <IconFolder size={64} stroke={1} color="#86868b" />
              <Title order={3} mt="lg" c="dimmed">
                {searchQuery ? '검색 결과가 없습니다' : '프로젝트가 없습니다'}
              </Title>
              <Text c="dimmed" size="sm" mt="xs">
                {searchQuery
                  ? '다른 검색어로 시도해보세요'
                  : '새 프로젝트를 만들어 시작하세요'}
              </Text>
              {!searchQuery && (
                <Button
                  mt="lg"
                  leftSection={<IconPlus size={18} />}
                  variant="light"
                  onClick={open}
                >
                  프로젝트 만들기
                </Button>
              )}
            </Box>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className={classes.projectCard}
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <Group justify="space-between" mb="md">
                    <Badge
                      variant="light"
                      color="blue"
                      size="sm"
                      radius="sm"
                    >
                      {getAnnotationTypeLabel(project.annotation_type)}
                    </Badge>
                    <Menu position="bottom-end" withArrow>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}/settings`);
                          }}
                        >
                          수정
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id);
                          }}
                        >
                          삭제
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>

                  <Title order={4} className={classes.projectName}>
                    {project.name}
                  </Title>

                  {project.description && (
                    <Text size="sm" c="dimmed" lineClamp={2} mt="xs">
                      {project.description}
                    </Text>
                  )}

                  <Group mt="md" gap="xs">
                    {project.classes?.slice(0, 4).map((cls) => (
                      <ColorSwatch
                        key={cls.id}
                        color={cls.color}
                        size={16}
                        withShadow={false}
                      />
                    ))}
                    {project.classes && project.classes.length > 4 && (
                      <Text size="xs" c="dimmed">
                        +{project.classes.length - 4}
                      </Text>
                    )}
                  </Group>

                  <Box mt="lg">
                    <Group justify="space-between" mb={4}>
                      <Text size="xs" c="dimmed">
                        진행률
                      </Text>
                      <Text size="xs" c="dimmed">
                        {project.annotated_count || 0}/{project.image_count || 0}
                      </Text>
                    </Group>
                    <Progress
                      value={
                        project.image_count
                          ? ((project.annotated_count || 0) / project.image_count) * 100
                          : 0
                      }
                      size="sm"
                      radius="xl"
                    />
                  </Box>
                </Card>
              ))}
            </SimpleGrid>
          )}
        </Container>
      </Box>

      {/* Create Project Modal */}
      <Modal
        opened={opened}
        onClose={close}
        title="새 프로젝트"
        size="md"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="프로젝트 이름"
            placeholder="예: 의료 이미지 분석"
            value={newProject.name}
            onChange={(e) =>
              setNewProject({ ...newProject, name: e.target.value })
            }
            required
          />

          <Textarea
            label="설명"
            placeholder="프로젝트에 대한 간단한 설명"
            value={newProject.description}
            onChange={(e) =>
              setNewProject({ ...newProject, description: e.target.value })
            }
            minRows={3}
          />

          <Select
            label="어노테이션 유형"
            data={[
              { value: 'instance', label: '인스턴스 세그멘테이션' },
              { value: 'semantic', label: '시맨틱 세그멘테이션' },
              { value: 'bbox', label: '바운딩 박스' },
            ]}
            value={newProject.annotation_type}
            onChange={(value) =>
              setNewProject({
                ...newProject,
                annotation_type: value as 'instance' | 'semantic' | 'bbox',
              })
            }
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={close}>
              취소
            </Button>
            <Button onClick={handleCreateProject}>생성</Button>
          </Group>
        </Stack>
      </Modal>
    </AppShellWrapper>
  );
}
