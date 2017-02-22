.PHONY: install docker-build docker-push

install: 
	mkdir -p  ./static/images/

	pip install -r requirements.txt

	wget https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip -O static/master.zip

	cd ./static && unzip master.zip


docker-build:
	@echo "\n --------------------"
	@echo " * Building Docker images"
	@echo " --------------------\n"
	# mkdir -p  ./static/images/
	# wget https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip -O static/master.zip
	# cd ./static && unzip -o master.zip
	docker-compose -f docker-compose.yml build

docker-push:
	@echo "\n --------------------"
	@echo " * Pushing images to PDG registry"
	@echo " --------------------\n"
	docker-compose -f docker-compose.yml push