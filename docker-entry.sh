#!/bin/bash

[ -n "$APP_DEBUG" ] || APP_DEBUG=false
[ -n "$PRODUCTION" ] || PRODUCTION=true

echo "Environment (dev): $(printenv)"

if [ $PRODUCTION = TRUE ] ;
then
	[ -n "$NUM_WORKERS" ] || NUM_WORKERS=1
	[ -n "$BIND_ADDRESS" ] || BIND_ADDRESS=0.0.0.0
	[ -n "$BIND_PORT" ] || BIND_PORT=80

	[ -n "$LOGLEVEL" ] || LOGLEVEL="info"
	[ -n "$LOGDIR" ] || LOGDIR="$APP_HOME/log"
	[ -n "$LOGFILE" ] || LOGFILE="${LOGDIR}/app-$TEAM.log"
	[ -n "$ERRFILE" ] || ERRFILE="${LOGDIR}/app-$TEAM.err"

	mkdir -p ${LOGDIR};
	touch ${LOGFILE} ${ERRFILE}
	echo "Running GUNICORN instance:"
	echo "=> ${BIND_ADDRESS}:${BIND_PORT} | ${NUM_WORKERS} workers"

	# Run application
	cd $APP_HOME && \
	gunicorn \
		--workers ${NUM_WORKERS} \
		--bind ${BIND_ADDRESS}:${BIND_PORT} \
		--log-level=${LOGLEVEL} \
		--log-file=${LOGFILE} \
		--error-logfile=${ERRFILE} \
		botapadapp:botapadapp
else
	# Runs with Flask on port :5000
	echo "Running development instance: ${BIND_ADDRESS}:${BIND_PORT}"
	echo "=> ${BIND_ADDRESS}:${BIND_PORT}"
	python botapadapp.py --host $BIND_ADDRESS --port $BIND_PORT
fi

