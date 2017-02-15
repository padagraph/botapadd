FROM python:2.7
LABEL maintainer "Christopher Burroughs <chris.burroughs@protonmail.ch>, ynnk"

# Setup application home
ENV APP_HOME /var/padagraph-botapadd
RUN mkdir -p ${APP_HOME} ${APP_home}/log
WORKDIR ${APP_HOME}
ENV PYTHONPATH=${APP_HOME}/screenshot/:/usr/lib/python2.7/dist-packages/

# Install pip requirements
COPY requirements.txt ${APP_HOME}/requirements.txt
RUN pip install -r requirements.txt

COPY . ${APP_HOME}/
#COPY docker-entry.sh ${APP_HOME}/docker-entry.sh
#COPY src ?

VOLUME ${APP_HOME}/src ${APP_HOME}/log
EXPOSE 5000 80

RUN chmod +x docker-entry.sh
ENTRYPOINT ["/var/padagraph-botapadd/docker-entry.sh"]
CMD ["/bin/bash"]