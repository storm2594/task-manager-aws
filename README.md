# TaskFlow — Task Manager

A production-ready Task Management SaaS application built for **AWS ECS Fargate** deployment with a 3-tier architecture.

**Stack:** React + Vite + TailwindCSS | Node.js + Express | PostgreSQL (RDS)

---

## Project Structure

```
task-manager-app/
├── frontend/                  # React + Vite + TailwindCSS
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── context/           # AuthContext (JWT)
│   │   ├── hooks/             # useTasks hook
│   │   ├── pages/             # Login, Register, Dashboard
│   │   └── utils/             # Axios API client
│   ├── Dockerfile             # Multi-stage: Node build → Nginx serve
│   └── nginx.conf             # SPA routing + reverse proxy
├── backend/                   # Express REST API
│   ├── src/
│   │   ├── config/            # DB pool + Winston logger
│   │   ├── controllers/       # auth + tasks business logic
│   │   ├── middleware/        # JWT auth + error handler
│   │   └── routes/            # /api/auth  /api/tasks
│   └── Dockerfile             # Node 20 Alpine
├── database/
│   └── schema.sql             # PostgreSQL DDL (RDS-compatible)
├── docker-compose.yml         # Local dev: frontend + backend + postgres
├── Jenkinsfile                # CI/CD → ECR → ECS
└── README.md
```

---

## Architecture

```
Internet
    │
    ▼
Application Load Balancer (public, HTTPS)
    │                    │
    ▼                    ▼
ECS Fargate          ECS Fargate
Frontend Service     Backend Service
(Nginx on port 80)   (Node on port 5000)
                          │
                          ▼
                    Amazon RDS PostgreSQL
                    (private subnet)
```

CloudWatch log groups collect stdout from all containers automatically.

---

## Local Development (Docker Compose)

```bash
# 1. Clone repo
git clone <your-repo-url>
cd task-manager-app

# 2. Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start all services
docker compose up --build

# App running at:
#   Frontend → http://localhost:3000
#   Backend  → http://localhost:5000
#   Database → localhost:5432
```

---

## API Reference

### Auth
| Method | Endpoint              | Body                              | Auth |
|--------|-----------------------|-----------------------------------|------|
| POST   | /api/auth/register    | `{name, email, password}`         | No   |
| POST   | /api/auth/login       | `{email, password}`               | No   |
| GET    | /api/auth/me          | —                                 | Yes  |

### Tasks
| Method | Endpoint              | Body / Query                      | Auth |
|--------|-----------------------|-----------------------------------|------|
| GET    | /api/tasks            | `?status=pending\|completed`      | Yes  |
| POST   | /api/tasks            | `{title, description?}`           | Yes  |
| PUT    | /api/tasks/:id        | `{title?, description?, status?}` | Yes  |
| DELETE | /api/tasks/:id        | —                                 | Yes  |
| GET    | /health               | —                                 | No   |

JWT token must be passed as: `Authorization: Bearer <token>`

---

## AWS ECS Deployment Guide

### Prerequisites

- AWS CLI configured with sufficient IAM permissions
- Docker installed locally
- AWS account ID handy (`aws sts get-caller-identity`)

---

### Step 1 — Create ECR Repositories

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws ecr create-repository --repository-name taskmanager/backend  --region $AWS_REGION
aws ecr create-repository --repository-name taskmanager/frontend --region $AWS_REGION
```

---

### Step 2 — Create RDS PostgreSQL

```bash
# Create a DB subnet group (use your private subnet IDs)
aws rds create-db-subnet-group \
  --db-subnet-group-name taskmanager-db-subnet \
  --db-subnet-group-description "TaskManager DB subnets" \
  --subnet-ids subnet-XXXX subnet-YYYY

# Create RDS instance (db.t3.micro = ~$13/month)
aws rds create-db-instance \
  --db-instance-identifier taskmanager-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16.3 \
  --master-username taskmanager \
  --master-user-password YourSecurePassword123! \
  --allocated-storage 20 \
  --db-name taskmanager \
  --db-subnet-group-name taskmanager-db-subnet \
  --no-publicly-accessible \
  --storage-encrypted \
  --backup-retention-period 7
```

Wait for the instance to be available, then get the endpoint:
```bash
aws rds describe-db-instances \
  --db-instance-identifier taskmanager-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

Run schema:
```bash
psql -h <RDS_ENDPOINT> -U taskmanager -d taskmanager -f database/schema.sql
```

---

### Step 3 — Build & Push Docker Images

```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push backend
docker build -t $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/taskmanager/backend:latest ./backend
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/taskmanager/backend:latest

# Build and push frontend
docker build -t $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/taskmanager/frontend:latest ./frontend
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/taskmanager/frontend:latest
```

---

### Step 4 — Create ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name taskmanager-cluster \
  --capacity-providers FARGATE \
  --region $AWS_REGION
