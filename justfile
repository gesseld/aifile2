# Development Commands
install:
    #!/usr/bin/env bash
    npm install
    cd frontend && npm install
    cd backend && pip install -r requirements.txt

dev:
    #!/usr/bin/env bash
    docker-compose -f backend/docker-compose.yml -f frontend/docker-compose.yml up

lint:
    #!/usr/bin/env bash
    npm run lint
    cd frontend && npm run lint

test:
    #!/usr/bin/env bash
    npm test
    cd frontend && npm test

# Docker Operations
build:
    #!/usr/bin/env bash
    docker-compose -f backend/docker-compose.yml -f frontend/docker-compose.yml build

clean:
    #!/usr/bin/env bash
    docker-compose -f backend/docker-compose.yml -f frontend/docker-compose.yml down
    docker system prune -f
