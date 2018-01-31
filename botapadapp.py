#!/usr/bin/env python
#-*- coding:utf-8 -*-

import os
import sys
import datetime 
import logging
import codecs
import json
from functools import wraps

from flask import Flask, Response, make_response, g, current_app, request
from flask import render_template, render_template_string, abort, redirect, url_for,  jsonify

from botapi import BotApiError, Botagraph,  BotaIgraph, BotLoginError
from botapad import Botapad, BotapadError, BotapadParseError, BotapadURLError, BotapadCsvError

from cello.graphs import IN, OUT, ALL
from cello.graphs import pedigree
from cello.graphs.prox import ProxSubgraph
from cello.graphs.filter import RemoveNotConnected, GenericVertexFilter

from reliure.utils.log import get_app_logger_color

DEBUG = os.environ.get('APP_DEBUG', "").lower() == "true"


log_level = logging.INFO if DEBUG else logging.WARN
logger = get_app_logger_color("botapad", app_log_level=log_level, log_level=log_level)

RUN_GUNICORN = os.environ.get('RUN_GUNICORN', None) == "1"



# padagraph host valid token
PATH = "./static/images" # images storage

STATIC_HOST = os.environ.get('STATIC_HOST', "")
ENGINES_HOST = os.environ.get('ENGINES_HOST', "http://localhost:5000")
PADAGRAPH_HOST = os.environ.get('PADAGRAPH_HOST', ENGINES_HOST)

try:
    KEY  = codecs.open("secret/key.txt", 'r', encoding='utf8').read().strip()
except:
    KEY = "SHOULD BE ADDED in secret/key.txt"


# delete before import
DELETE = os.environ.get('BOTAPAD_DELETE', "nope").lower() == "true"

# app
print( "== Botapad %s %s ==" % ("DEBUG" if DEBUG else "", "DELETE" if DELETE else "") )
print( "== Running with gunicorn : %s==" % (RUN_GUNICORN) )
print( "== engines:%s static:%s padagraph:%s==" % (ENGINES_HOST, STATIC_HOST, PADAGRAPH_HOST) )

app = Flask(__name__)
app.config['DEBUG'] = DEBUG

socketio = None

# Flask-Login
from flask_login import LoginManager, current_user, login_user, login_required
   
login_manager = LoginManager()
login_manager.init_app(app)

from flask_cors import CORS
CORS(app)

# Database 
# ===

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
import pickle
import StringIO
from pdgapi.explor import export_graph, prepare_graph, igraph2dict, EdgeList
from pdglib.graphdb_ig import IGraphDB, engines

graphdb = IGraphDB({})
graphdb.open_database()

