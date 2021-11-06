#!/usr/bin/env python
#-*- coding:utf-8 -*-

import os
import sys

import time 
import datetime 
import logging
import codecs
import json
from functools import wraps

from flask import Flask, Response, make_response, g, current_app, request
from flask import render_template, render_template_string, abort, redirect, url_for,  jsonify, send_file

from flask_cors import CORS
from botapi import BotApiError, BotLoginError

from botapad import Botapad, BotapadError, BotapadParseError, BotapadURLError, BotapadCsvError, BotapadPostError
from botapad.utils import export_graph, prepare_graph, compute_pedigree, graph_stats

from cello.graphs import IN, OUT, ALL
from cello.graphs.prox import ProxSubgraph
from cello.graphs.filter import RemoveNotConnected, GenericVertexFilter


from pdglib.graphdb_ig import IGraphDB, engines

DEBUG = os.environ.get('APP_DEBUG', "").lower() == "true"


from reliure.utils.log import get_app_logger_color
log_level = logging.DEBUG if DEBUG else logging.WARN
logger = get_app_logger_color("botapad", app_log_level=log_level, log_level=log_level)

RUN_GUNICORN = os.environ.get('RUN_GUNICORN', None) == "1"

STATIC_HOST = os.environ.get('STATIC_HOST', "")
ENGINES_HOST = os.environ.get('ENGINES_HOST', "http://localhost:5002")
PADAGRAPH_HOST = os.environ.get('PADAGRAPH_HOST', ENGINES_HOST)
DELETE = os.environ.get('BOTAPAD_DELETE', "nope").lower() == "true"

# redis flag
REDIS_STORAGE = os.environ.get('REDIS_STORAGE', False) == "true"
# local path for csv pickle
LOCAL_PADS_STORE = "./pads"


app = Flask(__name__)
app.config['DEBUG'] = DEBUG

CORS(app)

from glob import glob
conf = {path[5:-7]:path for path in glob("pads/*.pickle")} 

from graphdb_tmuse import TMuseGDB

graphdb = TMuseGDB() # conf=conf)
#{
#    'silene':'pads/silene.pickle', 
#    'cilin':'pads/cilin.pickle', 
#    'cwn_a':'pads/cwna.pickle', 
#    'test':'pads/zhfr.pickle'} )

@app.route('/view/<string:gid>', methods=['GET'])
def simple_view(gid):
    routes = "%s/engines" % ENGINES_HOST
    graph = gid
    data = None    
    complete = False
    error = None
    options = ""
    graphurl = ""
    sync=""

    #args
    args = request.args
    
    userconfig = {}
    try :
        for k in args:
            if k.startswith("engine."):
                engine = k.split(".")[1]
                userconfig[engine] = json.loads(urllib.parse.unquote(args[k]))
    except Exception as err:
        pass # pb with config 
        
    bgcolor = "#" + args.get("bgcolor", "dbdcce" )    

    reader = args.get("format", "pickle")

    args =  dict(zip(
        request.args.keys(),
        request.args.values()
    ))
    args['s'] = gid

    graphurl = u"?%s" % "&".join([ "%s=%s" % (k,args.get(k)) for k in args])
    options = {
        #
        'wait' : 4,
        #template
        'zoom'  : args.get("zoom", 1200 ),
        'buttons': 0, # removes play/vote buttons
        'labels' : 1 if not args.get("no-labels", None ) else 0,  # removes graph name/attributes 
        # gviz
        'el': "#viz",
        'background_color' : bgcolor,

        # todo check where used
        'initial_size' : 4,
        'vtx_size' : args.get("vertex_size", 2 ),

        'user_font_size': float(args.get("font_size", 1) ), # [-5, 5]
        'user_vtx_size' : float(args.get("vtx_size" , 1) ), # float > 0
        
        'show_text'  : 0 if args.get("no_text"  , None ) else 1, # removes vertex text 
        'show_nodes' : 0 if args.get("no_nodes" , None ) else 1, # removes vertex only 
        'show_edges' : 0 if args.get("no_edges" , None ) else 1, # removes edges 
        'show_images': 0 if args.get("no_images", None ) else 1, # removes vertex images
        
        'auto_rotate': int(args.get("auto_rotate", 0 )),
        'adaptive_zoom': int(args.get("adaptive_zoom", 1 )),
        
        'layout' : args.get("layout") if args.get("layout", "2D" ) in ("2D","3D") else "2D",
    }
    #builder = _pad2igraph | compute_pedigree | graph_stats
    padurl= gid + ".pickle"
    #graph = builder( gid, padurl, reader )
    #graphdb.set_graph(gid, graph)                           
    sync = "%s/graphs/g/%s" % (ENGINES_HOST, gid)
    #data = "%s/xplor/starred/%s.json" % (ENGINES_HOST, gid)
    data = "%s/import/igraph.pickle?s=%s" % (ENGINES_HOST, padurl)
    today = datetime.datetime.now()
    #db = get_db()
    #db.execute ("""
    #        insert into imports (imported_on, gid, padurl, status, help )
    #        values (?, ?, ?, ?, ? )
    #        """ , ( today, gid, padurl, 1 if complete else 0 , 0 ) )
    #db.commit()
    return render_template('graph.html',
        static_host=STATIC_HOST, color=bgcolor,
        routes=routes, data=data, options=json.dumps(options),
        padurl=padurl, 
        graphurl = graphurl, 
        sync=sync,
        userconfig=json.dumps(userconfig)
        )

#@app.route('/import/', methods=['GET', 'POST'])
#def simple_import()



# from pdglib.graphdb_ig import engines
import engines_tmuse as engines
from botapadapi import explore_api, starred

from  pdgapi.explor import layout_api, clustering_api

from pdgapi import graphedit
socketio = None
login_manager = None
edit_api = graphedit.graphedit_api("graphs", app, graphdb, login_manager, socketio )

app.register_blueprint(edit_api)
api = explore_api(engines, graphdb)
api = layout_api(engines, api)
api = clustering_api(engines, api)


app.register_blueprint(api)




from pdgapi import get_engines_routes
    
@app.route('/engines', methods=['GET'])
def _engines():
    host = ENGINES_HOST
    routes = { k:v for k,v in get_engines_routes(app, host).items() if k[0] != "<" }
    return jsonify({'routes': routes})

    

def build_app():

    pass
    

# Start app

if RUN_GUNICORN: build_app()