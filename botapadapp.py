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
from flask import render_template, render_template_string, abort, redirect, url_for,  jsonify

from botapi import BotApiError, BotLoginError

from botapad import Botapad, BotapadError, BotapadParseError, BotapadURLError, BotapadCsvError, BotapadPostError
from botapad.utils import export_graph, prepare_graph, compute_pedigree, graph_stats

from cello.graphs import IN, OUT, ALL
from cello.graphs.prox import ProxSubgraph
from cello.graphs.filter import RemoveNotConnected, GenericVertexFilter


DEBUG = os.environ.get('APP_DEBUG', "").lower() == "true"


from reliure.utils.log import get_app_logger_color
log_level = logging.DEBUG if DEBUG else logging.WARN
logger = get_app_logger_color("botapad", app_log_level=log_level, log_level=log_level)

RUN_GUNICORN = os.environ.get('RUN_GUNICORN', None) == "1"



# padagraph host valid token
PATH = "./static/images" # images storage

STATIC_HOST = os.environ.get('STATIC_HOST', "")
ENGINES_HOST = os.environ.get('ENGINES_HOST', "http://localhost:5000")
PADAGRAPH_HOST = os.environ.get('PADAGRAPH_HOST', ENGINES_HOST)
DELETE = os.environ.get('BOTAPAD_DELETE', "nope").lower() == "true"

# redis flag
REDIS_STORAGE = os.environ.get('REDIS_STORAGE', False) == "true"
# local path for csv pickle
LOCAL_PADS_STORE = "./pads"

# padagraph.io n4j key
try:
    KEY  = codecs.open("secret/key.txt", 'r', encoding='utf8').read().strip()
except:
    KEY = "!! SHOULD BE ADDED in secret/key.txt"


# delete before import

# app
print( " == Botapad %s %s ==" % ("DEBUG" if DEBUG else "INFO", "DELETE" if DELETE else "") )
print( " == Running with gunicorn : %s==" % (RUN_GUNICORN) )
print( " == engines:%s static:%s padagraph:%s==" % (ENGINES_HOST, STATIC_HOST, PADAGRAPH_HOST) )
print( " == REDIS STORAGE : %s ==  " % REDIS_STORAGE )
print( " == LOCAL_PADS_STORE : %s ==  " % LOCAL_PADS_STORE)

app = Flask(__name__)
app.config['DEBUG'] = DEBUG

socketio = None

# Flask-Login
from flask_login import LoginManager, current_user, login_user, login_required
   
login_manager = LoginManager()
login_manager.init_app(app)

from flask_cors import CORS
CORS(app)

# == Database ==
import os.path
from flask import g
import sqlite3

DATABASE = os.environ.get('BOTAPAD_DB', "./db.sqlite")
#    status: success 1, fail 0
#    help  : 0 | 1  
DB_SCHEMA = """
create table imports (
    gid        text,
    padurl     text,
    status     integer,
    help       integer, 
    imported_on    TIMESTAMP
);
"""


import igraph
from igraph.utils import named_temporary_file 
try :
    import cPickle as pickle
except : import pickle
from pdgapi.explor import EdgeList
from pdglib.graphdb_ig import IGraphDB, engines


graphdb = IGraphDB( graphs={} )


if REDIS_STORAGE:
    import redis
    class RedisGraphs(object):
        def __init__(self, host='localhost', port=6379):
            # initialize the redis connection pool
            self.redis = redis.Redis(host=host, port=port)

        def __setitem__(self, gid, graph):
            # pickle and set in redis
            # todo ttl = 10
            self.redis.set(gid, pickle.dumps(graph))

        def get(self, gid):
            return self.__getitem__(gid)

        def __getitem__(self, gid):
            # get from redis and unpickle
            
            start = time.time()
            graph = pickle.loads(self.redis.get(gid))
            print("loading %s from redis" % gid )
            
            if graph is None : 
                path = self.conf.get(gid, None)
                if path is None :
                    raise GraphError('no such graph %s' % gid) 
                else:
                    print("opening graph %s@%s" %(gid, path))
                    graph = IgraphGraph.Read(path)

            end = time.time()

            print( "redis time GET %s" % (end - start) )
            if graph is not None:
                print(graph.summary())
                return graph

            raise GraphError('%s' % gid)

        def keys(self):
            return []

    graphdb = IGraphDB( graphs=RedisGraphs() )
    
    


graphdb.open_database()

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE, detect_types=sqlite3.PARSE_DECLTYPES|sqlite3.PARSE_COLNAMES)
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        db = get_db()
        db.cursor().executescript(DB_SCHEMA)
        db.commit()


