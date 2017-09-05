#!/usr/bin/env python
#-*- coding:utf-8 -*-

import os
import sys
import datetime 
import logging
import codecs
import json
import pickle
from functools import wraps

from flask import Flask, Response, make_response, g, current_app, request
from flask import render_template, render_template_string, abort, redirect, url_for,  jsonify

from botapi import BotApiError, Botagraph,  BotaIgraph, BotLoginError
from botapad import Botapad, BotapadError, BotapadURLError, BotapadCsvError

DEBUG = os.environ.get('APP_DEBUG', "").lower() == "true"

# padagraph host valid token
PATH = "./static/images" # images storage

STATIC_HOST = os.environ.get('STATIC_HOST', "")
ENGINES_HOST = os.environ.get('ENGINES_HOST', "http://padagraph.io")

KEY  = codecs.open("secret/key.txt", 'r', encoding='utf8').read().strip()
KEY  = codecs.open("../me.local", 'r', encoding='utf8').read().strip()

# delete before import
DELETE = os.environ.get('BOTAPAD_DELETE', "True").lower() == "true"


# app

print( "== Botapad %s %s ==" % ("DEBUG" if DEBUG else "", "DELETE" if DELETE else "") )
print( "== engines:%s static:%s ==" % (ENGINES_HOST, STATIC_HOST) )

app = Flask(__name__)
app.config['DEBUG'] = DEBUG


# ===
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
    return render_template('homepage.html', stats=stats)

    
@app.route('/readme', methods=['GET', 'POST'])
def readme():
    md = codecs.open('README.md', 'r', encoding='utf8').read()
    return render_template('homepage.html', readme=md )
    
    
def home():
    kw = {
        'fail' : False,
        'complete' : False,
        'readme' : False,
    }
    return render_template('homepage.html', **kw )



def pad2pdg(gid, url):
    description = "imported from %s" % url
    bot = Botagraph(ENGINES_HOST, KEY)
    botapad = Botapad(bot, gid, description, delete=DELETE)
    return bot.parse(url, separator='auto', debug=app.config['DEBUG'])

def pad2igraph(gid, url):
    
    description = "imported from %s" % url
    bot = BotaIgraph()
    botapad = Botapad(bot , gid, description, delete=DELETE)
    botapad.parse(url, separator='auto', debug=app.config['DEBUG'])
    graph = bot.get_igraph()
    return graph
    
    
    
    
@app.route('/import', methods=['GET'])
@app.route('/import/', methods=['GET'])
@app.route('/import/<string:repo>', methods=['GET', 'POST'])
@app.route('/import/<string:repo>.<string:content>', methods=['GET', 'POST'])
def import2pdg(repo='igraph', content=None):
    if repo in ("padagraph", "igraph"):
        if content in ("html", "pickle", "json", ):
            return botimport(repo, content)

        return botimport(repo, 'html')
            
    return botimport('igraph', 'html')
    
def botimport(repo, content_type="html"):

    #raise ValueError(request)
    action = "%s?%s" % (repo, request.query_string)
    print "action " , action
    routes = "%s/engines" % ENGINES_HOST
    graph = None
    data = None
    
    complete = False
    error = None
    options = ""

    gid = request.form.get('gid', None)
    url = request.form.get('url', None)
    print "content_type", content_type
    content_type = request.form.get('content_type', content_type)
    print "content_type",  content_type
    
    promote = 1 if request.form.get('promote', 0)  else 0        
    
    args = request.args
    color = "#" + args.get("color", "249999" )

    if gid and url:
        
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
                pad2pdg(gid, url)
                data = "%s/xplor/%s.json" % (ENGINES_HOST, gid) 
                complete = True 

                if content_type == "json":
                    return redirect(data, code=302)
                    
            elif repo == "igraph":
                graph = pad2igraph(gid, url)
                graph = prepare_graph(graph)
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
                'url' : url, 
            }
        finally:
            today = datetime.datetime.now()
            db = get_db()
            db.execute ("""
            insert into imports (imported_on, gid, padurl, status, help )
            values (?, ?, ?, ?, ? )
            """ , ( today, gid, url, 1 if complete else 0 , promote ) )
            db.commit()
        
        #snapshot(gid, **params)D

    return render_template('homepage.html',
        static_host=STATIC_HOST, action=action, content_type=content_type, color=color,
        repo=repo, complete=complete, error=error,
        routes=routes, data=data, options=json.dumps(options),
        padurl=url, graphurl=graph_url(gid) , img=img_url(gid),
        )

