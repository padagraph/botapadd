#!/usr/bin/env python
#-*- coding:utf-8 -*-

import os
import sys
import logging
import codecs
from functools import wraps

from flask import Flask, Response, make_response, g, current_app, request
from flask import render_template, render_template_string, abort, redirect, url_for,  jsonify


from botapad import Botapad

#from screenshot import getScreenShot
#from selenium import webdriver


# app
app = Flask(__name__)
app.config['DEBUG'] = True

# padagraph host to connect
HOST = os.environ.get('BOTAPAD_HOST', "http://localhost:5000")

# padagraph host valid token
KEY  = codecs.open("key.txt", 'r', encoding='utf8').read()

# delete before import
DELETE = os.environ.get('BOTAPAD_DELETE', "True").lower() == "true"
PATH = "./static/images" # images storage

# browser webdriver
#driver = webdriver.Chrome("chromedriver")

from flaskext.markdown import Markdown
Markdown(app)

def img_url(gid):
    return '%s/%s.png' % ( PATH, gid )

def graph_url(gid):
    return '%s/graph/%s' % ( HOST, gid )
    


def import_pad(gid, url):
    description = "imported from %s" % url
    bot = Botapad(HOST, KEY, gid, description, delete=DELETE)
    return bot.parse(url, separator='auto')

def snapshot(gid, **kwargs):
    """
    requires screenshot & selenium driver
    """
    path = '%s/%s.png' % ( PATH, gid )
    #driver, HOST, gid, path, width, height, {iframe params}
    getScreenShot(driver, HOST, gid, path, 400,400, **kwargs)    


@app.route('/image/<string:gid>', methods=['GET', 'POST'])
def image(gid):
    return redirect( img_url(gid) )



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
    
    
@app.route('/import', methods=['GET'])
def home():
    return render_template('homepage.html' )


@app.route('/import', methods=['POST'])
@app.route('/', methods=['GET'])
def botimport():
    gid = request.args.get('gid', None)
    url = request.args.get('url', None)

    if gid is None:
        gid = request.form.get('gid', None)
        url = request.form.get('url', None)

    complete = False
    iframe = ""
    if gid and url:
        args = request.args
        params = {
            #
            'wait' : 4,
            #template
            'color' : args.get("color", "12AAAA" ),
            'zoom'  : args.get("zoom", 1200 ),
            'buttons': 0, # removes play/vote buttons
            'labels' : 1 if args.get("no-labels", None ) else 0,  # removes graph name/attributes 
            # gviz
            'vtx_size' : args.get("vertex_size", 0 ),
            'show_text'  : 0 if args.get("no_text"  , None ) else 1,     # removes vertex text 
            'show_nodes' : 0 if args.get("no_nodes" , None ) else 1,   # removes vertex only 
            'show_edges' : 0 if args.get("no_edges" , None ) else 1,   # removes edges 
            'show_images': 0 if args.get("no_images", None ) else 1, # removes vertex images
            
            'auto_rotate': 1,
                
        }

        import_pad(gid, url)

        querystr = "&".join(["%s=%s" % (k,v) for k,v in params.items()])
        iframe = "%s/iframe/%s?%s#graph" % ( HOST, gid, querystr )
        complete = True

        #snapshot(gid, **params)

    return render_template('homepage.html', iframe= iframe, url=graph_url(gid) , img=img_url(gid), complete=complete)
    
def main():
    ## run the app
    from flask_runner import Runner

    runner = Runner(app)
    runner.run()


if __name__ == '__main__':
    sys.exit(main())


