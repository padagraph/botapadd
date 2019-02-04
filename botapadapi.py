#!/usr/bin/env python
#-*- coding:utf-8 -*-

from flask import request, jsonify
from flask import Response, make_response

import igraph
from igraph.utils import named_temporary_file
import pickle
import json

import datetime
from collections import Counter

from reliure.types import GenericType, Text, Numeric, Boolean
from reliure.web import ReliureAPI, EngineView, ComponentView, RemoteApi
from reliure.pipeline import Optionable, Composable
from reliure.engine import Engine

from cello.graphs import export_graph, IN, OUT, ALL
from cello.graphs.prox import ProxSubgraph, ProxExtract, pure_prox, sortcut
from cello.layout import export_layout
from cello.clustering import export_clustering

from pdgapi.explor import ComplexQuery, AdditiveNodes, NodeExpandQuery, layout_api, clustering_api

from botapad.utils import export_graph, prepare_graph   
from botapad import Botapad, BotapadError, BotapadParseError, BotapadURLError, BotapadCsvError, BotapadPostError

from botapi import BotApiError, Botagraph,  BotaIgraph, BotLoginError


def db_graph(graphdb, query ):
    gid = query['graph']
    graph = graphdb.get_graph(gid)
    return graph

def pad2pdg(gid, url, host, key, delete, debug=False):
    description = "imported from %s" % url
    bot = Botagraph()
    botapad = Botapad(bot, gid, description, delete=delete)
    return botapad.parse(url, separator='auto', debug=debug)
        
AVAILABLE_FORMATS = ('pickle', 'graphml', 'graphmlz', 'gml', 'pajek')
        
def pad2igraph(gid, url, format, delete=False, store="/pads/", debug=True):

    print ("format", gid, url, format )
    
    if format == 'csv':
        
        try : 
            description = "imported from %s" % url
            if url[0:4] != 'http':
                url = "%s/%s.%s" % (store, url, format) 
            bot = BotaIgraph(directed=True)
            botapad = Botapad(bot , gid, description, delete=delete, verbose=True, debug=False)
            botapad.parse(url, separator='auto', debug=debug)
            graph = bot.get_igraph(weight_prop="weight")

            if graph.vcount() == 0 :
                raise BotapadParseError(url, "Botapad can't create a graph without nodes.", None )

            return prepare_graph(gid, graph)
            
        except BotapadParseError as e :
            log = botapad.get_log()
            e.log = log
            raise e
            
        except OSError as e :
            raise BotapadURLError( "No such File or Directory : %s " % url, url)

            
        
    elif format in AVAILABLE_FORMATS:
        content = None
        if url[0:4] == 'http':
            try :
                url = convert_url(path)
                if format in ( 'pickle', 'picklez'):
                    raise ValueError('no pickle from HTTP : %s ' % url )
                print( " === Downloading %s %s\n" % (url, separator))
                content = requests.get(url).text
            except :
                raise BotapadURLError("Can't download %s" % url, url)

        else : 
            try :                 
                print (" === reading  %s/%s.%s" % (store, url, format) )
                content = open("%s/%s.%s" % (store, url, format) , 'r').read()
            except Exception as err :
                raise BotapadURLError("Can't open file %s: %s" % (url, err), url)


        try :
            with named_temporary_file(text=False) as tmpf: 
                outf = open(tmpf, "wt") 
                outf.write(content) 
                outf.close()         
                graph =  igraph.read(tmpf, format=format) 
  
            return prepare_graph(gid, graph)
        
        except Exception as err :
            raise
            raise BotapadError('%s : cannot read %s file at %s : %s' % ( gid, format, url, err))

    else :
        raise BotapadError('%s : Unsupported format %s file at %s ' % ( gid, format, url ))
    
    

def _weights(weightings):

    def _w( graph, vertex):
        
        r = [(vertex, 1)] # loop        
        for i in graph.incident(vertex, mode=ALL):
            e = graph.es[i]
            v = e.source if e.target == vertex else e.target

            w = (v, 1) # default
            
            if weightings:
                if "1" in weightings : 
                    w = (v, 1.)
                elif "weight" in weightings:
                    w = (v, e['weight'])
        
            r.append( w )
                
        return r
        
    return _w

    
