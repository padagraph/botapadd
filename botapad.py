# -*- coding: utf-8 -*-

import sys
import argparse
from botapi import Botagraph, BotApiError
from reliure.types import Text 

from collections import namedtuple
import codecs
import requests
import re
import csv
from pprint import pprint

DIRECTIONS = ('<<','--','>>')
EDGE = 0  
VERTEX = 1

DEBUG = False
VERBOSE = True

def log(*args):
    if len(args) == 1 and type(args) in (tuple,list):
        args = args[0]
    if VERBOSE:
        print(args)

def debug(*args):
    if DEBUG:
        print( "DEBUG:")
        pprint( args)

def norm_key(key):
    return re.sub('\W' , '', key, flags=re.UNICODE)
   
def csv_rows(lines, start_col=None, end_col=None, separator=";"):
    
    log( "csv_rows %s %s [%s:%s]" % (separator , len(lines), start_col, end_col) )
    reader = csv.reader(lines, delimiter=separator)
    rows = [ r for r in reader]
    rows = [ r[start_col:end_col] for r in rows]
    rows = [ r for r in rows if len(r)]
    
    return rows
    

# TODO
def convert_url(url):
    """ complete url if needed
        framapad expension  auto add /export/txt

     """
     
    re_framapad = "https?:\/\/([a-z]+)\.framapad.org/p/([0-9a-zA-Z\-_]+)/?([export\/txt]+)?"
    frama = re.findall(re_framapad, url)
    if  len(frama) :
        frama = [r for r in frama[0] if len(r)]
        if  len(frama) == 2 :
            url = "https://%s.framapad.org/p/%s/export/txt" % (frama[0], frama[1])
            return url
            
    #https://framacalc.org/uspaties
    re_framacalc = "https?:\/\/framacalc.org/([0-9a-zA-Z\-_]+)([\.csv]+)?"
    frama = re.findall(re_framacalc, url)
    debug( "convert_url", url , frama )
    if  len(frama) :
        frama = [r for r in frama[0] if len(r)]
        if  len(frama) == 1 :
            url = "https://framacalc.org/%s.csv" % (frama[0])
            return url
            
    
    return url


Prop = namedtuple('Prop', ['name', 'type' ,'isref', 'isindex', 'ismulti', 'isproj', 'iscliq'])


class BotapadError(Exception):
    pass

class BotapadCsvError(Exception):
    def __init__(self, path, separator, message):
        self.path = path
        self.separator = separator
        self.message = message
    
class BotapadURLError(Exception):
    def __init__(self, message, url):
        self.message = message
        self.url = url