if not os.path.exists(DATABASE):
    init_db()


# ====
# app functions
# ====

from flaskext.markdown import Markdown
Markdown(app)


# browser webdriver
#from screenshot import getScreenShot
#from selenium import webdriver
#driver = webdriver.Chrome("chromedriver")

def snapshot(gid, **kwargs):
    """
    requires screenshot & selenium driver
    """
    path = '%s/%s.png' % ( PATH, gid )
    #driver, HOST, gid, path, width, height, {iframe params}
    getScreenShot(driver, ENGINES_HOST, gid, path, 400,400, **kwargs)    

def img_url(gid):
    return '%s/%s.png' % ( PATH, gid )

def graph_url(gid):
    return '%s/graph/%s' % ( ENGINES_HOST, gid )


# === app routes ===




@app.route('/image/<string:gid>', methods=['GET', 'POST'])
def image(gid):
    return redirect( img_url(gid) )

@app.route('/promote', methods=['GET'])
def promote():
    
    query = """
    SELECT * FROM IMPORTS
    """
    cursor = get_db().cursor()
    cursor.execute("""
    select imported_on, gid, padurl from imports as i
    where i.status = 1 and i.help = 1
    group by  gid, padurl
    order by imported_on desc
    limit 0,20;     
    """)
    rows = []
    for row in cursor.fetchall():
        #imported_on,  gid, padurl, status, needhelp = row
        r = dict(zip( "imported_on,gid,padurl".split(','), row ))
        r['graph_url'] = graph_url(row[1])
        r['date'] = row[0].strftime(' %d %m %Y')
        r['time'] = row[0].strftime(' %H: %M')
        rows.append(r)
        
    #rows = rows.reverse()
    promote = { 'rows' : rows }

    cursor.execute("""
    select count(distinct padurl) from imports  where status = 1 and help=1;
    """)
    promote['count'] = cursor.fetchone()[0]
    
    return render_template('homepage.html', promote=promote)
    

    
@app.route('/stats', methods=['GET', 'POST'])
def get_stats():
    query = """
    SELECT * FROM IMPORTS
    """
    cursor = get_db().cursor()

    stats = {}
    
    cursor.execute("""
    select count(padurl) from imports where status = 1;
    """)
    stats['success'] = cursor.fetchone()[0]
    
    
    cursor.execute("""
    select count(padurl) from imports  where status = 0;
    """)
    stats['fails'] = cursor.fetchone()[0]
    stats['tries'] = stats['fails'] + stats['success']
    
    cursor.execute("""
    select imported_on, gid, padurl, status, help from imports ORDER BY IMPORTED_ON DESC;
    """)
    
    def botapad_url(padurl, gid, **options):
        opt = [ "%s=%s" % (k,v) for k,v in options.items() ]
        return '/import/igraph.html?gid=%s&s=%s&%s' % ( gid,padurl, "&".join(opt) ) 

    rows = []
    for row in cursor.fetchall():
        #imported_on,  gid, padurl, status, needhelp = row
        r = dict(zip( "imported_on,gid,padurl,status,help".split(','), row ))
        r['graph_url'] = graph_url(row[1])
        r['botapad_url'] = botapad_url(r['padurl'], r['gid'] )
        r['date'] = row[0].strftime(' %d %m %Y')
        r['time'] = row[0].strftime(' %H: %M')
        
        rows.append(r)
        
    stats['rows'] = rows
    cursor.close()
    return render_template('botapadapp.html', stats=stats)

    
@app.route('/readme', methods=['GET', 'POST'])
def readme():
    md = codecs.open('README.md', 'r', encoding='utf8').read()
    return render_template('botapadapp.html', readme=md )
 

@app.route('/embed', methods=['GET'])
def embed():
    padurl = request.query_string
    graphurl = "/import/igraph.html?s=%s&gid=graph&nofoot=1" % (padurl)
    return botimport('igraph', padurl, "graph", "embed")
    

FORMAT = [ (k, 'import' if  v[0]!= None else "" ,'export' if  v[1]!=None else "" )  for k,v in igraph.Graph._format_mapping.items()]


FORMAT_IMPORT = ('graphml', 'graphmlz', 'csv')
FORMAT_EXPORT = ('graphml', 'graphmlz', 'picklez', 'pickle', 'csv', 'json')


def uuid(url):
    now = datetime.datetime.now().ctime()
    return hex( hash(url) + hash(now) )[2:]

