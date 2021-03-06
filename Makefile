.PHONY: install docker-build docker-push docker-pull

install:
	virtualenv -p /usr/bin/python3 venv3
	. venv3/bin/activate; pip install -r requirements.txt

	mkdir -p  ./static/images/
	wget https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip -O static/master.zip

	cd ./static && unzip master.zip

	npm install jade --save
 

build: jade 
	@echo "\n ---------------------------"
	@echo " * Building botapad   "
	@echo " ---------------------------\n"
	cd ../application/src/ && make build
	cp -r ../application/src/static/bower_components/polymer static/
	cp ../application/src/static/*.html static/
	cp ../application/src/static/*.js static/

jade:
	@echo "\n ---------------------------"
	@echo " * Building flask templates"
	@echo " ---------------------------\n"
	cd ./templates && node ../node_modules/jade/bin/jade.js -P *.jade


rundev: 
	. venv3/bin/activate; export APP_DEBUG=false; export FLASK_APP=botapadapp.py ;export FLASK_DEBUG=1; flask run --port 5002


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
