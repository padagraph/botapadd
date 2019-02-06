
import os
import sys
import json
import argparse
from botapi import Botagraph, BotApiError
from botapad import *
from reliure.types import Text , Numeric

import collections 
import codecs
from six import StringIO
import requests
import re
import csv
from pprint import pprint
import traceback

try:
    reload(sys)
    sys.setdefaultencoding('utf-8')
except : pass

DIRECTIONS = ('<-','<<','--',"<>",'>>', '->')
VERTEX = 0
EDGE = 1  
EDGE2 = 2  

def norm_key(key):
    s = re.sub( "(\[.*\])", "", key.strip() )
    s = re.sub('\W' , '', s.strip(), flags=re.UNICODE)
    s = re.sub( "(^[0-9]*\.?[0-9]*)", "", s.strip() )
    
    return s.strip()
    
def csv_rows(lines, start_col=None, end_col=None, separator=";"):
    
    reader = csv.reader(lines, delimiter=separator)
    rows = [ r for r in reader]
    rows = [ r[start_col:end_col] for r in rows]
    rows = [ r for r in rows if len(r)]
    
    return rows
    

# TODO
def convert_url(url):
    return parse_url(url)[0]
    
def parse_url(url):
    """ complete url if needed
        framapad expension  auto add /export/txt

     """
    re_pad = "https?:\/\/docs.google.com/document/d/([0-9a-zA-Z\-_]+)/?"
    pad = re.findall(re_pad, url)
    if  len(pad) :
        return "https://docs.google.com/document/d/%s/export?format=txt" % (pad[0]), pad[0], "txt"
    
    re_pad = "https?:\/\/docs.google.com/spreadsheets/d/([0-9a-zA-Z\-_]+)/"
    pad = re.findall(re_pad, url)
    if  len(pad) :
        return "https://docs.google.com/spreadsheets/d/%s/export?format=csv" % (pad[0]), pad[0], "csv"
    
    re_pad = "https?:\/\/([a-z0-9]+)\.framapad.org/p/([0-9a-zA-Z\-_]+)/?([export\/txt]+)?"
    pad = re.findall(re_pad, url)
    if  len(pad) :
        pad = [r for r in pad[0] if len(r)]
        if  len(pad) == 2 :
            url = "https://%s.framapad.org/p/%s/export/txt" % (pad[0], pad[1])
            return url, pad[0], "txt"
            
    # padagraph.io
    re_pad = "https?:\/\/calc.padagraph.io/([0-9a-zA-Z\-_]+)([\.csv]+)?"
    pad = re.findall(re_pad, url)

    if  len(pad):
        pad = [r for r in pad[0] if len(r)]
        if  len(pad) :
            return "%s.csv" % url, pad[0], "csv"

    # ethercald & framacalc
    re_pad = "https?:\/\/(?:frama|ether)calc.org/([0-9a-zA-Z\-_]+)([\.csv]+)?"
    pad = re.findall(re_pad, url)
    
    if  len(pad):
        pad = [r for r in pad[0] if len(r)]
        if  len(pad) :
            return "%s.csv" % url, pad[0], "csv"

    # hackmd
    re_pad = "https?:\/\/hackmd.io\/(?:s/)?([0-9a-zA-Z\-_\=\+]+)"
    pad = re.findall(re_pad, url)
    if  len(pad) :
        return "https://hackmd.io/%s/download" % pad[0], pad[0], "md"
        
    # github
    return url, None, ""

def namedtuple_with_defaults(typename, field_names, default_values=()):
    T = collections.namedtuple(typename, field_names)
    T.__new__.__defaults__ = (None,) * len(T._fields)
    if isinstance(default_values, collections.Mapping):
        prototype = T(**default_values)
    else:
        prototype = T(*default_values)
    T.__new__.__defaults__ = tuple(prototype)
    return T
    
