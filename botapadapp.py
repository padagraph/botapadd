#!/usr/bin/env python
#-*- coding:utf-8 -*-

import os
import sys
import datetime 
import logging
import codecs
from functools import wraps

from flask import Flask, Response, make_response, g, current_app, request
from flask import render_template, render_template_string, abort, redirect, url_for,  jsonify


from botapad import Botapad, BotapadError, BotapadURLError, BotapadCsvError

#from screenshot import getScreenShot
#from selenium import webdriver

DEBUG = os.environ.get('APP_DEBUG', "").lower() == "true"

PATH = "./static/images" # images storage

# padagraph host t o connect
HOST = os.environ.get('BOTAPAD_HOST', "http://localhost:5009")
# padagraph host valid token
KEY  = codecs.open("key.txt", 'r', encoding='utf8').read()

# delete before import
DELETE = os.environ.get('BOTAPAD_DELETE', "True").lower() == "true"


# app

print( "== running Botapad %s==" % ("DEBUG" if DEBUG else "")  )
print( "== %s ==" % HOST)

app = Flask(__name__)
app.config['DEBUG'] = DEBUG



# === sqlite database ===

import os.path
import sqlite3
from flask import g
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


# browser webdriver
#driver = webdriver.Chrome("chromedriver")

from flaskext.markdown import Markdown
Markdown(app)




# == app functions ===


def img_url(gid):
    return '%s/%s.png' % ( PATH, gid )

def graph_url(gid):
    return '%s/graph/%s' % ( HOST, gid )

def import_pad(gid, url):
    description = "imported from %s" % url
    bot = Botapad(HOST, KEY, gid, description, delete=DELETE)
    return bot.parse(url, separator='auto', debug=app.config['DEBUG'])

def snapshot(gid, **kwargs):
    """
    requires screenshot & selenium driver
    """
    path = '%s/%s.png' % ( PATH, gid )
    #driver, HOST, gid, path, width, height, {iframe params}
    getScreenShot(driver, HOST, gid, path, 400,400, **kwargs)    



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

    
#@app.route('/test', methods=['GET'])
def test():
    gid = "fillon"
    params = {
            #template
            'color' : "12AAAA",
            'zoom'  : 1200,
            
            'auto_rotate': 1,
                
            'buttons': 1, # removes play/vote buttons
            'labels' : 0,  # removes graph name/attributes 
            # gviz
            'vtx_size' : 0,
            'show_text'  : 1 ,     # removes vertex text 
            'show_nodes' : 1 ,   # removes vertex only 
            'show_edges' : 1 ,   # removes edges 
            'show_images': 1 , # removes vertex images 
        }
        
    querystr = "&".join(["%s=%s" % (k,v) for k,v in params.items()])
    iframe = "%s/iframe/%s?%s#graph" % ( HOST, gid, querystr )
    return render_template('homepage.html', iframe= iframe, url=graph_url(gid) , img=img_url(gid), complete=True)

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


@app.route('/import', methods=['GET', 'POST'])
@app.route('/', methods=['GET'])
def botimport():
    
    complete = False
    error = None
    iframe = ""

    gid = request.form.get('gid', None)
    url = request.form.get('url', None)
    promote = 1 if request.form.get('promote', 0)  else 0
        

    if gid and url:
        
        args = request.args
        params = {
            #
            'wait' : 4,
            #template
            'color' : args.get("color", "12AAAA" ),
            'zoom'  : args.get("zoom", 1200 ),
            'buttons': 0, # removes play/vote buttons
            'labels' : 1 if not args.get("no-labels", None ) else 0,  # removes graph name/attributes 
            # gviz
            'vtx_size' : args.get("vertex_size", 0 ),
            'show_text'  : 0 if args.get("no_text"  , None ) else 1,     # removes vertex text 
            'show_nodes' : 0 if args.get("no_nodes" , None ) else 1,   # removes vertex only 
            'show_edges' : 0 if args.get("no_edges" , None ) else 1,   # removes edges 
            'show_images': 0 if args.get("no_images", None ) else 1, # removes vertex images
            
            'auto_rotate': 1,
                
        }

        try : 
            import_pad(gid, url)
            querystr = "&".join(["%s=%s" % (k,v) for k,v in params.items()])
            iframe = "%s/iframe/%s?%s#graph" % ( HOST, gid, querystr )
            complete = True 
    
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
        finally:
            today = datetime.datetime.now()
            db = get_db()
            db.execute ("""
            insert into imports (imported_on, gid, padurl, status, help )
            values (?, ?, ?, ?, ? )
            """ , ( today, gid, url, 1 if complete else 0 , promote ) )
            db.commit()
        
        #snapshot(gid, **params)

    return render_template('homepage.html', iframe= iframe, padurl=url, graphurl=graph_url(gid) , img=img_url(gid), complete=complete, error=error)


# === main ===
    
def main():
    ## run the app
    from flask_runner import Runner

    runner = Runner(app)
    runner.run()


if __name__ == '__main__':
    sys.exit(main())