class Botapad(object):
    
    def __init__(self, host, key, gid, description, delete=False):
        """ Function doc
        :param : 
        """
        
        # Bot creation & login 
        log( "\n * Locating graph %s @ padagraph %s \n  " % (gid, host) )
        
        self.gid = gid

        self.imports = set()
        
        self.current = () # (VERTEX | EDGE, label, names, index_prop)
        
        self.idx = {}
        self.edgetypes = {}
        self.nodetypes = {}
        self.starred = set() # starred nodes

        self.node_headers = {}
        self.edge_headers = {}
        
        self.projectors = []

        bot = Botagraph(host, key)

        if bot.has_graph(gid) and delete:
            log( " * deleting graph %s" % gid )
            bot.delete_graph(gid)
             
        if not bot.has_graph(gid) :
            log( " * Create graph %s" % gid)
            bot.create_graph(gid, { 'description':description,
                                    'image': "",
                                    'tags': ["Botapad"]
                                  }
                            )

        schema = bot.get_schema(self.gid)['schema']
        
        self.edgetypes = { e['name']:e for e in schema['edgetypes'] }
        self.nodetypes = { n['name']:n for n in schema['nodetypes'] }

        self.bot = bot


    def read(self, path, separator='auto'):
        path = path.strip()
        if path[0:4] == 'http':
            try : 
                url = convert_url(path)
                log( " * Downloading %s \n" % url)
                content = requests.get(url).text
                lines = content.split('\n')
            except :
                raise BotapadURLError("Can't download %s" % url, url)
        else:
            log( " * Opening %s \n" % path)
            try : 
                with codecs.open(path, 'r', encoding='utf8' ) as fin:
                    lines = [ line for line in fin]
            except :
                raise BotapadError("Can't read file %s" % path)

        lines = [ line.strip() for line in lines ]
        lines = [ line.encode('utf8') for line in lines if len(line)]
        
        if separator == u'auto':
            line = lines[0].strip()
            if line in ( '!;','!,'):
                separator = line[1:]
            else: separator = ','

        log(" * Reading %s (%s) lines with delimiter '%s'" % (path, len(lines), separator))

        try : 
            reader = csv.reader(lines, delimiter=separator)
            rows = [ r for r in reader]
            #start_col = 0 if start_col is None else start_col
            #rows = [ r[start_col:end_col] for r in rows]
            rows = [ [ e.strip().decode('utf8')  for e in r ] for r in rows if len(r) and not all([ len(e) == 0 for e in r]) ]
        except :
            raise BotapadCsvError(path, separator, "Error while parsing data %s lines with separator %s" % (len(lines), separator )  )

        return rows
                    
    def parse(self, path, debug=False, **kwargs):
        """ :param path : txt file path

        handles special lines starting with [# @ _]
        for comments, node type, property names
        
        """
        DEBUG = debug


        csv = self.read(path, **kwargs)
        
        rows = []
        
        for row in csv:
            cell = row[0]
            # ! comment
            if cell[:1] == "!":
                continue

            # IMPORT external ressource
            if cell[:1] == "&":
                
                url = cell[1:].strip()
                                
                # circular references
                if url not in self.imports:
                    log("=== Importing === '%s'" % url)
                    self.parse(url)
                else :
                    log ("=== IMPORT === ! circular import ! skipping %s" % url)
                    
            # @ Nodetypes, _ Edgetypes
            elif cell[:1] in ("@", "_"):

                self.post(self.current, rows)
                
                # processing directiv
                line = ";".join(row)
                cols = re.sub(' ', '', line[1:]) # no space
                # @Politic: %Chamber; #First Name; #Last Name;%Party;%State;%Stance;Statement;
                cols = [e for e in re.split("[:;,]" , "%s" % cols, flags=re.UNICODE) if len(e)]
                label = cols[0] # @Something
                
                # ( name, type indexed, projection )
                props = [ Prop( norm_key(e), Text(multi="+" in e), "@" in e, "#" in e, "+" in e,  "%" in e, "+" in e and "=" in e ) for e in  cols[1:]]
                start = 0
                end   = None
                props = props[start: end]
                
                names = [ k.name for k in props ]
                projs = [ k.name for k in props if k.isproj ]
                indexes = [ k.name for k in props if k.isindex ]

                typeprops = { p.name : p.type for p in props }
                    
                if cell[:1] == "@": # nodetype def
                    rows = []
                    
                    self.current = (VERTEX, label, props)
                    if not label in self.nodetypes:
                        log( "* posting @ %s [%s]" % (label, ", ".join(names)) , indexes, projs)
                        self.nodetypes[label] = self.bot.post_nodetype(self.gid, label, label, typeprops)
                        self.node_headers[label] = props
                        
                elif cell[:1] == "_": # edgetype def
                    rows = []
                    self.current = (EDGE, label, props)
                    if not label in self.edgetypes:                        
                        log( "* posting _ %s [%s]" % (label, ", ".join(names)) )
                        self.edgetypes[label] = self.bot.post_edgetype(self.gid, label, "", typeprops)
                        self.edge_headers[label] = props
                        
            else: # table data
                if self.current and self.current[2]:
                    props = self.current[2]
                    for i, v in enumerate(row[1:]):
                        if i >= len(props): break
                        #print props[i] , row[i+1]
                        if props[i].ismulti :
                            row[i+1] = [  e.strip() for e in re.split("[_,;]", v.strip(), ) ]
                            
                rows.append(row)

        self.post( self.current, rows)

        log( " * Starring %s nodes" % len(list(self.starred)) )
        self.bot.star_nodes(self.gid, [ self.idx[e] for e in self.starred ])
        self.starred = set()
        
        log( " * [Parse] %s complete" % path )
        log( self.bot.get_graph(self.gid) , self.imports)

        return path , self.bot.get_graph(self.gid), self.imports

    def post(self, current, rows):
        
        if not len(rows) or not len(current): return
        
        mode, label, props = current
        names = [ k.name for k in props ]

        if mode == EDGE:

            edges = []
            for row in rows:
                #row = [r.strip() for r in row]
                edge = [ e.strip() for e in re.split("\s+", row[0], flags=re.UNICODE)]
                src, direction, tgt = edge
                if direction not in DIRECTIONS :
                    raise ValueError('edge direction not in [%s]' % ", ".join(DIRECTIONS))
                
                if '<' in direction:
                    tmp = src
                    src = tgt
                    tgt = tmp
                
                values = row[1:] if len(row)>1 else []

                if src in self.idx and tgt in self.idx:
                    edgeprops = dict(zip(names, values))
                    edgeprops['label'] = edgeprops.get('label', self.edgetypes[label]['name'])
                    
                    payload = {
                        'edgetype': self.edgetypes[label]['uuid'],
                        'source': self.idx[src],
                        'target': self.idx[tgt],
                        'properties': edgeprops 
                    }
                    edges.append(payload)
                    
            log( "    [POST] EDGE _ %s %s [%s]" % (len(edges), label , ", ".join(names)))
            for e in self.bot.post_edges(self.gid, iter(edges)) : 
                debug(e)
        
        # Vertex
        
        if mode == VERTEX:

            payload = []
            index_props = [ e for e,k in enumerate(props) if k.isindex ]
            
            if len(index_props) == 0 : index_props = [0]
            
            for values in rows:
                if values[0][:1] == "*":
                    values[0] = values[0][1:]
                    self.starred.add(values[0])
                    
                postdata = {
                    'nodetype': self.nodetypes[label]['uuid'],
                    'properties': dict(zip(names, values))
                  }
                  
                if 'label' not in names:
                    key = " ".join([ values[i] for i in index_props ])
                    postdata['properties']['label'] = key
                
                payload.append( postdata)
            
            # post nodes
            
            log( "    [POST] @ %s %s" % (len(payload), label) , names  ,index_props) 
            for node, uuid in self.bot.post_nodes(self.gid, iter(payload)):
                key = "%s" % ("".join([ node['properties'][names[i]] for i in index_props  ]))
                self.idx[ key ] = uuid
                log(key , uuid)
                debug(node)

            self.apply_projectors(rows, label )
            

    def apply_projectors(self, rows, label ):
        """ property projector """

        src = label      #  @ Label 
        props = self.node_headers[src]
        projs = [p for p in props if p.isproj]
        names = [ k[0] for k in props ]

        for iprop, prop in enumerate(props) :

            if not ( prop.isproj or prop.iscliq ) : continue
            
            #  @ Label: %prop0 , ...
            tgt = prop.name

            # Distinct column values 
            values = []
            if prop.ismulti == False:
                values =  [ r[iprop] for r in rows ]
            else :
                for r in rows:
                    if iprop < len(r):
                        values.extend( [ k.strip() for k in r[iprop]] )
            values = list(set(values))
            
            log( "\n * [Projector] : %s(%s) -- %s(%s) (%s) %s" %( src , len(rows), tgt, len(values), iprop, values ) )

            nodeprops = { "label": Text() }

            if tgt not  in self.node_headers:
                self.node_headers[tgt] = [ Prop('label', Text(), False, False, False, False, False )]
                self.nodetypes[tgt] = self.bot.post_nodetype(self.gid, tgt, tgt, nodeprops)

                payload = []
            
                # is this a table ? @ prop0
                for v in values:
                    #key = "%s_%s" % ( tgt, v )
                    key = "%s" % ( v )

                    if key not in self.idx :
                        # if values[0][:1] == "*":
                            #values[0] = values[0][1:]
                            #starred.add(values[0])
 
                        payload.append( {
                            'nodetype': self.nodetypes[tgt]['uuid'],
                            'properties': dict(zip(['label'], [v] ))
                          })

                log( "* [Projector] posting @ %s %s " % (len(payload), tgt ))
                for node, uuid in self.bot.post_nodes(self.gid, iter(payload)):
                    tgtid = '%s' % (node['properties']['label'])
                    self.idx[ tgtid ] = uuid
                    log(node)

                
            etname = "%s_%s" % (src, tgt)
            if etname not in self.edgetypes:
                self.edgetypes[etname] = self.bot.post_edgetype(self.gid, etname, etname, nodeprops)

            # label -- property edge
            edges = []
            indexes = [ e for e, k in enumerate(props) if k.isindex ]
            cliqset = set()
            cliqedges = [] 
            cliqname = ""
            
            for r in rows:                
                if iprop < len(r):
                    targets = r[iprop] if prop.ismulti else [r[iprop]]
                    
                    if prop.iscliq :
                        cliqname = "%s_clique" % (prop.name)
                        if cliqname not in self.edgetypes:
                            self.edgetypes[cliqname] = self.bot.post_edgetype(self.gid, cliqname, cliqname, nodeprops)
                        
                        for e, t in enumerate(targets):
                            for t2 in targets[e+1:]:
                                
                                cliqe = '%s%s' % (t,t2) if t > t2 else (t2,t)
                                if cliqe not in cliqset:
                                    cliqedges.append( {
                                        'edgetype': self.edgetypes[cliqname]['uuid'],
                                        'source': self.idx['%s' % (t)],
                                        'target': self.idx['%s' % (t2)],
                                        'properties': {"label" : cliqname}
                                    } )
                                    cliqset.add(cliqe)
                                    
                    if prop.isproj :
                        for t in targets:
                            st = self.node_headers[label]
                            srcid = "".join([ r[i] for i in indexes  ])
                            tgtid = '%s' % (t)

                            edges.append( {
                                'edgetype': self.edgetypes[etname]['uuid'],
                                'source': self.idx[srcid],
                                'target': self.idx[tgtid],
                                'properties': {"label" : etname}
                            } )

                            
            log( "posting _ %s %s " % (len(cliqedges), cliqname ) )
            #print edges
            for e in self.bot.post_edges(self.gid, iter(cliqedges)) : 
                debug(e)
                
            log( "posting _ %s %s " % (len(edges), etname ) )
            #print edges
            for e in self.bot.post_edges(self.gid, iter(edges)) : 
                debug(e)
        

        