@app.route('/', methods=['GET', 'POST'])
@app.route('/import', methods=['GET','POST'])
def home():
    url = request.form.get('url', None)
    gid = request.form.get('gid', None)
    if url and gid :
        return botimport("igraph", url, gid, 'html')
    
    url = request.args.get('s')
    if url:
        return botimport("igraph", url, uuid(url), 'html')
    
    return render_template('botapadapp.html', repo='igraph', content="html")




@app.route('/import/<string:repo>', methods=['GET', 'POST'])
@app.route('/import/<string:repo>.<string:content>', methods=['GET', 'POST'])
def import2pdg(repo='igraph', content="html"):
    """
    """
    
    if repo in ("padagraph", "igraph"):
        content = request.form.get('content_type', content)
        if content in ("html", "embed", "pickle", "json", ):

            padurl = request.form.get('url', None)
            pad_source = request.args.get('s', padurl)

            if pad_source:

                if pad_source  == "framapad":
                    padurl = "https://annuel2.framapad.org/p/%s" % gid
                    
                elif pad_source in ('google', 'googledoc'):
                    padurl = "https://docs.google.com/document/d/%s/edit" % gid

                else : padurl = pad_source

            gid = "%s" % padurl.split('/')[-1] if padurl else None
            gid = request.form.get('gid', request.args.get('gid', gid ))

            return botimport(repo, padurl, gid, content)

    return botimport(repo, None, None, 'html')
            


from botapadapi import pad2igraph, pad2pdg, starred

from reliure.pipeline import Optionable, Composable

@Composable
def _pad2igraph(gid, url, format="csv"):
    graph = pad2igraph(gid, url, format, delete=True, store=LOCAL_PADS_STORE)
    
    if not 'meta' in graph.attributes() : graph['meta'] = {}
    graph['meta']['gid'] = gid
    graph['meta']['graph'] = gid
    graph['properties'] =  {
      "description": "%s imported from %s [%s]" % (gid, url, format) , 
      "image": "", 
      "name": gid, 
      "tags": [
        "Botapad", format
      ]
    }
    graph['meta']['owner'] = None
    graph['meta']['date'] = datetime.datetime.now().strftime("%Y-%m-%d %Hh%M")
    return prepare_graph(gid, graph)

import traceback
    
