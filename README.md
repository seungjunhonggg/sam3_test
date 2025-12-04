# SAM3 라벨링 도구

Meta의 Segment Anything Model 3 (SAM3)를 활용한 AI 기반 이미지 라벨링 도구입니다. Roboflow에서 영감을 받은 현대적인 웹 인터페이스로, 텍스트, 포인트, 박스 프롬프트를 사용한 자동 세그멘테이션을 지원합니다.

## 주요 기능

### 라벨링 도구
- **폴리곤 도구**: 정밀한 어노테이션을 위한 수동 폴리곤 그리기
- **바운딩 박스 도구**: 빠른 사각형 어노테이션
- **브러시 도구**: 이미지에 직접 마스크 페인팅
- **SAM3 포인트**: 객체를 클릭하면 SAM3가 자동으로 세그멘테이션
- **SAM3 박스**: 박스를 그리면 해당 영역 내 객체를 세그멘테이션
- **SAM3 텍스트**: 자연어로 객체를 설명하여 세그멘테이션 (SAM3의 open-vocabulary 기능)

### 프로젝트 관리
- 여러 라벨링 프로젝트 생성 및 관리
- 색상과 함께 커스텀 클래스 라벨 정의
- 어노테이션 진행 상황 추적 (대기중, 완료, 검토됨)
- 드래그 앤 드롭으로 여러 이미지 업로드

### 내보내기 형식
- **COCO JSON**: 표준 COCO 형식 어노테이션
- **YOLO**: 객체 탐지용 YOLO 형식
- **YOLO 세그멘테이션**: 폴리곤 좌표 포함 YOLO 형식
- **Pascal VOC**: XML 형식 어노테이션
- **마스크 이미지**: 바이너리 마스크 PNG
- **SAM3 학습용**: SAM3 파인튜닝에 바로 사용 가능한 형식

### 파인튜닝
- UI에서 직접 라벨링한 데이터로 SAM3 학습
- 학습 파라미터 설정 (배치 사이즈, 학습률, 에폭)
- LoRA를 활용한 효율적인 파인튜닝 지원
- 실시간 학습 로그 및 진행 상황 확인
- 파인튜닝된 모델을 바로 적용하여 더 나은 세그멘테이션

## 시스템 요구사항

### GPU 사용 시 (권장)
- Python 3.12 이상
- CUDA 12.6 이상
- PyTorch 2.7 이상
- 16GB 이상 VRAM의 NVIDIA GPU (전체 SAM3 모델용)

### CPU 사용 시 (제한된 기능)
- Python 3.12 이상
- PyTorch 2.7 이상
- 참고: GPU 없이는 SAM3 추론 속도가 느립니다

## 설치 방법

### 방법 1: Docker (권장)

```bash
# NVIDIA GPU 사용 시
docker-compose up -d

# CPU만 사용 (개발용)
docker-compose --profile cpu up -d
```

### 방법 2: 수동 설치

1. **저장소 복제**
```bash
git clone <repository-url>
cd sam3-labeling-tool
```

2. **SAM3 설치**
```bash
# conda 환경 생성
conda create -n sam3 python=3.12
conda activate sam3

# CUDA 지원 PyTorch 설치
pip install torch==2.7.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

# SAM3 복제 및 설치
git clone https://github.com/facebookresearch/sam3.git
cd sam3
pip install -e .
cd ..
```

3. **HuggingFace 인증**
```bash
# https://huggingface.co/facebook/sam3 에서 접근 권한 요청
huggingface-cli login
```

4. **백엔드 설치**
```bash
cd backend
pip install -r requirements.txt
```

5. **프론트엔드 설치**
```bash
cd frontend
npm install
```

6. **애플리케이션 실행**
```bash
# 터미널 1: 백엔드
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 터미널 2: 프론트엔드 (개발 모드)
cd frontend
npm run dev
```

7. **애플리케이션 열기**
```
http://localhost:3000
```

## 사용 방법

### 프로젝트 생성

1. 프로젝트 페이지에서 "새 프로젝트" 클릭
2. 프로젝트 이름과 설명 입력
3. 어노테이션 유형 선택 (인스턴스 세그멘테이션, 시맨틱, 바운딩 박스)
4. 기본 클래스가 생성됨 - 나중에 커스터마이징 가능

### 이미지 업로드

1. 프로젝트 열기
2. 이미지를 드래그 앤 드롭하거나 클릭하여 파일 선택
3. 지원 형식: PNG, JPG, JPEG, WebP, BMP

### 이미지 어노테이션

1. 이미지에서 "어노테이션" 클릭
2. 우측 패널에서 클래스 선택
3. 도구 선택:
   - **V** - 선택: 어노테이션 클릭하여 선택
   - **P** - 폴리곤: 클릭하여 점 추가, Enter로 완료
   - **B** - 박스: 클릭하고 드래그하여 박스 그리기
   - **S** - SAM3 포인트: 객체를 클릭하여 자동 세그멘테이션
   - **X** - SAM3 박스: 박스를 그려서 자동 세그멘테이션
   - **T** - SAM3 텍스트: 설명을 입력하여 open-vocabulary 세그멘테이션

### 키보드 단축키

