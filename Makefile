.PHONY: install docker-build docker-push docker-pull

install:


	mkdir -p  ./static/images/

	pip install -r requirements.txt

	wget https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip -O static/master.zip

	cd ./static && unzip master.zip

	npm install jade --save
 


jade:
	@echo "\n ---------------------------"
	@echo " * Building flask templates"
	@echo " ---------------------------\n"

	#cd ./templates && pypugjs  *.jade
	cd ./templates && node ../node_modules/jade/bin/jade.js -P *.jade




docker-build:
	@echo "\n --------------------"
	@echo " * Building Docker images"
	@echo " --------------------\n"
	docker-compose -f docker-compose.yml build


docker-push:
	@echo "\n --------------------"
	@echo " * Pushing images to PDG registry"
	@echo " --------------------\n"
	docker-compose -f docker-compose.yml push


docker-pull:
	@echo "\n --------------------"
	@echo " * Pulling images from PDG registry"
	@echo " --------------------\n"
	docker-compose -f docker-compose.yml pull