#                                label   ,  text  , @     ,  #       ,  +       ,  %      ,  =      , !         , (float) ,[default]
Prop = namedtuple_with_defaults('Prop', ['name', 'type' ,'isref', 'isindex', 'ismulti', 'isproj','iscliq', 'isignored', 'direction', 'weight','value'  ], default_values=() )


class Botapad(object):
    
    def __init__(self, bot, gid, description, delete=False, verbose=True, debug=False):
        # Bot creation & login 
            
        self.verbose = verbose
        self._debug = debug
        self._log = StringIO()
        self.log( "\n * Locating graph %s @ padagraph \n  " % (gid) )
        
        self.gid = gid
        self.imports = set()
        self.path = None
        
        self.current = () # (VERTEX | EDGE, label, names, index_prop)
        
        self.idx = {}
        self.edgetypes = {}
        self.nodetypes = {}
        self.starred = set() # starred nodes

        self.node_headers = {}
        self.edge_headers = {}
        
        self.projectors = []

        if bot.has_graph(gid) and delete:
            self.log( " * deleting graph %s" % gid )
            bot.delete_graph(gid)
             
        self.log( " * Create graph %s" % gid)
        bot.create_graph(gid, { 'name': gid,
                                'description':description,
                                'image': "",
                                'tags': ["Botapad"]
                              }
                        )

        schema = bot.get_schema(self.gid)['schema']
        
        self.edgetypes = { e['name']:e for e in schema['edgetypes'] }
        self.nodetypes = { n['name']:n for n in schema['nodetypes'] }

        self.bot = bot

    def get_log(self):
        return self._log.getvalue()
        
    def log(self, *args):
        if len(args) == 1 and type(args) in (tuple,list):
            args = args[0]
        if self.verbose:
            self._log.write( "; ".join([ "*%s" % e for e in args ]))
            self._log.write( "\n" )
            print(args)

    def debug(self, *args):
        if self._debug:
            self._log.write( "DEBUG" )
            self._log.write( json.dumps(args))
            self._log.write( "\n" )
            pprint( args)


    def read(self, path, separator='auto', output=None, **kwargs):
        """
        path : file path or url
        """
        encoding = 'utf-8'
        path = path.strip()

        if path[0:4] == 'http':
            try : 
                url = convert_url(path)
                self.log( " * Converting url %s to %s" % ( path, url ))
                self.log( " * Downloading %s %s" % (url, separator))
                r = requests.get(url)
                content = r.text

                self.log( "   %s, length %s encoding %s  %s\n" % (r, len(content), r.encoding, type(r.text)))
                
                # bug BOM ggdoc
                if content[0:1] == u'\ufeff':
                    content = content[1:]
                lines = content.split('\n')
                
                if output:
                    with open(output, "a") as myfile:
                        myfile.write("\n\n! %s \n\n" % path)                
                        for line in lines:
                            if len(line) and line[0] != "&":
                                myfile.write("%s\n" % line)

            except Exception as err :

                raise BotapadURLError("Can't download %s" % url, err)

        else:
            self.log( " * Opening %s \n" % path)
            
            bytes = min(32, os.path.getsize(path))
            raw = open(path, 'rb').read(bytes)
            if raw.startswith(codecs.BOM_UTF8):
                encoding = 'utf-8-sig'
            #else:
                #result = chardet.detect(raw)
                #encoding = result['encoding']

            try : 
                with codecs.open(path, 'r', encoding=encoding ) as fin:
                    lines = [ line for line in fin]
                
            except :
                raise BotapadError("Can't read file %s" % path)

        lines = [ line.strip()for line in lines ]
        lines = [ line for line in lines if len(line)]
        
        if not len(lines):
            raise BotapadCsvError(path, separator, "Table is empty %s lines" % (len(lines) )  )
            

        if separator == 'auto':
            line = lines[0].strip()
            if line in ( '!;','!,'):
                separator = line[1:]
            else: separator = ','
            
        self.log(" * Reading %s [%s] (%s) lines with delimiter '%s' " % (path, encoding, len(lines), separator))

        try : 
            reader = csv.reader(lines, delimiter=separator)
            rows = [ r for r in reader]
            rows = [ [ e.strip()  for e in r ] for r in rows if len(r) and not all([ len(e) == 0 for e in r]) ]
        except :
            raise BotapadCsvError(path, separator, "Error while parsing data %s lines with separator %s" % (len(lines), separator )  )

        return rows

                    
    def parse(self, path, debug=False, output=None, **kwargs):
        self._debug = debug
        
        if output:
            with open(output, "w") as myfile:
                myfile.write("\n! %s \n" % path)                
        self.output = output
    
        rows = []
        rows = self._parse(path, rows, output=output,  **kwargs)            
        
        self.post( self.current, rows )

        self.log( " * [Parse] %s complete" % path )
        g = self.bot.get_igraph(weight_prop="weight")
        self.log( g.summary() )

        self.log( " * Starring %s nodes %s" % (len(list(self.starred)), self.starred ))
        self.bot.star_nodes(self.gid, [ e for e in self.starred ])
        self.starred = set()
        
        graph = self.bot.get_graph(self.gid)
        self.log( graph , self.imports)
        return path , graph, self.imports

    def parse_csvrows(self, rows, **kwargs):
        
        buff = []
        rows = self._parse_csvrows(rows, buff, **kwargs)
        self.post( self.current, rows )

        self.log( " * Starring %s nodes" % len(list(self.starred)) )
        self.bot.star_nodes(self.gid, [ self.idx[e] for e in self.starred ])
        self.starred = set()
        
        self.log( " * [Parse] %s rows  complete" % len(rows) )
        
        g = self.bot.get_graph(self.gid) 
        self.log( g, self.imports)
        return g, self.imports

            
    def _parse(self, path, rows, **kwargs):
        """ :param path : txt file path

        for comments, node type, property names
        
        """
        self.log( "\n * _parse %s %s + %s" % (path, len(rows), kwargs)  )
        self.imports.add(path)
        self.path = path
        csv = self.read(path, **kwargs)
        
        return self._parse_csvrows(csv, rows, **kwargs)

        
    def _parse_csvrows(self, csv, rows, **kwargs):

        # ( name, type indexed, projection )
        def _w(e):
            isproj="%" in e
            w =  re.findall( "\((-?[0-9]?\.?[0-9]+)\)", e  )
            if isproj and len(w) :
                w = float(w[0])
            elif isproj :
                w = 1.
            else  :
                w = None

            return w

        def _v(e):
            
            isproj="%" in e
            w =  "".join( re.findall( "\[(.*)\]", e  ))
            if not isproj : 
                return w if len(w) else None 
            elif isproj :
                return None

        for row in csv:
            cell = row[0]
            # ! comment
            if cell and cell[:1] == "!":
                continue

            # IMPORT external ressource
            if cell and cell[:1] == "&":
                
                url = cell[1:].strip()
                # circular references
                if url not in self.imports:
                    self.log("  === Import === '%s'" % url)
                    rows = self._parse(url, rows, **kwargs)
                else :
                    raise BotapadParseError(self.path, "Same file is imported multiple times  ! ", row )
                    
            # @ Nodetypes, _ Edgetypes
            elif cell and cell[:1] in ("@", "_"):

                self.post(self.current, rows)
                rows = []
                
                # processing directiv
                line = ";".join(row)
                cols = re.sub(' ', '', line[1:]) # no space
                # @Politic: %Chamber; #First Name; #Last Name;%Party;%State;%Stance;Statement;
                cols = [e for e in re.split("[:;,]" , "%s" % cols, flags=re.UNICODE) if len(e)]
                label = cols[0] # @Something
                
                start = 1
                if cell[:1] == "_" and cell[1] == "" and cell[1] == "" : start = 3
                
                props = [ Prop( name=norm_key(e), type=Text(multi="+" in e, default=_v(e)),
                    isref="@" in e, isindex="#" in e, ismulti="+" in e,
                    isproj="%" in e, iscliq="+" in e and "=" in e ,
                    isignored="!" in e,
                    direction= "OUT" if ">" in e else "IN" if "<" in e else "ALL" ,
                    weight=_w(e), value=_v(e) ) for e in cols[start:] ]

                def get_prop(name):
                    for e in props :
                        if e.name == name :
                            return e
                    return None

                start = 0
                end   = None
                props = props[0: end]
                self.log( "\n * @%s : Props " % label )
                self.log( "  (%s)" % ",".join(Prop()._fields) )
                for e in props:
                    self.log( "  %s" % str([v for v in e]) )
                
                
                names = [ k.name for k in props ]
                projs = [ k.name for k in props if k.isproj ]
                indexes = [ k.name for k in props if k.isindex ]

                typeprops = lambda px : { p.name : p.type for p in px }
                
                if cell[:1] == "@": # nodetype def
                    # raise error if no label & index
                    pl = get_prop('label')
                    
                    if len(indexes) == 0 and pl is None:
                        message = 'No `index` nor `label` set for @%s ' % (label )
                        raise BotapadParseError(self.path, message, row )

                    if len(indexes) == 0:
                        indexes = ['label']
                        
                    for prop in props:
                        if len(prop.name) == 0:
                            message = "Property error %s " % prop
                            raise BotapadParseError(self.path, 'Parse error : %s ' % message, row )
                    
                    if len(projs) > 0 and len(indexes) == 0 :
                        message = "no `index` properties to create edge %s " % self.current
                        raise BotapadParseError(self.path, 'Parse error :  %s\n  ' % ( message), row )

                    self.current = (VERTEX, label, props)

                    if not label in self.nodetypes:
                        self.log( "\n  >> posting @ %s [%s] [%s] [%s]" % (label, ", ".join(names) , ", ".join(indexes), ", ".join(projs)))
                        self.nodetypes[label] = self.bot.post_nodetype(self.gid, label, label, typeprops(props))
                        self.node_headers[label] = props
                        
                elif cell[:1] == "_": # edgetype def
                    rows = []
                    self.current = (EDGE2, label, props)
                    
                    if not label in self.edgetypes:                        

                        if "label" not in names : props = [Prop( name="label", type=Text(), value="" )] + props
                        if "weight" not in names : props = [Prop( name="weight", type=Numeric(), value=1. )] + props
                        names = [ k.name for k in props ]
                        self.log( "  >> posting _ %s [%s]" % (label, ", ".join(names)) )
                        
                        self.edgetypes[label] = self.bot.post_edgetype(self.gid, label, "", typeprops(props))
                        self.edge_headers[label] = props

                
                        
            else: # table data
                if self.current and self.current[2]:
                    props = self.current[2]
                    if self.current[0] in (EDGE, EDGE2):
                        
                        start = 1 # if self.current[0] == EDGE:
                        if self.current[0] == EDGE2:
                            start = 3
                            
                        for i, v in enumerate(row[start:]):
                            if i >= len(props): break
                            if props[i].ismulti:
                                row[i+start] = list(set([  e.strip() for e in re.split("[,;]", v.strip(), ) if e.strip() != "" ]))
                                
                    elif self.current[0] == VERTEX:
                        for i, v in enumerate(row):
                            if i >= len(props): break
                            if props[i].ismulti :
                                row[i] = [  e.strip() for e in re.split("[,;]", v.strip(), ) if e.strip() != "" ]
                            
                rows.append(row)
                
        return rows

    def post(self, current, rows):
        
        if not len(rows) or not len(current): return
        
        mode, label, props = current
        names = [ k.name for k in props ]

        if mode in (EDGE,EDGE2):

            edges = []
            try : 
                for row in rows:
                    edge = None
                    values = []
                    if mode == EDGE:
                        edge = [ e.strip() for e in re.split("\s+", row[0], flags=re.UNICODE)]
                        values = row[1:] if len(row)>1 else []

                    elif mode == EDGE2:
                        edge = row[0:3]
                        values = row[3:] if len(row)>1 else []
                                        
                    src, direction, tgt = edge
                    
                    if direction not in DIRECTIONS :
                        raise ValueError('edge direction not in [%s]' % ", ".join(DIRECTIONS))
                    
                    if '<' in direction:
                        tmp = src
                        src = tgt
                        tgt = tmp
                    

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
                        
                self.log( "    [POST] EDGE _ %s %s [%s]" % (len(edges), label , ", ".join(names)))
                for e,i in self.bot.post_edges(self.gid, iter(edges) ) :
                    self.debug(e)
                    
            except Exception as err:
                print( "Erreur mode : %s \n %s" % (mode, traceback.format_exc()), row )
                raise BotapadPostError("Error while posting edges ", edges, row)
        # Vertex
        
        if mode == VERTEX:

            payload = []
            index_props = [ e for e,k in enumerate(props) if k.isindex ]
            
            if len(index_props) == 0 : index_props = [0]
            try :
                stars = set()
                for values in rows:
                    star = False
                    if values[0] and values[0][:1] == "*":
                        print (">>> STARRING %s" % values[0])
                        values[0] = values[0][1:]
                        star = True

                    values = [ e.value  if e.value and v == "" else v for e,v in zip(props, values) if e.isproj == False ]
                    _names = [ e.name for e in props if e.isproj == False ]
                        
                    postdata = {
                        'nodetype': self.nodetypes[label]['uuid'],
                        'properties': dict(zip(_names, values))
                      }

                    key = "".join([ values[i] for i in index_props ])

                    if star:
                        stars.add(key)
                      
                    if 'label' not in names:
                        postdata['properties']['label'] = key
                    
                    payload.append( postdata)
                
                # post nodes
                node = None
                self.log( "    [POST] @ %s %s [%s] (%s)" % (len(payload), label , ", ".join(names)  ,  ", ".join(["%s" % e for e in index_props]) )) 

                for node, vi in self.bot.post_nodes(self.gid, iter(payload), key=[names[i] for i in index_props]):
                    key = "%s" % ("".join([ node['properties'][names[i]] for i in index_props  ]))
                    self.idx[ key ] = vi
                    if key in stars : self.starred.add(node['uuid'])
                    self.debug( "%s  %s  %s  %s" % (key , vi, node['uuid'], "   <<<<<<<<< *" if key in stars else "") )

            except KeyError as e:
                print(e)
                pprint( payload)
                message = "Cannot find column `%s` in : \n %s" % ( e, payload )
                raise BotapadParseError("", message, payload)
            except Exception as e:
                raise
                raise BotapadError(e.message)
                
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
            
            self.log( "\n * [Projector] : %s(%s) -- %s(%s) (%s) " %( src , len(rows), tgt, len(values), prop.name) )

            if tgt in self.node_headers:
                nodeprops = { prop.name: Text(default= prop.value ) for prop in self.node_headers[tgt] }

            elif tgt not in self.node_headers:
                nodeprops = { "label": Text(),  }
                self.node_headers[tgt] = [ Prop('label', Text(),False, False, False, False, False, False, 1., None )]
                self.nodetypes[tgt] = self.bot.post_nodetype(self.gid, tgt, tgt, nodeprops)

            payload = []
        
            # is this a table ? @ prop0
            for v in values:
                #key = "%s_%s" % ( tgt, v )
                key = "%s" % ( v )
                if key not in self.idx :
                    # defaults values
                    _k = [ p.name for p in self.node_headers[tgt] if p.value ]
                    _v = [ p.value for p in self.node_headers[tgt] if p.value  ]
                    properties = dict( zip(_k,_v) )
                    properties['label'] = v
                    
                    payload.append( {
                        'nodetype': self.nodetypes[tgt]['uuid'],
                        'properties': properties
                      })
                      
            if len(payload):
                self.log( " * [Projector] posting @ %s %s " % (len(payload), tgt ))
                for node, uuid in self.bot.post_nodes(self.gid, iter(payload)):
                    tgtid = '%s' % (node['properties']['label'])
                    self.idx[ tgtid ] = uuid
                    self.debug(node)
                
            etname = "%s/%s" % (src, tgt)
            edgeprops = { "label": Text(), 'weight' :Numeric( vtype=float, default=1. ) }
            if etname not in self.edgetypes:
                self.log( " * [Projector] POST edgetype %s %s " % (etname, edgeprops ) )
                self.edgetypes[etname] = self.bot.post_edgetype(self.gid, etname, etname, edgeprops)

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
                            self.log( " * [Projector] POST edgetype %s %s " % (cliqname, edgeprops ) )
                            self.edgetypes[cliqname] = self.bot.post_edgetype(self.gid, cliqname, cliqname, edgeprops)
                        
                                
                        for e, t in enumerate(targets):
                            for t2 in targets[e+1:]:
                                
                                cliqe = '%s%s' % (t,t2) if t > t2 else (t2,t)
                                if cliqe not in cliqset:
                                    
                                    properties = {"label" : cliqname, 'weight' : prop.weight}
                                    if cliqname in self.edge_headers:
                                        _k = [ p.name  for p in self.edge_headers[cliqname] if p.value ]
                                        _v = [ p.value for p in self.edge_headers[cliqname] if p.value ]
                                        properties = dict( zip(_k,_v) )
                                        

                                    cliqedges.append( {
                                        'edgetype': self.edgetypes[cliqname]['uuid'],
                                        'source': self.idx['%s' % (t)],
                                        'target': self.idx['%s' % (t2)],
                                        'properties': properties
                                    } )
                                    cliqset.add(cliqe)
                                    
                    if prop.isproj :

                        for t in targets:
                            st = self.node_headers[label]
                            srcid = "".join([ r[i] for i in indexes  ])
                            tgtid = '%s' % (t)

                            properties = dict()
                            if etname in self.edge_headers:
                                _k = [ p.name  for p in self.edge_headers[etname] if p.value ]
                                _v = [ p.value for p in self.edge_headers[etname] if p.value ]
                                properties = dict( zip(_k,_v) )

                            properties['label']  = etname
                            properties['weight'] = prop.weight

                            # edge direction
                            essrc = self.idx[srcid] if prop.direction in ("IN",) else self.idx[tgtid]
                            estgt = self.idx[srcid] if prop.direction in ("OUT", "ALL") else self.idx[tgtid]

                            edges.append( {
                                'edgetype': self.edgetypes[etname]['uuid'],
                                'source': essrc,
                                'target': estgt,
                                'weight' : prop.weight,
                                'properties': properties
                            } )
                            
            direction = prop.direction
            self.log( " * [Projector] posting _ = %s %s %s " % (len(cliqedges), direction, cliqname ) )
            for e in self.bot.post_edges(self.gid, iter(cliqedges), extra=lambda x : etname) : 
                self.debug(e)
                    
            self.log( " * [Projector] posting _ %% %s %s %s " % (len(edges), direction, etname ) )
            for e in self.bot.post_edges(self.gid, iter(edges), extra=lambda x : etname) : 
                self.debug(e)
            
            
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
    
    parser.add_argument("-o", "--output" , action='store', help="csv output path", default=None)

    parser.add_argument("-d", "--debug" , action='store_true', help="", default=False)
    parser.add_argument("-v", "--verbose" , action='store_true', help="", default=False)

    args = parser.parse_args()

    verbose = args.verbose
    debug = args.debug

    if args.host and args.key and args.name and args.path:
        description = "imported from %s . " % args.path
        bot = Botagraph(args.host, args.key)
        pad = Botapad(bot, args.name, description, delete=args.delete, verbose=verbose, debug=debug )
        pad.log( "VERBOSE", args.verbose, "DEBUG", args.debug )
        pprint( pad.parse(args.path, separator=args.separator, output=args.output) )

        pad.log(" * Visit %s/graph/%s" % ( args.host, args.name, ) )

if __name__ == '__main__':
    sys.exit(main())
