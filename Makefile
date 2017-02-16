.PHONY: install

install: 
	cd /var/padagraph-botapadd/ && \
	mkdir -p  ./static/images/ && \
	pip install -r requirements.txt && \
	pwd && ll && \
	wget https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip -O ./static/master.zip && \
	pwd && ll . && \
	cd ./static && unzip master.zip