def main():
    """ """
    parser = argparse.ArgumentParser()
    parser.add_argument("name" , action='store', help="graph name", default=None)
    parser.add_argument("path" , action='store', help="path  txt file to parse ", default=None)

    parser.add_argument("--host", action='store', help="host", default="http://padagraph.io")
    parser.add_argument("--key" , action='store', help="authentification token", default=None)
    parser.add_argument("--delete" , action='store_true', help="delete graph", default=False)

    parser.add_argument("--separator" , action='store', help="csv col separator [;]", default=";")
    #parser.add_argument("--start-col" , action='store', help="", type=int, default=0)
    #parser.add_argument("--end-col" , action='store', help="", type=int, default=None)
    

    parser.add_argument("-d", "--debug" , action='store_true', help="", default=False)
    parser.add_argument("-v", "--verbose" , action='store_true', help="", default=False)

    args = parser.parse_args()

    global VERBOSE, DEBUG
    VERBOSE = args.verbose
    DEBUG = args.debug

    log( "VERBOSE", args.verbose, "DEBUG", args.debug )

    if args.host and args.key and args.name and args.path:
        description = "imported from %s . " % args.path
        pad = Botapad(args.host, args.key, args.name, description, delete=args.delete)

        pprint( pad.parse(args.path, separator=args.separator) )
    
    log(" * Visit %s/graph/%s" % ( args.host, args.name, ) )
    
if __name__ == '__main__':
    sys.exit(main())
    