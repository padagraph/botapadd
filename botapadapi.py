#!/usr/bin/env python
#-*- coding:utf-8 -*-

from flask import request, jsonify
from flask import Response, make_response

import igraph
import pickle
import json

from reliure.types import GenericType, Text, Numeric, Boolean
from reliure.web import ReliureAPI, EngineView, ComponentView, RemoteApi
from reliure.pipeline import Optionable, Composable
from reliure.engine import Engine

from cello.graphs import export_graph, IN, OUT, ALL
from cello.graphs.prox import ProxSubgraph, ProxExtract, pure_prox, sortcut

from cello.layout import export_layout
from cello.clustering import export_clustering

from pdgapi.explor import ComplexQuery, AdditiveNodes, NodeExpandQuery, export_graph, layout_api, clustering_api


def db_graph(graphdb, query ):
    gid = query['graph']
    graph = graphdb.get_graph(gid)
    return graph

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
    def subgraph(query, cut=50, weighted=True, length=3, mode=ALL, add_loops=False, ):

        graph = db_graph(graphdb, query)

        uuids = { v['uuid'] : v.index for v in graph.vs }
        pz = [ q for q in query.get('units', []) ]
        pz = [ uuids[p] for p in pz ]
        
        extract = ProxExtract()
        vs = []
        if len(pz):
            for u in pz:
                s = extract(graph, pzeros=[u], weighted=weighted,mode=mode, cut=cut, length=length)
                vs = vs + s.keys()
        else :
            s = extract(graph, pzeros=[], weighted=weighted,mode=mode, cut=cut, length=length)
            vs = s.keys()
            
        return graph.subgraph(vs)

    from cello.graphs.transform import VtxAttr
    
    searchs = []
    for k,w,l,m,n  in [
              (u"Search", True, 3, ALL ,30 ), ]:
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
    def expand(query, length=3, cut=100, nodes=False, weightings=None):

        graph = db_graph(graphdb, query)
        gid = query.get("graph")
        uuids = { v['uuid'] : v.index for v in graph.vs }

        pz = {}
        qnodes = query.get("nodes", []) if nodes else []
        qexpand = query.get("expand", [])
        pz.update( { uuids[p] : 1./len(_nodes) for p in qnodes } )
        pz.update( { uuids[p] : 1. for p in qexpand })
        
        weightings = ["1"] if weightings == None else weightings
        wneighbors = _weights(weightings)
        
        vs = pure_prox(graph, pz, length, wneighbors)
        vs = sortcut(vs, cut)
        return dict(vs)

    scores = Optionable("scores")
    scores._func = Composable(expand)
    scores.add_option("length", Numeric( vtype=int, default=3))
    scores.add_option("cut", Numeric( vtype=int, default=50, max=100))
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