def explore_engine(graphdb):
    """ Prox engine """
    # setup
    engine = Engine("graph")
    engine.graph.setup(in_name="request", out_name="graph")

    ## Search
    @Composable
    def get_graph(query, **kwargs):
        return db_graph(graphdb, query)
        
    @Composable
    def subgraph(query, cut=100, weighted=True, length=7, mode=ALL, add_loops=False, **kwargs ):

        graph = db_graph(graphdb, query)

        uuids = { v['uuid'] : v.index for v in graph.vs }
        pz = [ q for q in query.get('units', []) ]
        pz = [ uuids[p] for p in pz ]
        
        extract = ProxExtract()
        vs = []
        if len(pz):
            for u in pz:
                s = extract(graph, pzeros=[u], weighted=weighted,mode=mode, cut=cut, length=length)
                vs = vs + list(s.keys())
        else :
            s = extract(graph, pzeros=[], weighted=weighted,mode=mode, cut=cut, length=length)
            vs = list(s.keys())
            
        return graph.subgraph(vs)

    @Composable
    def filtering(graph, single_filtered=False, **kwargs):
        if single_filtered :
            to_del = []
            for v in graph.vs:
                if not len(v.neighbors()):
                    to_del.add(v.index)
            graph.vs.delete(to_del)
        
        return graph
        
    from cello.graphs.transform import VtxAttr
    
    searchs = []
    for k,w,l,m,n  in [
              (u"Search", True, 6, ALL ,100 ), ]:
        search = Optionable("GraphSearch")
        search._func = subgraph
        search.add_option("weighted", Boolean(default=w))
        search.add_option("add_loops", Boolean(default=True, help="add loops on vertices"))
        search.add_option("mode", Numeric(choices=[ OUT, IN,  ALL], default=m, help="edge directions"))
        search.add_option("length", Numeric( vtype=int, min=1, default=l))
        search.add_option("cut", Numeric( vtype=int, min=2, default=n))
        
        search |= VtxAttr(color=[(45, 200, 34), ])
        search |= VtxAttr(type=1)

        search.name = k
        searchs.append(search)

    sglobal = get_graph | ProxSubgraph()
    sglobal.name = "Global"
    searchs.append(sglobal)


    engine.graph.set( *searchs )
    return engine

    
def expand_prox_engine(graphdb):
    """
    prox with weights and filters on UNodes and UEdges types
    
    input:  {
                nodes : [ uuid, .. ],  //more complex p0 distribution
                weights: [float, ..], //list of weight
            }
    output: {
                graph : gid,
                scores : [ (uuid_node, score ), .. ]
            }
    """
    engine = Engine("scores")
    engine.scores.setup(in_name="request", out_name="scores")

    ## Search
    def expand(query, length=3, cut=300, nodes=False, weightings=None):

        graph = db_graph(graphdb, query)
        gid = query.get("graph")
        uuids = { v['uuid'] : v.index for v in graph.vs }

        pz = {}
        qnodes = query.get("nodes", []) if nodes else []
        qexpand = query.get("expand", [])
        pz.update( { uuids[p] : 1./len(_nodes) for p in qnodes } )
        pz.update( { uuids[p] : 1. for p in qexpand })
        
        print( "expand >>> %s" % pz )
        weightings = ["1"] if weightings in ([], None) else weightings
        wneighbors = _weights(weightings)
        
        vs = pure_prox(graph, pz, length, wneighbors)
        vs = sortcut(vs, cut)
        vs = [ (graph.vs[v[0]]['uuid'], v[1]) for v in vs ]
        return dict(vs)

    scores = Optionable("scores")
    scores._func = Composable(expand)
    scores.add_option("length", Numeric( vtype=int, default=3))
    scores.add_option("cut", Numeric( vtype=int, default=50, max=300))
    scores.add_option("nodes", Boolean( default=True))
    scores.add_option("weighting", Text(choices=[  u"0", u"1", u"weight" ], multi=True, default=u"1", help="ponderation"))
    
    engine.scores.set(expand)

    return engine


def explore_api(engines, graphdb):
    #explor_api = explor.explore_api("xplor", graphdb, engines)
    api = ReliureAPI("xplor",expose_route=False)

    # prox search returns graph only
    view = EngineView(explore_engine(graphdb))
    view.set_input_type(ComplexQuery())
    view.add_output("request", ComplexQuery())
    view.add_output("graph", export_graph, id_attribute='uuid')

    api.register_view(view, url_prefix="explore")

    # prox expand returns [(node,score), ...]
        
    view = EngineView(expand_prox_engine(graphdb))
    view.set_input_type(NodeExpandQuery())
    view.add_output("scores", lambda x:x)

    api.register_view(view, url_prefix="expand_px")

    # additive search
    view = EngineView(engines.additive_nodes_engine(graphdb))
    view.set_input_type(AdditiveNodes())
    view.add_output("graph", export_graph, id_attribute='uuid'  )

    api.register_view(view, url_prefix="additive_nodes")

    @api.route("/<string:gid>.json", methods=['GET'])
    def _json_dump(gid):
        dumps = lambda g : json.dumps( export_graph(g, id_attribute='uuid') )
        return stargraph_dump(gid, dumps, 'json')

    @api.route("/<string:gid>.pickle", methods=['GET'])
    def _pickle_dump(gid):
        return stargraph_dump(gid, pickle.dumps, 'pickle')

    def stargraph_dump(gid, dumps, content_type):
        """ returns igraph pickled/jsonified starred graph  """

        engine = explore_engine(graphdb)
        
        meta = graphdb.get_graph_metadata(gid)
        graph = engine.play({'graph':gid})['graph']

        for k,v in meta.iteritems():
            graph[k] = v

        response = make_response(dumps(graph))
        response.headers['Content-Type'] = 'application/%s' % content_type
        response.headers['Content-Disposition'] = 'inline; filename=%s.%s' % (gid, content_type)
        return response

    return api