# =====
# igraph specific transformation functions
# copied from  padagraph application api/explore to avoid dependency
# =====

import igraph

def igraph2dict(graph, exclude_gattrs=[], exclude_vattrs=[], exclude_eattrs=[], id_attribute=None):
    """ Transform a graph (igraph graph) to a dictionary
    to send it to template (or json)
    
    :param graph: the graph to transform
    :type graph: :class:`igraph.Graph`
    :param exclude_gattrs: graph attributes to exclude (TODO)
    :param exclude_vattrs: vertex attributes to exclude (TODO)
    :param exclude_eattrs: edges attributes to exclude (TODO)
    """
    
    # some check
    assert isinstance(graph, igraph.Graph)
    if 'id' in graph.vs.attributes():
        raise ValueError("The graph already have a vertex attribute 'id'")

    # create the graph dict
    attrs = { k : graph[k] for k in graph.attributes()}
    d = {}
    d['vs'] = []
    d['es'] = []
    
    # attributs of the graph
    if 'nodetypes' in attrs : 
        d['nodetypes']  = attrs.pop('nodetypes')
    if 'edgetypes' in attrs : 
        d['edgetypes']  = attrs.pop('edgetypes')
    
    if 'properties' in attrs:
        d['properties'] = attrs.pop('properties', {})

    if 'meta' in attrs:
        d['meta'] = attrs.pop('meta', {})
        d['meta'].update( {
            'directed' : graph.is_directed(), 
            'bipartite' : 'type' in graph.vs and graph.is_bipartite(),
            'e_attrs' : sorted(graph.es.attribute_names()),
            'v_attrs' : sorted( [ attr for attr in graph.vs.attribute_names() if not attr.startswith('_')])
            })

    # vertices
    v_idx = { }
    for vid, vtx in enumerate(graph.vs):
        vertex = vtx.attributes()
        if id_attribute is not None:
            v_idx[vid] = vertex[id_attribute]
        else:
            v_idx[vid] = vid
            vertex["id"] = vid

        d['vs'].append(vertex)

    # edges
    _getvid = lambda vtxid : v_idx[vtxid] if id_attribute else vtxid 

    for edg in graph.es:
        edge = edg.attributes() # recopie tous les attributs
        edge["source"] = v_idx[edg.source] # match with 'id' vertex attributs
        edge["target"] = v_idx[edg.target]
        #TODO check il n'y a pas de 's' 't' dans attr
        d['es'].append(edge)

    return d

def prepare_graph(graph):

    if 'nodetype' not in graph.vs.attribute_names():
        graph.vs['nodetype'] = [ "T" for e in graph.vs ]
    if 'uuid' not in graph.vs.attribute_names():
        graph.vs['uuid'] = range(len(graph.vs))
    if 'properties' not in graph.vs.attribute_names():
        props = [ {  }  for i in range(len(graph.vs))]
        attrs = graph.vs.attribute_names()
        
        for p,v  in zip(props, graph.vs):
            for e in attrs:
                if e not in ['nodetype', 'uuid', 'properties' ]  :
                    p[e] = v[e]
            if 'label' not in attrs:
                p['label']  = v.index
                
        graph.vs['properties'] = props
            

    if 'edgetype' not in graph.es.attribute_names():
        graph.es['edgetype'] = [ "T" for e in graph.es ]
    if 'uuid' not in graph.es.attribute_names():
        graph.es['uuid'] = range(len(graph.es))
    if 'weight' not in graph.es.attribute_names():
        graph.es['weight'] = [1. for e in graph.es ]
    if 'properties' not in graph.es.attribute_names():
        props = [ {  }  for i in range(len(graph.es))]
        attrs = graph.es.attribute_names()
        
        for p,v  in zip(props, graph.es):
            for e in attrs:
                if e not in ['edgetype', 'uuid', 'properties' ]  :
                    p[e] = v[e]
            if 'label' not in attrs:
                p['label']  = v.index
                
        graph.es['properties'] = props

    return graph


def export_graph(graph, exclude_gattrs=[], exclude_vattrs=[], exclude_eattrs=[], id_attribute=None):
    return  igraph2dict(graph, exclude_gattrs, exclude_vattrs, exclude_eattrs, id_attribute)    




# === main ===
    
def main():
    ## run the app
    from flask_runner import Runner

    runner = Runner(app)
    runner.run()


if __name__ == '__main__':
    sys.exit(main())


