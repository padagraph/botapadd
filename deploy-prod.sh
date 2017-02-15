#!/bin/bash

# Launches a development instance using Gunicorn on port 80
# Reads from docker-compose.yml only

PROJECT="botapadd-prod"

docker-compose -p $PROJECT -f docker-compose.yml -f up --build -d
docker-compose -p $PROJECT logs -f