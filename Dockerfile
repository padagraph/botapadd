FROM python:2.7
LABEL maintainer "Christopher Burroughs <chris.burroughs@protonmail.ch>, ynnk"

# Setup application home
ENV APP_HOME=/var/padagraph-botapadd
RUN mkdir -p $APP_HOME $APP_home/log
WORKDIR $APP_HOME

# Install pip requirements
COPY requirements.txt $APP_HOME/requirements.txt
RUN pip install -r requirements.txt

COPY docker-entry.sh $APP_HOME/
#COPY src ?

VOLUME $APP_HOME/src $APP_HOME/log
EXPOSE 5000 80

ENTRYPOINT ["$APP_HOME/docker-entry.sh"]
CMD ["/bin/bash"]