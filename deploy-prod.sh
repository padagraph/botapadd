#!/bin/bash

# Launches a production instance using Gunicorn on port 81
# Reads from docker-compose.yml only

PROJECT="botapadd-prod"

#docker-compose -f docker-compose.yml pull
docker-compose -f docker-compose.yml up --no-build --force-recreate -d
docker-compose logs -ft