```

---

### Step 5 — Create ECS Task Definitions

**Backend task definition** (`backend-task-def.json`):
```json
{
  "family": "taskmanager-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "backend",
    "image": "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/taskmanager/backend:latest",
    "portMappings": [{ "containerPort": 5000, "protocol": "tcp" }],
    "environment": [
      { "name": "NODE_ENV",      "value": "production" },
      { "name": "PORT",          "value": "5000" },
      { "name": "DB_HOST",       "value": "<RDS_ENDPOINT>" },
      { "name": "DB_PORT",       "value": "5432" },
      { "name": "DB_USER",       "value": "taskmanager" },
      { "name": "DB_NAME",       "value": "taskmanager" },
      { "name": "DB_SSL",        "value": "true" },
      { "name": "DB_PASSWORD",   "value": "YourSecurePassword123!" },
      { "name": "JWT_SECRET",    "value": "your-production-jwt-secret" }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group":         "/ecs/taskmanager-backend",
        "awslogs-region":        "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:5000/health || exit 1"],
      "interval": 30, "timeout": 10, "retries": 3
    }
  }]
}
```

```bash
aws ecs register-task-definition --cli-input-json file://backend-task-def.json
```

Repeat similarly for the **frontend** task definition (port 80, image `taskmanager/frontend`).

---

### Step 6 — Create Application Load Balancer

```bash
# Create ALB (use your public subnet IDs)
aws elbv2 create-load-balancer \
  --name taskmanager-alb \
  --subnets subnet-PUBLIC1 subnet-PUBLIC2 \
  --security-groups sg-XXXX \
  --type application

# Create target groups
aws elbv2 create-target-group \
  --name tg-frontend \
  --protocol HTTP --port 80 \
  --target-type ip \
  --vpc-id vpc-XXXX \
  --health-check-path /health

aws elbv2 create-target-group \
  --name tg-backend \
  --protocol HTTP --port 5000 \
  --target-type ip \
  --vpc-id vpc-XXXX \
  --health-check-path /health
```

Create listener rules:
- `/api/*` → forward to `tg-backend`
- `/*`     → forward to `tg-frontend`

---

### Step 7 — Create ECS Services

```bash
# Backend service
aws ecs create-service \
  --cluster taskmanager-cluster \
  --service-name taskmanager-backend-service \
  --task-definition taskmanager-backend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-PRIVATE1,subnet-PRIVATE2],securityGroups=[sg-BACKEND],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...:tg-backend,containerName=backend,containerPort=5000"

# Frontend service (same pattern, port 80, public subnets)
aws ecs create-service \
  --cluster taskmanager-cluster \
  --service-name taskmanager-frontend-service \
  --task-definition taskmanager-frontend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-PRIVATE1,subnet-PRIVATE2],securityGroups=[sg-FRONTEND],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...:tg-frontend,containerName=frontend,containerPort=80"
```

---

### Step 8 — CloudWatch Log Groups

```bash
aws logs create-log-group --log-group-name /ecs/taskmanager-backend  --region $AWS_REGION
aws logs create-log-group --log-group-name /ecs/taskmanager-frontend --region $AWS_REGION

# Set retention
aws logs put-retention-policy --log-group-name /ecs/taskmanager-backend  --retention-in-days 30
aws logs put-retention-policy --log-group-name /ecs/taskmanager-frontend --retention-in-days 30
```

---

### Security Group Recommendations

| SG Name       | Inbound                             | Outbound |
|---------------|-------------------------------------|----------|
| sg-alb        | 80, 443 from 0.0.0.0/0              | All      |
| sg-frontend   | 80 from sg-alb                      | All      |
| sg-backend    | 5000 from sg-alb + sg-frontend      | All      |
| sg-rds        | 5432 from sg-backend                | None     |

---

## Environment Variables Reference

### Backend
| Variable         | Description                        | Required |
|------------------|------------------------------------|----------|
| PORT             | Server port (default: 5000)        | No       |
| DB_HOST          | RDS endpoint or localhost          | Yes      |
| DB_PORT          | PostgreSQL port (default: 5432)    | No       |
| DB_USER          | Database username                  | Yes      |
| DB_PASSWORD      | Database password                  | Yes      |
| DB_NAME          | Database name                      | Yes      |
| DB_SSL           | Enable SSL for RDS (`true`)        | No       |
| JWT_SECRET       | Secret for signing JWTs            | Yes      |
| JWT_EXPIRES_IN   | Token expiry (default: 7d)         | No       |
| ALLOWED_ORIGINS  | CORS origins (comma-separated)     | No       |

### Frontend
| Variable       | Description                         |
|----------------|-------------------------------------|
| VITE_API_URL   | Backend base URL (empty = same host)|

---

## CI/CD with Jenkins

1. Add AWS credentials to Jenkins as `aws-ecr-credentials`
2. Set `AWS_ACCOUNT_ID` as a Jenkins global environment variable
3. Create a pipeline job pointing to your Git repo
4. The `Jenkinsfile` will automatically build, push, and deploy on pushes to `main`

---

## Cost Estimate (us-east-1, minimal)

| Service             | Config                   | Est. Cost/month |
|---------------------|--------------------------|-----------------|
| ECS Fargate (2 svc) | 0.25 vCPU / 0.5 GB each  | ~$10            |
| RDS PostgreSQL      | db.t3.micro, 20 GB       | ~$15            |
| ALB                 | 1 ALB, low traffic       | ~$17            |
| ECR                 | <1 GB storage            | ~$0.10          |
| CloudWatch          | Basic logs               | ~$2             |
| **Total**           |                          | **~$44/month**  |

