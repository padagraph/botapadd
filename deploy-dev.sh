#!/bin/bash

# Launches a development instance using Flask on port 5000
# Reads from docker-compose.yml + docker-compose.override.yml

PROJECT="botapadd-dev"

docker-compose up --build --force-recreate -d
docker-compose logs -ft