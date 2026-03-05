pipeline {
    agent any

    environment {
        AWS_REGION          = 'us-east-1'
        AWS_ACCOUNT_ID      = credentials('aws-account-id')
        ECR_REGISTRY        = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        ECR_FRONTEND_REPO   = 'taskmanager/frontend'
        ECR_BACKEND_REPO    = 'taskmanager/backend'
        ECS_CLUSTER         = 'taskmanager-cluster'
        ECS_FRONTEND_SVC    = 'taskmanager-frontend-service'
        ECS_BACKEND_SVC     = 'taskmanager-backend-service'
        IMAGE_TAG           = "${env.GIT_COMMIT?.take(7) ?: 'latest'}"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                echo "Branch: ${env.BRANCH_NAME} | Commit: ${env.GIT_COMMIT}"
                checkout scm
            }
        }

        stage('Install Dependencies') {
            parallel {
                stage('Backend') {
                    steps { dir('backend') { sh 'npm ci' } }
                }
                stage('Frontend') {
                    steps { dir('frontend') { sh 'npm ci' } }
                }
            }
        }

        stage('ECR Login') {
            steps {
                withAWS(credentials: 'aws-ecr-credentials', region: "${AWS_REGION}") {
                    sh 'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY'
                }
            }
        }

        stage('Build Images') {
            parallel {
                stage('Backend Image') {
                    steps {
                        dir('backend') {
                            sh '''
                                docker build \
                                  -t $ECR_REGISTRY/$ECR_BACKEND_REPO:$IMAGE_TAG \
                                  -t $ECR_REGISTRY/$ECR_BACKEND_REPO:latest \
                                  --label "git-commit=$GIT_COMMIT" .
                            '''
                        }
                    }
                }
                stage('Frontend Image') {
                    steps {
                        dir('frontend') {
                            sh '''
                                docker build \
                                  --build-arg VITE_API_URL=/api \
                                  -t $ECR_REGISTRY/$ECR_FRONTEND_REPO:$IMAGE_TAG \
                                  -t $ECR_REGISTRY/$ECR_FRONTEND_REPO:latest \
                                  --label "git-commit=$GIT_COMMIT" .
                            '''
                        }
                    }
                }
            }
        }

        stage('Push to ECR') {
            parallel {
                stage('Push Backend') {
                    steps {
                        sh '''
                            docker push $ECR_REGISTRY/$ECR_BACKEND_REPO:$IMAGE_TAG
                            docker push $ECR_REGISTRY/$ECR_BACKEND_REPO:latest
                        '''
                    }
                }
                stage('Push Frontend') {
                    steps {
                        sh '''
                            docker push $ECR_REGISTRY/$ECR_FRONTEND_REPO:$IMAGE_TAG
                            docker push $ECR_REGISTRY/$ECR_FRONTEND_REPO:latest
                        '''
                    }
                }
            }
        }

        stage('Deploy to ECS') {
            when { anyOf { branch 'main'; branch 'master' } }
            steps {
                withAWS(credentials: 'aws-ecr-credentials', region: "${AWS_REGION}") {
                    sh '''
                        aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_BACKEND_SVC --force-new-deployment --region $AWS_REGION
                        aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_FRONTEND_SVC --force-new-deployment --region $AWS_REGION
                        aws ecs wait services-stable --cluster $ECS_CLUSTER --services $ECS_BACKEND_SVC $ECS_FRONTEND_SVC --region $AWS_REGION
                        echo "Deployment complete: $IMAGE_TAG"
                    '''
                }
            }
        }
    }

    post {
        always {
            sh '''
                docker rmi $ECR_REGISTRY/$ECR_BACKEND_REPO:$IMAGE_TAG || true
                docker rmi $ECR_REGISTRY/$ECR_FRONTEND_REPO:$IMAGE_TAG || true
            '''
        }
        success { echo "SUCCESS: ${env.IMAGE_TAG} deployed" }
        failure { echo "FAILURE: pipeline failed" }
    }
}
