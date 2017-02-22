FROM python:2.7
LABEL maintainer "Christopher Burroughs <chris.burroughs@protonmail.ch>, ynnk"

# Setup application home
ENV APP_HOME /var/padagraph/botapadd
RUN mkdir -p $APP_HOME $APP_HOME/log $APP_HOME/static $APP_HOME/static/images
WORKDIR $APP_HOME
ENV PYTHONPATH=$APP_HOME/screenshot/:/usr/lib/python2.7/dist-packages/

COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

# Copy those after pip install to avoid rebuilding layers
COPY botapad.py botapadapp.py ./
#COPY static/ static/
ADD https://github.com/Semantic-Org/Semantic-UI-CSS/archive/master.zip static/
COPY templates/ templates/

# Temp: volumize whole app dir. Should only volumize /log/
VOLUME $APP_HOME/log $APP_HOME/secret
EXPOSE 5000 80

COPY docker-entry.sh /var/padagraph/botapadd/docker-entry.sh
ENTRYPOINT ["/var/padagraph/botapadd/docker-entry.sh"]
CMD ["/bin/bash"]