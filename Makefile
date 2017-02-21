.PHONY: install

install: 
	mkdir -p  ./static/images/

	pip install -r requirements.txt

	wget https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip -O static/master.zip

	cd ./static && unzip master.zip


docker:
	mkdir -p  ./static/images/
	wget https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip -O static/master.zip
	cd ./static && unzip master.zip