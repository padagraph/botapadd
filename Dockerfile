FROM python:2.7
LABEL maintainer "Christopher Burroughs <chris.burroughs@protonmail.ch>, ynnk"

# Setup application home
ENV APP_HOME /var/padagraph-botapadd
RUN mkdir -p ${APP_home}/log
WORKDIR /var/padagraph-botapadd
ENV PYTHONPATH=${APP_HOME}/screenshot/:/usr/lib/python2.7/dist-packages/

COPY . ${APP_HOME}/
#COPY ./static/ ${APP_HOME}/static
RUN pip install -r requirements.txt

# Temp: volumize whole app dir. Should only volumize /log/
VOLUME ${APP_HOME}/ 
#${APP_HOME}/src ${APP_HOME}/log
EXPOSE 5000 80

ENTRYPOINT ["/var/padagraph-botapadd/docker-entry.sh"]
CMD ["/bin/bash"]