def botimport(repo, padurl, gid, content_type):

    print( " *** botimport ", repo, content_type, gid, padurl )
    
    action = "%s?%s" % (repo, request.query_string)
    routes = "%s/engines" % ENGINES_HOST
    
    graph = None
    data = None    
    complete = False
    error = None
    options = ""
    graphurl = ""
    sync=""

    #args
    args = request.args
     
    bgcolor = "#" + args.get("bgcolor", "dbdcce" )    
    if content_type == "embed":
        footer = False
    else : 
        footer = (args.get('footer', 0) == "1") # default false

    reader = args.get("format", "csv")

    args =  dict(zip(
        request.args.keys(),
        request.args.values()
    ))
    args['s'] = padurl

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
            
    }


    if gid == None and padurl == None :
        #error = {
            #'class' : "BotapadURLError",
            #'message' : "padurl not given",
            #'url' : "###", 
        #}
        pass
    elif gid and padurl == None :
        sync = "%s/graphs/g/%s" % (ENGINES_HOST, gid)
        data = "%s/xplor/%s.json" % (ENGINES_HOST, gid)
        complete = True
        
    elif padurl :
        
        promote = 1 if request.form.get('promote', 0)  else 0    

        try : 
            if repo == "padagraph":
                pad2pdg(gid, padurl, PADAGRAPH_HOST, KEY, DELETE , debug=app.config['DEBUG'])
                
                data = "%s/xplor/%s.json" % (ENGINES_HOST, gid) 
                sync = "%s/graphs/g/%s" % (ENGINES_HOST, gid)
                complete = True 

                if content_type == "json":
                    return redirect(data, code=302)
                    
            elif repo == "igraph":

                if content_type == "embed":
                    complete = True 
                    data = "%s/import/igraph.json?s=%s" % (ENGINES_HOST, padurl)
    
                else :

                    builder = _pad2igraph | compute_pedigree | graph_stats
                    
                    graph = builder( gid, padurl, reader )
                    graphdb.set_graph(gid, graph)                           
                                        
                    sync = "%s/graphs/g/%s" % (ENGINES_HOST, gid)
                    
                    if graph.vcount() > 300: 
                        
                        LENMIN = graph.vcount() / 100 - 5
                        LENMIN = 10
                        vfilter = lambda v : False
                        subgraph = ProxSubgraph() | GenericVertexFilter(vfilter)
                        
                        length = int(args.get("length" , 3 ) )
                        cut = int(args.get("cut" , 50 ) )
                        mode = int(args.get("mode" , ALL ))
                        addloops = int(args.get("addloops" , 1 )) == 1
                        pzeros = args.get("pz" , "" )
                        pzeros = [] if not len(pzeros) else [int(e) for e in pzeros.split(',')]
                        print( pzeros , graph.summary() )
                        
                        subg = subgraph(graph, length=length, cut=cut, pzeros=pzeros, add_loops=addloops, mode=mode)
                    else :
                        subg = graph
                    complete = True 

                print(" .............. graph build", graphurl, gid )

                
                if content_type == "pickle":
                    response = make_response(pickle.dumps(graph))
                    response.headers["Content-Disposition"] = "attachment; filename=%s.pickle" % gid
                    return response
                elif content_type in ( "json" , "inline" ):
                    data = export_graph(subg, attribute_id='uuid')
                    if content_type == "json":
                        return jsonify(data)
                    elif content_type == "inline":
                        data = json.dumps(data,  ensure_ascii=False)
                else :
                    data = "%s/xplor/starred/%s.json" % (ENGINES_HOST, gid)
                         
        except BotapadCsvError as err:
            error = {
                'class' : err.__class__.__name__,
                'url' : err.path, 
                'separator' : err.separator,
                'message' : err.message
            }
        
        except BotapadParseError as err:
            
            print( "EXCEPT BotapadParseError" , err )
            error = {
                'class' : err.__class__.__name__,
                'url' : err.path, 
                'message'  : err.message.replace('\n', '<br/>'),
                'line'  : err.line,
                'log'  : err.log,
                'separator' : "NONE",
            }
            
        except BotapadURLError as err:
            error = {
                'class' : err.__class__.__name__,
                'message' : err.message,
                'url' : err.url, 
            }
        except BotLoginError as err:
            error = {
                'class' : err.__class__.__name__,
                'message' : err.message,
                'host' : err.host, 
                'url' : padurl, 
            }
        except Exception as err:
            error = {
                'class' : err.__class__.__name__,
                'message' : err.message if hasattr(err,'message') else "unexpected error",
                'url' : padurl,
                'stacktrace':traceback.format_exc()
            }
            print( err, traceback.format_exc() )
        finally:
            today = datetime.datetime.now()
            db = get_db()
            db.execute ("""
            insert into imports (imported_on, gid, padurl, status, help )
            values (?, ?, ?, ?, ? )
            """ , ( today, gid, padurl, 1 if complete else 0 , promote ) )
            db.commit()
        
        #snapshot(gid, **params)

    if error:
        return render_template("botapadapp.html", error=error)
    

    return render_template('graph.html',
        static_host=STATIC_HOST, color=bgcolor,
        repo=repo, complete=complete, error=error,
        routes=routes, data=data, options=json.dumps(options),
        padurl=padurl, graphurl = graphurl, sync=sync,
        footer=footer
        )


# === layout ===

from reliure.web import ReliureAPI, EngineView
from reliure.pipeline import Optionable, Composable
from reliure.types import GenericType
from reliure.engine import Engine
from reliure.utils.log import get_basic_logger

        
def edge_subgraph( data ):
    _format  = data['format']
    gid = data['graph']

    if _format == 'index_edgelist' :
        nodelist =  data['nodelist']
        edgelist =  data['edgelist']
        weights =  data.get('weights', None)
        directed =  data.get('directed', False)
        return egde_list_subgraph(nodelist, edgelist, weights )

def egde_list_subgraph(node_list, edge_list, weights, directed=False ):
    
    graph = igraph.Graph(directed= directed, 
                     graph_attrs={},
                     n=len(node_list),
                     vertex_attrs={'uuid': node_list},
                     edges=edge_list,
                     edge_attrs={'weight': weights})
    return graph

        

from pdgapi import graphedit
 
edit_api = graphedit.graphedit_api("graphs", app, graphdb, login_manager, socketio )
app.register_blueprint(edit_api)

from pdglib.graphdb_ig import engines
from botapadapi import explore_api, starred

from  pdgapi.explor import layout_api, clustering_api
api = explore_api(engines, graphdb)

@api.route("/starred/<string:gid>.json", methods=['GET'])
def g_json_dump(gid):
    graph = graphdb.get_graph(gid)
    g = starred(graph, limit=10, prune=True)
    g = export_graph( g, id_attribute='uuid')

    return jsonify(g)


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


if __name__ == '__main__':
    sys.exit(main())