| 키 | 동작 |
|-----|--------|
| V | 선택 도구 |
| P | 폴리곤 도구 |
| B | 바운딩 박스 도구 |
| S | SAM3 포인트 도구 |
| X | SAM3 박스 도구 |
| T | SAM3 텍스트 도구 |
| Enter | 폴리곤 완료 |
| Escape | 현재 작업 취소 |
| Delete | 선택한 어노테이션 삭제 |
| Ctrl+Z | 실행 취소 |
| Ctrl+Shift+Z | 다시 실행 |
| 좌/우 화살표 | 이전/다음 이미지 |

### SAM3 파인튜닝

1. 프로젝트의 학습 페이지로 이동
2. "새 학습" 클릭
3. 학습 파라미터 설정:
   - **배치 사이즈**: 4 (GPU 메모리에 따라 조절)
   - **학습률**: 1e-5
   - **에폭**: 10
   - **LoRA 사용**: 효율적인 학습을 위해 권장
4. "학습 시작" 클릭
5. 실시간으로 진행 상황 모니터링
6. 완료되면 "모델 적용"을 클릭하여 파인튜닝된 모델 사용

### 데이터 내보내기

1. 프로젝트 열기
2. "내보내기" 클릭
3. 형식 선택 (COCO, YOLO 등)
4. 이미지 포함 여부 선택
5. 내보낸 파일 다운로드

## API 레퍼런스

백엔드는 RESTful API를 제공합니다:

### 프로젝트
- `GET /api/projects` - 모든 프로젝트 목록
- `POST /api/projects` - 프로젝트 생성
- `GET /api/projects/{id}` - 프로젝트 상세 정보
- `PUT /api/projects/{id}` - 프로젝트 수정
- `DELETE /api/projects/{id}` - 프로젝트 삭제

### 이미지
- `POST /api/images/upload/{project_id}` - 이미지 업로드
- `GET /api/images/project/{project_id}` - 프로젝트 이미지 목록
- `GET /api/images/{id}` - 이미지 상세 정보
- `DELETE /api/images/{id}` - 이미지 삭제

### 어노테이션
- `GET /api/annotations/image/{image_id}` - 이미지 어노테이션 조회
- `POST /api/annotations` - 어노테이션 생성
- `POST /api/annotations/bulk` - 여러 어노테이션 일괄 생성
- `PUT /api/annotations/{id}` - 어노테이션 수정
- `DELETE /api/annotations/{id}` - 어노테이션 삭제

### 세그멘테이션 (SAM3)
- `POST /api/segmentation/set-image/{image_id}` - 현재 이미지 설정
- `POST /api/segmentation/text` - 텍스트 프롬프트로 세그멘테이션
- `POST /api/segmentation/points` - 포인트 프롬프트로 세그멘테이션
- `POST /api/segmentation/box` - 박스 프롬프트로 세그멘테이션
- `POST /api/segmentation/auto` - 모든 객체 자동 세그멘테이션

### 학습
- `GET /api/training/project/{project_id}` - 학습 실행 목록
- `POST /api/training` - 새 학습 실행 시작
- `GET /api/training/{id}/logs` - 학습 로그 조회
- `POST /api/training/{id}/cancel` - 학습 취소
- `POST /api/training/{id}/apply` - 파인튜닝된 모델 적용

### 내보내기
- `GET /api/export/formats` - 사용 가능한 내보내기 형식 목록
- `POST /api/export/project/{project_id}` - 프로젝트 데이터 내보내기

## 프로젝트 구조

```
sam3-labeling-tool/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py         # 설정
│   │   ├── database.py       # 데이터베이스 모델
│   │   └── main.py           # FastAPI 애플리케이션
│   ├── routers/
│   │   ├── projects.py       # 프로젝트 엔드포인트
│   │   ├── images.py         # 이미지 엔드포인트
│   │   ├── annotations.py    # 어노테이션 엔드포인트
│   │   ├── segmentation.py   # SAM3 엔드포인트
│   │   ├── training.py       # 학습 엔드포인트
│   │   └── export.py         # 내보내기 엔드포인트
│   ├── services/
│   │   ├── sam3_service.py   # SAM3 모델 서비스
│   │   └── training_service.py # 학습 서비스
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # React 컴포넌트
│   │   ├── pages/            # 페이지 컴포넌트
│   │   ├── store/            # Zustand 상태 관리
│   │   ├── utils/            # API 유틸리티
│   │   └── styles/           # CSS 스타일
│   ├── package.json
│   └── vite.config.ts
├── data/                     # 데이터 저장소
├── models/                   # 모델 체크포인트
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## 문제 해결

### SAM3가 로드되지 않는 경우
- HuggingFace에서 SAM3 접근 권한을 요청하고 승인받았는지 확인
- 토큰으로 `huggingface-cli login` 실행
- GPU 메모리 확인 (SAM3는 약 16GB VRAM 필요)

### 학습 실패 시
- 최소 5개 이상의 어노테이션된 이미지가 있는지 확인
- GPU 메모리 부족 시 배치 사이즈 줄이기
- 학습 로그에서 구체적인 오류 확인

### 세그멘테이션이 느린 경우
- 실시간 세그멘테이션을 위해서는 GPU 필요
- CPU 모드도 작동하지만 상당히 느림

## 라이선스

이 프로젝트는 교육 및 연구 목적입니다. SAM3 모델은 Meta의 라이선스 하에 배포됩니다 - 자세한 내용은 [facebook/sam3](https://github.com/facebookresearch/sam3)를 참조하세요.

## 감사의 글

- [Meta AI - SAM3](https://github.com/facebookresearch/sam3)
- [Roboflow](https://roboflow.com) - UI/UX 영감
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://reactjs.org/)
