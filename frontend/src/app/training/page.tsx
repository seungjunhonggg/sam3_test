'use client';

import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Text,
  SimpleGrid,
  Card,
  Group,
  Badge,
  Button,
  Stack,
  Box,
  Progress,
  Select,
  NumberInput,
  Switch,
  Paper,
  Skeleton,
  ScrollArea,
  Code,
  Modal,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconCheck,
  IconX,
  IconBrain,
  IconRefresh,
} from '@tabler/icons-react';
import { AppShellWrapper } from '@/components/AppShell';
import { projectsApi, trainingApi, type Project, type TrainingRun } from '@/lib/api';
import classes from './page.module.css';

export default function TrainingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [trainingRuns, setTrainingRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [trainingModalOpened, { open: openTrainingModal, close: closeTrainingModal }] = useDisclosure(false);

  // Training config
  const [config, setConfig] = useState({
    batch_size: 4,
    learning_rate: 0.00001,
    num_epochs: 10,
    use_lora: true,
  });

  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const [logsInterval, setLogsInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadTrainingRuns();
    }
  }, [selectedProjectId]);

  useEffect(() => {
    return () => {
      if (logsInterval) clearInterval(logsInterval);
    };
  }, [logsInterval]);

  const loadProjects = async () => {
    try {
      const response = await projectsApi.list();
      setProjects(response.data);
      if (response.data.length > 0) {
        setSelectedProjectId(response.data[0].id.toString());
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrainingRuns = async () => {
    if (!selectedProjectId) return;
    try {
      const response = await trainingApi.listByProject(parseInt(selectedProjectId));
      setTrainingRuns(response.data);
    } catch (error) {
      console.error('Failed to load training runs:', error);
    }
  };

  const startTraining = async () => {
    if (!selectedProjectId) return;

    try {
      const response = await trainingApi.create(parseInt(selectedProjectId), config);
      notifications.show({
        title: '성공',
        message: '학습이 시작되었습니다',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      closeTrainingModal();
      loadTrainingRuns();

      // Start polling logs
      const interval = setInterval(async () => {
        try {
          const logsResponse = await trainingApi.getLogs(response.data.id);
          setLogs(logsResponse.data);

          const runResponse = await trainingApi.get(response.data.id);
          if (runResponse.data.status === 'completed' || runResponse.data.status === 'failed' || runResponse.data.status === 'cancelled') {
            clearInterval(interval);
            loadTrainingRuns();
          }
        } catch (error) {
          console.error('Failed to fetch logs:', error);
        }
      }, 2000);

      setLogsInterval(interval);
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '학습 시작에 실패했습니다',
        color: 'red',
      });
    }
  };

  const cancelTraining = async (runId: number) => {
    try {
      await trainingApi.cancel(runId);
      notifications.show({
        title: '성공',
        message: '학습이 취소되었습니다',
        color: 'green',
      });
      loadTrainingRuns();
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '학습 취소에 실패했습니다',
        color: 'red',
      });
    }
  };

  const applyModel = async (runId: number) => {
    try {
      await trainingApi.apply(runId);
      notifications.show({
        title: '성공',
        message: '모델이 적용되었습니다',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: '오류',
        message: '모델 적용에 실패했습니다',
        color: 'red',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge color="blue">학습 중</Badge>;
      case 'completed':
        return <Badge color="green">완료</Badge>;
      case 'failed':
        return <Badge color="red">실패</Badge>;
      case 'cancelled':
        return <Badge color="gray">취소됨</Badge>;
      default:
        return <Badge color="gray">대기 중</Badge>;
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
                  학습
                </Title>
                <Text c="dimmed" size="sm" mt={4}>
                  SAM3 모델 파인튜닝
                </Text>
              </Box>
              <Group>
                <Select
                  placeholder="프로젝트 선택"
                  value={selectedProjectId}
                  onChange={setSelectedProjectId}
                  data={projects.map((p) => ({ value: p.id.toString(), label: p.name }))}
                  w={200}
                />
                <Button
                  leftSection={<IconPlayerPlay size={18} />}
                  onClick={openTrainingModal}
                  disabled={!selectedProjectId}
                >
                  새 학습
                </Button>
              </Group>
            </Group>
          </Container>
        </Box>

        {/* Content */}
        <Container size="xl" py="lg">
          {loading ? (
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
              <Skeleton height={200} radius="lg" />
              <Skeleton height={200} radius="lg" />
            </SimpleGrid>
          ) : trainingRuns.length === 0 ? (
            <Box className={classes.emptyState}>
              <IconBrain size={64} stroke={1} color="#86868b" />
              <Title order={3} mt="lg" c="dimmed">
                학습 기록이 없습니다
              </Title>
              <Text c="dimmed" size="sm" mt="xs">
                프로젝트를 선택하고 새 학습을 시작하세요
              </Text>
              <Button
                mt="lg"
                leftSection={<IconPlayerPlay size={18} />}
                onClick={openTrainingModal}
                disabled={!selectedProjectId}
              >
                학습 시작
              </Button>
            </Box>
          ) : (
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
              {/* Training Runs */}
              <Stack gap="md">
                <Text fw={600}>학습 기록</Text>
                {trainingRuns.map((run) => (
                  <Card key={run.id} padding="lg" radius="lg" withBorder>
                    <Group justify="space-between" mb="md">
                      {getStatusBadge(run.status)}
                      <Text size="xs" c="dimmed">
                        {new Date(run.created_at).toLocaleString('ko-KR')}
                      </Text>
                    </Group>

                    <Group gap="xl" mb="md">
                      <Box>
                        <Text size="xs" c="dimmed">배치 사이즈</Text>
                        <Text size="sm" fw={500}>{run.config.batch_size}</Text>
                      </Box>
                      <Box>
                        <Text size="xs" c="dimmed">학습률</Text>
                        <Text size="sm" fw={500}>{run.config.learning_rate}</Text>
                      </Box>
                      <Box>
                        <Text size="xs" c="dimmed">에폭</Text>
                        <Text size="sm" fw={500}>{run.config.num_epochs}</Text>
                      </Box>
                      <Box>
                        <Text size="xs" c="dimmed">LoRA</Text>
                        <Text size="sm" fw={500}>{run.config.use_lora ? '사용' : '미사용'}</Text>
                      </Box>
                    </Group>

                    {run.status === 'running' && run.metrics && (
                      <Box mb="md">
                        <Group justify="space-between" mb={4}>
                          <Text size="xs" c="dimmed">진행률</Text>
                          <Text size="xs" c="dimmed">
                            에폭 {run.metrics.epoch || 0}/{run.config.num_epochs}
                          </Text>
                        </Group>
                        <Progress
                          value={(run.metrics.progress || 0) * 100}
                          size="sm"
                          radius="xl"
                          animated
                        />
                      </Box>
                    )}

                    <Group gap="sm">
                      {run.status === 'running' && (
                        <Button
                          variant="light"
                          color="red"
                          size="xs"
                          leftSection={<IconPlayerStop size={14} />}
                          onClick={() => cancelTraining(run.id)}
                        >
                          취소
                        </Button>
                      )}
                      {run.status === 'completed' && run.checkpoint_path && (
                        <Button
                          variant="light"
                          size="xs"
                          leftSection={<IconCheck size={14} />}
                          onClick={() => applyModel(run.id)}
                        >
                          모델 적용
                        </Button>
                      )}
                    </Group>
                  </Card>
                ))}
              </Stack>

              {/* Logs */}
              <Stack gap="md">
                <Group justify="space-between">
                  <Text fw={600}>학습 로그</Text>
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => {
                      const activeRun = trainingRuns.find((r) => r.status === 'running');
                      if (activeRun) {
                        trainingApi.getLogs(activeRun.id).then((res) => setLogs(res.data));
                      }
                    }}
                  >
                    새로고침
                  </Button>
                </Group>
                <Paper
                  p="md"
                  radius="lg"
                  withBorder
                  className={classes.logsContainer}
                >
                  <ScrollArea h={400}>
                    {logs.length > 0 ? (
                      <Stack gap={4}>
                        {logs.map((log, index) => (
                          <Code key={index} block className={classes.logLine}>
                            {log}
                          </Code>
                        ))}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed" ta="center" py="xl">
                        로그가 없습니다
                      </Text>
                    )}
                  </ScrollArea>
                </Paper>
              </Stack>
            </SimpleGrid>
          )}
        </Container>
      </Box>

      {/* Training Config Modal */}
      <Modal
        opened={trainingModalOpened}
        onClose={closeTrainingModal}
        title="새 학습 설정"
        centered
        size="md"
      >
        <Stack gap="md">
          <NumberInput
            label="배치 사이즈"
            description="GPU 메모리에 따라 조절하세요"
            value={config.batch_size}
            onChange={(value) => setConfig({ ...config, batch_size: value as number })}
            min={1}
            max={32}
          />

          <NumberInput
            label="학습률"
            description="일반적으로 1e-5를 권장합니다"
            value={config.learning_rate}
            onChange={(value) => setConfig({ ...config, learning_rate: value as number })}
            min={0.0000001}
            max={0.01}
            step={0.000001}
            decimalScale={7}
          />

          <NumberInput
            label="에폭"
            description="전체 데이터셋을 몇 번 학습할지 설정합니다"
            value={config.num_epochs}
            onChange={(value) => setConfig({ ...config, num_epochs: value as number })}
            min={1}
            max={100}
          />

          <Switch
            label="LoRA 사용"
            description="메모리 효율적인 파인튜닝을 위해 권장됩니다"
            checked={config.use_lora}
            onChange={(e) => setConfig({ ...config, use_lora: e.currentTarget.checked })}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeTrainingModal}>
              취소
            </Button>
            <Button onClick={startTraining}>
              학습 시작
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShellWrapper>
  );
}