STORE = "../application/src/sample"
STORE = "./pads"


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
        print row
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
def stats():
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
    select imported_on, gid, padurl, status, help from imports;
    """)

    rows = []
    for row in cursor.fetchall():
        #imported_on,  gid, padurl, status, needhelp = row
        r = dict(zip( "imported_on,gid,padurl,status,help".split(','), row ))
        r['graph_url'] = graph_url(row[1])
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
    
def pad2pdg(gid, url):
    description = "imported from %s" % url
    bot = Botagraph(PADAGRAPH_HOST, KEY)
    botapad = Botapad(bot, gid, description, delete=DELETE)
    return botapad.parse(url, separator='auto', debug=app.config['DEBUG'])


def pad2igraph(gid, url, format="csv"):

    print ("format", gid, url, format )
    
    if format == 'csv':
        
        try : 
            description = "imported from %s" % url
            if url[0:4] != 'http':
                url = "%s/%s.%s" % (STORE, url, format) 
            bot = BotaIgraph(directed=True)
            botapad = Botapad(bot , gid, description, delete=DELETE, verbose=True, debug=False)
            #botapad.parse(url, separator='auto', debug=app.config['DEBUG'])
            botapad.parse(url, separator='auto', debug=False)
            graph = bot.get_igraph(weight_prop=True)

            if graph.vcount() == 0 :
                raise BotapadParseError(url, "Botapad can't create a graph without nodes.", None )

            return graph
            
        except BotapadParseError as e :
            log = botapad.get_log()
            e.log = log
            raise e
            
        except OSError as e :
            raise BotapadURLError( "No such File or Directory : %s " % url, url)
            
        
    elif format in ('pickle', 'graphml', 'graphmlz', 'gml', 'pajek'):
        content = None
        if url[0:4] == 'http':
            try :
                url = convert_url(path)
                if format in ( 'pickle', 'picklez'):
                    raise ValueError('no pickle from HTTP : %s ' % url )
                log( " * Downloading %s %s\n" % (url, separator))
                content = requests.get(url).text
            except :
                raise BotapadURLError("Can't download %s" % url, url)

        elif DEBUG : 
            try : 
                content = open("%s/%s.%s" % (STORE, url, format) , 'rb').read()
            except Exception as err :
                raise BotapadURLError("Can't open file %s: %s" % (url, err.message ), url)

        print (" === reading  %s/%s.%s" % (STORE, url, format) )

        try :
            with named_temporary_file(text=False) as tmpf: 
                outf = open(tmpf, "wt") 
                outf.write(content) 
                outf.close() 
            
                graph =  igraph.read(tmpf, format=format) 
  
            return graph
        
        except Exception as err :
            raise BotapadError('%s : cannot read %s file at %s : %s' % ( gid, format, url, err.message ))

    else :
        raise BotapadError('%s : Unsupported format %s file at %s ' % ( gid, format, url ))
    
    

@app.route('/embed', methods=['GET'])
def embed():
    padurl = request.query_string
    graphurl = "/import/igraph.html?s=%s&gid=graph&nofoot=1" % (padurl)
    return botimport('igraph', padurl, "graph", "embed")
    

FORMAT = [ (k, 'import' if  v[0]!= None else "" ,'export' if  v[1]!=None else "" )  for k,v in igraph.Graph._format_mapping.iteritems()]


FORMAT_IMPORT = ('graphml', 'graphmlz', 'csv')
FORMAT_EXPORT = ('graphml', 'graphmlz', 'picklez', 'pickle', 'csv', 'json')



@app.route('/import', methods=['GET'])
@app.route('/import/', methods=['GET'])
@app.route('/import/<string:repo>', methods=['GET', 'POST'])
@app.route('/import/<string:repo>.<string:content>', methods=['GET', 'POST'])
def import2pdg(repo='igraph', content=None):
    
    if repo in ("padagraph", "igraph"):
        content = request.form.get('content_type', content)
        if content in ("html", "embed", "pickle", "json", ):

            gid = request.form.get('gid', request.args.get('gid', "graph"))
            padurl = request.form.get('url', None)
            pad_source = request.args.get('s', padurl)

            if pad_source:

                if pad_source  == "framapad":
                    padurl = "https://annuel2.framapad.org/p/%s" % gid
                    
                elif pad_source in ('google', 'googledoc'):
                    padurl = "https://docs.google.com/document/d/%s/edit" % gid

                else : padurl = pad_source

            return botimport(repo, padurl, gid, content)

        return botimport(repo, None, None, 'html')
            
    return botimport('igraph', None, None, 'html')
    
def botimport(repo, padurl, gid, content_type):

    print repo, content_type, gid, padurl
    
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
     
    color = "#" + args.get("color", "249999" )    
    if content_type == "embed":
        footer = False
    else : 
        footer = not(args.get('nofoot', 0) == "1") # default true

    reader = args.get("format", "csv")

    args = dict(request.args)
    args['s'] = padurl

    if padurl:
        
        promote = 1 if request.form.get('promote', 0)  else 0    
        graphurl = "#/import/igraph.html?s=%s&gid=%s&nofoot=1" % (padurl, gid)
        graphurl = "?%s" % "&".join([ "%s=%s" % (k,args.get(k)) for k in  args.keys()])
        
        options = {
            #
            'wait' : 4,
            #template
            'zoom'  : args.get("zoom", 1200 ),
            'buttons': 0, # removes play/vote buttons
            'labels' : 1 if not args.get("no-labels", None ) else 0,  # removes graph name/attributes 
            # gviz
            'el': "#viz",
            'background_color' : color,
            'initial_size' : 16,
            'user_font_size' : 2,
            'user_vtx_size' : 3,
            'vtx_size' : args.get("vertex_size", 2 ),
            'show_text'  : 0 if args.get("no_text"  , None ) else 1,     # removes vertex text 
            'show_nodes' : 0 if args.get("no_nodes" , None ) else 1,   # removes vertex only 
            'show_edges' : 0 if args.get("no_edges" , None ) else 1,   # removes edges 
            'show_images': 0 if args.get("no_images", None ) else 1, # removes vertex images
            
            'auto_rotate': 0,
            'adaptive_zoom': 0,
                
        }
    
        try : 
            if repo == "padagraph":
                pad2pdg(gid, padurl)
                
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
                    graph = pad2igraph( gid, padurl, reader )
                    graph = prepare_graph(graph)
                    
                    graph['meta']['date'] = datetime.datetime.now().strftime("%Y-%m-%d %Hh%M")
                    graph['meta']['owner'] = None

                    graph['meta']['pedigree'] = pedigree.compute(graph)
          
                    graphdb.graphs[gid] = graph
                                        
                                        
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
                        print pzeros , graph.summary()
                        
                        graph = subgraph(graph, length=length, cut=cut, pzeros=pzeros, add_loops=addloops, mode=mode)
                        print LENMIN , graph.summary()
                                                 
                    
                    data = export_graph(graph, id_attribute='uuid')
                                     
                    complete = True 

                if content_type == "json":
                    return jsonify(data)
                    
                elif content_type == "pickle":
                    response = make_response(pickle.dumps(graph))
                    response.headers["Content-Disposition"] = "attachment; filename=%s.pickle" % gid
                    return response
                else :
                    data = json.dumps(data)

        except BotapadCsvError as err:
            error = {
                'class' : err.__class__.__name__,
                'url' : err.path, 
                'separator' : err.separator,
                'message' : err.message
            }
        
        except BotapadParseError as err:
            
            print "EXCEPT BotapadParseError" , err
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
        #except :
            #error = {
                #'class' : "ImportERROR",
                #'message' : "unexpected",
                #'url' : padurl, 
            #}
        finally:
            today = datetime.datetime.now()
            db = get_db()
            db.execute ("""
            insert into imports (imported_on, gid, padurl, status, help )
            values (?, ?, ?, ?, ? )
            """ , ( today, gid, padurl, 1 if complete else 0 , promote ) )
            db.commit()
        
        #snapshot(gid, **params)

    return render_template('botapadapp.html',
        static_host=STATIC_HOST, color=color,
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

        
#@app.route('/engines', methods=['GET'])
#def engines():
    #r = request.path
    #return jsonify({'routes': {
            #'layout' : "%s/engines/layout" % ENGINES_HOST,
            #'clustering' : "%s/engines/clustering" % ENGINES_HOST ,
        #}})









from pdgapi import graphedit
 
edit_api = graphedit.graphedit_api("graphs", app, graphdb, login_manager, socketio )
app.register_blueprint(edit_api)

from botapadapi import explore_api
from pdglib.graphdb_ig import engines
api = explore_api(engines, graphdb)

app.register_blueprint(api)


from pdgapi import get_engines_routes
    
@app.route('/engines', methods=['GET'])
def _engines():
    host = ENGINES_HOST
    return jsonify({'routes': get_engines_routes(app, host)})

    

def build_app():

    pass
    

# Start app

if RUN_GUNICORN: build_app()

    
from flask_runner import Runner
def main():
    ## run the app
    print "running main"

    build_app()

    runner = Runner(app)
    runner.run()

if __name__ == '__main__':
    sys.exit(main())


